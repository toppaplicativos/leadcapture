/**
 * Central de Push do Programa de Afiliados (por marca).
 * - Overrides de eventos (texto, imagem, deeplink, ligado/desligado)
 * - Campanhas: manual | agendada | por comportamento
 * - Deeplink canônico: /central-afiliado/{slug}/painel/{rota}
 */

import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { NOTIFICATION_EVENT_REGISTRY } from "../config/notification-events";

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export type PushTriggerType = "manual" | "schedule" | "behavior";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";

export type AffiliatePushOverride = {
  id: string;
  brand_id: string;
  event_key: string;
  title_template: string | null;
  body_template: string | null;
  image_url: string | null;
  deep_link: string | null;
  is_enabled: boolean;
  priority: string | null;
  updated_at?: string;
};

export type AffiliatePushCampaign = {
  id: string;
  brand_id: string;
  owner_user_id: string;
  title: string;
  body: string;
  image_url: string | null;
  deep_link: string | null;
  cta_label: string | null;
  target: string;
  program_id: string | null;
  trigger_type: PushTriggerType;
  trigger_config: Record<string, unknown>;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_at?: string;
  updated_at?: string;
};

/** Rotas curtas do app afiliado → path relativo ao painel */
export const AFFILIATE_DEEP_LINK_PRESETS: Array<{ path: string; label: string }> = [
  { path: "ranking", label: "Ranking & Premiações" },
  { path: "oportunidades", label: "Oportunidades" },
  { path: "atendimento", label: "Atendimento" },
  { path: "vendas", label: "Pedidos" },
  { path: "financeiro", label: "Carteira" },
  { path: "divulgacao", label: "Divulgar" },
  { path: "materiais", label: "Materiais" },
  { path: "links", label: "Links" },
  { path: "contatos", label: "Contatos" },
  { path: "notificacoes", label: "Notificações" },
  { path: "aprendizado", label: "Aprender" },
  { path: "produtos", label: "Produtos" },
  { path: "conexoes", label: "WhatsApp" },
  { path: "perfil", label: "Perfil" },
  { path: "", label: "Início (resumo)" },
];

async function ensureSchema() {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_push_overrides (
        id VARCHAR(36) PRIMARY KEY,
        brand_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        event_key VARCHAR(120) NOT NULL,
        title_template TEXT NULL,
        body_template TEXT NULL,
        image_url VARCHAR(600) NULL,
        deep_link VARCHAR(500) NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        priority VARCHAR(20) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (brand_id, event_key)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_push_campaigns (
        id VARCHAR(36) PRIMARY KEY,
        brand_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        image_url VARCHAR(600) NULL,
        deep_link VARCHAR(500) NULL,
        cta_label VARCHAR(80) NULL,
        target VARCHAR(40) NOT NULL DEFAULT 'all_active',
        program_id VARCHAR(36) NULL,
        trigger_type VARCHAR(30) NOT NULL DEFAULT 'manual',
        trigger_config_json TEXT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        scheduled_at TIMESTAMP NULL,
        sent_at TIMESTAMP NULL,
        sent_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_push_campaign_log (
        id VARCHAR(36) PRIMARY KEY,
        campaign_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        affiliate_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        status VARCHAR(30) NOT NULL,
        error_message VARCHAR(300) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    schemaReady = true;
  })().catch((e) => {
    schemaPromise = null;
    throw e;
  });
  return schemaPromise;
}

function parseJson(raw: any): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) || {};
  } catch {
    return {};
  }
}

/** Resolve slug da marca (brand_units ou storefront). */
export async function resolveBrandSlug(brandId: string): Promise<string | null> {
  const brand = await queryOne<{ slug: string | null }>(
    `SELECT slug FROM brand_units WHERE id = ? LIMIT 1`,
    [brandId],
  ).catch(() => null);
  const s = String(brand?.slug || "").trim().toLowerCase();
  if (s) return s;
  const store = await queryOne<{ slug: string | null }>(
    `SELECT slug FROM storefront_stores WHERE brand_id = ? ORDER BY (status = 'active') DESC NULLS LAST LIMIT 1`,
    [brandId],
  ).catch(() => null);
  const ss = String(store?.slug || "").trim().toLowerCase();
  return ss || null;
}

/**
 * Converte path curto (`ranking`, `/ranking`, `painel/ranking`) no deeplink canônico do app afiliado.
 * Mantém URLs absolutas e paths já completos.
 */
