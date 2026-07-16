/**
 * Saúde e Elegibilidade WhatsApp — gate único antes de qualquer envio.
 *
 * Camadas (sempre nesta ordem):
 * 1. Telefone inválido
 * 2. Bloqueio global / marca
 * 3. Opt-out LGPD / WhatsApp PARAR
 * 4. Instância pausada por qualidade
 * 5. (marketing) consentimento, limites, intervalo mínimo, dedupe
 * 6. Registro de evento de envio (sucesso/negado)
 *
 * Transacional / OTP / reply humano: só 1–3 (e 4 opcional).
 * Comercial / campanha / automação / fluxo outbound: regras completas.
 */
import { createHash, randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";
import { lgpdOptoutService, normalizePhone as lgpdNormalizePhone } from "./lgpdOptout";

export type WaSendPurpose =
  | "marketing"
  | "campaign"
  | "automation"
  | "flow"
  | "affiliate"
  | "service"
  | "transactional"
  | "order"
  | "followup"
  | "human_reply"
  | "otp"
  | "test";

export type WaSendSource =
  | "campaign"
  | "automation"
  | "flow"
  | "affiliate"
  | "inbox"
  | "manual"
  | "rotation"
  | "commerce"
  | "booking"
  | "mob"
  | "composer_test"
  | "unknown";

export type WaSendContext = {
  purpose?: WaSendPurpose;
  source?: WaSendSource;
  userId?: string | null;
  brandId?: string | null;
  campaignId?: string | null;
  automationId?: string | null;
  flowId?: string | null;
  /** Conteúdo bruto para fingerprint de dedupe (não loga o texto completo). */
  content?: string | null;
  /** Se true, não aplica limites de ritmo (ainda aplica block/opt-out). */
  skipRateLimits?: boolean;
  /** Nome da marca para rodapé de 1ª mensagem. */
  brandName?: string | null;
  /** Origem do contato (ex.: formulário, importação). */
  contactOrigin?: string | null;
  /** Não anexa rodapé PARAR (já incluso no template). */
  skipIdentifyFooter?: boolean;
};

export type EligibilityDecision =
  | {
      ok: true;
      phone: string;
      purpose: WaSendPurpose;
      message?: string;
      firstContact: boolean;
      limits: {
        minIntervalSeconds: number;
        maxPerRecipientDay: number;
        maxPerInstanceHour: number;
        maxPerBrandDay: number;
      };
    }
  | {
      ok: false;
      phone: string;
      code: string;
      reason: string;
      purpose: WaSendPurpose;
    };

const waSendAls = new AsyncLocalStorage<WaSendContext>();

export function runWithWaSendContext<T>(ctx: WaSendContext, fn: () => Promise<T>): Promise<T> {
  const parent = waSendAls.getStore() || {};
  return waSendAls.run({ ...parent, ...ctx }, fn);
}

export function getWaSendContext(): WaSendContext {
  return waSendAls.getStore() || {};
}

export function normalizeWaPhone(input: unknown): string {
  return lgpdNormalizePhone(input);
}

export function phoneFromJid(jid: string): string {
  const raw = String(jid || "").trim();
  if (!raw) return "";
  if (raw.endsWith("@g.us") || raw.endsWith("@broadcast") || raw.endsWith("@newsletter")) {
    return ""; // grupo / canal — não aplicar gate de lead
  }
  const local = raw.split("@")[0] || "";
  // LID sem PN: não dá para gatear por telefone
  if (raw.endsWith("@lid") && !/^\d{10,15}$/.test(local)) return "";
  return normalizeWaPhone(local);
}

const OPT_OUT_PATTERNS = [
  /^\s*(parar|stop|sair|cancelar|cancela|descadastrar|descadastro|opt[\s-]?out|nao quero|não quero|remover|tira da lista|me tira)\s*[.!]*\s*$/i,
  /^\s*(parar|stop)\s+(mensagens?|disparos?|promo(c|ç)(o|õ)es?)\s*$/i,
];

export function isWhatsAppOptOutText(text: unknown): boolean {
  const t = String(text || "").trim();
  if (!t || t.length > 80) return false;
  return OPT_OUT_PATTERNS.some((re) => re.test(t));
}

const MARKETING_PURPOSES = new Set<WaSendPurpose>([
  "marketing",
  "campaign",
  "automation",
  "flow",
  "affiliate",
  "followup",
]);

const LIGHT_PURPOSES = new Set<WaSendPurpose>([
  "human_reply",
  "otp",
  "transactional",
  "order",
  "service",
  "test",
]);

/** Defaults conservadores — qualidade e consentimento, não só delay. */
export const DEFAULT_ELIGIBILITY_LIMITS = {
  minIntervalSeconds: 90,
  maxPerRecipientDay: 2,
  maxPerInstanceHour: 40,
  maxPerBrandDay: 150,
  maxIdenticalFingerprintHours: 48,
  qualityPauseFailRate: 0.35,
  qualityPauseMinSends: 20,
  requireConsentForMarketing: false, // soft-launch; pode ligar por marca depois
};

function contentFingerprint(content: string | null | undefined): string | null {
  const t = String(content || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  if (!t) return null;
  return createHash("sha256").update(t).digest("hex").slice(0, 32);
}

function isMarketing(purpose: WaSendPurpose): boolean {
  return MARKETING_PURPOSES.has(purpose);
}

class WhatsAppSendEligibilityService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) {
      await this.schemaPromise;
      return;
    }
    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS wa_message_consents (
          id VARCHAR(36) PRIMARY KEY,
          phone_normalized VARCHAR(40) NOT NULL,
          user_id VARCHAR(36) NULL,
          brand_id VARCHAR(36) NULL,
          purpose VARCHAR(40) NOT NULL DEFAULT 'marketing',
          origin VARCHAR(120) NOT NULL DEFAULT 'unknown',
          evidence TEXT NULL,
          source VARCHAR(60) NULL,
          granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at TIMESTAMP NULL,
          metadata_json JSONB NOT NULL DEFAULT '{}'
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_wa_consents_phone
          ON wa_message_consents (phone_normalized, brand_id)
      `).catch(() => {});

      await query(`
        CREATE TABLE IF NOT EXISTS wa_send_blocks (
          id VARCHAR(36) PRIMARY KEY,
          phone_normalized VARCHAR(40) NOT NULL,
          scope VARCHAR(20) NOT NULL DEFAULT 'global',
          user_id VARCHAR(36) NULL,
          brand_id VARCHAR(36) NULL,
          reason VARCHAR(200) NULL,
          source VARCHAR(60) NOT NULL DEFAULT 'system',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_wa_blocks_phone_active
          ON wa_send_blocks (phone_normalized, active)
      `).catch(() => {});

      await query(`
        CREATE TABLE IF NOT EXISTS wa_send_events (
          id VARCHAR(36) PRIMARY KEY,
          phone_normalized VARCHAR(40) NOT NULL,
          user_id VARCHAR(36) NULL,
          brand_id VARCHAR(36) NULL,
          instance_id VARCHAR(36) NULL,
          purpose VARCHAR(40) NOT NULL,
          source VARCHAR(60) NOT NULL,
          outcome VARCHAR(20) NOT NULL,
          deny_code VARCHAR(60) NULL,
          content_fingerprint VARCHAR(40) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_wa_events_phone_time
          ON wa_send_events (phone_normalized, created_at DESC)
      `).catch(() => {});
      await query(`
        CREATE INDEX IF NOT EXISTS idx_wa_events_instance_time
          ON wa_send_events (instance_id, created_at DESC)
      `).catch(() => {});

      await query(`
        CREATE TABLE IF NOT EXISTS wa_instance_quality (
          instance_id VARCHAR(36) PRIMARY KEY,
          paused BOOLEAN NOT NULL DEFAULT FALSE,
          pause_reason TEXT NULL,
          paused_at TIMESTAMP NULL,
          fail_rate_24h DOUBLE PRECISION NULL,
          sends_24h INTEGER NOT NULL DEFAULT 0,
          fails_24h INTEGER NOT NULL DEFAULT 0,
          optouts_24h INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS wa_eligibility_settings (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NULL,
          brand_id VARCHAR(36) NULL,
          min_interval_seconds INTEGER NOT NULL DEFAULT 90,
          max_per_recipient_day INTEGER NOT NULL DEFAULT 2,
          max_per_instance_hour INTEGER NOT NULL DEFAULT 40,
          max_per_brand_day INTEGER NOT NULL DEFAULT 150,
          require_consent_marketing BOOLEAN NOT NULL DEFAULT FALSE,
          identify_first_message BOOLEAN NOT NULL DEFAULT TRUE,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.schemaReady = true;
    })()
      .catch((err) => {
        logger.error(`[wa_eligibility] schema failed: ${err?.message || err}`);
        throw err;
      })
      .finally(() => {
        this.schemaPromise = null;
      });

    await this.schemaPromise;
  }

  private resolvePurpose(ctx: WaSendContext): WaSendPurpose {
    if (ctx.purpose) return ctx.purpose;
    if (ctx.source === "campaign") return "campaign";
    if (ctx.source === "automation") return "automation";
    if (ctx.source === "flow") return "flow";
    if (ctx.source === "affiliate") return "affiliate";
    if (ctx.source === "inbox") return "human_reply";
    if (ctx.source === "mob") return "otp";
    if (ctx.source === "commerce" || ctx.source === "booking") return "transactional";
    if (ctx.source === "composer_test") return "test";
    return "service";
  }

  async getLimits(userId?: string | null, brandId?: string | null) {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM wa_eligibility_settings
       WHERE (brand_id IS NOT NULL AND brand_id = ?)
          OR (user_id IS NOT NULL AND user_id = ? AND brand_id IS NULL)
       ORDER BY CASE WHEN brand_id IS NOT NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      [brandId || "", userId || ""]
    ).catch(() => null);

    return {
      minIntervalSeconds: Math.max(
        30,
        Number(row?.min_interval_seconds || DEFAULT_ELIGIBILITY_LIMITS.minIntervalSeconds)
      ),
      maxPerRecipientDay: Math.max(
        1,
        Number(row?.max_per_recipient_day || DEFAULT_ELIGIBILITY_LIMITS.maxPerRecipientDay)
      ),
      maxPerInstanceHour: Math.max(
        5,
        Number(row?.max_per_instance_hour || DEFAULT_ELIGIBILITY_LIMITS.maxPerInstanceHour)
      ),
      maxPerBrandDay: Math.max(
        10,
        Number(row?.max_per_brand_day || DEFAULT_ELIGIBILITY_LIMITS.maxPerBrandDay)
      ),
      requireConsentForMarketing: Boolean(
        row?.require_consent_marketing ?? DEFAULT_ELIGIBILITY_LIMITS.requireConsentForMarketing
      ),
      identifyFirstMessage: row?.identify_first_message !== false,
    };
  }

  async registerConsent(input: {
    phone: string;
    userId?: string | null;
    brandId?: string | null;
    purpose?: string;
    origin: string;
    evidence?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    await this.ensureSchema();
    const phone = normalizeWaPhone(input.phone);
    if (!phone || phone.length < 10) throw new Error("phone_required");
    const id = randomUUID();
    await query(
      `INSERT INTO wa_message_consents
         (id, phone_normalized, user_id, brand_id, purpose, origin, evidence, source, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)`,
      [
        id,
        phone,
        input.userId || null,
        input.brandId || null,
        String(input.purpose || "marketing").slice(0, 40),
        String(input.origin || "unknown").slice(0, 120),
        input.evidence ? String(input.evidence).slice(0, 2000) : null,
        input.source ? String(input.source).slice(0, 60) : null,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return { id };
  }

  /**
   * Fontes que representam opt-in real do titular (não scrape/prospecção fria).
   */
  isExplicitConsentSource(source?: string | null): boolean {
    const s = String(source || "")
      .trim()
      .toLowerCase();
    if (!s) return false;
    if (
      /google|maps|scrape|prospect|import.?csv|cold|lista.?comprada|cold.?list|enriched/.test(s)
    ) {
      return false;
    }
    return /manual|form|website|site|checkout|loja|storefront|landing|cadastro|whatsapp|inbox|pedido|order|cliente|public|opt.?in|newsletter|lead.?form|catalogo|catálogo/.test(
      s
    );
  }

  /**
   * Fire-and-forget: grava consentimento em capturas/checkout com evidência.
   * Nunca lança — falha de consent não derruba o fluxo de negócio.
   */
  async recordCaptureConsent(input: {
    phone?: string | null;
    userId?: string | null;
    brandId?: string | null;
    origin: string;
    purpose?: string | string[];
    evidence?: string | null;
    source?: string | null;
    requireExplicitSource?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const phone = normalizeWaPhone(input.phone);
      if (!phone || phone.length < 10) return;

      if (input.requireExplicitSource !== false && input.source) {
        if (!this.isExplicitConsentSource(input.source) && !this.isExplicitConsentSource(input.origin)) {
          return;
        }
      }

      const purposes = Array.isArray(input.purpose)
        ? input.purpose
        : [input.purpose || "marketing"];

      for (const purpose of purposes) {
        // Evita spam de linhas idênticas no mesmo dia
        const recent = await queryOne<any>(
          `SELECT id FROM wa_message_consents
           WHERE phone_normalized = ?
             AND purpose = ?
             AND COALESCE(brand_id,'') = COALESCE(?,'')
             AND revoked_at IS NULL
             AND granted_at > NOW() - INTERVAL '7 days'
           LIMIT 1`,
          [phone, String(purpose).slice(0, 40), input.brandId || null]
        ).catch(() => null);
        if (recent) continue;

        await this.registerConsent({
          phone,
          userId: input.userId,
          brandId: input.brandId,
          purpose: String(purpose || "marketing"),
          origin: input.origin,
          evidence: input.evidence || null,
          source: input.source || null,
          metadata: input.metadata,
        });
      }
    } catch (e: any) {
      logger.warn(`[wa_eligibility] recordCaptureConsent: ${e?.message || e}`);
    }
  }

  async hasActiveConsent(
    phone: string,
    brandId?: string | null,
    purpose = "marketing"
  ): Promise<boolean> {
    await this.ensureSchema();
    const p = normalizeWaPhone(phone);
    if (!p) return false;
    const row = await queryOne<any>(
      `SELECT id FROM wa_message_consents
       WHERE phone_normalized = ?
         AND revoked_at IS NULL
         AND purpose = ?
         AND (brand_id IS NULL OR brand_id = ?)
       ORDER BY granted_at DESC
       LIMIT 1`,
      [p, purpose, brandId || ""]
    );
    return !!row;
  }

  async blockPhone(input: {
    phone: string;
    reason?: string;
    source?: string;
    scope?: "global" | "brand" | "user";
    userId?: string | null;
    brandId?: string | null;
    expiresAt?: string | null;
  }): Promise<{ id: string }> {
    await this.ensureSchema();
    const phone = normalizeWaPhone(input.phone);
    if (!phone) throw new Error("phone_required");
    // desativa bloqueios anteriores iguais
    await query(
      `UPDATE wa_send_blocks SET active = FALSE
       WHERE phone_normalized = ? AND active = TRUE
         AND scope = ?
         AND COALESCE(brand_id,'') = COALESCE(?,'')
         AND COALESCE(user_id,'') = COALESCE(?,'')`,
      [phone, input.scope || "global", input.brandId || null, input.userId || null]
    ).catch(() => {});
    const id = randomUUID();
    await query(
      `INSERT INTO wa_send_blocks
         (id, phone_normalized, scope, user_id, brand_id, reason, source, expires_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        id,
        phone,
        input.scope || "global",
        input.userId || null,
        input.brandId || null,
        input.reason ? String(input.reason).slice(0, 200) : null,
        input.source || "system",
        input.expiresAt || null,
      ]
    );
    return { id };
  }

  async isBlocked(
    phone: string,
    opts?: { userId?: string | null; brandId?: string | null }
  ): Promise<{ blocked: boolean; reason?: string }> {
    await this.ensureSchema();
    const p = normalizeWaPhone(phone);
    if (!p) return { blocked: false };
    const row = await queryOne<any>(
      `SELECT reason FROM wa_send_blocks
       WHERE phone_normalized = ?
         AND active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (
           scope = 'global'
           OR (scope = 'brand' AND brand_id = ?)
           OR (scope = 'user' AND user_id = ?)
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [p, opts?.brandId || "", opts?.userId || ""]
    );
    if (row) return { blocked: true, reason: row.reason || "blocked" };
    return { blocked: false };
  }

  /**
   * Opt-out completo: block + LGPD + limpeza de filas pendentes.
   */
  async registerOptOutAndPurge(input: {
    phone: string;
    reason?: string;
    source?: string;
    userId?: string | null;
    brandId?: string | null;
    instanceId?: string | null;
  }): Promise<{ ok: true; purged: Record<string, number> }> {
    await this.ensureSchema();
    const phone = normalizeWaPhone(input.phone);
    if (!phone) throw new Error("phone_required");

    await this.blockPhone({
      phone,
      reason: input.reason || "whatsapp_opt_out",
      source: input.source || "whatsapp_command",
      scope: "global",
    });

    try {
      await lgpdOptoutService.register({
        phone,
        reason: input.reason || "WhatsApp PARAR",
        source: "whatsapp_command",
      });
    } catch (e: any) {
      logger.warn(`[wa_eligibility] lgpd register: ${e?.message || e}`);
    }

    // revoga consents
    await query(
      `UPDATE wa_message_consents SET revoked_at = NOW()
       WHERE phone_normalized = ? AND revoked_at IS NULL`,
      [phone]
    ).catch(() => {});

    const purged: Record<string, number> = {};

    try {
      const r = await query(
        `UPDATE campaign_leads
         SET status = 'opted_out', error_message = 'Opt-out WhatsApp'
         WHERE status IN ('pending','ready','sending','queued')
           AND REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') = ?`,
        [phone]
      );
      purged.campaign_leads = Number((r as any)?.rowCount || (r as any)?.affectedRows || 0);
    } catch {
      // fallback sem REGEXP (MySQL-ish)
      try {
        const r = await query(
          `UPDATE campaign_leads
           SET status = 'opted_out', error_message = 'Opt-out WhatsApp'
           WHERE status IN ('pending','ready','sending','queued')
             AND REPLACE(REPLACE(REPLACE(COALESCE(phone,''),'+',''),'-',''),' ','') LIKE ?`,
          [`%${phone.slice(-11)}`]
        );
        purged.campaign_leads = Number((r as any)?.rowCount || 0);
      } catch {
        purged.campaign_leads = 0;
      }
    }

    try {
      const r = await query(
        `UPDATE automation_jobs
         SET status = 'cancelled', error_message = 'Opt-out WhatsApp'
         WHERE status IN ('pending','scheduled','ready','processing')
           AND (
             REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') = ?
             OR REGEXP_REPLACE(COALESCE(target_phone,''), '[^0-9]', '', 'g') = ?
           )`,
        [phone, phone]
      );
      purged.automation_jobs = Number((r as any)?.rowCount || 0);
    } catch {
      purged.automation_jobs = 0;
    }

    try {
      const r = await query(
        `UPDATE lead_distribution_queue
         SET status = 'cancelled', last_error = 'Opt-out WhatsApp'
         WHERE status IN ('pending','ready','assigned','retry')
           AND REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') = ?`,
        [phone]
      );
      purged.lead_distribution_queue = Number((r as any)?.rowCount || 0);
    } catch {
      purged.lead_distribution_queue = 0;
    }

    await this.recordEvent({
      phone,
      userId: input.userId,
      brandId: input.brandId,
      instanceId: input.instanceId,
      purpose: "service",
      source: "inbox",
      outcome: "opt_out",
      denyCode: "opt_out",
    });

    logger.info(
      `[wa_eligibility] opt-out phone=***${phone.slice(-4)} purged=${JSON.stringify(purged)}`
    );
    return { ok: true, purged };
  }

  async recordEvent(input: {
    phone: string;
    userId?: string | null;
    brandId?: string | null;
    instanceId?: string | null;
    purpose: WaSendPurpose;
    source: WaSendSource;
    outcome: "sent" | "denied" | "failed" | "opt_out";
    denyCode?: string | null;
    contentFingerprint?: string | null;
  }): Promise<void> {
    try {
      await this.ensureSchema();
      await query(
        `INSERT INTO wa_send_events
           (id, phone_normalized, user_id, brand_id, instance_id, purpose, source, outcome, deny_code, content_fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          normalizeWaPhone(input.phone) || "unknown",
          input.userId || null,
          input.brandId || null,
          input.instanceId || null,
          input.purpose,
          input.source,
          input.outcome,
          input.denyCode || null,
          input.contentFingerprint || null,
        ]
      );
    } catch (e: any) {
      logger.warn(`[wa_eligibility] recordEvent: ${e?.message || e}`);
    }
  }

  async refreshInstanceQuality(instanceId: string): Promise<void> {
    if (!instanceId) return;
    await this.ensureSchema();
    const stats = await queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE outcome = 'sent') AS sends,
         COUNT(*) FILTER (WHERE outcome IN ('failed','denied')) AS fails,
         COUNT(*) FILTER (WHERE outcome = 'opt_out') AS optouts
       FROM wa_send_events
       WHERE instance_id = ?
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [instanceId]
    ).catch(() => null);

    // Postgres FILTER may fail if translated poorly — fallback
    let sends = Number(stats?.sends || 0);
    let fails = Number(stats?.fails || 0);
    let optouts = Number(stats?.optouts || 0);
    if (!stats) {
      const rows = (await query<any[]>(
        `SELECT outcome, COUNT(*)::int AS c FROM wa_send_events
         WHERE instance_id = ? AND created_at > NOW() - INTERVAL '24 hours'
         GROUP BY outcome`,
        [instanceId]
      ).catch(() => [])) as any[];
      for (const r of rows || []) {
        if (r.outcome === "sent") sends = Number(r.c || 0);
        if (r.outcome === "failed" || r.outcome === "denied") fails += Number(r.c || 0);
        if (r.outcome === "opt_out") optouts = Number(r.c || 0);
      }
    }

    const total = sends + fails;
    const failRate = total > 0 ? fails / total : 0;
    const shouldPause =
      total >= DEFAULT_ELIGIBILITY_LIMITS.qualityPauseMinSends &&
      failRate >= DEFAULT_ELIGIBILITY_LIMITS.qualityPauseFailRate;

    const existing = await queryOne<any>(
      `SELECT paused FROM wa_instance_quality WHERE instance_id = ?`,
      [instanceId]
    ).catch(() => null);

    if (existing) {
      await query(
        `UPDATE wa_instance_quality SET
           fail_rate_24h = ?, sends_24h = ?, fails_24h = ?, optouts_24h = ?,
           paused = CASE WHEN ? THEN TRUE ELSE paused END,
           pause_reason = CASE WHEN ? THEN ? ELSE pause_reason END,
           paused_at = CASE WHEN ? AND paused = FALSE THEN NOW() ELSE paused_at END,
           updated_at = NOW()
         WHERE instance_id = ?`,
        [
          failRate,
          sends,
          fails,
          optouts,
          shouldPause,
          shouldPause,
          shouldPause
            ? `Pausa preventiva: ${(failRate * 100).toFixed(0)}% falhas/opt-out em 24h (${fails}/${total})`
            : null,
          shouldPause,
          instanceId,
        ]
      ).catch(() => {});
    } else {
      await query(
        `INSERT INTO wa_instance_quality
           (instance_id, paused, pause_reason, paused_at, fail_rate_24h, sends_24h, fails_24h, optouts_24h)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          instanceId,
          shouldPause,
          shouldPause
            ? `Pausa preventiva: ${(failRate * 100).toFixed(0)}% falhas em 24h`
            : null,
          shouldPause ? new Date().toISOString() : null,
          failRate,
          sends,
          fails,
          optouts,
        ]
      ).catch(() => {});
    }
  }

  async isInstancePaused(instanceId: string): Promise<{ paused: boolean; reason?: string }> {
    if (!instanceId) return { paused: false };
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT paused, pause_reason FROM wa_instance_quality WHERE instance_id = ?`,
      [instanceId]
    ).catch(() => null);
    if (row?.paused) return { paused: true, reason: row.pause_reason || "instance_paused" };
    return { paused: false };
  }

  async setInstancePaused(instanceId: string, paused: boolean, reason?: string): Promise<void> {
    await this.ensureSchema();
    await query(
      `INSERT INTO wa_instance_quality (instance_id, paused, pause_reason, paused_at, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON CONFLICT (instance_id) DO UPDATE SET
         paused = EXCLUDED.paused,
         pause_reason = EXCLUDED.pause_reason,
         paused_at = CASE WHEN EXCLUDED.paused THEN COALESCE(wa_instance_quality.paused_at, NOW()) ELSE NULL END,
         updated_at = NOW()`,
      [instanceId, paused, reason || null, paused ? new Date().toISOString() : null]
    ).catch(async () => {
      // MySQL-style fallback
      await query(
        `UPDATE wa_instance_quality SET paused = ?, pause_reason = ?, updated_at = NOW() WHERE instance_id = ?`,
        [paused, reason || null, instanceId]
      ).catch(() => {});
    });
  }

  buildIdentifyFooter(input: {
    brandName?: string | null;
    contactOrigin?: string | null;
  }): string {
    const brand = String(input.brandName || "nossa empresa").trim() || "nossa empresa";
    const origin = String(input.contactOrigin || "seu contato conosco").trim();
    return (
      `\n\n—\n` +
      `${brand}. Você recebe esta mensagem por ${origin}. ` +
      `Responda *PARAR* para não receber mais comunicações.`
    );
  }

  /**
   * Gate principal — chamar antes de relay/sendMessage.
   */
  async assertCanSend(input: {
    phone?: string | null;
    jid?: string | null;
    instanceId?: string | null;
    userId?: string | null;
    brandId?: string | null;
    purpose?: WaSendPurpose;
    source?: WaSendSource;
    content?: string | null;
    skipRateLimits?: boolean;
    brandName?: string | null;
    contactOrigin?: string | null;
    skipIdentifyFooter?: boolean;
  }): Promise<EligibilityDecision & { messageOut?: string }> {
    const ctx = { ...getWaSendContext(), ...input };
    const purpose = this.resolvePurpose(ctx);
    const source: WaSendSource = ctx.source || "unknown";

    // Grupos / canais: não gatear por lead phone
    const jid = String(input.jid || "").trim();
    if (jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) {
      return {
        ok: true,
        phone: "",
        purpose,
        firstContact: false,
        limits: {
          minIntervalSeconds: DEFAULT_ELIGIBILITY_LIMITS.minIntervalSeconds,
          maxPerRecipientDay: DEFAULT_ELIGIBILITY_LIMITS.maxPerRecipientDay,
          maxPerInstanceHour: DEFAULT_ELIGIBILITY_LIMITS.maxPerInstanceHour,
          maxPerBrandDay: DEFAULT_ELIGIBILITY_LIMITS.maxPerBrandDay,
        },
        messageOut: input.content || undefined,
      };
    }

    let phone = normalizeWaPhone(input.phone);
    if (!phone && jid) phone = phoneFromJid(jid);

    if (!phone || phone.length < 10) {
      // LID sem PN: falha aberta em service, nega marketing
      if (isMarketing(purpose)) {
        return {
          ok: false,
          phone: phone || "",
          code: "phone_unresolved",
          reason: "Não foi possível validar o telefone do destinatário para envio comercial.",
          purpose,
        };
      }
      return {
        ok: true,
        phone: phone || "",
        purpose,
        firstContact: false,
        limits: {
          minIntervalSeconds: DEFAULT_ELIGIBILITY_LIMITS.minIntervalSeconds,
          maxPerRecipientDay: DEFAULT_ELIGIBILITY_LIMITS.maxPerRecipientDay,
          maxPerInstanceHour: DEFAULT_ELIGIBILITY_LIMITS.maxPerInstanceHour,
          maxPerBrandDay: DEFAULT_ELIGIBILITY_LIMITS.maxPerBrandDay,
        },
        messageOut: input.content || undefined,
      };
    }

    try {
      await this.ensureSchema();
    } catch {
      // schema down: marketing fail-closed, service fail-open
      if (isMarketing(purpose)) {
        return {
          ok: false,
          phone,
          code: "eligibility_unavailable",
          reason: "Serviço de elegibilidade indisponível — envio comercial bloqueado.",
          purpose,
        };
      }
      return {
        ok: true,
        phone,
        purpose,
        firstContact: false,
        limits: {
          minIntervalSeconds: DEFAULT_ELIGIBILITY_LIMITS.minIntervalSeconds,
          maxPerRecipientDay: DEFAULT_ELIGIBILITY_LIMITS.maxPerRecipientDay,
          maxPerInstanceHour: DEFAULT_ELIGIBILITY_LIMITS.maxPerInstanceHour,
          maxPerBrandDay: DEFAULT_ELIGIBILITY_LIMITS.maxPerBrandDay,
        },
        messageOut: input.content || undefined,
      };
    }

    const userId = ctx.userId || null;
    const brandId = ctx.brandId || null;
    const instanceId = input.instanceId || null;
    const limits = await this.getLimits(userId, brandId);
    const fp = contentFingerprint(input.content || ctx.content);

    const deny = async (code: string, reason: string): Promise<EligibilityDecision> => {
      await this.recordEvent({
        phone,
        userId,
        brandId,
        instanceId,
        purpose,
        source,
        outcome: "denied",
        denyCode: code,
        contentFingerprint: fp,
      });
      return { ok: false, phone, code, reason, purpose };
    };

    // 1) Block list
    const blocked = await this.isBlocked(phone, { userId, brandId });
    if (blocked.blocked) {
      return deny("blocked", blocked.reason || "Número bloqueado para envios WhatsApp.");
    }

    // 2) LGPD opt-out
    if (await lgpdOptoutService.isOptedOut(phone)) {
      return deny("opted_out", "Destinatário optou por não receber comunicações (LGPD/opt-out).");
    }

    // 3) Instance quality pause (não bloqueia OTP/human)
    if (instanceId && purpose !== "otp" && purpose !== "human_reply") {
      const iq = await this.isInstancePaused(instanceId);
      if (iq.paused) {
        return deny("instance_quality_pause", iq.reason || "Seção pausada por baixa qualidade.");
      }
    }

    // Light purposes: only block/opt-out
    if (LIGHT_PURPOSES.has(purpose) || ctx.skipRateLimits) {
      return {
        ok: true,
        phone,
        purpose,
        firstContact: false,
        limits: {
          minIntervalSeconds: limits.minIntervalSeconds,
          maxPerRecipientDay: limits.maxPerRecipientDay,
          maxPerInstanceHour: limits.maxPerInstanceHour,
          maxPerBrandDay: limits.maxPerBrandDay,
        },
        messageOut: input.content || undefined,
      };
    }

    // 4) Consent (optional hard require)
    if (limits.requireConsentForMarketing && isMarketing(purpose)) {
      const okConsent = await this.hasActiveConsent(phone, brandId, "marketing");
      if (!okConsent) {
        return deny(
          "consent_required",
          "Sem consentimento registrado para mensagens comerciais deste contato."
        );
      }
    }

    // 5) Min interval same recipient
    const last = await queryOne<any>(
      `SELECT created_at FROM wa_send_events
       WHERE phone_normalized = ?
         AND outcome = 'sent'
         AND purpose IN ('marketing','campaign','automation','flow','affiliate','followup')
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone]
    ).catch(() => null);
    if (last?.created_at) {
      const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (elapsed < limits.minIntervalSeconds) {
        return deny(
          "min_interval",
          `Aguarde ${Math.ceil(limits.minIntervalSeconds - elapsed)}s antes de nova mensagem a este contato.`
        );
      }
    }

    // 6) Per recipient daily
    const dayCount = await queryOne<any>(
      `SELECT COUNT(*)::int AS c FROM wa_send_events
       WHERE phone_normalized = ?
         AND outcome = 'sent'
         AND purpose IN ('marketing','campaign','automation','flow','affiliate','followup')
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [phone]
    ).catch(() => ({ c: 0 }));
    if (Number(dayCount?.c || 0) >= limits.maxPerRecipientDay) {
      return deny(
        "recipient_daily_limit",
        `Limite diário de ${limits.maxPerRecipientDay} mensagem(ns) comerciais por contato.`
      );
    }

    // 7) Per instance hourly
    if (instanceId) {
      const hourCount = await queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM wa_send_events
         WHERE instance_id = ?
           AND outcome = 'sent'
           AND created_at > NOW() - INTERVAL '1 hour'`,
        [instanceId]
      ).catch(() => ({ c: 0 }));
      if (Number(hourCount?.c || 0) >= limits.maxPerInstanceHour) {
        return deny(
          "instance_hourly_limit",
          `Limite horário da seção (${limits.maxPerInstanceHour}/h) atingido.`
        );
      }
    }

    // 8) Per brand daily
    if (brandId) {
      const brandCount = await queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM wa_send_events
         WHERE brand_id = ?
           AND outcome = 'sent'
           AND purpose IN ('marketing','campaign','automation','flow','affiliate','followup')
           AND created_at > NOW() - INTERVAL '24 hours'`,
        [brandId]
      ).catch(() => ({ c: 0 }));
      if (Number(brandCount?.c || 0) >= limits.maxPerBrandDay) {
        return deny(
          "brand_daily_limit",
          `Limite diário da marca (${limits.maxPerBrandDay}) atingido.`
        );
      }
    }

    // 9) Dedupe identical content across engines
    if (fp) {
      const dup = await queryOne<any>(
        `SELECT id FROM wa_send_events
         WHERE phone_normalized = ?
           AND content_fingerprint = ?
           AND outcome = 'sent'
           AND created_at > NOW() - INTERVAL '${DEFAULT_ELIGIBILITY_LIMITS.maxIdenticalFingerprintHours} hours'
         LIMIT 1`,
        [phone, fp]
      ).catch(() => null);
      if (dup) {
        return deny(
          "duplicate_content",
          "Mensagem idêntica já enviada a este contato recentemente (campanha/automação/fluxo)."
        );
      }
    }

    // 10) First commercial contact?
    const prior = await queryOne<any>(
      `SELECT id FROM wa_send_events
       WHERE phone_normalized = ?
         AND outcome = 'sent'
         AND purpose IN ('marketing','campaign','automation','flow','affiliate','followup')
       LIMIT 1`,
      [phone]
    ).catch(() => null);
    const firstContact = !prior;

    let messageOut = input.content || undefined;
    if (
      firstContact &&
      limits.identifyFirstMessage &&
      isMarketing(purpose) &&
      !ctx.skipIdentifyFooter &&
      typeof messageOut === "string" &&
      messageOut.trim() &&
      !/\bPARAR\b/i.test(messageOut)
    ) {
      messageOut =
        messageOut +
        this.buildIdentifyFooter({
          brandName: ctx.brandName,
          contactOrigin: ctx.contactOrigin,
        });
    }

    return {
      ok: true,
      phone,
      purpose,
      firstContact,
      limits: {
        minIntervalSeconds: limits.minIntervalSeconds,
        maxPerRecipientDay: limits.maxPerRecipientDay,
        maxPerInstanceHour: limits.maxPerInstanceHour,
        maxPerBrandDay: limits.maxPerBrandDay,
      },
      messageOut,
    };
  }

  async markSent(input: {
    phone: string;
    instanceId?: string | null;
    userId?: string | null;
    brandId?: string | null;
    purpose?: WaSendPurpose;
    source?: WaSendSource;
    content?: string | null;
  }): Promise<void> {
    const ctx = getWaSendContext();
    await this.recordEvent({
      phone: input.phone,
      userId: input.userId ?? ctx.userId,
      brandId: input.brandId ?? ctx.brandId,
      instanceId: input.instanceId,
      purpose: input.purpose || this.resolvePurpose(ctx),
      source: input.source || ctx.source || "unknown",
      outcome: "sent",
      contentFingerprint: contentFingerprint(input.content || ctx.content),
    });
    if (input.instanceId) {
      void this.refreshInstanceQuality(input.instanceId);
    }
  }

  async markFailed(input: {
    phone: string;
    instanceId?: string | null;
    userId?: string | null;
    brandId?: string | null;
    purpose?: WaSendPurpose;
    source?: WaSendSource;
    code?: string;
  }): Promise<void> {
    const ctx = getWaSendContext();
    await this.recordEvent({
      phone: input.phone,
      userId: input.userId ?? ctx.userId,
      brandId: input.brandId ?? ctx.brandId,
      instanceId: input.instanceId,
      purpose: input.purpose || this.resolvePurpose(ctx),
      source: input.source || ctx.source || "unknown",
      outcome: "failed",
      denyCode: input.code || "send_failed",
    });
    if (input.instanceId) {
      void this.refreshInstanceQuality(input.instanceId);
    }
  }

  async getHealthDashboard(input: {
    userId: string;
    brandId?: string | null;
  }): Promise<{
    instances: Array<Record<string, unknown>>;
    totals24h: Record<string, number>;
    limits: Awaited<ReturnType<WhatsAppSendEligibilityService["getLimits"]>>;
  }> {
    await this.ensureSchema();
    const brandFilter = input.brandId
      ? "AND (i.brand_id = ? OR i.brand_id IS NULL)"
      : "";
    const params: any[] = [input.userId];
    if (input.brandId) params.push(input.brandId);

    const instances = (await query<any[]>(
      `SELECT i.id, i.name, i.phone, i.status, i.brand_id,
              q.paused, q.pause_reason, q.fail_rate_24h, q.sends_24h, q.fails_24h, q.optouts_24h
       FROM whatsapp_instances i
       LEFT JOIN wa_instance_quality q ON q.instance_id = i.id
       WHERE i.created_by = ? ${brandFilter}
       ORDER BY i.name ASC`,
      params
    ).catch(() => [])) as any[];

    // enrich with event stats if quality table empty
    for (const inst of instances || []) {
      if (inst.sends_24h == null) {
        const s = await queryOne<any>(
          `SELECT
             COUNT(*) FILTER (WHERE outcome = 'sent') AS sends,
             COUNT(*) FILTER (WHERE outcome IN ('failed','denied')) AS fails,
             COUNT(*) FILTER (WHERE outcome = 'opt_out') AS optouts
           FROM wa_send_events
           WHERE instance_id = ? AND created_at > NOW() - INTERVAL '24 hours'`,
          [inst.id]
        ).catch(() => null);
        inst.sends_24h = Number(s?.sends || 0);
        inst.fails_24h = Number(s?.fails || 0);
        inst.optouts_24h = Number(s?.optouts || 0);
      }
    }

    const totals = await queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE outcome = 'sent') AS sent,
         COUNT(*) FILTER (WHERE outcome = 'denied') AS denied,
         COUNT(*) FILTER (WHERE outcome = 'failed') AS failed,
         COUNT(*) FILTER (WHERE outcome = 'opt_out') AS optouts
       FROM wa_send_events e
       WHERE e.created_at > NOW() - INTERVAL '24 hours'
         AND (e.user_id = ? OR e.user_id IS NULL)`,
      [input.userId]
    ).catch(() => ({ sent: 0, denied: 0, failed: 0, optouts: 0 }));

    return {
      instances: instances || [],
      totals24h: {
        sent: Number(totals?.sent || 0),
        denied: Number(totals?.denied || 0),
        failed: Number(totals?.failed || 0),
        optouts: Number(totals?.optouts || 0),
      },
      limits: await this.getLimits(input.userId, input.brandId),
    };
  }
}

export const whatsappSendEligibility = new WhatsAppSendEligibilityService();
