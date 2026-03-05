import { randomUUID } from "crypto";
import { query, queryOne, update } from "../config/database";
import { InstanceManager } from "../core/instanceManager";
import { logger } from "../utils/logger";

type RuntimeJobStatus = "pending" | "processing" | "completed" | "failed" | "dead_letter" | "canceled";

type RuntimeSettings = {
  user_id: string;
  enabled: boolean;
  allowed_start_hour: number;
  allowed_end_hour: number;
  max_attempts: number;
  max_messages_per_hour: number;
  cooldown_minutes: number;
};

type RuntimeSettingsPatch = Partial<{
  enabled: boolean;
  allowed_start_hour: number;
  allowed_end_hour: number;
  max_attempts: number;
  max_messages_per_hour: number;
  cooldown_minutes: number;
}>;

type AutomationRuleRow = {
  id: string;
  user_id: string;
  code: string;
  name: string;
  trigger_text: string;
  tags_json: string | null;
  status_from: string;
  status_to: string;
  timing_json: string | null;
  copy_json: string | null;
  objective_text: string;
  is_active: number;
  sort_order: number;
};

type RuntimeJobRow = {
  id: string;
  execution_id: string;
  user_id: string;
  automation_code: string;
  lead_id: string;
  step_index: number;
  step_key: string;
  status: RuntimeJobStatus;
  run_at: Date | string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  payload_json: string | null;
  last_error: string | null;
};

type AutomationLead = {
  id: string;
  name: string;
  phone: string;
  status: string;
  tags: string[];
  sourceDetails: Record<string, any>;
};

type TriggerContext = {
  segmento?: string;
  cidade?: string;
  produto?: string;
  oferta?: string;
  beneficio?: string;
};

type RuntimeSummary = {
  pending: number;
  processing: number;
  completed_24h: number;
  failed_24h: number;
  dead_letters_open: number;
  lastLoopAt: string | null;
  loopErrors: number;
};

type DeadLetterItem = {
  id: string;
  job_id: string;
  automation_code: string;
  lead_id: string;
  reason: string;
  payload_json: string | null;
  status: string;
  retry_count: number;
  created_at: string;
  retried_at?: string | null;
};

const PRIMARY_OUTBOUND_CODE = "prospeccao_ativa_lead_frio";

const STATUS_MAP: Record<string, string> = {
  "novo lead": "new",
  "contato iniciado": "contacted",
  engajado: "replied",
  "proposta enviada": "qualified",
  "em negociacao": "negotiating",
  cliente: "converted",
  perdido: "lost",
  reativacao: "contacted"
};

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    return trimmed
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function toStatusKey(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

function mapFunnelStatusToDb(value: string): string {
  const normalized = toStatusKey(value);
  return STATUS_MAP[normalized] || normalized || "new";
}

function parseTimingMinutes(timing: string, index: number): number {
  const raw = String(timing || "").trim().toLowerCase();
  if (!raw) return index * 60;

  if (raw.includes("t0") || raw.includes("imediat")) return 0;

  const plusMatch = raw.match(/t\s*\+\s*(\d+)\s*(h|hora|horas|min|m|dia|dias)/i);
  if (plusMatch) {
    const amount = Number(plusMatch[1] || 0);
    const unit = plusMatch[2] || "m";

    if (unit.startsWith("h")) return amount * 60;
    if (unit.startsWith("dia")) return amount * 60 * 24;
    return amount;
  }

  const onlyHours = raw.match(/(\d+)\s*(h|hora|horas)/i);
  if (onlyHours) return Number(onlyHours[1] || 0) * 60;

  const onlyDays = raw.match(/(\d+)\s*(dia|dias)/i);
  if (onlyDays) return Number(onlyDays[1] || 0) * 60 * 24;

  const onlyMin = raw.match(/(\d+)\s*(min|m)/i);
  if (onlyMin) return Number(onlyMin[1] || 0);

  return index * 60;
}

function normalizePhone(phone?: string | null): string {
  return String(phone || "").replace(/\D/g, "");
}

function extractPhoneFromJid(jid?: string | null): string {
  const raw = String(jid || "").trim();
  if (!raw) return "";
  const [left] = raw.split("@");
  const [phone] = left.split(":");
  return normalizePhone(phone);
}

function samePhone(a?: string | null, b?: string | null): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function fillTemplate(template: string, lead: AutomationLead, ctx: TriggerContext): string {
  const values: Record<string, string> = {
    nome: lead.name,
    name: lead.name,
    telefone: lead.phone,
    phone: lead.phone,
    segmento: String(ctx.segmento || "seu segmento"),
    cidade: String(ctx.cidade || "sua cidade"),
    produto: String(ctx.produto || ctx.oferta || "sua oferta"),
    produto_servico: String(ctx.produto || ctx.oferta || "seu produto/servico"),
    oferta: String(ctx.oferta || ctx.produto || "oferta personalizada"),
    beneficio_principal: String(ctx.beneficio || "mais previsibilidade comercial"),
    data_limite: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR")
  };

  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => values[key] || "");
}