export async function resolveAffiliateDeepLink(
  brandId: string,
  pathOrUrl?: string | null,
): Promise<string> {
  const raw = pathOrUrl == null ? "ranking" : String(pathOrUrl).trim();
  // path vazio explícito = início do painel (não forçar ranking)
  if (raw === "") {
    const slug = await resolveBrandSlug(brandId);
    return slug ? `/central-afiliado/${encodeURIComponent(slug)}/painel` : "/central-afiliado";
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/central-afiliado/") || raw.startsWith("/parceiros/")) return raw;

  const slug = await resolveBrandSlug(brandId);
  if (!slug) return raw.startsWith("/") ? raw : `/${raw}`;

  let rest = raw.replace(/^\//, "");
  if (rest.startsWith("painel/")) rest = rest.slice("painel/".length);
  // aliases
  if (rest === "premios" || rest === "premiacoes") rest = "ranking";
  if (rest === "alertas") rest = "notificacoes";
  if (rest === "leads") rest = "contatos";

  const base = `/central-afiliado/${encodeURIComponent(slug)}/painel`;
  return rest ? `${base}/${rest}` : base;
}

function mapCampaign(row: any): AffiliatePushCampaign {
  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    owner_user_id: String(row.owner_user_id),
    title: String(row.title || ""),
    body: String(row.body || ""),
    image_url: row.image_url ? String(row.image_url) : null,
    deep_link: row.deep_link ? String(row.deep_link) : null,
    cta_label: row.cta_label ? String(row.cta_label) : null,
    target: String(row.target || "all_active"),
    program_id: row.program_id ? String(row.program_id) : null,
    trigger_type: (row.trigger_type || "manual") as PushTriggerType,
    trigger_config: parseJson(row.trigger_config_json),
    status: (row.status || "draft") as CampaignStatus,
    scheduled_at: row.scheduled_at ? String(row.scheduled_at) : null,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    sent_count: Number(row.sent_count || 0),
    failed_count: Number(row.failed_count || 0),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

class AffiliatePushCenterService {
  async ensureSchema() {
    await ensureSchema();
  }

  /** Catálogo de eventos do contexto affiliate + override da marca */
  async listCatalog(brandId: string) {
    await ensureSchema();
    const seed = NOTIFICATION_EVENT_REGISTRY.filter((e) => e.app_context === "affiliate");
    const overrides = await query<any[]>(
      `SELECT * FROM affiliate_push_overrides WHERE brand_id = ?`,
      [brandId],
    ).catch(() => []);
    const map = new Map((overrides || []).map((o) => [String(o.event_key), o]));

    const defaultDeep = await resolveAffiliateDeepLink(brandId, "ranking");

    return seed.map((ev) => {
      const o = map.get(ev.event_key);
      const label =
        ev.event_key
          .replace(/^affiliate\./, "")
          .replace(/\./g, " · ")
          .replace(/_/g, " ");
      let effectiveDeep = o?.deep_link || null;
      if (!effectiveDeep && ev.deep_link_template && !ev.deep_link_template.includes("{{")) {
        effectiveDeep = null; // resolved below
      }
      return {
        event_key: ev.event_key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        category: ev.category,
        type: ev.event_type,
        default_title: ev.title_template,
        default_body: ev.body_template,
        default_deep_link: ev.deep_link_template || null,
        default_cta: ev.cta_label || null,
        default_priority: ev.default_priority,
        override: o
          ? {
              id: String(o.id),
              title_template: o.title_template,
              body_template: o.body_template,
              image_url: o.image_url,
              deep_link: o.deep_link,
              is_enabled: o.is_enabled !== false && o.is_enabled !== 0,
              priority: o.priority,
            }
          : null,
        effective: {
          title: o?.title_template || ev.title_template,
          body: o?.body_template || ev.body_template,
          deep_link:
            o?.deep_link
            || (ev.deep_link_template && !ev.deep_link_template.includes("{{")
              ? defaultDeep.replace(/\/ranking$/, `/${String(ev.deep_link_template).replace(/^\//, "")}`)
              : null)
            || defaultDeep,
          image_url: o?.image_url || null,
          is_enabled: o ? o.is_enabled !== false && o.is_enabled !== 0 : true,
          priority: o?.priority || ev.default_priority,
        },
      };
    });
  }

  async upsertOverride(input: {
    ownerUserId: string;
    brandId: string;
    eventKey: string;
    title_template?: string | null;
    body_template?: string | null;
    image_url?: string | null;
    deep_link?: string | null;
    is_enabled?: boolean;
    priority?: string | null;
  }) {
    await ensureSchema();
    const eventKey = String(input.eventKey || "").trim();
    if (!eventKey) throw new Error("event_key obrigatório");

    let deepLink = input.deep_link !== undefined ? input.deep_link : undefined;
    if (deepLink != null && String(deepLink).trim() && !String(deepLink).includes("{{")) {
      deepLink = await resolveAffiliateDeepLink(input.brandId, deepLink);
    }

    const existing = await queryOne<any>(
      `SELECT id FROM affiliate_push_overrides WHERE brand_id = ? AND event_key = ? LIMIT 1`,
      [input.brandId, eventKey],
    );

    if (existing?.id) {
      const fields: string[] = [];
      const vals: any[] = [];
      if (input.title_template !== undefined) {
        fields.push("title_template = ?");
        vals.push(input.title_template);
      }
      if (input.body_template !== undefined) {
        fields.push("body_template = ?");
        vals.push(input.body_template);
      }
      if (input.image_url !== undefined) {
        fields.push("image_url = ?");
        vals.push(input.image_url);
      }
      if (deepLink !== undefined) {
        fields.push("deep_link = ?");
        vals.push(deepLink);
      }
      if (input.is_enabled !== undefined) {
        fields.push("is_enabled = ?");
        vals.push(!!input.is_enabled);
      }
      if (input.priority !== undefined) {
        fields.push("priority = ?");
        vals.push(input.priority);
      }
      if (fields.length) {
        fields.push("updated_at = NOW()");
        vals.push(existing.id);
        await query(
          `UPDATE affiliate_push_overrides SET ${fields.join(", ")} WHERE id = ?`,
          vals,
        );
      }
      return this.getOverride(input.brandId, eventKey);
    }

    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_push_overrides
       (id, brand_id, owner_user_id, event_key, title_template, body_template, image_url, deep_link, is_enabled, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.brandId,
        input.ownerUserId,
        eventKey,
        input.title_template ?? null,
        input.body_template ?? null,
        input.image_url ?? null,
        deepLink ?? null,
        input.is_enabled !== false,
        input.priority ?? null,
      ],
    );
    return this.getOverride(input.brandId, eventKey);
  }

  async getOverride(brandId: string, eventKey: string): Promise<AffiliatePushOverride | null> {
    await ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM affiliate_push_overrides WHERE brand_id = ? AND event_key = ? LIMIT 1`,
      [brandId, eventKey],
    );
    if (!row) return null;
    return {
      id: String(row.id),
      brand_id: String(row.brand_id),
      event_key: String(row.event_key),
      title_template: row.title_template,
      body_template: row.body_template,
      image_url: row.image_url,
      deep_link: row.deep_link,
      is_enabled: row.is_enabled !== false && row.is_enabled !== 0,
      priority: row.priority,
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
    };
  }

  /**
   * Aplica override da marca sobre título/corpo/deeplink/imagem de um evento.
   * Usado pelos emissores (ranking, campanhas, hub).
   */
  async applyEventOverride(
    brandId: string,
    eventKey: string,
    base: {
      title: string;
      body: string;
      deep_link?: string | null;
      image_url?: string | null;
    },
  ) {
    await ensureSchema();
    const o = await this.getOverride(brandId, eventKey);
    if (o && !o.is_enabled) {
      return { ...base, suppressed: true as const };
    }
    let deep = o?.deep_link || base.deep_link || "ranking";
    if (deep && !deep.includes("{{") && !/^https?:\/\//i.test(deep)) {
      deep = await resolveAffiliateDeepLink(brandId, deep);
    }
    return {
      title: o?.title_template || base.title,
      body: o?.body_template || base.body,
      deep_link: deep,
      image_url: o?.image_url || base.image_url || null,
      suppressed: false as const,
    };
  }

  async listCampaigns(brandId: string) {
    await ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM affiliate_push_campaigns WHERE brand_id = ? ORDER BY created_at DESC LIMIT 100`,
      [brandId],
    ).catch(() => []);
    return (rows || []).map(mapCampaign);
  }

  async getCampaign(id: string, brandId: string) {
    await ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM affiliate_push_campaigns WHERE id = ? AND brand_id = ? LIMIT 1`,
      [id, brandId],
    );
    return row ? mapCampaign(row) : null;
  }

  async createCampaign(input: {
    ownerUserId: string;
    brandId: string;
    title: string;
    body: string;
    image_url?: string | null;
    deep_link?: string | null;
    cta_label?: string | null;
    target?: string;
    program_id?: string | null;
    trigger_type?: PushTriggerType;
    trigger_config?: Record<string, unknown>;
    scheduled_at?: string | null;
    status?: CampaignStatus;
  }) {
    await ensureSchema();
    const title = String(input.title || "").trim();
    const body = String(input.body || "").trim();
    if (!title) throw new Error("Título obrigatório");
    if (!body) throw new Error("Corpo da mensagem obrigatório");

    const deep = await resolveAffiliateDeepLink(input.brandId, input.deep_link || "ranking");
    const triggerType = (input.trigger_type || "manual") as PushTriggerType;
    let status: CampaignStatus = input.status || "draft";
    if (triggerType === "schedule" && input.scheduled_at) status = "scheduled";

    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_push_campaigns
       (id, brand_id, owner_user_id, title, body, image_url, deep_link, cta_label, target, program_id,
        trigger_type, trigger_config_json, status, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.brandId,
        input.ownerUserId,
        title.slice(0, 200),
        body,
        input.image_url || null,
        deep,
        input.cta_label || null,
        input.target || "all_active",
        input.program_id || null,
        triggerType,
        JSON.stringify(input.trigger_config || {}),
        status,
        input.scheduled_at || null,
      ],
    );
    return this.getCampaign(id, input.brandId);
  }

  async updateCampaign(
    id: string,
    brandId: string,
    patch: Partial<{
      title: string;
      body: string;
      image_url: string | null;
      deep_link: string | null;
      cta_label: string | null;
      target: string;
      program_id: string | null;
      trigger_type: PushTriggerType;
      trigger_config: Record<string, unknown>;
      scheduled_at: string | null;
      status: CampaignStatus;
    }>,
  ) {
    await ensureSchema();
    const fields: string[] = [];
    const vals: any[] = [];
    if (patch.title !== undefined) {
      fields.push("title = ?");
      vals.push(String(patch.title).slice(0, 200));
    }
    if (patch.body !== undefined) {
      fields.push("body = ?");
      vals.push(patch.body);
    }
    if (patch.image_url !== undefined) {
      fields.push("image_url = ?");
      vals.push(patch.image_url);
    }
    if (patch.deep_link !== undefined) {
      fields.push("deep_link = ?");
      vals.push(await resolveAffiliateDeepLink(brandId, patch.deep_link));
    }
    if (patch.cta_label !== undefined) {
      fields.push("cta_label = ?");
      vals.push(patch.cta_label);
    }
    if (patch.target !== undefined) {
      fields.push("target = ?");
      vals.push(patch.target);
    }
    if (patch.program_id !== undefined) {
      fields.push("program_id = ?");
      vals.push(patch.program_id);
    }
    if (patch.trigger_type !== undefined) {
      fields.push("trigger_type = ?");
      vals.push(patch.trigger_type);
    }
    if (patch.trigger_config !== undefined) {
      fields.push("trigger_config_json = ?");
      vals.push(JSON.stringify(patch.trigger_config || {}));
    }
    if (patch.scheduled_at !== undefined) {
      fields.push("scheduled_at = ?");
      vals.push(patch.scheduled_at);
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      vals.push(patch.status);
    }
    if (!fields.length) return this.getCampaign(id, brandId);
    fields.push("updated_at = NOW()");
    vals.push(id, brandId);
    await query(
      `UPDATE affiliate_push_campaigns SET ${fields.join(", ")} WHERE id = ? AND brand_id = ?`,
      vals,
    );
    return this.getCampaign(id, brandId);
  }

  async deleteCampaign(id: string, brandId: string) {
    await ensureSchema();
    await query(`DELETE FROM affiliate_push_campaign_log WHERE campaign_id = ? AND brand_id = ?`, [
      id,
      brandId,
    ]).catch(() => null);
    await query(`DELETE FROM affiliate_push_campaigns WHERE id = ? AND brand_id = ?`, [id, brandId]);
    return { deleted: true };
  }

  /** Dispara campanha agora para afiliados ativos da marca */
  async sendCampaign(id: string, brandId: string) {
    await ensureSchema();
    const campaign = await this.getCampaign(id, brandId);
    if (!campaign) throw new Error("Campanha não encontrada");
    if (campaign.status === "cancelled") throw new Error("Campanha cancelada");

    await query(
      `UPDATE affiliate_push_campaigns SET status = 'sending', updated_at = NOW() WHERE id = ?`,
      [id],
    );

    const affiliates = await query<any[]>(
      `SELECT id, affiliate_user_id, display_name
       FROM affiliates
       WHERE brand_id = ? AND COALESCE(status, 'active') = 'active'
       LIMIT 500`,
      [brandId],
    ).catch(() => []);

    const deep = await resolveAffiliateDeepLink(brandId, campaign.deep_link || "ranking");
    const { getNotificationService } = await import("./notifications");
    const notif = getNotificationService();

    let sent = 0;
    let failed = 0;

    for (const a of affiliates || []) {
      const userId = String(a.affiliate_user_id || "").trim();
      if (!userId) {
        failed++;
        continue;
      }
      try {
        await notif.createPlatformNotification({
          user_id: userId,
          event_key: "affiliate.push.campaign",
          title: campaign.title,
          message: campaign.body,
          priority: "high",
          channels: ["in_app", "push"],
          app_target: "affiliate",
          brand_id: brandId,
          category: "sales",
          deep_link: deep,
          cta_label: campaign.cta_label || "Abrir",
          metadata: {
            app_context: "affiliate",
            url: deep,
            icon: campaign.image_url || undefined,
            cover_url: campaign.image_url || null,
            campaign_id: id,
          },
        });

        sent++;
        await query(
          `INSERT INTO affiliate_push_campaign_log (id, campaign_id, brand_id, affiliate_id, user_id, status)
           VALUES (?, ?, ?, ?, ?, 'sent')`,
          [randomUUID(), id, brandId, a.id, userId],
        ).catch(() => null);
      } catch (e: any) {
        failed++;
        await query(
          `INSERT INTO affiliate_push_campaign_log (id, campaign_id, brand_id, affiliate_id, user_id, status, error_message)
           VALUES (?, ?, ?, ?, ?, 'failed', ?)`,
          [randomUUID(), id, brandId, a.id, userId, String(e?.message || e).slice(0, 280)],
        ).catch(() => null);
      }
    }

    await query(
      `UPDATE affiliate_push_campaigns
       SET status = 'sent', sent_at = NOW(), sent_count = ?, failed_count = ?, updated_at = NOW()
       WHERE id = ?`,
      [sent, failed, id],
    );

    return { sent, failed, total: (affiliates || []).length, deep_link: deep };
  }

  /** Processa campanhas agendadas (chamado por cron/job). */
  async processDueSchedules(limit = 20) {
    await ensureSchema();
    const due = await query<any[]>(
      `SELECT id, brand_id FROM affiliate_push_campaigns
       WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT ?`,
      [limit],
    ).catch(() => []);

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const row of due || []) {
      try {
        await this.sendCampaign(String(row.id), String(row.brand_id));
        results.push({ id: String(row.id), ok: true });
      } catch (e: any) {
        await query(
          `UPDATE affiliate_push_campaigns SET status = 'failed', updated_at = NOW() WHERE id = ?`,
          [row.id],
        ).catch(() => null);
        results.push({ id: String(row.id), ok: false, error: e?.message });
      }
    }
    return results;
  }

  /** Dispara campanhas behavior ligadas a um event_key */
  async fireBehavior(brandId: string, eventKey: string, vars?: Record<string, unknown>) {
    await ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM affiliate_push_campaigns
       WHERE brand_id = ? AND status IN ('draft', 'scheduled') AND trigger_type = 'behavior'`,
      [brandId],
    ).catch(() => []);

    const matched = (rows || []).filter((r) => {
      const cfg = parseJson(r.trigger_config_json);
      return String(cfg.event_key || "") === eventKey;
    });

    const out: Array<{ id: string; sent?: number }> = [];
    for (const row of matched) {
      // Substituir vars no title/body se houver placeholders simples
      let title = String(row.title || "");
      let body = String(row.body || "");
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          title = title.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v ?? ""));
          body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v ?? ""));
        }
        await query(
          `UPDATE affiliate_push_campaigns SET title = ?, body = ?, updated_at = NOW() WHERE id = ?`,
          [title, body, row.id],
        ).catch(() => null);
      }
      const r = await this.sendCampaign(String(row.id), brandId);
      out.push({ id: String(row.id), sent: r.sent });
    }
    return out;
  }

  deepLinkPresets() {
    return AFFILIATE_DEEP_LINK_PRESETS;
  }
}

export const affiliatePushCenterService = new AffiliatePushCenterService();
