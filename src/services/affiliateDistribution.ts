import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import type { InstanceManager } from "../core/instanceManager";
import { AffiliatesService } from "./affiliates";
import { affiliateGlobalService } from "./affiliateGlobal";
import { affiliateProgramsService } from "./affiliatePrograms";
import { getHealthSnapshot } from "./whatsappHealth";
import { logger } from "../utils/logger";

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

let imRef: InstanceManager | null = null;
export function setDistributionInstanceManagerRef(im: InstanceManager): void {
  imRef = im;
}

const DEFAULT_INITIAL_MESSAGE_TEMPLATE =
  "Olá {{prospect_name}}! Tudo bem? Sou {{affiliate_name}}, parceiro(a) da {{brand_name}}. "
  + "Recebi seu contato e gostaria de entender como posso te ajudar. Posso te enviar mais informações?";

const DEFAULT_FOLLOWUP_TEMPLATE =
  "Oi {{prospect_name}}! Passando para saber se ainda posso te ajudar com informações da {{brand_name}}. "
  + "Fico à disposição quando quiser conversar.";

const DEFAULT_FOLLOWUP_DELAYS_HOURS = [24, 48, 72];

function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || "").replace(/\D/g, "");
}

function phoneTailMatch(a?: string | null, b?: string | null): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  const tail = (s: string) => s.slice(-9);
  return tail(da) === tail(db) || da.endsWith(db) || db.endsWith(da);
}

function parseFollowupDelays(raw?: string | null): number[] {
  if (!raw) return DEFAULT_FOLLOWUP_DELAYS_HOURS;
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return DEFAULT_FOLLOWUP_DELAYS_HOURS;
    const nums = parsed.map((n) => Math.max(1, Number(n))).filter((n) => Number.isFinite(n));
    return nums.length ? nums : DEFAULT_FOLLOWUP_DELAYS_HOURS;
  } catch {
    return DEFAULT_FOLLOWUP_DELAYS_HOURS;
  }
}

export type DistributionStatusValue = "available" | "paused" | "blocked" | "ineligible";
export type WhatsappStatusValue = "connected" | "disconnected" | "unstable" | "none";

export type EligibilityChecklistItem = {
  key: string;
  label: string;
  ok: boolean;
  action?: string | null;
  /** CTA curta no app (ex.: "Aceitar termos") */
  cta?: string | null;
  /** Rota relativa no app afiliado */
  action_path?: string | null;
};

export type AffiliateEligibilitySnapshot = {
  can_receive: boolean;
  distribution_status: DistributionStatusValue;
  whatsapp_status: WhatsappStatusValue;
  blockers: string[];
  checklist: EligibilityChecklistItem[];
  program_id: string | null;
  program_name: string | null;
  enrollment_id: string | null;
  enrollment_status: string | null;
  terms_html?: string | null;
  connected_instance_id: string | null;
  connected_instance_name: string | null;
  connected_instances: number;
  stats: {
    assigned_total: number;
    assigned_active: number;
    assigned_today: number;
    alerts_unread: number;
    queued_for_brand: number;
  };
};

