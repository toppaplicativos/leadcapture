/**
 * MasterService — Super-admin (SaaS owner) operations.
 *
 * Distinct from the per-tenant /admin: this is the operator of the SaaS
 * itself. Manages all clients, plans, integrations, audit log.
 */

import { query, queryOne } from "../config/database"
import { config } from "../config"
import { logger } from "../utils/logger"
import { v4 as uuidv4 } from "uuid"

/**
 * Parse a value coming from a JSONB column.
 *
 * - The `pg` driver returns JSONB values already parsed (object/string/number).
 * - But some setups (and MySQL fallback) return them as raw strings.
 * - Some legacy rows may contain plain text (not JSON-encoded) from older code.
 *
 * We try JSON.parse only when the string looks like JSON; otherwise return
 * the raw string. This is forgiving and avoids `JSON.parse('sk_...')` crashes.
 */
function parseJsonbValue<T = any>(v: any): T {
  if (v == null) return v as T
  if (typeof v !== "string") return v as T
  const t = v.trim()
  if (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]")) ||
    (t.startsWith('"') && t.endsWith('"')) ||
    t === "true" ||
    t === "false" ||
    t === "null" ||
    /^-?\d+(\.\d+)?$/.test(t)
  ) {
    try {
      return JSON.parse(t) as T
    } catch {
      return v as T
    }
  }
  return v as T
}

export interface MasterSetting {
  key: string
  value: any
  updated_by?: string | null
  updated_at: Date
}

export interface AuditEntry {
  id: string
  actor_user_id: string
  actor_email: string
  action: string
  resource: string | null
  payload: any
  ip: string | null
  created_at: Date
}

export class MasterService {
  private schemaReady = false
  private schemaPromise: Promise<void> | null = null

