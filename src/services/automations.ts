import { randomUUID } from "crypto";
import { query, queryOne, update } from "../config/database";

export type AutomationTemplate = {
  code: string;
  name: string;
  trigger: string;
  send_only_whatsapp_confirmed: boolean;
  tags: string[];
  status_from: string;
  status_to: string;
  timing_steps: string[];
  copy_messages: string[];
  objective: string;
  sort_order: number;
};

export type AutomationRule = AutomationTemplate & {
  id: string;
  user_id: string;
  is_custom?: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ScoringEvent = {
  key: string;
  label: string;
  points: number;
};

export type AutomationScoring = {
  threshold: number;
  events: ScoringEvent[];
};

export type OutboundEventType = "message_sent" | "message_replied" | "lead_engaged" | "lead_client";

export type OutboundEventInput = {
  lead_id?: string | number;
  message_key?: string;
  event_type: OutboundEventType;
  response_time_seconds?: number;
  metadata?: Record<string, unknown>;
  automation_code?: string;
};

export type OutboundMetrics = {
  total_outbound_leads: number;
  replied_leads: number;
  engaged_leads: number;
  client_leads: number;
  response_rate: number;
  engaged_rate: number;
  client_rate: number;
  avg_response_time_minutes: number | null;
  best_message: {
    message_key: string;
    sent_count: number;
    responses_count: number;
    response_rate: number;
  } | null;
};

const FUNNEL_STATUSES = [
  "Novo Lead",
  "Contato Iniciado",
  "Engajado",
  "Proposta Enviada",
  "Em Negociacao",
  "Cliente",
  "Perdido",
  "Reativacao",
];

const PRIMARY_OUTBOUND_CODE = "prospeccao_ativa_lead_frio";

const DEFAULT_TEMPLATES: AutomationTemplate[] = [
  {
    code: PRIMARY_OUTBOUND_CODE,
    name: "Prospeccao Ativa (Lead Frio Internet)",
    trigger: "Contato importado manualmente ou via scraping/API com nome, telefone, segmento, cidade e fonte_coleta.",
    send_only_whatsapp_confirmed: true,
    tags: [
      "lead_outbound",
      "captado_web",
      "segmento_x",
      "temperatura_frio",
      "nao_contatado",
      "primeiro_contato_enviado",
      "followup_1",
      "followup_final",
      "lead_frio_nao_respondeu",
      "respondeu_whatsapp",
      "interesse_inicial",
      "sem_interesse",
      "lead_quente",
      "lead_morno",
      "lead_frio_interessado",
    ],
    status_from: "Novo Lead",
    status_to: "Contato Iniciado",
    timing_steps: ["T0 primeira abordagem", "T+12h follow-up leve", "T+48h ultima tentativa", "T+72h mover para Perdido"],
    copy_messages: [
      "Ola {{nome}}, tudo bem? Encontrei seu contato pesquisando empresas de {{segmento}} em {{cidade}}. Trabalho ajudando negocios como o seu a gerar mais clientes atraves de {{beneficio_principal}}. Posso te explicar rapidamente como funciona?",
      "Perfeito. Hoje voces ja fazem alguma estrategia para atrair novos clientes ou ainda nao?",
      "Oi {{nome}}, prometo ser breve. So queria confirmar se recebeu minha mensagem anterior.",
      "{{nome}}, posso encerrar por aqui ou ainda faz sentido falarmos sobre como gerar mais clientes para seu negocio?",
      "{{nome}}, tudo bem? Vi que voces trabalham com {{segmento}} em {{cidade}}. Hoje voces estao satisfeitos com o volume de clientes que recebem?",
    ],
    objective: "Transformar contato frio captado na internet em lead engajado com contexto, autoridade e baixa pressao.",
    sort_order: 0,
  },
  {
    code: "boas_vindas_instantanea",
    name: "Boas-vindas Instantanea (Lead Novo)",
    trigger: "Lead entrou no sistema",
    send_only_whatsapp_confirmed: true,
    tags: ["lead_novo", "boas_vindas_enviado"],
    status_from: "Novo Lead",
    status_to: "Contato Iniciado",
    timing_steps: ["T0 - imediato", "T+12h se nao responder"],
    copy_messages: [
      "Ola, {{nome}}. Vi que voce demonstrou interesse em {{produto_servico}}. Posso te enviar mais detalhes agora?",
      "Oi {{nome}}, passando pra confirmar se recebeu minha mensagem. Ainda faz sentido pra voce?",
    ],
    objective: "Gerar primeira interacao.",
    sort_order: 1,
  },
  {
    code: "followup_1_lead_silencioso",
    name: "Follow-up Automatico 1 (Lead Silencioso)",
    trigger: "Nao respondeu apos 24h da primeira mensagem",
    send_only_whatsapp_confirmed: true,
    tags: ["followup_1", "lead_frio"],
    status_from: "Contato Iniciado",
    status_to: "Perdido",
    timing_steps: ["T+24h", "T+48h sem resposta"],
    copy_messages: [
      "{{nome}}, prometo ser rapido. Voce ainda tem interesse em {{produto}} ou posso encerrar por aqui?",
      "Sem retorno apos 48h: mover para Perdido e tag lead_frio.",
    ],
    objective: "Recuperar lead silencioso sem insistencia excessiva.",
    sort_order: 2,
  },
  {
    code: "nutricao_educacional_3_dias",
    name: "Nutricao Educacional (3 dias)",
    trigger: "Lead engajado sem compra",
    send_only_whatsapp_confirmed: true,
    tags: ["nutricao"],
    status_from: "Engajado",
    status_to: "Engajado",
    timing_steps: ["Dia 1", "Dia 2", "Dia 3"],
    copy_messages: [
      "Muitas pessoas me perguntam sobre {{dor_principal}}. O que mais te preocupa hoje sobre isso?",
      "Separei um conteudo rapido que explica como resolver {{problema}} de forma pratica.",
      "Se fizer sentido, posso te explicar como aplicamos isso no seu caso especifico.",
    ],
    objective: "Educar lead e gerar desejo.",
    sort_order: 3,
  },
  {
    code: "envio_oferta_direta",
    name: "Envio de Oferta Direta",
    trigger: "Lead engajado com interesse claro",
    send_only_whatsapp_confirmed: true,
    tags: ["oferta_enviada"],
    status_from: "Engajado",
    status_to: "Proposta Enviada",
    timing_steps: ["Imediato apos sinal de interesse"],
    copy_messages: [
      "{{nome}}, preparei uma condicao especial pra voce: {{oferta}}. Valida ate {{data_limite}}. Posso reservar pra voce?",
    ],
    objective: "Converter interesse em negociacao.",
    sort_order: 4,
  },
  {
    code: "lembrete_oferta_urgencia",
    name: "Lembrete de Oferta (Urgencia)",
    trigger: "24h antes do vencimento da oferta",
    send_only_whatsapp_confirmed: true,
    tags: ["urgencia_enviada"],
    status_from: "Proposta Enviada",
    status_to: "Em Negociacao",
    timing_steps: ["24h antes da expiracao"],
    copy_messages: [
      "Ultimas horas da condicao especial que te enviei. Depois de hoje volta ao valor normal. Quer garantir?",
    ],
    objective: "Criar urgencia para fechamento.",
    sort_order: 5,
  },
  {
    code: "reativacao_perdido_7_dias",
    name: "Recuperacao de Lead Perdido (7 dias)",
    trigger: "Lead no status Perdido ha 7 dias",
    send_only_whatsapp_confirmed: true,
    tags: ["reativacao"],
    status_from: "Perdido",
    status_to: "Reativacao",
    timing_steps: ["T+7 dias apos perdido"],
    copy_messages: [
      "{{nome}}, consegui uma nova condicao essa semana e lembrei de voce. Ainda esta buscando {{produto}}?",
    ],
    objective: "Reabrir conversa com leads frios.",
    sort_order: 6,
  },
  {
    code: "pos_proposta_sem_resposta",
    name: "Pos-Proposta Sem Resposta",
    trigger: "Proposta enviada ha 3 dias sem retorno",
    send_only_whatsapp_confirmed: true,
    tags: ["pos_proposta_followup"],
    status_from: "Proposta Enviada",
    status_to: "Perdido",
    timing_steps: ["T+3 dias", "T+48h sem retorno"],
    copy_messages: [
      "{{nome}}, ficou alguma duvida sobre a proposta? Posso ajustar algo pra voce.",
      "Sem resposta em 48h: mover para Perdido.",
    ],
    objective: "Evitar propostas paradas no funil.",
    sort_order: 7,
  },
  {
    code: "pos_venda_upsell",
    name: "Pos-Venda + Upsell",
    trigger: "Status mudou para Cliente",
    send_only_whatsapp_confirmed: true,
    tags: ["cliente_ativo"],
    status_from: "Cliente",
    status_to: "Cliente",
    timing_steps: ["T+3 dias da conversao"],
    copy_messages: [
      "{{nome}}, como esta sua experiencia ate agora? Posso te apresentar algo complementar que aumenta seus resultados?",
    ],
    objective: "Aumentar LTV e satisfacao.",
    sort_order: 8,
  },
  {
    code: "solicitacao_depoimento",
    name: "Solicitacao de Depoimento",
    trigger: "Cliente apos 7 dias da entrega",
    send_only_whatsapp_confirmed: true,
    tags: ["pedido_depoimento", "depoimento_recebido"],
    status_from: "Cliente",
    status_to: "Cliente",
    timing_steps: ["T+7 dias"],
    copy_messages: [
      "Sua opiniao e muito importante pra gente. Pode me enviar um audio rapido contando como foi sua experiencia?",
    ],
    objective: "Gerar prova social para novas conversoes.",
    sort_order: 9,
  },
  {
    code: "broadcast_segmentado",
    name: "Campanha Broadcast Segmentada",
    trigger: "Disparo manual por segmentacao de tags",
    send_only_whatsapp_confirmed: true,
    tags: ["lead_frio", "engajado", "cliente_ativo"],
    status_from: "Novo Lead",
    status_to: "Contato Iniciado",
    timing_steps: ["Manual sob demanda"],
    copy_messages: [
      "Estamos com uma condicao exclusiva para quem ja demonstrou interesse anteriormente. Quer receber?",
    ],
    objective: "Reativar audiencia por segmento.",
    sort_order: 10,
  },
];

const DEFAULT_TEMPLATE_CODES = new Set<string>(DEFAULT_TEMPLATES.map((item) => item.code));

const DEFAULT_SCORING: AutomationScoring = {
  threshold: 70,
  events: [
    { key: "respondeu_mensagem", label: "Respondeu mensagem", points: 20 },
    { key: "clicou_link", label: "Clicou link", points: 15 },
    { key: "pediu_preco", label: "Pediu preco", points: 30 },
    { key: "sem_resposta_3_dias", label: "Ficou 3 dias sem responder", points: -10 },
  ],
};

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      return trimmed.split("\n").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseScoring(value: unknown): ScoringEvent[] {
  if (!value) return DEFAULT_SCORING.events;
  if (Array.isArray(value)) {
    return value
      .map((item: any) => ({
        key: String(item?.key || "").trim(),
        label: String(item?.label || item?.key || "").trim(),
        points: Number(item?.points || 0),
      }))
      .filter((item) => item.key && Number.isFinite(item.points));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parseScoring(parsed);
    } catch {
      return DEFAULT_SCORING.events;
    }
  }

  return DEFAULT_SCORING.events;
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

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function slugifyAutomationCode(value: string): string {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return "automacao_custom";
  return normalized;
}

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export class AutomationsService {
  private initialized = false;
  private customerColumnsCache: string[] | null = null;

  private normalizeBrandId(brandId?: string | null): string {
    const normalized = String(brandId || "").trim();
    return normalized;
  }

  private buildBrandFilter(
    brandId?: string | null,
    options?: { column?: string; optionalWhenUndefined?: boolean }
  ): { sql: string; params: any[] } {
    const column = options?.column || "brand_id";
    const optionalWhenUndefined = options?.optionalWhenUndefined !== false;

    if (brandId === undefined && optionalWhenUndefined) {
      return { sql: "", params: [] };
    }

    const normalized = String(brandId || "").trim();
    return { sql: ` AND ${column} = ?`, params: [normalized] };
  }

  private buildRuleScopeFilter(brandId?: string | null): {
    sql: string;
    params: any[];
    preferCurrentBrandSql: string;
    preferCurrentBrandParams: any[];
  } {
    const normalized = this.normalizeBrandId(brandId);
    if (!normalized) {
      return {
        sql: " AND (brand_id = '' OR brand_id IS NULL)",
        params: [],
        preferCurrentBrandSql: "",
        preferCurrentBrandParams: [],
      };
    }

    return {
      sql: " AND (brand_id = ? OR brand_id = '' OR brand_id IS NULL)",
      params: [normalized],
      preferCurrentBrandSql: "CASE WHEN brand_id = ? THEN 0 ELSE 1 END, ",
      preferCurrentBrandParams: [normalized],
    };
  }

  private async ensureBrandColumns(): Promise<void> {
    await query("ALTER TABLE crm_automation_rules ADD COLUMN brand_id VARCHAR(36) NOT NULL DEFAULT ''").catch(() => undefined);
    await query("ALTER TABLE crm_automation_settings ADD COLUMN brand_id VARCHAR(36) NOT NULL DEFAULT ''").catch(() => undefined);
    await query("ALTER TABLE crm_automation_event_log ADD COLUMN brand_id VARCHAR(36) NOT NULL DEFAULT ''").catch(() => undefined);
    await query("ALTER TABLE crm_automation_message_metrics ADD COLUMN brand_id VARCHAR(36) NOT NULL DEFAULT ''").catch(() => undefined);
    await query("UPDATE crm_automation_rules SET brand_id = '' WHERE brand_id IS NULL").catch(() => undefined);
    await query("UPDATE crm_automation_settings SET brand_id = '' WHERE brand_id IS NULL").catch(() => undefined);
    await query("UPDATE crm_automation_event_log SET brand_id = '' WHERE brand_id IS NULL").catch(() => undefined);
    await query("UPDATE crm_automation_message_metrics SET brand_id = '' WHERE brand_id IS NULL").catch(() => undefined);
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_rules (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL DEFAULT '',
        code VARCHAR(120) NOT NULL,
        name VARCHAR(255) NOT NULL,
        trigger_text TEXT,
        send_only_whatsapp_confirmed TINYINT(1) NOT NULL DEFAULT 1,
        tags_json JSON,
        status_from VARCHAR(120),
        status_to VARCHAR(120),
        timing_json JSON,
        copy_json JSON,
        objective_text TEXT,
        is_active TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_crm_automation_user_code (user_id, brand_id, code),
        KEY idx_crm_automation_user (user_id),
        KEY idx_crm_automation_user_active (user_id, brand_id, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_settings (
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL DEFAULT '',
        lead_score_threshold INT NOT NULL DEFAULT 70,
        scoring_json JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, brand_id),
        KEY idx_crm_automation_settings_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_event_log (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL DEFAULT '',
        automation_code VARCHAR(120) NOT NULL,
        lead_id VARCHAR(64) NULL,
        message_key VARCHAR(120) NULL,
        event_type VARCHAR(40) NOT NULL,
        response_time_seconds INT NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_crm_auto_event_user (user_id),
        KEY idx_crm_auto_event_code (automation_code),
        KEY idx_crm_auto_event_type (event_type),
        KEY idx_crm_auto_event_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS crm_automation_message_metrics (
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL DEFAULT '',
        automation_code VARCHAR(120) NOT NULL,
        message_key VARCHAR(120) NOT NULL,
        sent_count INT NOT NULL DEFAULT 0,
        responses_count INT NOT NULL DEFAULT 0,
        engaged_count INT NOT NULL DEFAULT 0,
        client_count INT NOT NULL DEFAULT 0,
        last_event_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, brand_id, automation_code, message_key),
        KEY idx_crm_auto_metric_user_code (user_id, brand_id, automation_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.ensureBrandColumns();
    await query("ALTER TABLE crm_automation_rules ADD COLUMN send_only_whatsapp_confirmed TINYINT(1) NOT NULL DEFAULT 1").catch(() => undefined);

    this.initialized = true;
  }

  private async getCustomerColumns(): Promise<string[]> {
    if (this.customerColumnsCache) return this.customerColumnsCache;
    const rows = await query<any[]>("SHOW COLUMNS FROM customers");
    this.customerColumnsCache = rows.map((row) => String(row.Field || "")).filter(Boolean);
    return this.customerColumnsCache;
  }

  private hasCustomerColumn(columns: string[], name: string): boolean {
    return columns.includes(name);
  }

  private resolveCustomersOwnerColumn(columns: string[]): string | null {
    if (this.hasCustomerColumn(columns, "owner_user_id")) return "owner_user_id";
    if (this.hasCustomerColumn(columns, "user_id")) return "user_id";
    if (this.hasCustomerColumn(columns, "assigned_to")) return "assigned_to";
    return null;
  }

  private async ensureDefaultsForUser(userId: string, brandId?: string | null): Promise<void> {
    await this.ensureSchema();
    const brandValue = this.normalizeBrandId(brandId);

    for (const template of DEFAULT_TEMPLATES) {
      const defaultActive = template.code === PRIMARY_OUTBOUND_CODE ? 1 : 0;
      await query(
        `INSERT INTO crm_automation_rules (
          id, user_id, brand_id, code, name, trigger_text, send_only_whatsapp_confirmed, tags_json, status_from, status_to, timing_json, copy_json, objective_text, is_active, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE code = code`,
        [
          randomUUID(),
          userId,
          brandValue,
          template.code,
          template.name,
          template.trigger,
          template.send_only_whatsapp_confirmed ? 1 : 0,
          toJson(template.tags),
          template.status_from,
          template.status_to,
          toJson(template.timing_steps),
          toJson(template.copy_messages),
          template.objective,
          defaultActive,
          template.sort_order,
        ]
      );
    }

    await query(
      `INSERT INTO crm_automation_settings (user_id, brand_id, lead_score_threshold, scoring_json)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId, brandValue, DEFAULT_SCORING.threshold, toJson(DEFAULT_SCORING.events)]
    );
  }

  private mapRule(row: any): AutomationRule {
    const code = String(row.code);
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      code,
      name: String(row.name || ""),
      trigger: String(row.trigger_text || ""),
      send_only_whatsapp_confirmed: Number(row.send_only_whatsapp_confirmed ?? 1) === 1,
      tags: parseJsonArray(row.tags_json),
      status_from: String(row.status_from || ""),
      status_to: String(row.status_to || ""),
      timing_steps: parseJsonArray(row.timing_json),
      copy_messages: parseJsonArray(row.copy_json),
      objective: String(row.objective_text || ""),
      is_custom: !DEFAULT_TEMPLATE_CODES.has(code),
      is_active: Number(row.is_active || 0) === 1,
      sort_order: Number(row.sort_order || 0),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
  }

  async createRule(
    userId: string,
    brandId: string | null | undefined,
    payload: Partial<{
      name: string;
      trigger: string;
      send_only_whatsapp_confirmed: boolean;
      tags: string[];
      status_from: string;
      status_to: string;
      timing_steps: string[];
      copy_messages: string[];
      objective: string;
      is_active: boolean;
    }>
  ): Promise<AutomationRule> {
    await this.ensureDefaultsForUser(userId, brandId);
    const ruleScope = this.buildRuleScopeFilter(brandId);
    const brandValue = this.normalizeBrandId(brandId);

    const name = String(payload.name || "").trim();
    if (!name) {
      throw new Error("Automation name is required");
    }

    const baseCode = slugifyAutomationCode(name);
    let code = baseCode;
    let cursor = 1;

    // Avoid collisions with existing codes for this user
    while (true) {
      const existing = await queryOne<any>(
        `SELECT id FROM crm_automation_rules WHERE user_id = ?${ruleScope.sql} AND code = ? LIMIT 1`,
        [userId, ...ruleScope.params, code]
      );
      if (!existing) break;
      cursor += 1;
      code = `${baseCode}_${cursor}`;
    }

    const maxOrderRow = await queryOne<{ max_order: number | null }>(
      `SELECT MAX(sort_order) AS max_order FROM crm_automation_rules WHERE user_id = ?${ruleScope.sql}`,
      [userId, ...ruleScope.params]
    );
    const nextSortOrder = Number.isFinite(Number(maxOrderRow?.max_order))
      ? Number(maxOrderRow?.max_order) + 1
      : DEFAULT_TEMPLATES.length + 1;

    const rowId = randomUUID();
    await query(
      `INSERT INTO crm_automation_rules (
        id, user_id, brand_id, code, name, trigger_text, send_only_whatsapp_confirmed, tags_json, status_from, status_to, timing_json, copy_json, objective_text, is_active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rowId,
        userId,
        brandValue,
        code,
        name,
        String(payload.trigger || "Gatilho personalizado").trim(),
        payload.send_only_whatsapp_confirmed === undefined ? 1 : payload.send_only_whatsapp_confirmed ? 1 : 0,
        toJson(parseJsonArray(payload.tags || [])),
        String(payload.status_from || "Novo Lead").trim(),
        String(payload.status_to || "Contato Iniciado").trim(),
        toJson(parseJsonArray(payload.timing_steps || ["T0 primeira mensagem"])),
        toJson(parseJsonArray(payload.copy_messages || ["Ola {{nome}}, podemos conversar rapidamente?"])),
        String(payload.objective || "Fluxo personalizado criado pelo usuario").trim(),
        payload.is_active ? 1 : 0,
        nextSortOrder,
      ]
    );

    const created = await queryOne<any>(
      `SELECT * FROM crm_automation_rules WHERE id = ? LIMIT 1`,
      [rowId]
    );

    if (!created) {
      throw new Error("Failed to create automation");
    }

    return this.mapRule(created);
  }

  private extractTagSet(rawTags: unknown, sourceDetails: unknown): Set<string> {
    const tags = parseJsonArray(rawTags);
    const details = parseObject(sourceDetails);
    const detailTags = Array.isArray(details.tags)
      ? details.tags.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [];

    return new Set(
      [...tags, ...detailTags]
        .map((item) => normalizeText(item))
        .filter(Boolean)
    );
  }

  private isOutboundLeadRow(row: any): boolean {
    const tags = this.extractTagSet(row?.tags, row?.source_details);
    const source = normalizeText(row?.source);
    const details = parseObject(row?.source_details);
    const outboundFlag = details?.outbound === true || normalizeText(details?.capture_mode) === "outbound";

    return (
      outboundFlag ||
      tags.has("lead_outbound") ||
      tags.has("captado_web") ||
      tags.has("nao_contatado") ||
      tags.has("primeiro_contato_enviado") ||
      source === "import"
    );
  }

  private isRepliedLeadRow(row: any): boolean {
    const tags = this.extractTagSet(row?.tags, row?.source_details);
    const status = normalizeText(row?.status);
    return (
      tags.has("respondeu_whatsapp") ||
      tags.has("interesse_inicial") ||
      status === "replied" ||
      status === "engajado" ||
      status === "negotiating" ||
      status === "em negociacao" ||
      status === "converted" ||
      status === "cliente"
    );
  }

  private isEngagedLeadRow(row: any): boolean {
    const tags = this.extractTagSet(row?.tags, row?.source_details);
    const status = normalizeText(row?.status);
    return (
      tags.has("interesse_inicial") ||
      tags.has("lead_quente") ||
      status === "engajado" ||
      status === "replied" ||
      status === "negotiating" ||
      status === "em negociacao" ||
      status === "converted" ||
      status === "cliente"
    );
  }

  private isClientLeadRow(row: any): boolean {
    const tags = this.extractTagSet(row?.tags, row?.source_details);
    const status = normalizeText(row?.status);
    return tags.has("cliente_ativo") || status === "converted" || status === "cliente";
  }

  async listRules(userId: string, brandId?: string | null): Promise<{
    funnel_statuses: string[];
    rules: AutomationRule[];
    scoring: AutomationScoring;
  }> {
    await this.ensureDefaultsForUser(userId, brandId);
    const ruleScope = this.buildRuleScopeFilter(brandId);
    const normalizedBrandId = this.normalizeBrandId(brandId);

    const rows = await query<any[]>(
      `SELECT * FROM crm_automation_rules WHERE user_id = ?${ruleScope.sql}
       ORDER BY ${ruleScope.preferCurrentBrandSql} sort_order ASC, created_at ASC`,
      [userId, ...ruleScope.params, ...ruleScope.preferCurrentBrandParams]
    );

    const rowsByCode = new Map<string, any>();
    for (const row of rows) {
      const code = String(row?.code || "").trim();
      if (!code || rowsByCode.has(code)) continue;
      rowsByCode.set(code, row);
    }

    const effectiveRows = Array.from(rowsByCode.values());

    const settings = await queryOne<any>(
      `SELECT lead_score_threshold, scoring_json
       FROM crm_automation_settings
       WHERE user_id = ?${normalizedBrandId ? " AND (brand_id = ? OR brand_id = '' OR brand_id IS NULL)" : " AND (brand_id = '' OR brand_id IS NULL)"}
       ORDER BY ${normalizedBrandId ? "CASE WHEN brand_id = ? THEN 0 ELSE 1 END, " : ""}updated_at DESC
       LIMIT 1`,
      normalizedBrandId ? [userId, normalizedBrandId, normalizedBrandId] : [userId]
    );

    return {
      funnel_statuses: [...FUNNEL_STATUSES],
      rules: effectiveRows.map((row) => this.mapRule(row)),
      scoring: {
        threshold: Number(settings?.lead_score_threshold || DEFAULT_SCORING.threshold),
        events: parseScoring(settings?.scoring_json),
      },
    };
  }

  async updateRule(
    userId: string,
    brandId: string | null | undefined,
    code: string,
    payload: Partial<{
      name: string;
      trigger: string;
      send_only_whatsapp_confirmed: boolean;
      tags: string[];
      status_from: string;
      status_to: string;
      timing_steps: string[];
      copy_messages: string[];
      objective: string;
      is_active: boolean;
    }>
  ): Promise<AutomationRule | null> {
    await this.ensureDefaultsForUser(userId, brandId);
    const ruleScope = this.buildRuleScopeFilter(brandId);
    const existing = await queryOne<any>(
      `SELECT id
       FROM crm_automation_rules
       WHERE user_id = ?${ruleScope.sql} AND code = ?
       ORDER BY ${ruleScope.preferCurrentBrandSql}created_at ASC
       LIMIT 1`,
      [userId, ...ruleScope.params, code, ...ruleScope.preferCurrentBrandParams]
    );
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (payload.name !== undefined) {
      fields.push("name = ?");
      values.push(String(payload.name).trim());
    }
    if (payload.trigger !== undefined) {
      fields.push("trigger_text = ?");
      values.push(String(payload.trigger).trim());
    }
    if (payload.send_only_whatsapp_confirmed !== undefined) {
      fields.push("send_only_whatsapp_confirmed = ?");
      values.push(payload.send_only_whatsapp_confirmed ? 1 : 0);
    }
    if (payload.tags !== undefined) {
      fields.push("tags_json = ?");
      values.push(toJson(parseJsonArray(payload.tags)));
    }
    if (payload.status_from !== undefined) {
      fields.push("status_from = ?");
      values.push(String(payload.status_from).trim());
    }
    if (payload.status_to !== undefined) {
      fields.push("status_to = ?");
      values.push(String(payload.status_to).trim());
    }
    if (payload.timing_steps !== undefined) {
      fields.push("timing_json = ?");
      values.push(toJson(parseJsonArray(payload.timing_steps)));
    }
    if (payload.copy_messages !== undefined) {
      fields.push("copy_json = ?");
      values.push(toJson(parseJsonArray(payload.copy_messages)));
    }
    if (payload.objective !== undefined) {
      fields.push("objective_text = ?");
      values.push(String(payload.objective).trim());
    }
    if (payload.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(payload.is_active ? 1 : 0);
    }

    if (fields.length === 0) {
      const current = await queryOne<any>(
        `SELECT * FROM crm_automation_rules WHERE id = ? AND user_id = ? LIMIT 1`,
        [existing.id, userId]
      );
      return current ? this.mapRule(current) : null;
    }

    values.push(existing.id, userId);
    await update(
      `UPDATE crm_automation_rules SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ? AND user_id = ?`,
      values
    );

    const row = await queryOne<any>(
      `SELECT * FROM crm_automation_rules WHERE id = ? AND user_id = ? LIMIT 1`,
      [existing.id, userId]
    );

    return row ? this.mapRule(row) : null;
  }

  async resetRule(userId: string, brandId: string | null | undefined, code: string): Promise<AutomationRule | null> {
    await this.ensureDefaultsForUser(userId, brandId);
    const ruleScope = this.buildRuleScopeFilter(brandId);
    const template = DEFAULT_TEMPLATES.find((item) => item.code === code);
    if (!template) return null;

    const existing = await queryOne<any>(
      `SELECT id
       FROM crm_automation_rules
       WHERE user_id = ?${ruleScope.sql} AND code = ?
       ORDER BY ${ruleScope.preferCurrentBrandSql}created_at ASC
       LIMIT 1`,
      [userId, ...ruleScope.params, code, ...ruleScope.preferCurrentBrandParams]
    );
    if (!existing) return null;

    await update(
      `UPDATE crm_automation_rules
       SET name = ?, trigger_text = ?, send_only_whatsapp_confirmed = ?, tags_json = ?, status_from = ?, status_to = ?, timing_json = ?, copy_json = ?, objective_text = ?, is_active = ?, sort_order = ?, updated_at = NOW()
      WHERE id = ? AND user_id = ?`,
      [
        template.name,
        template.trigger,
        template.send_only_whatsapp_confirmed ? 1 : 0,
        toJson(template.tags),
        template.status_from,
        template.status_to,
        toJson(template.timing_steps),
        toJson(template.copy_messages),
        template.objective,
        template.code === PRIMARY_OUTBOUND_CODE ? 1 : 0,
        template.sort_order,
        existing.id,
        userId,
      ]
    );

    const row = await queryOne<any>(
      `SELECT * FROM crm_automation_rules WHERE id = ? AND user_id = ? LIMIT 1`,
      [existing.id, userId]
    );
    return row ? this.mapRule(row) : null;
  }

  async updateScoring(
    userId: string,
    brandId: string | null | undefined,
    payload: Partial<{
      threshold: number;
      events: ScoringEvent[];
    }>
  ): Promise<AutomationScoring> {
    await this.ensureDefaultsForUser(userId, brandId);
    const brandFilter = this.buildBrandFilter(brandId, { optionalWhenUndefined: false });

    const current = await queryOne<any>(
      `SELECT lead_score_threshold, scoring_json FROM crm_automation_settings WHERE user_id = ?${brandFilter.sql} LIMIT 1`,
      [userId, ...brandFilter.params]
    );

    const threshold = Number.isFinite(Number(payload.threshold))
      ? Math.max(0, Math.min(100, Math.floor(Number(payload.threshold))))
      : Number(current?.lead_score_threshold || DEFAULT_SCORING.threshold);

    const events = payload.events ? parseScoring(payload.events) : parseScoring(current?.scoring_json);

    await update(
      `UPDATE crm_automation_settings SET lead_score_threshold = ?, scoring_json = ?, updated_at = NOW() WHERE user_id = ?${brandFilter.sql}`,
      [threshold, toJson(events), userId, ...brandFilter.params]
    );

    return { threshold, events };
  }

  async recordOutboundEvent(userId: string, payload: OutboundEventInput, brandId?: string | null): Promise<{ ok: true }> {
    await this.ensureDefaultsForUser(userId, brandId);
    const brandValue = this.normalizeBrandId(brandId);

    const allowedTypes: OutboundEventType[] = ["message_sent", "message_replied", "lead_engaged", "lead_client"];
    const eventType = String(payload.event_type || "").trim() as OutboundEventType;
    if (!allowedTypes.includes(eventType)) {
      throw new Error("Invalid outbound event type");
    }

    const automationCode = String(payload.automation_code || PRIMARY_OUTBOUND_CODE).trim() || PRIMARY_OUTBOUND_CODE;
    const messageKey = String(payload.message_key || "default").trim() || "default";
    const leadId = payload.lead_id !== undefined ? String(payload.lead_id).trim() : null;
    const responseTimeSeconds = Number.isFinite(Number(payload.response_time_seconds))
      ? Math.max(0, Math.floor(Number(payload.response_time_seconds)))
      : null;
    const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : null;

    await query(
      `INSERT INTO crm_automation_event_log (
        id, user_id, brand_id, automation_code, lead_id, message_key, event_type, response_time_seconds, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), userId, brandValue, automationCode, leadId, messageKey, eventType, responseTimeSeconds, toJson(metadata)]
    );

    const sentInc = eventType === "message_sent" ? 1 : 0;
    const responseInc = eventType === "message_replied" ? 1 : 0;
    const engagedInc = eventType === "lead_engaged" ? 1 : 0;
    const clientInc = eventType === "lead_client" ? 1 : 0;

    await query(
      `INSERT INTO crm_automation_message_metrics (
        user_id, brand_id, automation_code, message_key, sent_count, responses_count, engaged_count, client_count, last_event_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        sent_count = sent_count + VALUES(sent_count),
        responses_count = responses_count + VALUES(responses_count),
        engaged_count = engaged_count + VALUES(engaged_count),
        client_count = client_count + VALUES(client_count),
        last_event_at = NOW()`,
      [userId, brandValue, automationCode, messageKey, sentInc, responseInc, engagedInc, clientInc]
    );

    return { ok: true };
  }

  async getOutboundMetrics(userId: string, brandId?: string | null): Promise<OutboundMetrics> {
    await this.ensureDefaultsForUser(userId, brandId);
    const brandFilter = this.buildBrandFilter(brandId, { optionalWhenUndefined: false });

    const customerColumns = await this.getCustomerColumns();
    const ownerColumn = this.resolveCustomersOwnerColumn(customerColumns);

    const statusCol = this.hasCustomerColumn(customerColumns, "status") ? "status" : "'new' AS status";
    const tagsCol = this.hasCustomerColumn(customerColumns, "tags") ? "tags" : "NULL AS tags";
    const sourceDetailsCol = this.hasCustomerColumn(customerColumns, "source_details")
      ? "source_details"
      : "NULL AS source_details";
    const sourceCol = this.hasCustomerColumn(customerColumns, "source") ? "source" : "'manual' AS source";

    let where = "WHERE 1=1";
    const params: any[] = [];
    if (ownerColumn) {
      where += ` AND ${ownerColumn} = ?`;
      params.push(userId);
    }

    const leads = await query<any[]>(
      `SELECT id, ${statusCol}, ${tagsCol}, ${sourceDetailsCol}, ${sourceCol}
       FROM customers
       ${where}`,
      params
    );

    const outboundLeads = leads.filter((row) => this.isOutboundLeadRow(row));
    const totalOutboundLeads = outboundLeads.length;

    const repliedLeads = outboundLeads.filter((row) => this.isRepliedLeadRow(row)).length;
    const engagedLeads = outboundLeads.filter((row) => this.isEngagedLeadRow(row)).length;
    const clientLeads = outboundLeads.filter((row) => this.isClientLeadRow(row)).length;

    const avgResponse = await queryOne<{ avg_seconds: number | null }>(
      `SELECT AVG(response_time_seconds) AS avg_seconds
       FROM crm_automation_event_log
       WHERE user_id = ?${brandFilter.sql} AND automation_code = ? AND event_type = 'message_replied' AND response_time_seconds IS NOT NULL`,
      [userId, ...brandFilter.params, PRIMARY_OUTBOUND_CODE]
    );

    const bestMessage = await queryOne<{
      message_key: string;
      sent_count: number;
      responses_count: number;
      response_rate: number;
    }>(
      `SELECT
          message_key,
          sent_count,
          responses_count,
          CASE WHEN sent_count > 0 THEN (responses_count / sent_count) * 100 ELSE 0 END AS response_rate
       FROM crm_automation_message_metrics
       WHERE user_id = ?${brandFilter.sql} AND automation_code = ? AND sent_count > 0
       ORDER BY response_rate DESC, responses_count DESC, sent_count DESC
       LIMIT 1`,
      [userId, ...brandFilter.params, PRIMARY_OUTBOUND_CODE]
    );

    return {
      total_outbound_leads: totalOutboundLeads,
      replied_leads: repliedLeads,
      engaged_leads: engagedLeads,
      client_leads: clientLeads,
      response_rate: percent(repliedLeads, totalOutboundLeads),
      engaged_rate: percent(engagedLeads, totalOutboundLeads),
      client_rate: percent(clientLeads, totalOutboundLeads),
      avg_response_time_minutes:
        avgResponse?.avg_seconds && Number.isFinite(Number(avgResponse.avg_seconds))
          ? Number((Number(avgResponse.avg_seconds) / 60).toFixed(2))
          : null,
      best_message: bestMessage
        ? {
            message_key: String(bestMessage.message_key),
            sent_count: Number(bestMessage.sent_count || 0),
            responses_count: Number(bestMessage.responses_count || 0),
            response_rate: Number(Number(bestMessage.response_rate || 0).toFixed(2)),
          }
        : null,
    };
  }
}