export class AutomationRuntimeService {
  private started = false;
  private interval: NodeJS.Timeout | null = null;
  private isLoopRunning = false;
  private schemaReady = false;
  private lastLoopAt: string | null = null;
  private loopErrors = 0;
  private customerColumnsCache: string[] | null = null;
  private customersOwnerColumnCache: string | null = null;

  constructor(private readonly instanceManager: InstanceManager) {}

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_runtime_settings (
        user_id VARCHAR(36) PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        allowed_start_hour TINYINT UNSIGNED NOT NULL DEFAULT 8,
        allowed_end_hour TINYINT UNSIGNED NOT NULL DEFAULT 20,
        max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 3,
        max_messages_per_hour INT NOT NULL DEFAULT 40,
        cooldown_minutes INT NOT NULL DEFAULT 2,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_auto_runtime_user_enabled (user_id, enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_executions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        automation_code VARCHAR(120) NOT NULL,
        lead_id VARCHAR(64) NOT NULL,
        status ENUM('active','completed','canceled','failed') NOT NULL DEFAULT 'active',
        current_step INT NOT NULL DEFAULT 0,
        total_steps INT NOT NULL DEFAULT 1,
        next_run_at TIMESTAMP NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        context_json JSON NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        last_error TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_auto_execution_idem (idempotency_key),
        KEY idx_auto_execution_user_status (user_id, status),
        KEY idx_auto_execution_user_code (user_id, automation_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_jobs (
        id VARCHAR(36) PRIMARY KEY,
        execution_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        automation_code VARCHAR(120) NOT NULL,
        lead_id VARCHAR(64) NOT NULL,
        instance_id VARCHAR(36) NULL,
        step_index INT NOT NULL,
        step_key VARCHAR(120) NOT NULL,
        status ENUM('pending','processing','completed','failed','dead_letter','canceled') NOT NULL DEFAULT 'pending',
        run_at TIMESTAMP NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        idempotency_key VARCHAR(255) NOT NULL,
        payload_json JSON NULL,
        last_error TEXT NULL,
        locked_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_auto_jobs_idem (idempotency_key),
        KEY idx_auto_jobs_queue (status, run_at),
        KEY idx_auto_jobs_user_status (user_id, status),
        KEY idx_auto_jobs_execution (execution_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_dead_letters (
        id VARCHAR(36) PRIMARY KEY,
        job_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        automation_code VARCHAR(120) NOT NULL,
        lead_id VARCHAR(64) NOT NULL,
        reason TEXT NOT NULL,
        payload_json JSON NULL,
        status ENUM('open','retried','resolved') NOT NULL DEFAULT 'open',
        retry_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        retried_at TIMESTAMP NULL,
        KEY idx_auto_dlq_user_status (user_id, status),
        KEY idx_auto_dlq_job (job_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    this.schemaReady = true;
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.ensureSchema();
    this.started = true;

    this.interval = setInterval(() => {
      void this.processDueJobs(25);
    }, 5000);

    await this.processDueJobs(25);
    logger.info("Automation runtime started");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.started = false;
  }

  private async getCustomerColumns(): Promise<string[]> {
    if (this.customerColumnsCache) return this.customerColumnsCache;
    const rows = await query<any[]>("SHOW COLUMNS FROM customers");
    this.customerColumnsCache = rows.map((row) => String(row.Field || "")).filter(Boolean);
    return this.customerColumnsCache;
  }

  private async getCustomersOwnerColumn(): Promise<string | null> {
    if (this.customersOwnerColumnCache !== null) return this.customersOwnerColumnCache;
    const columns = await this.getCustomerColumns();
    if (columns.includes("user_id")) {
      this.customersOwnerColumnCache = "user_id";
      return this.customersOwnerColumnCache;
    }
    if (columns.includes("assigned_to")) {
      this.customersOwnerColumnCache = "assigned_to";
      return this.customersOwnerColumnCache;
    }
    this.customersOwnerColumnCache = null;
    return null;
  }

  private async ensureUserSettings(userId: string): Promise<void> {
    await this.ensureSchema();
    await query(
      `INSERT INTO crm_automation_runtime_settings (user_id)
       VALUES (?)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId]
    );
  }

  private async getUserSettings(userId: string): Promise<RuntimeSettings> {
    await this.ensureUserSettings(userId);

    const row = await queryOne<any>(
      `SELECT user_id, enabled, allowed_start_hour, allowed_end_hour, max_attempts, max_messages_per_hour, cooldown_minutes
       FROM crm_automation_runtime_settings
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    return {
      user_id: userId,
      enabled: Number(row?.enabled ?? 1) === 1,
      allowed_start_hour: Number(row?.allowed_start_hour ?? 8),
      allowed_end_hour: Number(row?.allowed_end_hour ?? 20),
      max_attempts: Number(row?.max_attempts ?? 3),
      max_messages_per_hour: Number(row?.max_messages_per_hour ?? 40),
      cooldown_minutes: Number(row?.cooldown_minutes ?? 2)
    };
  }

  private async getActiveRules(userId: string): Promise<AutomationRuleRow[]> {
    await this.ensureSchema();

    const rows = await query<AutomationRuleRow[]>(
      `SELECT *
       FROM crm_automation_rules
       WHERE user_id = ? AND is_active = 1
       ORDER BY sort_order ASC, created_at ASC`,
      [userId]
    );

    return rows;
  }

  private async getLeadById(userId: string, leadId: string | number): Promise<AutomationLead | null> {
    const columns = await this.getCustomerColumns();
    const ownerColumn = await this.getCustomersOwnerColumn();

    const statusExpr = columns.includes("status") ? "status" : "'new' AS status";
    const tagsExpr = columns.includes("tags") ? "tags" : "NULL AS tags";
    const sourceDetailsExpr = columns.includes("source_details")
      ? "source_details"
      : "NULL AS source_details";

    let sql = `SELECT id, name, phone, ${statusExpr}, ${tagsExpr}, ${sourceDetailsExpr}
               FROM customers
               WHERE id = ?`;
    const params: any[] = [leadId];

    if (ownerColumn) {
      sql += ` AND ${ownerColumn} = ?`;
      params.push(userId);
    }

    sql += " LIMIT 1";

    const row = await queryOne<any>(sql, params);
    if (!row) return null;

    return {
      id: String(row.id),
      name: String(row.name || "Lead"),
      phone: normalizePhone(row.phone),
      status: String(row.status || "new"),
      tags: parseJsonArray(row.tags),
      sourceDetails: parseObject(row.source_details)
    };
  }

  private async findLeadByPhone(userId: string, phone: string): Promise<AutomationLead | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    const columns = await this.getCustomerColumns();
    const ownerColumn = await this.getCustomersOwnerColumn();

    if (!columns.includes("phone")) return null;

    const normalizedPhoneExpr =
      "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')";

    const statusExpr = columns.includes("status") ? "status" : "'new' AS status";
    const tagsExpr = columns.includes("tags") ? "tags" : "NULL AS tags";
    const sourceDetailsExpr = columns.includes("source_details")
      ? "source_details"
      : "NULL AS source_details";

    let sql = `SELECT id, name, phone, ${statusExpr}, ${tagsExpr}, ${sourceDetailsExpr}
               FROM customers
               WHERE ${normalizedPhoneExpr} = ?`;
    const params: any[] = [normalized];

    if (ownerColumn) {
      sql += ` AND ${ownerColumn} = ?`;
      params.push(userId);
    }

    sql += " ORDER BY id DESC LIMIT 1";

    const row = await queryOne<any>(sql, params);
    if (!row) return null;

    return {
      id: String(row.id),
      name: String(row.name || "Lead"),
      phone: normalizePhone(row.phone),
      status: String(row.status || "new"),
      tags: parseJsonArray(row.tags),
      sourceDetails: parseObject(row.source_details)
    };
  }

  private async updateLeadStatusAndTags(
    userId: string,
    leadId: string,
    patch: {
      nextStatus?: string;
      addTags?: string[];
      sourceDetailsPatch?: Record<string, unknown>;
    }
  ): Promise<void> {
    const columns = await this.getCustomerColumns();
    const ownerColumn = await this.getCustomersOwnerColumn();

    const current = await this.getLeadById(userId, leadId);
    if (!current) return;

    const fields: string[] = [];
    const values: any[] = [];

    if (patch.nextStatus && columns.includes("status")) {
      fields.push("status = ?");
      values.push(patch.nextStatus);
    }

    if (patch.addTags && patch.addTags.length && columns.includes("tags")) {
      const mergedTags = new Set(
        [...current.tags, ...patch.addTags]
          .map((item) => String(item).trim())
          .filter(Boolean)
      );
      fields.push("tags = ?");
      values.push(JSON.stringify(Array.from(mergedTags)));
    }

    if (columns.includes("source_details") && patch.sourceDetailsPatch) {
      const nextSourceDetails = {
        ...current.sourceDetails,
        ...patch.sourceDetailsPatch
      };
      fields.push("source_details = ?");
      values.push(JSON.stringify(nextSourceDetails));
    }

    if (!fields.length) return;

    let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
    values.push(leadId);

    if (ownerColumn) {
      sql += ` AND ${ownerColumn} = ?`;
      values.push(userId);
    }

    await update(sql, values);
  }

  private parseRuleContextFromLead(lead: AutomationLead): TriggerContext {
    return {
      segmento: String(lead.sourceDetails?.category || "").trim() || undefined,
      cidade: String(lead.sourceDetails?.address_city || lead.sourceDetails?.city || "").trim() || undefined,
      produto: String(lead.sourceDetails?.product || "").trim() || undefined,
      oferta: String(lead.sourceDetails?.offer || "").trim() || undefined,
      beneficio: String(lead.sourceDetails?.benefit || "").trim() || undefined
    };
  }

  private shouldRuleStartForLead(rule: AutomationRuleRow, lead: AutomationLead): boolean {
    const leadStatus = normalizeText(lead.status);
    const fromStatus = mapFunnelStatusToDb(rule.status_from || "");

    if (fromStatus && leadStatus && fromStatus !== leadStatus) {
      if (!(rule.code === PRIMARY_OUTBOUND_CODE && leadStatus === "new")) {
        return false;
      }
    }

    if (rule.code === PRIMARY_OUTBOUND_CODE) {
      const tags = new Set(lead.tags.map((item) => normalizeText(item)));
      if (tags.has("primeiro_contato_enviado") || tags.has("contato_iniciado")) {
        return false;
      }
    }

    return true;
  }

  private async createExecutionAndJobs(
    userId: string,
    rule: AutomationRuleRow,
    lead: AutomationLead,
    context?: TriggerContext,
    triggerKey?: string
  ): Promise<{ executionId: string; queuedJobs: number }> {
    const timingSteps = parseJsonArray(rule.timing_json);
    const messages = parseJsonArray(rule.copy_json);

    if (!messages.length) {
      return { executionId: "", queuedJobs: 0 };
    }

    const normalizedTriggerKey = String(triggerKey || "default")
      .trim()
      .toLowerCase()
      .slice(0, 100);
    const executionIdempotency = `${userId}:${rule.code}:${lead.id}:${normalizedTriggerKey}`;
    const executionId = randomUUID();
    await query(
      `INSERT INTO crm_automation_executions (
         id, user_id, automation_code, lead_id, status, current_step, total_steps, idempotency_key, context_json
       ) VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = NOW()`,
      [
        executionId,
        userId,
        rule.code,
        String(lead.id),
        messages.length,
        executionIdempotency,
        JSON.stringify(context || {})
      ]
    );

    const execution = await queryOne<{ id: string }>(
      `SELECT id FROM crm_automation_executions WHERE idempotency_key = ? LIMIT 1`,
      [executionIdempotency]
    );

    if (!execution) {
      return { executionId: "", queuedJobs: 0 };
    }

    let queuedJobs = 0;
    for (let i = 0; i < messages.length; i++) {
      const minutes = parseTimingMinutes(timingSteps[i] || "", i);
      const runAt = new Date(Date.now() + minutes * 60 * 1000);
      const stepKey = `step_${i + 1}`;
      const jobIdempotency = `${execution.id}:${stepKey}`;

      const payload = {
        template: messages[i],
        timing: timingSteps[i] || "",
        status_to: rule.status_to,
        tags: parseJsonArray(rule.tags_json),
        context: context || {}
      };

      await query(
        `INSERT INTO crm_automation_jobs (
          id, execution_id, user_id, automation_code, lead_id, step_index, step_key, status, run_at, attempts, max_attempts, idempotency_key, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, 3, ?, ?)
        ON DUPLICATE KEY UPDATE id = id`,
        [
          randomUUID(),
          execution.id,
          userId,
          rule.code,
          String(lead.id),
          i,
          stepKey,
          runAt,
          jobIdempotency,
          JSON.stringify(payload)
        ]
      );

      const exists = await queryOne<{ id: string }>(
        `SELECT id FROM crm_automation_jobs WHERE idempotency_key = ? LIMIT 1`,
        [jobIdempotency]
      );
      if (exists) queuedJobs++;
    }

    return { executionId: execution.id, queuedJobs };
  }

  async triggerLeadCreated(userId: string, leadId: string | number, context?: TriggerContext): Promise<void> {
    await this.ensureSchema();
    const lead = await this.getLeadById(userId, leadId);
    if (!lead) return;

    const rules = await this.getActiveRules(userId);
    for (const rule of rules) {
      if (!this.shouldRuleStartForLead(rule, lead)) continue;
      await this.createExecutionAndJobs(
        userId,
        rule,
        lead,
        context || this.parseRuleContextFromLead(lead),
        "lead_created"
      );
    }
  }

  async triggerLeadStatusChanged(
    userId: string,
    leadId: string | number,
    previousStatus: string,
    nextStatus: string
  ): Promise<void> {
    await this.ensureSchema();

    const normalizedPrevious = normalizeText(previousStatus);
    const normalizedNext = normalizeText(nextStatus);
    if (!normalizedNext || normalizedNext === normalizedPrevious) return;

    const lead = await this.getLeadById(userId, leadId);
    if (!lead) return;

    if (normalizedNext === "lost" || normalizedNext === "converted") {
      await update(
        `UPDATE crm_automation_jobs
         SET status = 'canceled', updated_at = NOW(), last_error = 'canceled_by_status_change'
         WHERE user_id = ? AND lead_id = ? AND status IN ('pending','processing')`,
        [userId, String(leadId)]
      );

      await update(
        `UPDATE crm_automation_executions
         SET status = 'canceled', completed_at = NOW(), updated_at = NOW(), last_error = 'canceled_by_status_change'
         WHERE user_id = ? AND lead_id = ? AND status = 'active'`,
        [userId, String(leadId)]
      );
    }

    const rules = await this.getActiveRules(userId);
    for (const rule of rules) {
      const ruleFrom = mapFunnelStatusToDb(rule.status_from || "");
      if (ruleFrom && ruleFrom === normalizedNext) {
        await this.createExecutionAndJobs(
          userId,
          rule,
          lead,
          this.parseRuleContextFromLead(lead),
          `status_${normalizedPrevious}_to_${normalizedNext}`
        );
      }
    }

    if (normalizedNext === "replied" || normalizedNext === "negotiating") {
      await this.recordEvent(userId, PRIMARY_OUTBOUND_CODE, String(leadId), "lead_engaged", "status_change");
    }
    if (normalizedNext === "converted") {
      await this.recordEvent(userId, PRIMARY_OUTBOUND_CODE, String(leadId), "lead_client", "status_change");
    }
  }

  private async getUserByInstance(instanceId: string): Promise<string | null> {
    const row = await queryOne<{ created_by: string | null }>(
      `SELECT created_by FROM whatsapp_instances WHERE id = ? LIMIT 1`,
      [instanceId]
    );

    return row?.created_by || null;
  }

  async triggerInboundMessage(input: {
    instanceId: string;
    remoteJid: string;
    body?: string;
    timestamp?: number;
  }): Promise<void> {
    await this.ensureSchema();
    const userId = await this.getUserByInstance(input.instanceId);
    if (!userId) return;

    const phone = extractPhoneFromJid(input.remoteJid);
    if (!phone) return;

    const lead = await this.findLeadByPhone(userId, phone);
    if (!lead) return;

    const previousStatus = normalizeText(lead.status);
    const shouldMoveToReplied = previousStatus !== "converted" && previousStatus !== "lost";

    await this.updateLeadStatusAndTags(userId, lead.id, {
      nextStatus: shouldMoveToReplied ? "replied" : undefined,
      addTags: ["respondeu_whatsapp", "interesse_inicial"],
      sourceDetailsPatch: {
        last_inbound_message_at: new Date().toISOString(),
        last_inbound_message_body: String(input.body || "").slice(0, 500)
      }
    });

    await this.recordEvent(userId, PRIMARY_OUTBOUND_CODE, lead.id, "message_replied", "inbound_reply");
    await this.recordEvent(userId, PRIMARY_OUTBOUND_CODE, lead.id, "lead_engaged", "inbound_reply");

    await update(
      `UPDATE crm_automation_jobs
       SET status = 'canceled', updated_at = NOW(), last_error = 'canceled_by_reply'
       WHERE user_id = ? AND lead_id = ? AND automation_code = ? AND status IN ('pending','processing')`,
      [userId, lead.id, PRIMARY_OUTBOUND_CODE]
    );

    await update(
      `UPDATE crm_automation_executions
       SET status = 'canceled', completed_at = NOW(), updated_at = NOW(), last_error = 'canceled_by_reply'
       WHERE user_id = ? AND lead_id = ? AND automation_code = ? AND status = 'active'`,
      [userId, lead.id, PRIMARY_OUTBOUND_CODE]
    );

    const rules = await this.getActiveRules(userId);
    for (const rule of rules) {
      const fromStatus = mapFunnelStatusToDb(rule.status_from || "");
      if (fromStatus === "replied") {
        await this.createExecutionAndJobs(
          userId,
          rule,
          {
            ...lead,
            status: "replied"
          },
          this.parseRuleContextFromLead(lead),
          `inbound_reply_${Math.floor(Number(input.timestamp || Date.now()) / 1000)}`
        );
      }
    }
  }

  private async resolveConnectedInstance(userId: string): Promise<string | null> {
    const row = await queryOne<{ id: string }>(
      `SELECT id
       FROM whatsapp_instances
       WHERE created_by = ? AND status = 'connected'
       ORDER BY last_connected_at DESC, updated_at DESC
       LIMIT 1`,
      [userId]
    );
    return row?.id || null;
  }

  private withinAllowedWindow(settings: RuntimeSettings): boolean {
    const now = new Date();
    const hour = now.getHours();

    const start = Math.max(0, Math.min(23, settings.allowed_start_hour));
    const end = Math.max(0, Math.min(23, settings.allowed_end_hour));

    if (start === end) return true;

    if (start < end) {
      return hour >= start && hour < end;
    }

    return hour >= start || hour < end;
  }

  private nextWindowDate(settings: RuntimeSettings): Date {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);

    const start = Math.max(0, Math.min(23, settings.allowed_start_hour));
    if (now.getHours() >= start) {
      next.setDate(next.getDate() + 1);
    }

    next.setHours(start, 0, 0, 0);
    return next;
  }

  private async overHourlyLimit(userId: string, settings: RuntimeSettings): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM crm_automation_jobs
       WHERE user_id = ?
         AND status = 'completed'
         AND completed_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [userId]
    );

    return Number(row?.total || 0) >= Math.max(1, settings.max_messages_per_hour);
  }

  private async inCooldown(userId: string, leadId: string, settings: RuntimeSettings): Promise<boolean> {
    const cooldown = Math.max(0, settings.cooldown_minutes || 0);
    if (cooldown === 0) return false;

    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM crm_automation_jobs
       WHERE user_id = ?
         AND lead_id = ?
         AND status = 'completed'
         AND completed_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [userId, leadId, cooldown]
    );

    return Number(row?.total || 0) > 0;
  }

  private async claimJob(jobId: string): Promise<boolean> {
    const affected = await update(
      `UPDATE crm_automation_jobs
       SET status = 'processing', locked_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [jobId]
    );
    return affected > 0;
  }

  private async markExecutionProgress(executionId: string): Promise<void> {
    const pending = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM crm_automation_jobs
       WHERE execution_id = ? AND status IN ('pending','processing')`,
      [executionId]
    );

    const completed = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM crm_automation_jobs
       WHERE execution_id = ? AND status = 'completed'`,
      [executionId]
    );

    const nextRun = await queryOne<{ run_at: Date | string | null }>(
      `SELECT run_at
       FROM crm_automation_jobs
       WHERE execution_id = ? AND status = 'pending'
       ORDER BY run_at ASC
       LIMIT 1`,
      [executionId]
    );

    if (Number(pending?.total || 0) === 0) {
      await update(
        `UPDATE crm_automation_executions
         SET status = 'completed', current_step = ?, next_run_at = NULL, completed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [Number(completed?.total || 0), executionId]
      );
      return;
    }

    await update(
      `UPDATE crm_automation_executions
       SET current_step = ?, next_run_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [Number(completed?.total || 0), nextRun?.run_at || null, executionId]
    );
  }

  private async sendJobMessage(job: RuntimeJobRow): Promise<void> {
    const settings = await this.getUserSettings(job.user_id);
    if (!settings.enabled) {
      await update(
        `UPDATE crm_automation_jobs
         SET status = 'pending', run_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE), updated_at = NOW(), last_error = 'runtime_disabled'
         WHERE id = ?`,
        [job.id]
      );
      return;
    }

    if (!this.withinAllowedWindow(settings)) {
      const runAt = this.nextWindowDate(settings);
      await update(
        `UPDATE crm_automation_jobs
         SET status = 'pending', run_at = ?, updated_at = NOW(), last_error = 'outside_allowed_window'
         WHERE id = ?`,
        [runAt, job.id]
      );
      return;
    }

    if (await this.overHourlyLimit(job.user_id, settings)) {
      await update(
        `UPDATE crm_automation_jobs
         SET status = 'pending', run_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), updated_at = NOW(), last_error = 'hourly_limit'
         WHERE id = ?`,
        [job.id]
      );
      return;
    }

    if (await this.inCooldown(job.user_id, String(job.lead_id), settings)) {
      await update(
        `UPDATE crm_automation_jobs
         SET status = 'pending', run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), updated_at = NOW(), last_error = 'lead_cooldown'
         WHERE id = ?`,
        [Math.max(1, settings.cooldown_minutes), job.id]
      );
      return;
    }

    const lead = await this.getLeadById(job.user_id, job.lead_id);
    if (!lead || !lead.phone) {
      await this.failJob(job, "lead_not_found_or_without_phone", settings.max_attempts);
      return;
    }

    const rule = await queryOne<AutomationRuleRow>(
      `SELECT * FROM crm_automation_rules WHERE user_id = ? AND code = ? AND is_active = 1 LIMIT 1`,
      [job.user_id, job.automation_code]
    );
    if (!rule) {
      await update(
        `UPDATE crm_automation_jobs
         SET status = 'canceled', updated_at = NOW(), last_error = 'rule_not_active'
         WHERE id = ?`,
        [job.id]
      );
      await this.markExecutionProgress(job.execution_id);
      return;
    }

    const payload = parseObject(job.payload_json);
    const template = String(payload.template || "").trim();
    const context = (payload.context && typeof payload.context === "object"
      ? payload.context
      : this.parseRuleContextFromLead(lead)) as TriggerContext;

    const message = fillTemplate(template, lead, context);
    if (!message.trim()) {
      await this.failJob(job, "empty_message_template", settings.max_attempts);
      return;
    }

    const instanceId = await this.resolveConnectedInstance(job.user_id);
    if (!instanceId) {
      await this.failJob(job, "no_connected_instance", settings.max_attempts);
      return;
    }

    const sent = await this.instanceManager.sendMessage(instanceId, lead.phone, message);
    if (!sent) {
      await this.failJob(job, "send_failed", settings.max_attempts);
      return;
    }

    await update(
      `UPDATE crm_automation_jobs
       SET status = 'completed', instance_id = ?, completed_at = NOW(), updated_at = NOW(), last_error = NULL
       WHERE id = ?`,
      [instanceId, job.id]
    );

    const nextStatus = mapFunnelStatusToDb(String(payload.status_to || rule.status_to || ""));
    const tags = parseJsonArray(payload.tags || rule.tags_json);

    await this.updateLeadStatusAndTags(job.user_id, String(lead.id), {
      nextStatus: nextStatus || undefined,
      addTags: tags,
      sourceDetailsPatch: {
        automation_last_message_at: new Date().toISOString(),
        automation_last_code: job.automation_code,
        automation_last_step: job.step_key
      }
    });

    await this.recordEvent(job.user_id, job.automation_code, String(lead.id), "message_sent", job.step_key);

    await this.markExecutionProgress(job.execution_id);
  }

  private async failJob(job: RuntimeJobRow, reason: string, defaultMaxAttempts: number): Promise<void> {
    const currentAttempts = Number(job.attempts || 0) + 1;
    const maxAttempts = Number(job.max_attempts || defaultMaxAttempts || 3);

    if (currentAttempts >= maxAttempts) {
      await update(
        `UPDATE crm_automation_jobs
         SET status = 'dead_letter', attempts = ?, updated_at = NOW(), last_error = ?
         WHERE id = ?`,
        [currentAttempts, reason, job.id]
      );

      await query(
        `INSERT INTO crm_automation_dead_letters
         (id, job_id, user_id, automation_code, lead_id, reason, payload_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
          randomUUID(),
          job.id,
          job.user_id,
          job.automation_code,
          String(job.lead_id),
          reason,
          job.payload_json || null
        ]
      );

      await update(
        `UPDATE crm_automation_executions
         SET status = 'failed', last_error = ?, updated_at = NOW()
         WHERE id = ?`,
        [reason, job.execution_id]
      );
      return;
    }

    const backoffMinutes = currentAttempts === 1 ? 2 : currentAttempts === 2 ? 5 : 15;

    await update(
      `UPDATE crm_automation_jobs
       SET status = 'pending', attempts = ?, run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), updated_at = NOW(), last_error = ?
       WHERE id = ?`,
      [currentAttempts, backoffMinutes, reason, job.id]
    );
  }

  private async recordEvent(
    userId: string,
    automationCode: string,
    leadId: string,
    eventType: string,
    messageKey: string
  ): Promise<void> {
    await query(
      `INSERT INTO crm_automation_event_log
       (id, user_id, automation_code, lead_id, message_key, event_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), userId, automationCode, leadId, messageKey || "default", eventType]
    );

    const sentInc = eventType === "message_sent" ? 1 : 0;
    const repliedInc = eventType === "message_replied" ? 1 : 0;
    const engagedInc = eventType === "lead_engaged" ? 1 : 0;
    const clientInc = eventType === "lead_client" ? 1 : 0;

    await query(
      `INSERT INTO crm_automation_message_metrics
       (user_id, automation_code, message_key, sent_count, responses_count, engaged_count, client_count, last_event_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         sent_count = sent_count + VALUES(sent_count),
         responses_count = responses_count + VALUES(responses_count),
         engaged_count = engaged_count + VALUES(engaged_count),
         client_count = client_count + VALUES(client_count),
         last_event_at = NOW()`,
      [userId, automationCode, messageKey || "default", sentInc, repliedInc, engagedInc, clientInc]
    );
  }

  async processDueJobs(limit = 25): Promise<void> {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    try {
      await this.ensureSchema();

      const jobs = await query<RuntimeJobRow[]>(
        `SELECT *
         FROM crm_automation_jobs
         WHERE status = 'pending' AND run_at <= NOW()
         ORDER BY run_at ASC
         LIMIT ${Math.max(1, Math.min(200, Math.floor(limit || 25)))}`
      );

      for (const job of jobs) {
        const claimed = await this.claimJob(job.id);
        if (!claimed) continue;

        const fresh = await queryOne<RuntimeJobRow>(
          `SELECT * FROM crm_automation_jobs WHERE id = ? LIMIT 1`,
          [job.id]
        );
        if (!fresh) continue;

        await this.sendJobMessage(fresh);
      }

      this.lastLoopAt = new Date().toISOString();
    } catch (error: any) {
      this.loopErrors += 1;
      logger.error(`Automation runtime loop error: ${error.message}`);
    } finally {
      this.isLoopRunning = false;
    }
  }

  async getRuntimeStatus(userId: string): Promise<RuntimeSummary> {
    await this.ensureSchema();

    const pending = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM crm_automation_jobs WHERE user_id = ? AND status = 'pending'`,
      [userId]
    );

    const processing = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM crm_automation_jobs WHERE user_id = ? AND status = 'processing'`,
      [userId]
    );

    const completed24h = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM crm_automation_jobs
       WHERE user_id = ? AND status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [userId]
    );

    const failed24h = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM crm_automation_jobs
       WHERE user_id = ? AND status IN ('failed', 'dead_letter') AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [userId]
    );

    const deadLetters = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM crm_automation_dead_letters WHERE user_id = ? AND status = 'open'`,
      [userId]
    );

    return {
      pending: Number(pending?.total || 0),
      processing: Number(processing?.total || 0),
      completed_24h: Number(completed24h?.total || 0),
      failed_24h: Number(failed24h?.total || 0),
      dead_letters_open: Number(deadLetters?.total || 0),
      lastLoopAt: this.lastLoopAt,
      loopErrors: this.loopErrors
    };
  }

  async listDeadLetters(userId: string, limit = 50): Promise<DeadLetterItem[]> {
    await this.ensureSchema();

    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit || 50)));
    const rows = await query<any[]>(
      `SELECT *
       FROM crm_automation_dead_letters
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
      [userId]
    );

    return rows.map((row) => ({
      id: String(row.id),
      job_id: String(row.job_id),
      automation_code: String(row.automation_code),
      lead_id: String(row.lead_id),
      reason: String(row.reason || ""),
      payload_json: row.payload_json ? String(row.payload_json) : null,
      status: String(row.status || "open"),
      retry_count: Number(row.retry_count || 0),
      created_at: new Date(row.created_at).toISOString(),
      retried_at: row.retried_at ? new Date(row.retried_at).toISOString() : null
    }));
  }

  async retryDeadLetter(userId: string, deadLetterId: string): Promise<boolean> {
    await this.ensureSchema();

    const deadLetter = await queryOne<any>(
      `SELECT * FROM crm_automation_dead_letters WHERE id = ? AND user_id = ? LIMIT 1`,
      [deadLetterId, userId]
    );

    if (!deadLetter || String(deadLetter.status || "") === "resolved") return false;

    const affected = await update(
      `UPDATE crm_automation_jobs
       SET status = 'pending', attempts = 0, run_at = NOW(), updated_at = NOW(), last_error = NULL
       WHERE id = ? AND user_id = ?`,
      [String(deadLetter.job_id), userId]
    );

    if (affected === 0) return false;

    await update(
      `UPDATE crm_automation_dead_letters
       SET status = 'retried', retry_count = retry_count + 1, retried_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [deadLetterId, userId]
    );

    return true;
  }

  async getRuntimeSettings(userId: string): Promise<RuntimeSettings> {
    return this.getUserSettings(userId);
  }

  async updateRuntimeSettings(userId: string, patch: RuntimeSettingsPatch): Promise<RuntimeSettings> {
    await this.ensureUserSettings(userId);

    const fields: string[] = [];
    const values: any[] = [];

    if (patch.enabled !== undefined) {
      fields.push("enabled = ?");
      values.push(patch.enabled ? 1 : 0);
    }
    if (patch.allowed_start_hour !== undefined && Number.isFinite(Number(patch.allowed_start_hour))) {
      fields.push("allowed_start_hour = ?");
      values.push(Math.max(0, Math.min(23, Math.floor(Number(patch.allowed_start_hour)))));
    }
    if (patch.allowed_end_hour !== undefined && Number.isFinite(Number(patch.allowed_end_hour))) {
      fields.push("allowed_end_hour = ?");
      values.push(Math.max(0, Math.min(23, Math.floor(Number(patch.allowed_end_hour)))));
    }
    if (patch.max_attempts !== undefined && Number.isFinite(Number(patch.max_attempts))) {
      fields.push("max_attempts = ?");
      values.push(Math.max(1, Math.min(10, Math.floor(Number(patch.max_attempts)))));
    }
    if (
      patch.max_messages_per_hour !== undefined &&
      Number.isFinite(Number(patch.max_messages_per_hour))
    ) {
      fields.push("max_messages_per_hour = ?");
      values.push(Math.max(1, Math.min(500, Math.floor(Number(patch.max_messages_per_hour)))));
    }
    if (patch.cooldown_minutes !== undefined && Number.isFinite(Number(patch.cooldown_minutes))) {
      fields.push("cooldown_minutes = ?");
      values.push(Math.max(0, Math.min(240, Math.floor(Number(patch.cooldown_minutes)))));
    }

    if (fields.length > 0) {
      values.push(userId);
      await update(
        `UPDATE crm_automation_runtime_settings
         SET ${fields.join(", ")}, updated_at = NOW()
         WHERE user_id = ?`,
        values
      );
    }

    return this.getUserSettings(userId);
  }
}