  /**
   * Idempotent schema bootstrap. Runs at startup.
   * Adds is_super_admin to users + creates master_settings + audit_log.
   */
  async ensureSchema(): Promise<void> {
    if (!config.postgres.connectionString && !config.postgres.host) return
    if (this.schemaReady) return
    if (this.schemaPromise) return this.schemaPromise

    this.schemaPromise = (async () => {
      // 1. is_super_admin column on users
      try {
        await query(`
          ALTER TABLE users
          ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE
        `)
      } catch (err: any) {
        logger.warn(`is_super_admin column add: ${err?.message || err}`)
      }

      // 2. master_settings — KV store for global SaaS config
      await query(`
        CREATE TABLE IF NOT EXISTS master_settings (
          key VARCHAR(80) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_by VARCHAR(36) NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)

      // 3. audit_log — every super-admin action
      await query(`
        CREATE TABLE IF NOT EXISTS master_audit_log (
          id VARCHAR(36) PRIMARY KEY,
          actor_user_id VARCHAR(36) NOT NULL,
          actor_email VARCHAR(255) NOT NULL,
          action VARCHAR(80) NOT NULL,
          resource VARCHAR(120) NULL,
          payload JSONB NULL,
          ip VARCHAR(64) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_master_audit_actor ON master_audit_log (actor_user_id)`)
        await query(`CREATE INDEX IF NOT EXISTS idx_master_audit_created ON master_audit_log (created_at DESC)`)
      } catch { /* ignore */ }

      // 4. plans — subscription plans visible to public + master
      await query(`
        CREATE TABLE IF NOT EXISTS plans (
          id VARCHAR(36) PRIMARY KEY,
          slug VARCHAR(40) NOT NULL UNIQUE,
          name VARCHAR(80) NOT NULL,
          tagline VARCHAR(140) NULL,
          price_cents INTEGER NOT NULL DEFAULT 0,
          interval VARCHAR(16) NOT NULL DEFAULT 'monthly',
          billing_type VARCHAR(16) NOT NULL DEFAULT 'subscription',
          features JSONB NOT NULL DEFAULT '[]',
          limits JSONB NOT NULL DEFAULT '{}',
          stripe_product_id VARCHAR(80) NULL,
          stripe_price_id VARCHAR(80) NULL,
          payment_link VARCHAR(255) NULL,
          payment_link_id VARCHAR(120) NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          is_featured BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      // Backfill columns for existing installs (idempotent)
      try {
        await query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_type VARCHAR(16) NOT NULL DEFAULT 'subscription'`)
        await query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_link VARCHAR(255) NULL`)
        await query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_link_id VARCHAR(120) NULL`)
      } catch { /* ignore */ }

      // 5. subscriptions — link user/brand to a plan
      await query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NULL,
          plan_id VARCHAR(36) NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'trialing',
          gateway VARCHAR(24) NULL,
          gateway_customer_id VARCHAR(120) NULL,
          gateway_subscription_id VARCHAR(120) NULL,
          trial_ends_at TIMESTAMPTZ NULL,
          current_period_start TIMESTAMPTZ NULL,
          current_period_end TIMESTAMPTZ NULL,
          canceled_at TIMESTAMPTZ NULL,
          metadata JSONB NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id)`)
        await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status)`)
      } catch { /* ignore */ }

      // 6. email_templates — system + tenant scoped
      await query(`
        CREATE TABLE IF NOT EXISTS email_templates (
          id VARCHAR(36) PRIMARY KEY,
          slug VARCHAR(80) NOT NULL,
          scope VARCHAR(16) NOT NULL DEFAULT 'system',
          brand_id VARCHAR(36) NULL,
          subject_template TEXT NOT NULL,
          html_template TEXT NOT NULL,
          text_template TEXT NULL,
          variables JSONB NOT NULL DEFAULT '[]',
          description TEXT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          updated_by VARCHAR(36) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      try {
        await query(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_email_tpl_slug_scope_brand
             ON email_templates (slug, scope, COALESCE(brand_id, ''))`,
        )
      } catch { /* ignore */ }

      // 7. email_logs — track every transactional send
      await query(`
        CREATE TABLE IF NOT EXISTS email_logs (
          id VARCHAR(36) PRIMARY KEY,
          template_slug VARCHAR(80) NULL,
          to_email VARCHAR(255) NOT NULL,
          subject TEXT NOT NULL,
          scope VARCHAR(16) NOT NULL DEFAULT 'system',
          brand_id VARCHAR(36) NULL,
          actor_user_id VARCHAR(36) NULL,
          status VARCHAR(16) NOT NULL DEFAULT 'sent',
          error_message TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs (created_at DESC)`)
      } catch { /* ignore */ }

      // 6. Seed default plans if table is empty.
      // 3 planos: Starter (individual), Pro (escala c/ IA+Meta+dominio), Custom (enterprise).
      // Limites usam estrutura nova { leads_per_day, leads_per_month, instances, brands,
      // features: { creative_ai, meta_integration, custom_domain, corporate_email, ... } }
      const existing = await queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM plans`)
      if (existing && Number(existing.count) === 0) {
        const defaults = [
          {
            slug: 'starter',
            name: 'Starter',
            tagline: 'Comece a captar hoje',
            price_cents: 9700,
            features: [
              'Até 100 leads captados/dia (3.000/mês)',
              '1 brand · 1 número WhatsApp',
              'Captação no mapa (Radar)',
              'CRM completo com tags e funil',
              'Importação inteligente (IA)',
              'Inteligência de prospecção (IA)',
              'Suporte por email',
            ],
            limits: {
              leads_per_day: 100,
              leads_per_month: 3000,
              instances: 1,
              brands: 1,
              disparos_per_month: 500,
              features: {
                radar: true,
                crm: true,
                smart_import: true,
                prospect_ai: true,
                creative_ai: false,
                meta_integration: false,
                custom_domain: false,
                corporate_email: false,
                campaigns: false,
                automations: false,
                multi_brand: false,
                api: false,
              },
            },
            sort_order: 1,
          },
          {
            slug: 'pro',
            name: 'Pro',
            tagline: 'Cresça com IA + presença digital',
            price_cents: 29700,
            features: [
              'Até 500 leads captados/dia (15.000/mês)',
              'Até 3 brands · 3 números WhatsApp',
              'Tudo do Starter +',
              'Criativo IA (posts, anúncios, copy)',
              'Integração Instagram + Facebook',
              'Domínio customizado (seudominio.com.br)',
              'Emails corporativos (você@seudominio)',
              'Automação completa de campanhas',
              'Disparos em massa ilimitados',
              'Vendas, catálogo e checkout',
              'Suporte prioritário',
            ],
            limits: {
              leads_per_day: 500,
              leads_per_month: 15000,
              instances: 3,
              brands: 3,
              disparos_per_month: -1,
              features: {
                radar: true,
                crm: true,
                smart_import: true,
                prospect_ai: true,
                creative_ai: true,
                meta_integration: true,
                custom_domain: true,
                corporate_email: true,
                campaigns: true,
                automations: true,
                multi_brand: true,
                api: false,
              },
            },
            is_featured: true,
            sort_order: 2,
          },
          {
            slug: 'custom',
            name: 'Custom',
            tagline: 'Sob medida para operações grandes',
            price_cents: 0,
            features: [
              'Volume customizado de leads',
              'Brands e números ilimitados',
              'Tudo do Pro +',
              'API e webhooks dedicados',
              'Integrações sob demanda (ERP, BI, etc)',
              'Onboarding e treinamento dedicado',
              'Gerente de sucesso (CSM) próprio',
              'SLA garantido em contrato',
              'Implantação assistida',
            ],
            limits: {
              leads_per_day: -1,
              leads_per_month: -1,
              instances: -1,
              brands: -1,
              disparos_per_month: -1,
              features: {
                radar: true,
                crm: true,
                smart_import: true,
                prospect_ai: true,
                creative_ai: true,
                meta_integration: true,
                custom_domain: true,
                corporate_email: true,
                campaigns: true,
                automations: true,
                multi_brand: true,
                api: true,
              },
            },
            sort_order: 3,
          },
        ]
        for (const p of defaults) {
          await query(
            `INSERT INTO plans (id, slug, name, tagline, price_cents, features, limits, is_featured, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              p.slug,
              p.name,
              p.tagline,
              p.price_cents,
              JSON.stringify(p.features),
              JSON.stringify(p.limits),
              !!(p as any).is_featured,
              p.sort_order,
            ],
          )
        }
        logger.info("Seeded default plans (Starter, Pro, Custom)")
      }

      /* Migration: atualiza planos existentes pra v2 (limites com features detalhados).
         Roda UMA vez via flag em master_settings. Idempotente — se rodou ja, pula. */
      const migrationFlag = await queryOne<{ value: any }>(
        `SELECT value FROM master_settings WHERE key = ?`,
        ['plans_v2_migrated_at'],
      )
      if (!migrationFlag) {
        const v2Plans = [
          {
            slug: 'starter',
            name: 'Starter',
            tagline: 'Comece a captar hoje',
            price_cents: 9700,
            features: [
              'Até 100 leads captados/dia (3.000/mês)',
              '1 brand · 1 número WhatsApp',
              'Captação no mapa (Radar)',
              'CRM completo com tags e funil',
              'Importação inteligente (IA)',
              'Inteligência de prospecção (IA)',
              'Suporte por email',
            ],
            limits: {
              leads_per_day: 100, leads_per_month: 3000, instances: 1, brands: 1,
              disparos_per_month: 500,
              features: {
                radar: true, crm: true, smart_import: true, prospect_ai: true,
                creative_ai: false, meta_integration: false, custom_domain: false,
                corporate_email: false, campaigns: false, automations: false,
                multi_brand: false, api: false,
              },
            },
            is_featured: false, sort_order: 1, is_active: true,
          },
          {
            slug: 'pro',
            name: 'Pro',
            tagline: 'Cresça com IA + presença digital',
            price_cents: 29700,
            features: [
              'Até 500 leads captados/dia (15.000/mês)',
              'Até 3 brands · 3 números WhatsApp',
              'Tudo do Starter +',
              'Criativo IA (posts, anúncios, copy)',
              'Integração Instagram + Facebook',
              'Domínio customizado (seudominio.com.br)',
              'Emails corporativos (você@seudominio)',
              'Automação completa de campanhas',
              'Disparos em massa ilimitados',
              'Vendas, catálogo e checkout',
              'Suporte prioritário',
            ],
            limits: {
              leads_per_day: 500, leads_per_month: 15000, instances: 3, brands: 3,
              disparos_per_month: -1,
              features: {
                radar: true, crm: true, smart_import: true, prospect_ai: true,
                creative_ai: true, meta_integration: true, custom_domain: true,
                corporate_email: true, campaigns: true, automations: true,
                multi_brand: true, api: false,
              },
            },
            is_featured: true, sort_order: 2, is_active: true,
          },
          {
            slug: 'custom',
            name: 'Custom',
            tagline: 'Sob medida para operações grandes',
            price_cents: 0,
            features: [
              'Volume customizado de leads',
              'Brands e números ilimitados',
              'Tudo do Pro +',
              'API e webhooks dedicados',
              'Integrações sob demanda (ERP, BI, etc)',
              'Onboarding e treinamento dedicado',
              'Gerente de sucesso (CSM) próprio',
              'SLA garantido em contrato',
              'Implantação assistida',
            ],
            limits: {
              leads_per_day: -1, leads_per_month: -1, instances: -1, brands: -1,
              disparos_per_month: -1,
              features: {
                radar: true, crm: true, smart_import: true, prospect_ai: true,
                creative_ai: true, meta_integration: true, custom_domain: true,
                corporate_email: true, campaigns: true, automations: true,
                multi_brand: true, api: true,
              },
            },
            is_featured: false, sort_order: 3, is_active: true,
          },
        ]
        for (const p of v2Plans) {
          /* Tenta atualizar pelo slug; se nao existir, insere. NAO mexe em stripe_* (preserva
             os links de pagamento ja criados). */
          const existingPlan = await queryOne<{ id: string }>(
            `SELECT id FROM plans WHERE slug = ?`, [p.slug],
          )
          if (existingPlan) {
            await query(
              `UPDATE plans
                 SET name = ?, tagline = ?, price_cents = ?, features = ?, limits = ?,
                     is_featured = ?, sort_order = ?, is_active = ?, updated_at = NOW()
               WHERE slug = ?`,
              [
                p.name, p.tagline, p.price_cents,
                JSON.stringify(p.features), JSON.stringify(p.limits),
                p.is_featured, p.sort_order, p.is_active, p.slug,
              ],
            )
          } else {
            await query(
              `INSERT INTO plans (id, slug, name, tagline, price_cents, features, limits, is_featured, sort_order, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(), p.slug, p.name, p.tagline, p.price_cents,
                JSON.stringify(p.features), JSON.stringify(p.limits),
                p.is_featured, p.sort_order, p.is_active,
              ],
            )
          }
        }
        /* Desativa qualquer plano legacy fora do conjunto v2 (ex: 'scale') */
        await query(
          `UPDATE plans SET is_active = FALSE WHERE slug NOT IN ('starter', 'pro', 'custom')`,
          [],
        )
        /* Marca flag pra nao reexecutar */
        await query(
          `INSERT INTO master_settings (key, value) VALUES (?, ?)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          ['plans_v2_migrated_at', JSON.stringify(new Date().toISOString())],
        )
        logger.info("Plans v2 migration applied (Starter/Pro/Custom with features matrix)")
      }

      this.schemaReady = true
      logger.info("Master schema bootstrap OK")
    })()

    return this.schemaPromise
  }

  /* ─────────────────────────── Settings (KV) ─────────────────────────── */

  async getSetting<T = any>(key: string): Promise<T | null> {
    await this.ensureSchema()
    const row = await queryOne<{ value: any }>(`SELECT value FROM master_settings WHERE key = ?`, [key])
    if (!row) return null
    return parseJsonbValue<T>(row.value)
  }

  async setSetting(key: string, value: any, updatedBy?: string): Promise<void> {
    await this.ensureSchema()
    await query(
      `INSERT INTO master_settings (key, value, updated_by, updated_at)
       VALUES (?, ?, ?, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [key, JSON.stringify(value), updatedBy || null],
    )
  }

  async listSettings(): Promise<Record<string, any>> {
    await this.ensureSchema()
    const rows = await query<{ key: string; value: any }[]>(
      `SELECT key, value FROM master_settings ORDER BY key`,
    )
    const out: Record<string, any> = {}
    for (const r of rows || []) {
      out[r.key] = parseJsonbValue(r.value)
    }
    return out
  }

  /* ─────────────────────────── Audit log ─────────────────────────── */

  async log(entry: {
    actor_user_id: string
    actor_email: string
    action: string
    resource?: string | null
    payload?: any
    ip?: string | null
  }): Promise<void> {
    try {
      await this.ensureSchema()
      await query(
        `INSERT INTO master_audit_log (id, actor_user_id, actor_email, action, resource, payload, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          entry.actor_user_id,
          entry.actor_email,
          entry.action,
          entry.resource || null,
          entry.payload ? JSON.stringify(entry.payload) : null,
          entry.ip || null,
        ],
      )
    } catch (err: any) {
      logger.warn(`audit log insert failed: ${err?.message}`)
    }
  }

  async listAudit(limit = 100): Promise<AuditEntry[]> {
    await this.ensureSchema()
    return await query<AuditEntry[]>(
      `SELECT * FROM master_audit_log ORDER BY created_at DESC LIMIT ?`,
      [limit],
    )
  }

  /* ─────────────────────────── Super-admin guard ─────────────────────────── */

  async isSuperAdmin(userId: string): Promise<boolean> {
    if (!userId) return false
    await this.ensureSchema()
    const row = await queryOne<{ is_super_admin: boolean }>(
      `SELECT is_super_admin FROM users WHERE id = ? AND is_active = true`,
      [userId],
    )
    return !!row?.is_super_admin
  }

  async promoteUser(email: string): Promise<{ id: string; email: string; name: string }> {
    await this.ensureSchema()
    const user = await queryOne<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM users WHERE LOWER(email) = LOWER(?) AND is_active = true`,
      [email],
    )
    if (!user) throw new Error(`User not found: ${email}`)
    await query(`UPDATE users SET is_super_admin = TRUE WHERE id = ?`, [user.id])
    logger.info(`Promoted to super admin: ${user.email}`)
    return user
  }
}

export const masterService = new MasterService()