async function initializeDistributionSchema(): Promise<void> {
  if (schemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_distribution_status (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      program_id VARCHAR(36) NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      affiliate_user_id VARCHAR(36) NOT NULL,
      distribution_status VARCHAR(20) NOT NULL DEFAULT 'ineligible',
      whatsapp_status VARCHAR(20) NOT NULL DEFAULT 'none',
      membership_status VARCHAR(30) NULL,
      terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      training_complete BOOLEAN NOT NULL DEFAULT FALSE,
      pause_reason VARCHAR(120) NULL,
      daily_assigned_count INT NOT NULL DEFAULT 0,
      daily_assigned_on DATE NULL,
      last_assigned_at TIMESTAMP NULL,
      last_rotation_at TIMESTAMP NULL,
      eligible_at TIMESTAMP NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_dist_affiliate (affiliate_id, brand_id),
      KEY idx_aff_dist_available (brand_id, distribution_status, whatsapp_status)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS prospect_assignments (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      program_id VARCHAR(36) NULL,
      prospect_id VARCHAR(36) NOT NULL,
      prospect_ref_table VARCHAR(40) NOT NULL DEFAULT 'customers',
      prospect_name VARCHAR(160) NULL,
      prospect_phone VARCHAR(30) NULL,
      prospect_city VARCHAR(120) NULL,
      prospect_region VARCHAR(120) NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      affiliate_user_id VARCHAR(36) NOT NULL,
      instance_id VARCHAR(36) NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'distribution',
      assignment_status VARCHAR(40) NOT NULL DEFAULT 'assigned',
      current_stage VARCHAR(40) NOT NULL DEFAULT 'assigned_to_affiliate',
      priority_score INT NOT NULL DEFAULT 0,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_interaction_at TIMESTAMP NULL,
      next_followup_at TIMESTAMP NULL,
      conversion_status VARCHAR(30) NOT NULL DEFAULT 'open',
      converted_customer_id VARCHAR(36) NULL,
      converted_order_id VARCHAR(36) NULL,
      notes TEXT NULL,
      metadata_json TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_pa_affiliate (affiliate_id, assignment_status, assigned_at DESC),
      KEY idx_pa_prospect (prospect_id, brand_id),
      KEY idx_pa_owner (owner_user_id, brand_id, assigned_at DESC)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS lead_distribution_queue (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      program_id VARCHAR(36) NULL,
      prospect_id VARCHAR(36) NOT NULL,
      prospect_ref_table VARCHAR(40) NOT NULL DEFAULT 'customers',
      prospect_name VARCHAR(160) NULL,
      prospect_phone VARCHAR(30) NULL,
      prospect_city VARCHAR(120) NULL,
      prospect_region VARCHAR(120) NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'panfleteiro_capture',
      priority_score INT NOT NULL DEFAULT 50,
      queue_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      assigned_at TIMESTAMP NULL,
      assignment_id VARCHAR(36) NULL,
      error_message VARCHAR(255) NULL,
      metadata_json TEXT NULL,
      KEY idx_ldq_pending (brand_id, queue_status, priority_score DESC, queued_at ASC)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS lead_distribution_rules (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      program_id VARCHAR(36) NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      max_daily_per_affiliate INT NOT NULL DEFAULT 20,
      rotation_mode VARCHAR(30) NOT NULL DEFAULT 'round_robin',
      require_whatsapp_connected BOOLEAN NOT NULL DEFAULT TRUE,
      require_training_complete BOOLEAN NOT NULL DEFAULT TRUE,
      require_terms_accepted BOOLEAN NOT NULL DEFAULT TRUE,
      auto_enqueue_capture BOOLEAN NOT NULL DEFAULT TRUE,
      auto_send_initial_message BOOLEAN NOT NULL DEFAULT TRUE,
      initial_message_template TEXT NULL,
      allowed_regions_json TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ldr_brand_program (brand_id, program_id)
    )
  `);

  for (const ddl of [
    `ALTER TABLE lead_distribution_rules ADD COLUMN auto_send_initial_message BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE lead_distribution_rules ADD COLUMN initial_message_template TEXT NULL`,
    `ALTER TABLE lead_distribution_rules ADD COLUMN followup_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE lead_distribution_rules ADD COLUMN followup_delays_hours_json TEXT NULL`,
    `ALTER TABLE lead_distribution_rules ADD COLUMN followup_message_template TEXT NULL`,
    `ALTER TABLE lead_distribution_rules ADD COLUMN require_pix_key BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE prospect_assignments ADD COLUMN followup_count INT NOT NULL DEFAULT 0`,
    `ALTER TABLE prospect_assignments ADD COLUMN last_followup_at TIMESTAMP NULL`,
  ]) {
    try {
      await query(ddl);
    } catch {
      /* column may already exist */
    }
  }

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_alerts (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      affiliate_user_id VARCHAR(36) NOT NULL,
      alert_type VARCHAR(40) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      title VARCHAR(160) NOT NULL,
      body VARCHAR(500) NULL,
      action_path VARCHAR(200) NULL,
      assignment_id VARCHAR(36) NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_aff_alert_user (affiliate_user_id, brand_id, is_read, created_at DESC)
    )
  `);

  schemaReady = true;
}

async function ensureDistributionSchema(): Promise<void> {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = initializeDistributionSchema().finally(() => {
      if (!schemaReady) schemaPromise = null;
    });
  }
  await schemaPromise;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapWhatsappStatus(
  summary: { connected: number; total: number; has_critical: boolean },
  instances?: Array<{ status_runtime?: string; status_db?: string; drift?: boolean }>,
): WhatsappStatusValue {
  if (!summary.total) return "none";

  // Elegibilidade: basta UMA sessão viva. has_critical em outra sessão offline
  // não pode marcar o afiliado como "desconectado" depois de conectar.
  const liveConnected = (instances || []).some((i) => {
    if (i.drift) return false;
    if (i.status_runtime === "connected") return true;
    if (i.status_runtime === "unknown" && i.status_db === "connected") return true;
    return false;
  });
  if (liveConnected || summary.connected > 0) return "connected";
  if (summary.has_critical) return "disconnected";
  return "disconnected";
}

export class AffiliateDistributionService {
  private affiliates = new AffiliatesService();

  async ensureSchema() {
    await this.affiliates.ensureSchema();
    await affiliateProgramsService.ensureSchema();
    await affiliateGlobalService.ensureSchema();
    await ensureDistributionSchema();
  }

  private resolveInitialMessageTemplate(rules?: any, program?: any): string {
    const custom = String(rules?.initial_message_template || "").trim();
    if (custom) return custom;
    const tone = String(program?.promotion_tone || "").trim();
    if (tone.length > 20) return tone;
    return DEFAULT_INITIAL_MESSAGE_TEMPLATE;
  }

  private applyMessageTemplate(
    template: string,
    ctx: {
      prospect_name?: string | null;
      prospect_city?: string | null;
      affiliate_name?: string | null;
      brand_name?: string | null;
      program_name?: string | null;
    }
  ): string {
    const firstName = String(ctx.prospect_name || "").trim().split(/\s+/)[0] || "tudo bem";
    const map: Record<string, string> = {
      "{{prospect_name}}": firstName,
      "{{prospect_city}}": String(ctx.prospect_city || "").trim(),
      "{{affiliate_name}}": String(ctx.affiliate_name || "nossa equipe").trim(),
      "{{brand_name}}": String(ctx.brand_name || "nossa marca").trim(),
      "{{program_name}}": String(ctx.program_name || "").trim(),
    };
    let out = template;
    for (const [token, value] of Object.entries(map)) {
      out = out.split(token).join(value || "");
    }
    return out.trim();
  }

  private async dispatchInitialProspectMessage(input: {
    assignmentId: string;
    ownerUserId: string;
    brandId: string;
    programId?: string | null;
    prospectPhone?: string | null;
    prospectName?: string | null;
    prospectCity?: string | null;
    affiliateId: string;
    affiliateUserId: string;
    instanceId?: string | null;
    rules?: any;
  }): Promise<{ sent: boolean; reason?: string; stage?: string }> {
    const rules = input.rules || await this.getOrCreateRules(input.ownerUserId, input.brandId, input.programId);
    if (!rules?.auto_send_initial_message) {
      return { sent: false, reason: "auto_send_disabled" };
    }

    const phone = String(input.prospectPhone || "").replace(/\D/g, "");
    const instanceId = String(input.instanceId || "").trim();
    if (!phone) return { sent: false, reason: "no_phone" };
    if (!instanceId) return { sent: false, reason: "no_instance" };
    if (!imRef || typeof imRef.sendMessage !== "function") {
      logger.warn("[affiliateDistribution] instanceManager not wired — initial message skipped");
      return { sent: false, reason: "no_sender" };
    }

    const [affiliate, brand, program] = await Promise.all([
      queryOne<any>(`SELECT display_name FROM affiliates WHERE id = ? LIMIT 1`, [input.affiliateId]),
      queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [input.brandId]),
      input.programId
        ? queryOne<any>(`SELECT name, promotion_tone FROM affiliate_programs WHERE id = ? LIMIT 1`, [input.programId])
        : Promise.resolve(null),
    ]);

    const template = this.resolveInitialMessageTemplate(rules, program);
    const message = this.applyMessageTemplate(template, {
      prospect_name: input.prospectName,
      prospect_city: input.prospectCity,
      affiliate_name: affiliate?.display_name ? String(affiliate.display_name) : null,
      brand_name: brand?.name ? String(brand.name) : null,
      program_name: program?.name ? String(program.name) : null,
    });

    const sent = await imRef.sendMessage(instanceId, phone, message).catch((e: any) => {
      logger.warn(`[affiliateDistribution] initial message failed: ${e?.message || e}`);
      return false;
    });

    if (!sent) {
      await this.ensureAlert({
        ownerUserId: input.ownerUserId,
        brandId: input.brandId,
        affiliateId: input.affiliateId,
        affiliateUserId: input.affiliateUserId,
        alertType: "initial_message_failed",
        severity: "warning",
        title: "Falha ao enviar mensagem inicial",
        body: input.prospectName
          ? `Não foi possível enviar a primeira mensagem para ${input.prospectName}. Abra o WhatsApp e inicie manualmente.`
          : "Não foi possível enviar a primeira mensagem. Inicie o contato manualmente.",
        actionPath: "/contatos",
        assignmentId: input.assignmentId,
        customerName: input.prospectName,
      });
      return { sent: false, reason: "send_failed" };
    }

    const stage = "awaiting_response";
    await query(
      `UPDATE prospect_assignments
       SET current_stage = ?, assignment_status = 'active', last_interaction_at = NOW()
       WHERE id = ?`,
      [stage, input.assignmentId]
    );
    await this.scheduleNextFollowup(input.assignmentId, rules, 0);

    return { sent: true, stage };
  }

  private resolveFollowupTemplate(rules?: any): string {
    const custom = String(rules?.followup_message_template || "").trim();
    return custom || DEFAULT_FOLLOWUP_TEMPLATE;
  }

  private async scheduleNextFollowup(assignmentId: string, rules?: any, followupIndex = 0) {
    const enabled = rules?.followup_enabled !== false && rules?.followup_enabled !== 0;
    const delays = parseFollowupDelays(rules?.followup_delays_hours_json);
    if (!enabled || followupIndex >= delays.length) {
      await query(`UPDATE prospect_assignments SET next_followup_at = NULL WHERE id = ?`, [assignmentId]);
      return null;
    }
    const hours = delays[followupIndex];
    const nextAt = new Date(Date.now() + hours * 3_600_000).toISOString();
    await query(
      `UPDATE prospect_assignments SET next_followup_at = ? WHERE id = ?`,
      [nextAt, assignmentId]
    );
    return hours;
  }

  async updateRules(
    ownerUserId: string,
    brandId: string,
    patch: {
      is_enabled?: boolean;
      max_daily_per_affiliate?: number;
      auto_enqueue_capture?: boolean;
      auto_send_initial_message?: boolean;
      initial_message_template?: string | null;
      followup_enabled?: boolean;
      followup_delays_hours_json?: string | null;
      followup_message_template?: string | null;
      require_whatsapp_connected?: boolean;
      require_training_complete?: boolean;
      require_terms_accepted?: boolean;
      require_pix_key?: boolean;
      allowed_regions_json?: string | null;
      program_id?: string | null;
    }
  ) {
    await this.ensureSchema();
    const rules = await this.getOrCreateRules(ownerUserId, brandId, patch.program_id);
    const fields: string[] = [];
    const values: any[] = [];

    if (patch.is_enabled !== undefined) {
      fields.push("is_enabled = ?");
      values.push(!!patch.is_enabled);
    }
    if (patch.max_daily_per_affiliate !== undefined) {
      fields.push("max_daily_per_affiliate = ?");
      values.push(Math.max(1, Math.min(500, Number(patch.max_daily_per_affiliate) || 20)));
    }
    if (patch.auto_enqueue_capture !== undefined) {
      fields.push("auto_enqueue_capture = ?");
      values.push(!!patch.auto_enqueue_capture);
    }
    if (patch.auto_send_initial_message !== undefined) {
      fields.push("auto_send_initial_message = ?");
      values.push(!!patch.auto_send_initial_message);
    }
    if (patch.initial_message_template !== undefined) {
      fields.push("initial_message_template = ?");
      values.push(patch.initial_message_template ? String(patch.initial_message_template).trim() : null);
    }
    if (patch.followup_enabled !== undefined) {
      fields.push("followup_enabled = ?");
      values.push(!!patch.followup_enabled);
    }
    if (patch.followup_delays_hours_json !== undefined) {
      fields.push("followup_delays_hours_json = ?");
      values.push(patch.followup_delays_hours_json ? String(patch.followup_delays_hours_json).trim() : null);
    }
    if (patch.followup_message_template !== undefined) {
      fields.push("followup_message_template = ?");
      values.push(patch.followup_message_template ? String(patch.followup_message_template).trim() : null);
    }
    if (patch.require_whatsapp_connected !== undefined) {
      fields.push("require_whatsapp_connected = ?");
      values.push(!!patch.require_whatsapp_connected);
    }
    if (patch.require_training_complete !== undefined) {
      fields.push("require_training_complete = ?");
      values.push(!!patch.require_training_complete);
    }
    if (patch.require_terms_accepted !== undefined) {
      fields.push("require_terms_accepted = ?");
      values.push(!!patch.require_terms_accepted);
    }
    if (patch.require_pix_key !== undefined) {
      fields.push("require_pix_key = ?");
      values.push(!!patch.require_pix_key);
    }
    if (patch.allowed_regions_json !== undefined) {
      fields.push("allowed_regions_json = ?");
      values.push(patch.allowed_regions_json ? String(patch.allowed_regions_json).trim() : null);
    }

    if (!fields.length) return rules;

    values.push(rules.id, ownerUserId, brandId);
    await query(
      `UPDATE lead_distribution_rules SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = ? AND owner_user_id = ? AND brand_id = ?`,
      values
    );
    return this.getOrCreateRules(ownerUserId, brandId, patch.program_id ?? rules.program_id);
  }

  async getDistributionOverview(ownerUserId: string, brandId: string) {
    await this.ensureSchema();
    // Atualiza elegibilidade antes de reportar KPIs (evita número stale)
    await this.refreshAllDistributionStatuses(ownerUserId, brandId).catch(() => undefined);

    const rules = await this.getOrCreateRules(ownerUserId, brandId);
    const counts = await queryOne<any>(
      `SELECT
         SUM(CASE WHEN queue_status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN queue_status = 'processing' THEN 1 ELSE 0 END) AS processing,
         SUM(CASE WHEN queue_status = 'assigned' THEN 1 ELSE 0 END) AS assigned,
         SUM(CASE WHEN queue_status = 'pending' AND error_message IS NOT NULL AND TRIM(error_message) != '' THEN 1 ELSE 0 END) AS stuck,
         COUNT(*) AS total
       FROM lead_distribution_queue
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );
    const eligible = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM affiliate_distribution_status
       WHERE owner_user_id = ? AND brand_id = ?
         AND distribution_status = 'available' AND whatsapp_status = 'connected'`,
      [ownerUserId, brandId]
    );
    const distStatus = await queryOne<any>(
      `SELECT
         SUM(CASE WHEN distribution_status = 'available' THEN 1 ELSE 0 END) AS available,
         SUM(CASE WHEN distribution_status = 'ineligible' THEN 1 ELSE 0 END) AS ineligible,
         SUM(CASE WHEN distribution_status = 'paused' THEN 1 ELSE 0 END) AS paused,
         SUM(CASE WHEN distribution_status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
         SUM(CASE WHEN whatsapp_status = 'connected' THEN 1 ELSE 0 END) AS wa_connected,
         COUNT(*) AS total_tracked
       FROM affiliate_distribution_status
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );
    const assignmentsOpen = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM prospect_assignments
       WHERE owner_user_id = ? AND brand_id = ? AND conversion_status = 'open'`,
      [ownerUserId, brandId]
    );
    const assignmentsNeedAttention = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM prospect_assignments
       WHERE owner_user_id = ? AND brand_id = ? AND conversion_status = 'open'
         AND current_stage = 'needs_human_attention'`,
      [ownerUserId, brandId]
    );
    const convertedWeek = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM prospect_assignments
       WHERE owner_user_id = ? AND brand_id = ? AND conversion_status = 'converted'
         AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [ownerUserId, brandId]
    );
    const oldestPending = await queryOne<{ queued_at?: string | null }>(
      `SELECT queued_at FROM lead_distribution_queue
       WHERE owner_user_id = ? AND brand_id = ? AND queue_status = 'pending'
       ORDER BY queued_at ASC LIMIT 1`,
      [ownerUserId, brandId]
    );
    const unreadAlerts = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM affiliate_alerts
       WHERE owner_user_id = ? AND brand_id = ? AND is_read = FALSE`,
      [ownerUserId, brandId]
    );

    const pending = Number(counts?.pending || 0);
    const stuck = Number(counts?.stuck || 0);
    const eligibleCount = Number(eligible?.total || 0);

    return {
      rules,
      queue: {
        pending,
        processing: Number(counts?.processing || 0),
        assigned: Number(counts?.assigned || 0),
        stuck,
        total: Number(counts?.total || 0),
        oldest_pending_at: oldestPending?.queued_at ? String(oldestPending.queued_at) : null,
      },
      eligible_affiliates: eligibleCount,
      open_assignments: Number(assignmentsOpen?.total || 0),
      needs_attention: Number(assignmentsNeedAttention?.total || 0),
      converted_week: Number(convertedWeek?.total || 0),
      alerts_unread: Number(unreadAlerts?.total || 0),
      network: {
        available: Number(distStatus?.available || 0),
        ineligible: Number(distStatus?.ineligible || 0),
        paused: Number(distStatus?.paused || 0),
        blocked: Number(distStatus?.blocked || 0),
        wa_connected: Number(distStatus?.wa_connected || 0),
        total_tracked: Number(distStatus?.total_tracked || 0),
      },
      health: {
        ok: !(pending > 0 && eligibleCount === 0),
        stuck_queue: stuck > 0 || (pending > 0 && eligibleCount === 0),
        message:
          pending > 0 && eligibleCount === 0
            ? "Fila com prospects e nenhum afiliado elegível"
            : stuck > 0
              ? "Itens na fila com erro de distribuição"
              : "Rede operacional",
      },
    };
  }

  async getOrCreateRules(ownerUserId: string, brandId: string, programId?: string | null) {
    await this.ensureSchema();
    const prog = programId ? String(programId).trim() : "";
    // Postgres: não usar `? IS NULL` com bind null (tipo indeterminado)
    let row = prog
      ? await queryOne<any>(
          `SELECT * FROM lead_distribution_rules
           WHERE owner_user_id = ? AND brand_id = ? AND program_id = ?
           LIMIT 1`,
          [ownerUserId, brandId, prog]
        )
      : await queryOne<any>(
          `SELECT * FROM lead_distribution_rules
           WHERE owner_user_id = ? AND brand_id = ? AND program_id IS NULL
           LIMIT 1`,
          [ownerUserId, brandId]
        );
    if (row) return row;

    const id = randomUUID();
    await query(
      `INSERT INTO lead_distribution_rules
       (id, owner_user_id, brand_id, program_id, is_enabled, max_daily_per_affiliate, rotation_mode,
        require_whatsapp_connected, require_training_complete, require_terms_accepted, auto_enqueue_capture)
       VALUES (?, ?, ?, ?, TRUE, 20, 'round_robin', TRUE, TRUE, TRUE, TRUE)`,
      [id, ownerUserId, brandId, prog || null]
    );
    row = await queryOne<any>(`SELECT * FROM lead_distribution_rules WHERE id = ? LIMIT 1`, [id]);
    return row;
  }

  private async resolveActiveEnrollment(affiliateId: string, brandId: string, affiliateUserId: string) {
    const enrollment = await queryOne<any>(
      `SELECT e.*, p.name AS program_name
       FROM affiliate_program_enrollments e
       LEFT JOIN affiliate_programs p ON p.id = e.program_id
       WHERE e.affiliate_id = ? AND e.brand_id = ?
       ORDER BY
         CASE e.status WHEN 'active' THEN 0 WHEN 'onboarding' THEN 1 ELSE 2 END,
         e.updated_at DESC
       LIMIT 1`,
      [affiliateId, brandId]
    );
    if (enrollment) return enrollment;

    return queryOne<any>(
      `SELECT e.*, p.name AS program_name
       FROM affiliate_program_enrollments e
       LEFT JOIN affiliate_programs p ON p.id = e.program_id
       WHERE e.affiliate_user_id = ? AND e.brand_id = ?
       ORDER BY e.updated_at DESC
       LIMIT 1`,
      [affiliateUserId, brandId]
    );
  }

  async syncAffiliateDistributionStatus(input: {
    ownerUserId: string;
    brandId: string;
    affiliateId: string;
    affiliateUserId: string;
  }): Promise<AffiliateEligibilitySnapshot> {
    await this.ensureSchema();

    const affiliate = await queryOne<any>(
      `SELECT * FROM affiliates WHERE id = ? AND brand_id = ? LIMIT 1`,
      [input.affiliateId, input.brandId]
    );
    const enrollment = await this.resolveActiveEnrollment(
      input.affiliateId,
      input.brandId,
      input.affiliateUserId
    );
    // membership.organization_id = brand_id (ver affiliateGlobal.syncMemberships)
    const programIdForScope = enrollment?.program_id ? String(enrollment.program_id) : "";
    const membership = programIdForScope
      ? await queryOne<any>(
          `SELECT * FROM affiliate_program_memberships
           WHERE affiliate_user_id = ? AND organization_id = ? AND program_id = ?
           ORDER BY updated_at DESC LIMIT 1`,
          [input.affiliateUserId, input.brandId, programIdForScope]
        )
      : await queryOne<any>(
          `SELECT * FROM affiliate_program_memberships
           WHERE affiliate_user_id = ? AND organization_id = ?
           ORDER BY
             CASE status WHEN 'approved' THEN 0 WHEN 'pre_approved' THEN 1 WHEN 'active' THEN 0 ELSE 2 END,
             updated_at DESC
           LIMIT 1`,
          [input.affiliateUserId, input.brandId]
        );

    const application = programIdForScope
      ? await queryOne<any>(
          `SELECT accepted_terms_at, status, program_id
           FROM affiliate_program_applications
           WHERE affiliate_user_id = ? AND brand_id = ? AND program_id = ?
           ORDER BY updated_at DESC LIMIT 1`,
          [input.affiliateUserId, input.brandId, programIdForScope]
        )
      : await queryOne<any>(
          `SELECT accepted_terms_at, status, program_id
           FROM affiliate_program_applications
           WHERE affiliate_user_id = ? AND brand_id = ?
           ORDER BY updated_at DESC LIMIT 1`,
          [input.affiliateUserId, input.brandId]
        );

    const rules = await this.getOrCreateRules(
      input.ownerUserId,
      input.brandId,
      enrollment?.program_id || null
    );
    const requireTerms = rules?.require_terms_accepted !== 0 && rules?.require_terms_accepted !== false;
    const requireTraining = rules?.require_training_complete !== 0 && rules?.require_training_complete !== false;
    const requireWhatsapp = rules?.require_whatsapp_connected !== 0 && rules?.require_whatsapp_connected !== false;
    const requirePix = rules?.require_pix_key === true || rules?.require_pix_key === 1;

    const health = await getHealthSnapshot({
      userId: input.ownerUserId,
      brandId: input.brandId,
      isAffiliate: true,
      ownerActorId: input.affiliateUserId,
    });
    const whatsappStatus = mapWhatsappStatus(health.summary, health.instances || []);
    const connectedInstance = (health.instances || []).find(
      (i) => i.status_runtime === "connected" && !i.drift
    ) || (health.instances || []).find(
      (i) => !i.drift && i.status_runtime === "unknown" && i.status_db === "connected"
    ) || (health.instances || []).find((i) => i.status_runtime === "connected");

    const affiliateActive = String(affiliate?.status || "").toLowerCase() === "active";
    const enrollmentActive = String(enrollment?.status || "").toLowerCase() === "active";
    const onboardingDone = Boolean(
      enrollment?.onboarding_completed_at || enrollment?.resources_unlocked_at
    );

    // Termos: timestamps de aceite + progresso da etapa terms_accept do onboarding.
    // Se o programa não tem terms_html e não tem etapa de termos, não bloqueia.
    let programTermsHtml: string | null = null;
    let programRequiresTerms = false;
    let termsStepCompleted = false;
    if (enrollment?.program_id) {
      const progTerms = await queryOne<{ terms_html?: string | null }>(
        `SELECT terms_html FROM affiliate_programs WHERE id = ? LIMIT 1`,
        [enrollment.program_id]
      );
      programTermsHtml = String(progTerms?.terms_html || "").trim() || null;
      const termsSteps = await query<any[]>(
        `SELECT id FROM affiliate_program_steps
         WHERE program_id = ? AND step_type = 'terms_accept'`,
        [enrollment.program_id]
      );
      programRequiresTerms = Boolean(programTermsHtml) || (termsSteps || []).length > 0;
      if (enrollment?.id && (termsSteps || []).length) {
        const completed = await queryOne<any>(
          `SELECT id FROM affiliate_program_progress
           WHERE enrollment_id = ?
             AND item_type = 'step'
             AND status = 'completed'
             AND item_id IN (${(termsSteps || []).map(() => "?").join(",")})
           LIMIT 1`,
          [enrollment.id, ...(termsSteps || []).map((s) => s.id)]
        );
        termsStepCompleted = Boolean(completed);
      }
    }
    let termsAccepted = Boolean(
      membership?.accepted_terms_at
      || application?.accepted_terms_at
      || termsStepCompleted
    );
    // Backfill: se o onboarding marcou a etapa mas o timestamp não foi gravado
    if (termsAccepted && enrollment?.id && !(membership?.accepted_terms_at || application?.accepted_terms_at)) {
      void this.stampTermsAccepted({
        affiliateUserId: input.affiliateUserId,
        brandId: input.brandId,
        programId: enrollment.program_id ? String(enrollment.program_id) : null,
        enrollmentId: String(enrollment.id),
      }).catch(() => undefined);
    }
    const termsOk = !requireTerms || !programRequiresTerms || termsAccepted;

    // Treinamento: progresso real ou onboarding concluído — não atalho por status active
    const trainingComplete = Boolean(
      membership?.training_status === "completed"
      || onboardingDone
    );
    const trainingOk = !requireTraining || trainingComplete;

    const whatsappOk = !requireWhatsapp || whatsappStatus === "connected";
    const hasPix = Boolean(String(affiliate?.pix_key || "").trim());
    const pixOk = !requirePix || hasPix;

    const enrollmentStatus = String(enrollment?.status || "").toLowerCase();
    // "programa ativo" para checklist: enrollment active. Onboarding incompleto tem ação dedicada.
    let programAction: string | null = null;
    let programCta: string | null = null;
    let programPath: string | null = null;
    if (enrollmentActive) {
      programAction = null;
    } else if (enrollmentStatus === "onboarding") {
      programAction = "Conclua as etapas do onboarding do programa";
      programCta = "Abrir onboarding";
      programPath = enrollment?.id ? `/aprendizado?onboarding=${encodeURIComponent(String(enrollment.id))}` : "/aprendizado";
    } else if (enrollment) {
      programAction = "Aguarde a ativação do programa ou conclua o onboarding";
      programCta = "Ver programa";
      programPath = "/mercado";
    } else {
      programAction = "Entre em um programa no Mercado";
      programCta = "Abrir Mercado";
      programPath = "/mercado";
    }

    const checklist: EligibilityChecklistItem[] = [
      {
        key: "affiliate_active",
        label: "Conta de afiliado ativa",
        ok: affiliateActive,
        action: affiliateActive ? null : "Aguarde aprovação da organização",
        cta: null,
        action_path: null,
      },
      {
        key: "program_active",
        label: enrollmentStatus === "onboarding" ? "Onboarding do programa" : "Programa aprovado e ativo",
        ok: enrollmentActive,
        action: programAction,
        cta: programCta,
        action_path: programPath,
      },
      {
        key: "terms",
        label: "Termos aceitos",
        ok: termsOk,
        action: termsOk ? null : "Leia e aceite os termos do programa para liberar a distribuição",
        cta: termsOk ? null : "Aceitar termos",
        action_path: termsOk ? null : "accept_terms",
      },
      {
        key: "training",
        label: "Treinamento concluído",
        ok: trainingOk,
        action: trainingOk ? null : "Conclua o treinamento em Aprender",
        cta: trainingOk ? null : "Abrir Aprender",
        action_path: trainingOk ? null : "/aprendizado",
      },
      {
        key: "whatsapp",
        label: "WhatsApp conectado",
        ok: whatsappOk,
        action: whatsappOk ? null : "Conecte seu WhatsApp para receber contatos",
        cta: whatsappOk ? null : "Conectar WhatsApp",
        action_path: whatsappOk ? null : "/conexoes",
      },
      {
        key: "pix",
        label: "Chave Pix cadastrada",
        ok: pixOk,
        action: pixOk ? null : "Cadastre sua chave Pix em Carteira",
        cta: pixOk ? null : "Abrir Pix",
        action_path: pixOk ? null : "/pagamentos",
      },
    ];

    const blockers = checklist.filter((c) => !c.ok).map((c) => c.label);
    let distributionStatus: DistributionStatusValue = "ineligible";
    let pauseReason: string | null = null;

    if (!affiliateActive || String(affiliate?.status || "").toLowerCase() === "blocked") {
      distributionStatus = "blocked";
      pauseReason = "Conta bloqueada ou inativa";
    } else if (blockers.length) {
      distributionStatus = "ineligible";
      pauseReason = blockers[0] || null;
    } else {
      distributionStatus = "available";
    }

    // WA desconectado: pausa recebimento mesmo se os demais gates ok
    if (requireWhatsapp && (whatsappStatus === "disconnected" || whatsappStatus === "none")) {
      if (distributionStatus === "available") {
        distributionStatus = "paused";
        pauseReason = "WhatsApp desconectado";
      }
    }

    const programId = enrollment?.program_id ? String(enrollment.program_id) : null;
    const existing = await queryOne<any>(
      `SELECT id FROM affiliate_distribution_status WHERE affiliate_id = ? AND brand_id = ? LIMIT 1`,
      [input.affiliateId, input.brandId]
    );
    const rowId = existing?.id || randomUUID();
    const eligibleAt = distributionStatus === "available" ? new Date() : null;

    await query(
      `INSERT INTO affiliate_distribution_status
       (id, owner_user_id, brand_id, program_id, affiliate_id, affiliate_user_id,
        distribution_status, whatsapp_status, membership_status, terms_accepted, training_complete,
        pause_reason, eligible_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         program_id = VALUES(program_id),
         distribution_status = VALUES(distribution_status),
         whatsapp_status = VALUES(whatsapp_status),
         membership_status = VALUES(membership_status),
         terms_accepted = VALUES(terms_accepted),
         training_complete = VALUES(training_complete),
         pause_reason = VALUES(pause_reason),
         eligible_at = COALESCE(VALUES(eligible_at), affiliate_distribution_status.eligible_at),
         updated_at = NOW()`,
      [
        rowId,
        input.ownerUserId,
        input.brandId,
        programId,
        input.affiliateId,
        input.affiliateUserId,
        distributionStatus,
        whatsappStatus,
        enrollment?.status || membership?.status || null,
        termsOk,
        trainingOk,
        pauseReason,
        eligibleAt,
      ]
    );

    if (
      requireWhatsapp
      && (whatsappStatus === "disconnected" || whatsappStatus === "none")
      && (distributionStatus === "paused" || distributionStatus === "ineligible")
    ) {
      await this.ensureAlert({
        ownerUserId: input.ownerUserId,
        brandId: input.brandId,
        affiliateId: input.affiliateId,
        affiliateUserId: input.affiliateUserId,
        alertType: "whatsapp_disconnected",
        severity: "warning",
        title: "WhatsApp desconectado",
        body: "Reconecte para voltar a receber contatos. Novos leads ficam em pausa.",
        actionPath: "/conexoes",
      });
    } else if (whatsappStatus === "connected") {
      // Limpa alerta de desconexão quando já reconectou
      try {
        await query(
          `UPDATE affiliate_alerts
           SET is_read = TRUE, updated_at = NOW()
           WHERE affiliate_id = ? AND brand_id = ?
             AND alert_type = 'whatsapp_disconnected' AND is_read = FALSE`,
          [input.affiliateId, input.brandId],
        );
      } catch {
        /* coluna/tabela opcional */
      }
    }

    const stats = await this.loadAffiliateStats(input.affiliateId, input.brandId, input.ownerUserId);

    return {
      can_receive: distributionStatus === "available",
      distribution_status: distributionStatus,
      whatsapp_status: whatsappStatus,
      blockers,
      checklist,
      program_id: programId,
      program_name: enrollment?.program_name ? String(enrollment.program_name) : null,
      enrollment_id: enrollment?.id ? String(enrollment.id) : null,
      enrollment_status: enrollment?.status ? String(enrollment.status) : null,
      terms_html: !termsOk ? programTermsHtml : null,
      connected_instance_id: connectedInstance?.id ? String(connectedInstance.id) : null,
      connected_instance_name: connectedInstance?.name ? String(connectedInstance.name) : null,
      connected_instances: (health.instances || []).filter(
        (i) => i.status_runtime === "connected" && !i.drift
      ).length,
      stats,
    };
  }

  /**
   * Registra aceite de termos de forma canônica (membership + application + progresso).
   * Usado pelo onboarding e pelo CTA do Ao Vivo.
   */
  async stampTermsAccepted(input: {
    affiliateUserId: string;
    brandId: string;
    programId?: string | null;
    enrollmentId?: string | null;
  }) {
    const programId = input.programId ? String(input.programId).trim() : "";
    const enrollmentId = input.enrollmentId ? String(input.enrollmentId).trim() : "";

    if (programId) {
      await query(
        `UPDATE affiliate_program_memberships
         SET accepted_terms_at = COALESCE(accepted_terms_at, NOW()), updated_at = NOW()
         WHERE affiliate_user_id = ? AND organization_id = ? AND program_id = ?`,
        [input.affiliateUserId, input.brandId, programId],
      ).catch(() => undefined);
      await query(
        `UPDATE affiliate_program_applications
         SET accepted_terms_at = COALESCE(accepted_terms_at, NOW()), updated_at = NOW()
         WHERE affiliate_user_id = ? AND brand_id = ? AND program_id = ?`,
        [input.affiliateUserId, input.brandId, programId],
      ).catch(() => undefined);
    } else {
      await query(
        `UPDATE affiliate_program_memberships
         SET accepted_terms_at = COALESCE(accepted_terms_at, NOW()), updated_at = NOW()
         WHERE affiliate_user_id = ? AND organization_id = ?`,
        [input.affiliateUserId, input.brandId],
      ).catch(() => undefined);
      await query(
        `UPDATE affiliate_program_applications
         SET accepted_terms_at = COALESCE(accepted_terms_at, NOW()), updated_at = NOW()
         WHERE affiliate_user_id = ? AND brand_id = ?`,
        [input.affiliateUserId, input.brandId],
      ).catch(() => undefined);
    }

    if (enrollmentId && programId) {
      const termsSteps = await query<any[]>(
        `SELECT id FROM affiliate_program_steps
         WHERE program_id = ? AND step_type = 'terms_accept'`,
        [programId],
      );
      for (const step of termsSteps || []) {
        const existing = await queryOne<any>(
          `SELECT id, status FROM affiliate_program_progress
           WHERE enrollment_id = ? AND item_type = 'step' AND item_id = ? LIMIT 1`,
          [enrollmentId, step.id],
        );
        if (existing?.status === "completed") continue;
        const enrollment = await queryOne<any>(
          `SELECT affiliate_id FROM affiliate_program_enrollments WHERE id = ? LIMIT 1`,
          [enrollmentId],
        );
        if (existing) {
          await query(
            `UPDATE affiliate_program_progress
             SET status = 'completed',
                 payload_json = ?,
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify({ terms_accepted: true, source: "stamp" }), existing.id],
          );
        } else {
          await query(
            `INSERT INTO affiliate_program_progress
             (id, enrollment_id, program_id, affiliate_id, item_type, item_id, status, payload_json, completed_at)
             VALUES (?, ?, ?, ?, 'step', ?, 'completed', ?, NOW())`,
            [
              randomUUID(),
              enrollmentId,
              programId,
              enrollment?.affiliate_id || null,
              step.id,
              JSON.stringify({ terms_accepted: true, source: "stamp" }),
            ],
          );
        }
      }
    }
  }

  /** Aceite explícito de termos a partir do app (Ao Vivo / elegibilidade). */
  async acceptTermsForAffiliate(input: {
    ownerUserId: string;
    brandId: string;
    affiliateId: string;
    affiliateUserId: string;
    accepted: boolean;
  }) {
    if (!input.accepted) {
      throw new Error("Marque a confirmação para aceitar os termos");
    }
    const enrollment = await this.resolveActiveEnrollment(
      input.affiliateId,
      input.brandId,
      input.affiliateUserId,
    );
    if (!enrollment) {
      throw new Error("Nenhuma inscrição de programa encontrada para esta marca");
    }

    await this.stampTermsAccepted({
      affiliateUserId: input.affiliateUserId,
      brandId: input.brandId,
      programId: enrollment.program_id ? String(enrollment.program_id) : null,
      enrollmentId: String(enrollment.id),
    });

    // Avança enrollment se todos os steps obrigatórios já estiverem ok
    try {
      const steps = await query<any[]>(
        `SELECT * FROM affiliate_program_steps WHERE program_id = ? ORDER BY sort_order ASC`,
        [enrollment.program_id],
      );
      await affiliateProgramsService.advanceEnrollment(enrollment, steps || []);
    } catch {
      /* advance opcional */
    }

    return this.syncAffiliateDistributionStatus({
      ownerUserId: input.ownerUserId,
      brandId: input.brandId,
      affiliateId: input.affiliateId,
      affiliateUserId: input.affiliateUserId,
    });
  }

  private async loadAffiliateStats(affiliateId: string, brandId: string, ownerUserId: string) {
    const assigned = await queryOne<{ total: number; active: number; today: number }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN assignment_status NOT IN ('lost', 'converted', 'recycled') THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN DATE(assigned_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS today
       FROM prospect_assignments
       WHERE affiliate_id = ? AND brand_id = ?`,
      [affiliateId, brandId]
    );
    const alerts = await queryOne<{ unread: number }>(
      `SELECT COUNT(*) AS unread FROM affiliate_alerts
       WHERE affiliate_id = ? AND brand_id = ? AND is_read = FALSE`,
      [affiliateId, brandId]
    );
    const queued = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM lead_distribution_queue
       WHERE owner_user_id = ? AND brand_id = ? AND queue_status = 'pending'`,
      [ownerUserId, brandId]
    );
    return {
      assigned_total: Number(assigned?.total || 0),
      assigned_active: Number(assigned?.active || 0),
      assigned_today: Number(assigned?.today || 0),
      alerts_unread: Number(alerts?.unread || 0),
      queued_for_brand: Number(queued?.total || 0),
    };
  }

  async listAssignmentsForAffiliate(affiliateId: string, brandId: string, limit = 50) {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM prospect_assignments
       WHERE affiliate_id = ? AND brand_id = ?
       ORDER BY assigned_at DESC
       LIMIT ?`,
      [affiliateId, brandId, Math.min(limit, 100)]
    );
    return (rows || []).map((r) => this.mapAssignment(r));
  }

  private mapAssignment(r: any) {
    let metadata: Record<string, any> = {};
    try { metadata = typeof r.metadata_json === "string" ? JSON.parse(r.metadata_json || "{}") : (r.metadata_json || {}); } catch { metadata = {}; }
    const niche = String(
      metadata.niche || metadata.keyword || metadata.palavra_chave || metadata.segment
      || metadata.category || metadata.categoria || ""
    ).trim() || null;
    return {
      id: String(r.id),
      prospect_id: String(r.prospect_id),
      prospect_name: r.prospect_name ? String(r.prospect_name) : null,
      prospect_phone: r.prospect_phone ? String(r.prospect_phone) : null,
      prospect_city: r.prospect_city ? String(r.prospect_city) : null,
      prospect_region: r.prospect_region ? String(r.prospect_region) : null,
      source: String(r.source || "distribution"),
      assignment_status: String(r.assignment_status || "assigned"),
      current_stage: String(r.current_stage || "assigned_to_affiliate"),
      assigned_at: r.assigned_at ? String(r.assigned_at) : null,
      last_interaction_at: r.last_interaction_at ? String(r.last_interaction_at) : null,
      next_followup_at: r.next_followup_at ? String(r.next_followup_at) : null,
      conversion_status: String(r.conversion_status || "open"),
      niche,
    };
  }

  async listAlerts(affiliateUserId: string, brandId: string, limit = 30) {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM affiliate_alerts
       WHERE affiliate_user_id = ? AND brand_id = ?
       ORDER BY is_read ASC, created_at DESC
       LIMIT ?`,
      [affiliateUserId, brandId, Math.min(limit, 50)]
    );
    return (rows || []).map((r) => ({
      id: String(r.id),
      alert_type: String(r.alert_type),
      severity: String(r.severity || "info"),
      title: String(r.title),
      body: r.body ? String(r.body) : null,
      action_path: r.action_path ? String(r.action_path) : null,
      assignment_id: r.assignment_id ? String(r.assignment_id) : null,
      is_read: !!r.is_read,
      created_at: r.created_at ? String(r.created_at) : null,
    }));
  }

  async markAlertRead(alertId: string, affiliateUserId: string, brandId: string) {
    await this.ensureSchema();
    await query(
      `UPDATE affiliate_alerts SET is_read = TRUE
       WHERE id = ? AND affiliate_user_id = ? AND brand_id = ?`,
      [alertId, affiliateUserId, brandId]
    );
  }

  /** Alertas de infraestrutura: dedupe por tipo. Comerciais: por assignment. */
  private static readonly INFRA_ALERT_TYPES = new Set([
    "whatsapp_disconnected",
  ]);

  private async ensureAlert(input: {
    ownerUserId: string;
    brandId: string;
    affiliateId: string;
    affiliateUserId: string;
    alertType: string;
    severity: string;
    title: string;
    body?: string;
    actionPath?: string;
    assignmentId?: string;
    /** Nome do prospect/cliente para templates de notificação */
    customerName?: string | null;
  }) {
    const assignmentId = input.assignmentId ? String(input.assignmentId).trim() : "";
    const isInfra = AffiliateDistributionService.INFRA_ALERT_TYPES.has(input.alertType);

    if (assignmentId) {
      // Nunca engolir um lead/reply distinto: dedupe só no mesmo assignment + tipo
      const recent = await queryOne<any>(
        `SELECT id FROM affiliate_alerts
         WHERE affiliate_user_id = ? AND brand_id = ? AND alert_type = ?
           AND assignment_id = ? AND is_read = FALSE
           AND created_at >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
         LIMIT 1`,
        [input.affiliateUserId, input.brandId, input.alertType, assignmentId]
      );
      if (recent?.id) return;
    } else if (isInfra) {
      // WA offline etc.: um unread por tipo basta
      const recent = await queryOne<any>(
        `SELECT id FROM affiliate_alerts
         WHERE affiliate_user_id = ? AND brand_id = ? AND alert_type = ? AND is_read = FALSE
           AND created_at >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
         LIMIT 1`,
        [input.affiliateUserId, input.brandId, input.alertType]
      );
      if (recent?.id) return;
    }

    const actionPath = input.actionPath || "/contatos";

    await query(
      `INSERT INTO affiliate_alerts
       (id, owner_user_id, brand_id, affiliate_id, affiliate_user_id, alert_type, severity, title, body, action_path, assignment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.ownerUserId,
        input.brandId,
        input.affiliateId,
        input.affiliateUserId,
        input.alertType,
        input.severity,
        input.title,
        input.body || null,
        actionPath,
        assignmentId || null,
      ]
    );

    void this.emitAlertPlatformNotification({
      ...input,
      actionPath,
      assignmentId: assignmentId || undefined,
    });
  }

  private async emitAlertPlatformNotification(input: {
    brandId: string;
    affiliateId: string;
    affiliateUserId: string;
    alertType: string;
    actionPath?: string;
    assignmentId?: string;
    customerName?: string | null;
    body?: string;
    title?: string;
  }): Promise<void> {
    try {
      const { emitPlatformEventToUser } = await import("./notificationHub");
      const customerName = String(input.customerName || "Contato").trim() || "Contato";
      const deepLink = input.actionPath || "/contatos";

      const base = {
        organization_id: input.brandId,
        role: "affiliate" as const,
        deep_link: deepLink,
        template_vars: {
          brand_id: input.brandId,
          customer_name: customerName,
          product_suffix: "",
          message_suffix: "",
          amount_suffix: "",
        },
      };

      switch (input.alertType) {
        case "whatsapp_disconnected":
          await emitPlatformEventToUser("affiliate.whatsapp.disconnected", input.affiliateUserId, {
            ...base,
            entity_type: "affiliate",
            entity_id: input.affiliateId,
            deep_link: "/conexoes",
          });
          break;
        case "new_prospect":
          await emitPlatformEventToUser("affiliate.lead.assigned", input.affiliateUserId, {
            ...base,
            entity_type: "prospect_assignment",
            entity_id: input.assignmentId || input.affiliateId,
          });
          break;
        case "prospect_replied":
          await emitPlatformEventToUser("affiliate.lead.hot", input.affiliateUserId, {
            ...base,
            entity_type: "prospect_assignment",
            entity_id: input.assignmentId || input.affiliateId,
            template_vars: {
              ...base.template_vars,
              message_suffix: " no WhatsApp",
              body_preview: input.body || input.title || "",
            },
          });
          break;
        case "initial_message_failed":
          await emitPlatformEventToUser("affiliate.system.message_send_failed", input.affiliateUserId, {
            ...base,
            entity_type: "prospect_assignment",
            entity_id: input.assignmentId || input.affiliateId,
            deep_link: "/contatos",
          });
          break;
        case "prospect_converted":
          await emitPlatformEventToUser("affiliate.customer.converted", input.affiliateUserId, {
            ...base,
            entity_type: "prospect_assignment",
            entity_id: input.assignmentId || input.affiliateId,
            deep_link: "/clientes",
          });
          break;
        case "followup_needs_attention":
          await emitPlatformEventToUser("affiliate.lead.followup_due", input.affiliateUserId, {
            ...base,
            entity_type: "prospect_assignment",
            entity_id: input.assignmentId || input.affiliateId,
            deep_link: "/contatos",
          });
          break;
        default:
          break;
      }
    } catch {
      /* notificação não deve bloquear distribuição */
    }
  }

  async enqueueProspect(input: {
    ownerUserId: string;
    brandId: string;
    prospectId: string;
    prospectRefTable?: string;
    source?: string;
    programId?: string | null;
    priorityScore?: number;
    metadata?: Record<string, unknown>;
  }) {
    await this.ensureSchema();
    const rules = await this.getOrCreateRules(input.ownerUserId, input.brandId, input.programId);
    if (!rules?.is_enabled) {
      return { queued: false, reason: "Distribuição desabilitada para esta marca" };
    }

    // address_city/address_state podem não existir em schemas antigos — tenta full, fallback mínimo
    let prospect: any = null;
    try {
      prospect = await queryOne<any>(
        `SELECT id, name, phone, city, state, address_city, address_state, owner_user_id, brand_id
         FROM customers WHERE id = ? AND owner_user_id = ? LIMIT 1`,
        [input.prospectId, input.ownerUserId]
      );
    } catch (colErr: any) {
      if (String(colErr?.message || "").includes("does not exist") || String(colErr?.message || "").includes("Unknown column")) {
        prospect = await queryOne<any>(
          `SELECT id, name, phone, city, state, owner_user_id, brand_id
           FROM customers WHERE id = ? AND owner_user_id = ? LIMIT 1`,
          [input.prospectId, input.ownerUserId]
        );
      } else {
        throw colErr;
      }
    }
    if (!prospect) {
      return { queued: false, reason: "Prospect não encontrado" };
    }

    const dup = await queryOne<any>(
      `SELECT id FROM lead_distribution_queue
       WHERE prospect_id = ? AND brand_id = ? AND queue_status IN ('pending', 'processing')
       LIMIT 1`,
      [input.prospectId, input.brandId]
    );
    if (dup?.id) {
      return { queued: false, reason: "Prospect já está na fila", queue_id: dup.id };
    }

    const assigned = await queryOne<any>(
      `SELECT id FROM prospect_assignments
       WHERE prospect_id = ? AND brand_id = ? AND conversion_status = 'open'
         AND assignment_status NOT IN ('lost', 'recycled')
       LIMIT 1`,
      [input.prospectId, input.brandId]
    );
    if (assigned?.id) {
      return { queued: false, reason: "Prospect já atribuído", assignment_id: assigned.id };
    }

    const queueId = randomUUID();
    const region =
      String(prospect.address_state || prospect.state || prospect.address_city || prospect.city || "").trim()
      || null;
    await query(
      `INSERT INTO lead_distribution_queue
       (id, owner_user_id, brand_id, program_id, prospect_id, prospect_ref_table,
        prospect_name, prospect_phone, prospect_city, prospect_region, source, priority_score, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        queueId,
        input.ownerUserId,
        input.brandId,
        input.programId || rules.program_id || null,
        input.prospectId,
        input.prospectRefTable || "customers",
        prospect.name || null,
        prospect.phone || null,
        prospect.city || null,
        region,
        input.source || "panfleteiro_capture",
        input.priorityScore ?? 50,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    const processed = await this.processQueue(input.ownerUserId, input.brandId, 1);
    return { queued: true, queue_id: queueId, processed };
  }

  private async listEligibleAffiliates(
    ownerUserId: string,
    brandId: string,
    programId: string | null,
    region?: string | null,
    rules?: any
  ) {
    await this.ensureSchema();
    const prog = programId ? String(programId).trim() : "";
    // Multi-programa: só afiliados com enrollment active no program_id da fila
    const affiliates = prog
      ? await query<any[]>(
          `SELECT a.id, a.affiliate_user_id, a.region, d.distribution_status, d.whatsapp_status,
                  d.daily_assigned_count, d.daily_assigned_on, d.last_assigned_at, d.last_rotation_at
           FROM affiliates a
           INNER JOIN affiliate_distribution_status d ON d.affiliate_id = a.id AND d.brand_id = a.brand_id
           WHERE a.owner_user_id = ? AND a.brand_id = ? AND a.status = 'active'
             AND d.distribution_status = 'available' AND d.whatsapp_status = 'connected'
             AND EXISTS (
               SELECT 1 FROM affiliate_program_enrollments e
               WHERE e.affiliate_id = a.id AND e.brand_id = a.brand_id
                 AND e.program_id = ? AND e.status = 'active'
             )
           ORDER BY COALESCE(d.last_rotation_at, d.last_assigned_at, '1970-01-01') ASC`,
          [ownerUserId, brandId, prog]
        )
      : await query<any[]>(
          `SELECT a.id, a.affiliate_user_id, a.region, d.distribution_status, d.whatsapp_status,
                  d.daily_assigned_count, d.daily_assigned_on, d.last_assigned_at, d.last_rotation_at
           FROM affiliates a
           INNER JOIN affiliate_distribution_status d ON d.affiliate_id = a.id AND d.brand_id = a.brand_id
           WHERE a.owner_user_id = ? AND a.brand_id = ? AND a.status = 'active'
             AND d.distribution_status = 'available' AND d.whatsapp_status = 'connected'
           ORDER BY COALESCE(d.last_rotation_at, d.last_assigned_at, '1970-01-01') ASC`,
          [ownerUserId, brandId]
        );

    const maxDaily = Number(rules?.max_daily_per_affiliate || 20);
    const today = todayDateOnly();

    let allowedRegions: string[] = [];
    try {
      const raw = rules?.allowed_regions_json ? JSON.parse(String(rules.allowed_regions_json)) : null;
      if (Array.isArray(raw)) {
        allowedRegions = raw.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      allowedRegions = [];
    }

    return (affiliates || []).filter((a) => {
      const dailyOn = a.daily_assigned_on ? String(a.daily_assigned_on).slice(0, 10) : null;
      const dailyCount = dailyOn === today ? Number(a.daily_assigned_count || 0) : 0;
      if (dailyCount >= maxDaily) return false;

      if (region && a.region) {
        const affRegion = String(a.region).toLowerCase();
        const prospectRegion = String(region).toLowerCase();
        if (!affRegion.includes(prospectRegion) && !prospectRegion.includes(affRegion)) {
          return false;
        }
      }

      // Restrição da org: se configured, prospect ou afiliado precisa casar
      if (allowedRegions.length) {
        const prospectRegion = String(region || "").toLowerCase();
        const affRegion = String(a.region || "").toLowerCase();
        const hit =
          allowedRegions.some((r) => prospectRegion.includes(r) || r.includes(prospectRegion))
          || allowedRegions.some((r) => affRegion.includes(r) || r.includes(affRegion));
        if (!hit && (prospectRegion || affRegion)) return false;
        if (!hit && !prospectRegion && !affRegion) return false;
      }

      return true;
    });
  }

  async processQueue(ownerUserId: string, brandId: string, maxItems = 5) {
    await this.ensureSchema();
    await this.refreshAllDistributionStatuses(ownerUserId, brandId);

    const pending = await query<any[]>(
      `SELECT * FROM lead_distribution_queue
       WHERE owner_user_id = ? AND brand_id = ? AND queue_status = 'pending'
       ORDER BY priority_score DESC, queued_at ASC
       LIMIT ?`,
      [ownerUserId, brandId, Math.max(1, maxItems)]
    );

    const results: any[] = [];
    for (const item of pending || []) {
      const rules = await this.getOrCreateRules(ownerUserId, brandId, item.program_id);
      await query(`UPDATE lead_distribution_queue SET queue_status = 'processing' WHERE id = ?`, [item.id]);

      const eligible = await this.listEligibleAffiliates(
        ownerUserId,
        brandId,
        item.program_id,
        item.prospect_region,
        rules
      );

      if (!eligible.length) {
        await query(
          `UPDATE lead_distribution_queue
           SET queue_status = 'pending', error_message = ?
           WHERE id = ?`,
          ["Nenhum afiliado elegível no momento", item.id]
        );
        results.push({ queue_id: item.id, assigned: false, reason: "no_eligible_affiliate" });
        void this.emitNoEligibleAffiliateAlert(ownerUserId, brandId);
        continue;
      }

      const pick = eligible[0];
      const health = await getHealthSnapshot({
        userId: ownerUserId,
        brandId,
        isAffiliate: true,
        ownerActorId: pick.affiliate_user_id,
      });
      const instance = (health.instances || []).find(
        (i) => i.status_runtime === "connected" && !i.drift,
      ) || (health.instances || []).find(
        (i) => !i.drift && i.status_runtime === "unknown" && i.status_db === "connected",
      ) || (health.instances || []).find((i) => i.status_runtime === "connected");

      const assignmentId = randomUUID();
      const today = todayDateOnly();
      await query(
        `INSERT INTO prospect_assignments
         (id, owner_user_id, brand_id, program_id, prospect_id, prospect_ref_table,
          prospect_name, prospect_phone, prospect_city, prospect_region,
          affiliate_id, affiliate_user_id, instance_id, source, assignment_status, current_stage, priority_score, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', 'assigned_to_affiliate', ?, ?)`,
        [
          assignmentId,
          ownerUserId,
          brandId,
          item.program_id,
          item.prospect_id,
          item.prospect_ref_table || "customers",
          item.prospect_name,
          item.prospect_phone,
          item.prospect_city,
          item.prospect_region,
          pick.id,
          pick.affiliate_user_id,
          instance?.id || null,
          item.source || "distribution",
          item.priority_score || 50,
          typeof item.metadata_json === "string" ? item.metadata_json : JSON.stringify(item.metadata_json || {}),
        ]
      );

      const dailyOn = pick.daily_assigned_on ? String(pick.daily_assigned_on).slice(0, 10) : null;
      const nextDaily = dailyOn === today ? Number(pick.daily_assigned_count || 0) + 1 : 1;

      await query(
        `UPDATE affiliate_distribution_status
         SET daily_assigned_count = ?, daily_assigned_on = ?, last_assigned_at = NOW(), last_rotation_at = NOW()
         WHERE affiliate_id = ? AND brand_id = ?`,
        [nextDaily, today, pick.id, brandId]
      );

      await query(
        `UPDATE lead_distribution_queue
         SET queue_status = 'assigned', assigned_at = NOW(), assignment_id = ?, error_message = NULL
         WHERE id = ?`,
        [assignmentId, item.id]
      );

      const initialSend = await this.dispatchInitialProspectMessage({
        assignmentId,
        ownerUserId,
        brandId,
        programId: item.program_id,
        prospectPhone: item.prospect_phone,
        prospectName: item.prospect_name,
        prospectCity: item.prospect_city,
        affiliateId: pick.id,
        affiliateUserId: pick.affiliate_user_id,
        instanceId: instance?.id || null,
        rules,
      });

      await this.ensureAlert({
        ownerUserId,
        brandId,
        affiliateId: pick.id,
        affiliateUserId: pick.affiliate_user_id,
        alertType: "new_prospect",
        severity: "info",
        title: "Novo contato recebido",
        body: initialSend.sent
          ? (item.prospect_name
            ? `${item.prospect_name} foi atribuído(a) a você. A primeira mensagem já foi enviada pelo seu WhatsApp.`
            : "Um novo prospect foi atribuído e a primeira mensagem já foi enviada.")
          : (item.prospect_name
            ? `${item.prospect_name} foi atribuído(a) a você. Inicie o contato no WhatsApp.`
            : "Um novo prospect foi atribuído a você."),
        actionPath: "/contatos",
        assignmentId,
        customerName: item.prospect_name,
      });

      results.push({
        queue_id: item.id,
        assigned: true,
        assignment_id: assignmentId,
        affiliate_id: pick.id,
        initial_message: initialSend,
      });
    }

    return results;
  }

  async listQueueForAdmin(ownerUserId: string, brandId: string, limit = 50) {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM lead_distribution_queue
       WHERE owner_user_id = ? AND brand_id = ?
       ORDER BY queued_at DESC
       LIMIT ?`,
      [ownerUserId, brandId, Math.min(limit, 100)]
    );
    return rows || [];
  }

  async refreshAllDistributionStatuses(ownerUserId: string, brandId: string) {
    await this.ensureSchema();
    const affiliates = await query<any[]>(
      `SELECT id, affiliate_user_id FROM affiliates WHERE owner_user_id = ? AND brand_id = ? AND status = 'active'`,
      [ownerUserId, brandId]
    );
    for (const a of affiliates || []) {
      await this.syncAffiliateDistributionStatus({
        ownerUserId,
        brandId,
        affiliateId: String(a.id),
        affiliateUserId: String(a.affiliate_user_id),
      });
    }
  }

  async processInboundReply(input: {
    ownerUserId: string;
    brandId?: string | null;
    instanceId: string;
    phone: string;
    message?: string;
  }): Promise<{ matched: boolean; assignment_id?: string }> {
    await this.ensureSchema();
    const digits = normalizePhoneDigits(input.phone);
    if (!digits) return { matched: false };

    const inst = await queryOne<any>(
      `SELECT owner_type, owner_actor_id, brand_id FROM whatsapp_instances WHERE id = ? LIMIT 1`,
      [input.instanceId]
    );
    if (String(inst?.owner_type || "") !== "affiliate") return { matched: false };

    const brandId = String(input.brandId || inst?.brand_id || "").trim();
    const affiliateUserId = String(inst?.owner_actor_id || "").trim();
    if (!brandId || !affiliateUserId) return { matched: false };

    const openRows = await query<any[]>(
      `SELECT * FROM prospect_assignments
       WHERE affiliate_user_id = ? AND brand_id = ? AND conversion_status = 'open'
         AND assignment_status NOT IN ('lost', 'recycled')
       ORDER BY assigned_at DESC
       LIMIT 50`,
      [affiliateUserId, brandId]
    );
    const assignment = (openRows || []).find((r) => phoneTailMatch(r.prospect_phone, digits));
    if (!assignment?.id) return { matched: false };

    await query(
      `UPDATE prospect_assignments
       SET current_stage = 'engaged', assignment_status = 'active',
           last_interaction_at = NOW(), next_followup_at = NULL
       WHERE id = ?`,
      [assignment.id]
    );

    await this.ensureAlert({
      ownerUserId: input.ownerUserId,
      brandId,
      affiliateId: String(assignment.affiliate_id),
      affiliateUserId,
      alertType: "prospect_replied",
      severity: "info",
      title: "Prospect respondeu",
      body: assignment.prospect_name
        ? `${assignment.prospect_name} respondeu no WhatsApp. Retome a conversa.`
        : "Um prospect respondeu no WhatsApp.",
      actionPath: "/contatos",
      assignmentId: String(assignment.id),
      customerName: assignment.prospect_name,
    });

    return { matched: true, assignment_id: String(assignment.id) };
  }

  async processDueFollowups(maxItems = 20): Promise<{ processed: number; sent: number }> {
    await this.ensureSchema();
    if (!imRef) return { processed: 0, sent: 0 };

    const due = await query<any[]>(
      `SELECT pa.*, wi.status AS instance_status
       FROM prospect_assignments pa
       LEFT JOIN whatsapp_instances wi ON wi.id = pa.instance_id
       WHERE pa.conversion_status = 'open'
         AND pa.assignment_status NOT IN ('lost', 'recycled')
         AND pa.next_followup_at IS NOT NULL AND pa.next_followup_at <= NOW()
       ORDER BY pa.next_followup_at ASC
       LIMIT ?`,
      [Math.max(1, Math.min(maxItems, 50))]
    );

    let sent = 0;
    for (const row of due || []) {
      const rules = await this.getOrCreateRules(
        String(row.owner_user_id),
        String(row.brand_id),
        row.program_id
      );
      if (!rules?.followup_enabled && rules?.followup_enabled !== 1) {
        await query(`UPDATE prospect_assignments SET next_followup_at = NULL WHERE id = ?`, [row.id]);
        continue;
      }

      const phone = normalizePhoneDigits(row.prospect_phone);
      const instanceId = String(row.instance_id || "").trim();
      if (!phone || !instanceId || String(row.instance_status || "") !== "connected") {
        await query(
          `UPDATE prospect_assignments SET current_stage = 'needs_human_attention' WHERE id = ?`,
          [row.id]
        );
        await this.ensureAlert({
          ownerUserId: String(row.owner_user_id),
          brandId: String(row.brand_id),
          affiliateId: String(row.affiliate_id),
          affiliateUserId: String(row.affiliate_user_id),
          alertType: "followup_needs_attention",
          severity: "warning",
          title: "Follow-up precisa de você",
          body: row.prospect_name
            ? `Não foi possível enviar follow-up para ${row.prospect_name}. Verifique o WhatsApp.`
            : "Um follow-up falhou. Verifique o WhatsApp e interfira no contato.",
          actionPath: "/contatos",
          assignmentId: String(row.id),
          customerName: row.prospect_name,
        });
        continue;
      }

      const [affiliate, brand] = await Promise.all([
        queryOne<any>(`SELECT display_name FROM affiliates WHERE id = ? LIMIT 1`, [row.affiliate_id]),
        queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [row.brand_id]),
      ]);
      const template = this.resolveFollowupTemplate(rules);
      const message = this.applyMessageTemplate(template, {
        prospect_name: row.prospect_name,
        prospect_city: row.prospect_city,
        affiliate_name: affiliate?.display_name ? String(affiliate.display_name) : null,
        brand_name: brand?.name ? String(brand.name) : null,
      });

      const ok = await imRef.sendMessage(instanceId, phone, message).catch(() => false);
      const followupCount = Number(row.followup_count || 0) + 1;
      if (ok) {
        sent += 1;
        await query(
          `UPDATE prospect_assignments
           SET followup_count = ?, last_followup_at = NOW(), last_interaction_at = NOW(),
               current_stage = 'awaiting_response'
           WHERE id = ?`,
          [followupCount, row.id]
        );
        await this.scheduleNextFollowup(String(row.id), rules, followupCount);
      } else {
        await query(
          `UPDATE prospect_assignments SET current_stage = 'needs_human_attention' WHERE id = ?`,
          [row.id]
        );
        await this.ensureAlert({
          ownerUserId: String(row.owner_user_id),
          brandId: String(row.brand_id),
          affiliateId: String(row.affiliate_id),
          affiliateUserId: String(row.affiliate_user_id),
          alertType: "followup_needs_attention",
          severity: "warning",
          title: "Follow-up não enviado",
          body: row.prospect_name
            ? `Falha ao enviar follow-up para ${row.prospect_name}. Intervenha manualmente.`
            : "Falha no follow-up automático. Intervenha no Contatos.",
          actionPath: "/contatos",
          assignmentId: String(row.id),
          customerName: row.prospect_name,
        });
      }
    }

    return { processed: (due || []).length, sent };
  }

  async convertAssignment(input: {
    assignmentId: string;
    ownerUserId: string;
    brandId: string;
    affiliateUserId?: string;
    orderId?: string | null;
    orderTotal?: number;
    notes?: string | null;
  }) {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM prospect_assignments
       WHERE id = ? AND owner_user_id = ? AND brand_id = ?
       LIMIT 1`,
      [input.assignmentId, input.ownerUserId, input.brandId]
    );
    if (!row) throw new Error("Atribuição não encontrada");
    if (input.affiliateUserId && String(row.affiliate_user_id) !== String(input.affiliateUserId)) {
      throw new Error("Atribuição não pertence a este afiliado");
    }
    if (String(row.conversion_status) === "converted") {
      return { already_converted: true, assignment_id: input.assignmentId };
    }

    let orderId = input.orderId ? String(input.orderId).trim() : null;
    const orderTotal = Number(input.orderTotal || 0);

    if (orderId && orderTotal > 0) {
      await this.affiliates.recordSale({
        ownerUserId: input.ownerUserId,
        brandId: input.brandId,
        affiliateId: String(row.affiliate_id),
        orderId,
        customerName: row.prospect_name,
        customerPhone: row.prospect_phone,
        orderTotal,
      });
    }

    await query(
      `UPDATE prospect_assignments
       SET conversion_status = 'converted',
           assignment_status = 'converted',
           current_stage = 'converted_to_customer',
           converted_order_id = ?,
           next_followup_at = NULL,
           last_interaction_at = NOW(),
           notes = COALESCE(?, notes)
       WHERE id = ?`,
      [orderId, input.notes || null, input.assignmentId]
    );

    await this.ensureAlert({
      ownerUserId: input.ownerUserId,
      brandId: input.brandId,
      affiliateId: String(row.affiliate_id),
      affiliateUserId: String(row.affiliate_user_id),
      alertType: "prospect_converted",
      severity: "info",
      title: "Contato convertido",
      body: row.prospect_name
        ? `${row.prospect_name} foi marcado(a) como convertido(a).`
        : "Um contato foi convertido.",
      actionPath: "/clientes",
      assignmentId: input.assignmentId,
      customerName: row.prospect_name,
    });

    return {
      converted: true,
      assignment_id: input.assignmentId,
      order_id: orderId,
      commission_recorded: !!(orderId && orderTotal > 0),
    };
  }

  /** Notifica admin quando fila trava sem afiliado (dedupe 1h por marca). */
  private async emitNoEligibleAffiliateAlert(ownerUserId: string, brandId: string): Promise<void> {
    try {
      const pending = await queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM lead_distribution_queue
         WHERE owner_user_id = ? AND brand_id = ? AND queue_status = 'pending'`,
        [ownerUserId, brandId]
      );
      const pendingCount = Number(pending?.total || 0);
      if (pendingCount < 1) return;

      // Dedupe simples em memória por brand (evita flood no processQueue)
      const key = `${ownerUserId}:${brandId}`;
      const now = Date.now();
      const last = noEligibleNotifyAt.get(key) || 0;
      if (now - last < 60 * 60 * 1000) return;
      noEligibleNotifyAt.set(key, now);

      const { emitPlatformEventToUser } = await import("./notificationHub");
      await emitPlatformEventToUser("admin.lead.no_affiliate", ownerUserId, {
        organization_id: brandId,
        role: "admin",
        entity_type: "lead_distribution_queue",
        entity_id: brandId,
        deep_link: "/afiliados",
        template_vars: {
          pending_count: String(pendingCount),
          brand_id: brandId,
        },
      });
    } catch {
      /* não bloquear fila */
    }
  }

  /** Processa filas pendentes de todas as marcas (worker de fundo). */
  async processAllPendingQueues(maxBrands = 20, maxPerBrand = 10): Promise<{ brands: number; assigned: number }> {
    await this.ensureSchema();
    const brands = await query<any[]>(
      `SELECT owner_user_id, brand_id, COUNT(*) AS pending
       FROM lead_distribution_queue
       WHERE queue_status = 'pending'
       GROUP BY owner_user_id, brand_id
       ORDER BY MAX(queued_at) ASC
       LIMIT ?`,
      [Math.max(1, Math.min(maxBrands, 50))]
    );

    let assigned = 0;
    for (const b of brands || []) {
      try {
        const ownerUserId = String(b.owner_user_id);
        const brandId = String(b.brand_id);
        // processQueue já faz refresh de elegibilidade
        const results = await this.processQueue(ownerUserId, brandId, maxPerBrand);
        assigned += results.filter((r) => r.assigned).length;
      } catch (e: any) {
        logger.warn(`[affiliateDistribution] processAllPendingQueues brand failed: ${e?.message || e}`);
      }
    }
    return { brands: (brands || []).length, assigned };
  }
}

const noEligibleNotifyAt = new Map<string, number>();

export const affiliateDistributionService = new AffiliateDistributionService();

let followupTimer: NodeJS.Timeout | null = null;
let queueTimer: NodeJS.Timeout | null = null;

export function startDistributionFollowupMonitor(): void {
  if (followupTimer) return;
  setTimeout(() => {
    void affiliateDistributionService.processDueFollowups(25).catch((e: any) => {
      logger.warn(`[affiliateDistribution] followup tick failed: ${e?.message || e}`);
    });
  }, 60_000);
  followupTimer = setInterval(() => {
    void affiliateDistributionService.processDueFollowups(25).catch((e: any) => {
      logger.warn(`[affiliateDistribution] followup tick failed: ${e?.message || e}`);
    });
  }, 5 * 60_000);
}

/** Worker: drena fila de distribuição quando afiliados voltam a ficar elegíveis. */
export function startDistributionQueueMonitor(): void {
  if (queueTimer) return;
  const tick = () => {
    void affiliateDistributionService.processAllPendingQueues(15, 10).catch((e: any) => {
      logger.warn(`[affiliateDistribution] queue tick failed: ${e?.message || e}`);
    });
  };
  setTimeout(tick, 90_000);
  queueTimer = setInterval(tick, 3 * 60_000);
}
