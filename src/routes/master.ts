/**
 * /api/master/* — Super-admin (SaaS owner) endpoints.
 * Every route requires auth + super_admin flag.
 */

import { Router, type Response } from "express"
import { authenticateToken, requireSuperAdmin, type AuthRequest } from "../middleware/auth"
import { masterService } from "../services/master"
import { syncPlanWithStripe, disablePlanLink } from "../services/stripeProducts"
import { emailService, renderTemplate } from "../services/email"
import { integrationService } from "../services/integrations"
import { getPushNotificationService } from "../services/pushNotifications"
import { PUSH_APP_CONTEXT_LABELS, PUSH_SOUND_OPTIONS } from "../config/push-events"
import { AI_MODELS, DEFAULT_PREFERENCES } from "../config/ai-models"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"

const GLOBAL_PROVIDER_SCOPE = { accountId: "__global__" as const }

const DEFAULT_PLATFORM_TOOLS = {
  maintenance_mode: false,
  maintenance_message: "",
  signup_enabled: true,
  public_signup: true,
  modules: {
    whatsapp: true,
    instagram: true,
    facebook: true,
    campaigns: true,
    automations: true,
    catalog: true,
    affiliates: true,
    ai_creatives: true,
    prospect_radar: true,
    video_studio: true,
    agent_workspace: true,
    flow_builder: true,
    lead_import: true,
  },
  default_ai_preferences: DEFAULT_PREFERENCES,
}

const router = Router()

// All endpoints require auth + super_admin
router.use(authenticateToken, requireSuperAdmin)

const ipOf = (req: AuthRequest): string =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "unknown"

/* ──────────────────────────── auth/me ──────────────────────────── */

router.get("/auth/me", async (req: AuthRequest, res: Response) => {
  const user = await queryOne<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM users WHERE id = ?`,
    [req.userId!],
  )
  if (!user) return res.status(404).json({ error: "user_not_found" })
  return res.json({ user })
})

/* ──────────────────────────── dashboard ──────────────────────────── */

router.get("/dashboard", async (_req: AuthRequest, res: Response) => {
  try {
    const totalUsers = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE is_active = true`,
    )
    const totalBrands = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM brand_units WHERE status = 'active'`,
    ).catch(() => ({ count: "0" } as any))
    const last7d = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`,
    )
    const last30d = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE created_at >= NOW() - INTERVAL '30 days'`,
    )
    const subs = await queryOne<{ active: string; trialing: string; canceled: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::text AS active,
         COUNT(*) FILTER (WHERE status = 'trialing')::text AS trialing,
         COUNT(*) FILTER (WHERE status = 'canceled')::text AS canceled
       FROM subscriptions`,
    ).catch(() => ({ active: "0", trialing: "0", canceled: "0" } as any))
    const mrrRow = await queryOne<{ mrr_cents: string }>(
      `SELECT COALESCE(SUM(p.price_cents), 0)::text AS mrr_cents
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'active'`,
    ).catch(() => ({ mrr_cents: "0" } as any))

    return res.json({
      users: {
        total: Number(totalUsers?.count || 0),
        new_7d: Number(last7d?.count || 0),
        new_30d: Number(last30d?.count || 0),
      },
      brands: { total: Number(totalBrands?.count || 0) },
      subscriptions: {
        active: Number(subs?.active || 0),
        trialing: Number(subs?.trialing || 0),
        canceled: Number(subs?.canceled || 0),
      },
      mrr_cents: Number(mrrRow?.mrr_cents || 0),
    })
  } catch (err: any) {
    logger.error({ err: err?.message }, "master dashboard error")
    return res.status(500).json({ error: "internal" })
  }
})

/* ──────────────────────────── settings (integrations) ──────────────────────────── */

const ALLOWED_KEYS = new Set([
  "openai_landing_chat_key",
  "openai_landing_chat_model",
  "stripe_secret_key",
  "stripe_publishable_key",
  "stripe_webhook_secret",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_password",
  "smtp_from",
  "feature_flags",
])

function maskSecret(v: any): any {
  if (typeof v !== "string" || v.length === 0) return v
  if (v.length < 12) return "***"
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

const SECRET_KEYS = new Set([
  "openai_landing_chat_key",
  "stripe_secret_key",
  "stripe_webhook_secret",
  "smtp_password",
])

router.get("/settings", async (_req: AuthRequest, res: Response) => {
  const all = await masterService.listSettings()
  // Mask secrets
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(all)) {
    out[k] = SECRET_KEYS.has(k)
      ? { has_value: !!v, masked: maskSecret(v) }
      : v
  }
  return res.json({ settings: out })
})

router.put("/settings/:key", async (req: AuthRequest, res: Response) => {
  const key = String(req.params.key || "")
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: "unknown_key" })
  const value = req.body?.value
  if (value === undefined) return res.status(400).json({ error: "missing_value" })

  await masterService.setSetting(key, value, req.userId)
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "setting.update",
    resource: `master_settings/${key}`,
    payload: { key, has_value: !!value },
    ip: ipOf(req),
  })
  return res.json({ ok: true })
})

router.delete("/settings/:key", async (req: AuthRequest, res: Response) => {
  const key = String(req.params.key || "")
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: "unknown_key" })
  await query(`DELETE FROM master_settings WHERE key = ?`, [key])
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "setting.delete",
    resource: `master_settings/${key}`,
    ip: ipOf(req),
  })
  return res.json({ ok: true })
})

/* ──────────────────────────── test connections ──────────────────────────── */

router.post("/integrations/openai/test", async (req: AuthRequest, res: Response) => {
  const key = req.body?.key || (await masterService.getSetting<string>("openai_landing_chat_key"))
  if (!key || typeof key !== "string") return res.json({ ok: false, message: "Sem chave configurada" })
  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (r.ok) return res.json({ ok: true, message: "OpenAI conectado" })
    const body = await r.json().catch(() => ({}))
    return res.json({ ok: false, message: (body as any)?.error?.message || `HTTP ${r.status}` })
  } catch (err: any) {
    return res.json({ ok: false, message: err?.message || "erro de rede" })
  }
})

router.post("/integrations/stripe/test", async (req: AuthRequest, res: Response) => {
  const key = req.body?.key || (await masterService.getSetting<string>("stripe_secret_key"))
  if (!key || typeof key !== "string") return res.json({ ok: false, message: "Sem chave configurada" })
  try {
    const r = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (r.ok) {
      const body = (await r.json()) as any
      const livemode = body.livemode
      return res.json({
        ok: true,
        message: livemode ? "Stripe LIVE conectado" : "Stripe TEST conectado",
        livemode,
      })
    }
    const body = await r.json().catch(() => ({}))
    return res.json({ ok: false, message: (body as any)?.error?.message || `HTTP ${r.status}` })
  } catch (err: any) {
    return res.json({ ok: false, message: err?.message || "erro de rede" })
  }
})

router.post("/integrations/smtp/test", async (req: AuthRequest, res: Response) => {
  const cfg = {
    host: req.body?.host || (await masterService.getSetting<string>("smtp_host")),
    port: Number(req.body?.port || (await masterService.getSetting<string>("smtp_port")) || 465),
    user: req.body?.user || (await masterService.getSetting<string>("smtp_user")),
    password: req.body?.password || (await masterService.getSetting<string>("smtp_password")),
    from: req.body?.from || (await masterService.getSetting<string>("smtp_from")),
    to: req.body?.to || (req.user as any)?.email,
  }
  if (!cfg.host || !cfg.user || !cfg.password) {
    return res.json({ ok: false, message: "Preencha host, usuário e senha SMTP" })
  }
  try {
    // Lazy load nodemailer; if not installed yet, return graceful error
    let nodemailer: any
    try {
      nodemailer = await import("nodemailer")
    } catch {
      return res.json({
        ok: false,
        message:
          "Pacote nodemailer ainda não instalado no servidor. Execute: npm i nodemailer @types/nodemailer",
      })
    }
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.password },
    })
    await transporter.verify()
    if (cfg.to) {
      await transporter.sendMail({
        from: cfg.from || cfg.user,
        to: cfg.to,
        subject: "✅ Teste SMTP — LeadCapture Master",
        text: "Este é um e-mail de teste do painel master. Se você recebeu, o SMTP está funcionando.",
      })
      return res.json({ ok: true, message: `E-mail de teste enviado para ${cfg.to}` })
    }
    return res.json({ ok: true, message: "SMTP autenticado com sucesso" })
  } catch (err: any) {
    return res.json({ ok: false, message: err?.message || "Falha SMTP" })
  }
})

/* ──────────────────────────── plans CRUD ──────────────────────────── */

router.get("/plans", async (_req: AuthRequest, res: Response) => {
  const plans = await query(
    `SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC`,
  )
  return res.json({ plans })
})

router.put("/plans/:id", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "")
  const fields: string[] = []
  const values: any[] = []
  const allowed = [
    "name",
    "tagline",
    "price_cents",
    "interval",
    "billing_type",
    "features",
    "limits",
    "is_active",
    "is_featured",
    "sort_order",
    "stripe_product_id",
    "stripe_price_id",
  ]
  for (const f of allowed) {
    if (f in req.body) {
      fields.push(`${f} = ?`)
      values.push(
        ["features", "limits"].includes(f) ? JSON.stringify(req.body[f]) : req.body[f],
      )
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: "no_fields" })
  fields.push(`updated_at = NOW()`)
  values.push(id)
  await query(`UPDATE plans SET ${fields.join(", ")} WHERE id = ?`, values)
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "plan.update",
    resource: `plans/${id}`,
    payload: req.body,
    ip: ipOf(req),
  })
  const updated = await queryOne(`SELECT * FROM plans WHERE id = ?`, [id])
  return res.json({ plan: updated })
})

/* Sync a plan with Stripe — creates/updates product, price, payment link */
router.post("/plans/:id/sync-stripe", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "")
  try {
    const plan = await syncPlanWithStripe(id)
    await masterService.log({
      actor_user_id: req.userId!,
      actor_email: (req.user as any)?.email || "",
      action: "plan.sync_stripe",
      resource: `plans/${id}`,
      payload: { stripe_product_id: plan.stripe_product_id, stripe_price_id: plan.stripe_price_id },
      ip: ipOf(req),
    })
    return res.json({ plan })
  } catch (err: any) {
    logger.error({ err: err?.message }, "stripe sync error")
    return res.status(400).json({ error: err?.message || "stripe_sync_failed" })
  }
})

/* Disable / archive payment link without deleting plan */
router.post("/plans/:id/disable-link", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "")
  try {
    await disablePlanLink(id)
    await masterService.log({
      actor_user_id: req.userId!,
      actor_email: (req.user as any)?.email || "",
      action: "plan.disable_link",
      resource: `plans/${id}`,
      ip: ipOf(req),
    })
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "failed" })
  }
})

/* ──────────────────────────── clients (tenants) ──────────────────────────── */

router.get("/clients", async (req: AuthRequest, res: Response) => {
  const search = String(req.query?.search || "").trim()
  const page = Math.max(1, parseInt(String(req.query?.page || "1"), 10))
  const limit = Math.min(100, Math.max(10, parseInt(String(req.query?.limit || "30"), 10)))
  const offset = (page - 1) * limit

  const params: any[] = []
  let where = "WHERE is_active = true"
  if (search) {
    where += " AND (LOWER(email) LIKE ? OR LOWER(name) LIKE ?)"
    const q = `%${search.toLowerCase()}%`
    params.push(q, q)
  }
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users ${where}`,
    params,
  )
  const rows = await query(
    `SELECT id, email, name, role, is_super_admin, is_active, last_login_at, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )
  return res.json({
    clients: rows,
    total: Number(totalRow?.count || 0),
    page,
    limit,
  })
})

/* ──────────────────────────── email templates ──────────────────────────── */

router.get("/emails", async (_req: AuthRequest, res: Response) => {
  const templates = await emailService.listTemplates("system")
  return res.json({ templates })
})

router.put("/emails/:id", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "")
  const updated = await emailService.updateTemplate(
    id,
    {
      subject_template: req.body?.subject_template,
      html_template: req.body?.html_template,
      text_template: req.body?.text_template,
      is_active: req.body?.is_active,
      description: req.body?.description,
    },
    req.userId,
  )
  if (!updated) return res.status(404).json({ error: "not_found" })
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "email_template.update",
    resource: `email_templates/${id}`,
    payload: { fields: Object.keys(req.body || {}) },
    ip: ipOf(req),
  })
  return res.json({ template: updated })
})

router.post("/emails/preview", async (req: AuthRequest, res: Response) => {
  const subject = String(req.body?.subject_template || "")
  const html = String(req.body?.html_template || "")
  const vars = req.body?.variables || {}
  return res.json({
    subject: renderTemplate(subject, vars),
    html: renderTemplate(html, vars),
  })
})

router.post("/emails/:id/send-test", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "")
  const to = String(req.body?.to || (req.user as any)?.email || "").trim()
  if (!to) return res.status(400).json({ error: "missing_to" })

  const tpl = await queryOne<any>(`SELECT * FROM email_templates WHERE id = ?`, [id])
  if (!tpl) return res.status(404).json({ error: "not_found" })

  const sampleVars: Record<string, any> = req.body?.variables || {
    user_name: "Você",
    brand_name: "Sua Marca",
    plan_name: "Pro",
    login_url: "https://app.leadcapture.online/login",
    billing_url: "https://app.leadcapture.online/admin/billing",
    reset_url: "https://app.leadcapture.online/reset?t=token-de-teste",
    expires_in: "30 minutos",
    ends_at: new Date(Date.now() + 7 * 86400000).toLocaleDateString("pt-BR"),
    amount: "R$ 297,00",
    next_billing: new Date(Date.now() + 30 * 86400000).toLocaleDateString("pt-BR"),
    invoice_url: "https://stripe.com/test",
  }

  const result = await emailService.sendTemplate(tpl.slug, to, sampleVars, {
    scope: tpl.scope,
    actorUserId: req.userId,
  })
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "email_template.send_test",
    resource: `email_templates/${id}`,
    payload: { to, ok: result.ok },
    ip: ipOf(req),
  })
  return res.json(result)
})

router.get("/emails/logs", async (_req: AuthRequest, res: Response) => {
  const rows = await query(
    `SELECT id, template_slug, to_email, subject, scope, status, error_message, created_at
       FROM email_logs ORDER BY created_at DESC LIMIT 100`,
  )
  return res.json({ logs: rows })
})

/* ──────────────────────────── audit log ──────────────────────────── */

router.get("/audit-log", async (_req: AuthRequest, res: Response) => {
  const entries = await masterService.listAudit(200)
  return res.json({ entries })
})

/* ──────────────────────────── organizations ──────────────────────────── */

router.get("/organizations", async (req: AuthRequest, res: Response) => {
  const search = String(req.query?.search || "").trim()
  const page = Math.max(1, parseInt(String(req.query?.page || "1"), 10))
  const limit = Math.min(100, Math.max(10, parseInt(String(req.query?.limit || "30"), 10)))
  const offset = (page - 1) * limit

  const params: any[] = []
  let where = "WHERE 1=1"
  if (search) {
    where += " AND (LOWER(b.name) LIKE ? OR LOWER(b.slug) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)"
    const q = `%${search.toLowerCase()}%`
    params.push(q, q, q, q)
  }

  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM brand_units b
       LEFT JOIN users u ON u.id = b.user_id
      ${where}`,
    params,
  ).catch(() => ({ count: "0" } as any))

  const rows = await query(
    `SELECT
       b.id,
       b.name,
       b.slug,
       b.status,
       b.is_default,
       b.created_at,
       b.updated_at,
       u.id AS owner_id,
       u.email AS owner_email,
       u.name AS owner_name,
       u.is_active AS owner_active,
       s.status AS subscription_status,
       p.name AS plan_name,
       p.slug AS plan_slug
     FROM brand_units b
     LEFT JOIN users u ON u.id = b.user_id
     LEFT JOIN LATERAL (
       SELECT status, plan_id
         FROM subscriptions
        WHERE brand_id = b.id OR (brand_id IS NULL AND user_id = b.user_id)
        ORDER BY updated_at DESC
        LIMIT 1
     ) s ON TRUE
     LEFT JOIN plans p ON p.id = s.plan_id
     ${where}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  ).catch(() => [])

  return res.json({
    organizations: rows,
    total: Number(totalRow?.count || 0),
    page,
    limit,
  })
})

router.patch("/organizations/:id", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "").trim()
  if (!id) return res.status(400).json({ error: "missing_id" })

  const fields: string[] = []
  const values: any[] = []
  if ("status" in req.body) {
    const status = String(req.body.status || "").trim()
    if (!["active", "suspended", "archived"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" })
    }
    fields.push("status = ?")
    values.push(status)
  }
  if ("name" in req.body) {
    fields.push("name = ?")
    values.push(String(req.body.name || "").trim())
  }
  if (fields.length === 0) return res.status(400).json({ error: "no_fields" })

  fields.push("updated_at = NOW()")
  values.push(id)
  await query(`UPDATE brand_units SET ${fields.join(", ")} WHERE id = ?`, values)

  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "organization.update",
    resource: `brand_units/${id}`,
    payload: req.body,
    ip: ipOf(req),
  })

  const updated = await queryOne(`SELECT * FROM brand_units WHERE id = ?`, [id])
  if (!updated) return res.status(404).json({ error: "not_found" })
  return res.json({ organization: updated })
})

/* ──────────────────────────── users (management) ──────────────────────────── */

router.patch("/users/:id", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "").trim()
  if (!id) return res.status(400).json({ error: "missing_id" })

  const fields: string[] = []
  const values: any[] = []

  if ("is_active" in req.body) {
    fields.push("is_active = ?")
    values.push(!!req.body.is_active)
  }
  if ("is_super_admin" in req.body) {
    fields.push("is_super_admin = ?")
    values.push(!!req.body.is_super_admin)
  }
  if ("role" in req.body) {
    const role = String(req.body.role || "").trim()
    if (!["admin", "manager", "user"].includes(role)) {
      return res.status(400).json({ error: "invalid_role" })
    }
    fields.push("role = ?")
    values.push(role)
  }
  if (fields.length === 0) return res.status(400).json({ error: "no_fields" })

  values.push(id)
  await query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values)

  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "user.update",
    resource: `users/${id}`,
    payload: req.body,
    ip: ipOf(req),
  })

  const updated = await queryOne(
    `SELECT id, email, name, role, is_super_admin, is_active, last_login_at, created_at FROM users WHERE id = ?`,
    [id],
  )
  if (!updated) return res.status(404).json({ error: "not_found" })
  return res.json({ user: updated })
})

/* ──────────────────────────── global AI providers ──────────────────────────── */

router.get("/providers/catalog", async (_req: AuthRequest, res: Response) => {
  return res.json({ models: AI_MODELS, defaults: DEFAULT_PREFERENCES })
})

router.get("/providers", async (_req: AuthRequest, res: Response) => {
  try {
    const providers = await integrationService.listProviders(GLOBAL_PROVIDER_SCOPE)
    return res.json({ providers })
  } catch (err: any) {
    logger.error({ err: err?.message }, "master providers list error")
    return res.status(500).json({ error: "internal" })
  }
})

router.get("/providers/:provider", async (req: AuthRequest, res: Response) => {
  try {
    const provider = await integrationService.getAdminSnapshot(
      String(req.params.provider || ""),
      GLOBAL_PROVIDER_SCOPE,
    )
    return res.json({ provider })
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "invalid_provider" })
  }
})

router.put("/providers/:provider", async (req: AuthRequest, res: Response) => {
  try {
    const provider = await integrationService.saveProvider(
      String(req.params.provider || ""),
      {
        key: req.body?.key,
        config: req.body?.config,
        is_active: req.body?.is_active,
        priority: req.body?.priority,
      },
      GLOBAL_PROVIDER_SCOPE,
    )
    await masterService.log({
      actor_user_id: req.userId!,
      actor_email: (req.user as any)?.email || "",
      action: "provider.update",
      resource: `providers/${req.params.provider}`,
      payload: { is_active: req.body?.is_active, has_key: !!req.body?.key },
      ip: ipOf(req),
    })
    return res.json({ provider })
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "save_failed" })
  }
})

router.post("/providers/:provider/test", async (req: AuthRequest, res: Response) => {
  try {
    const result = await integrationService.testConnection(
      String(req.params.provider || ""),
      { key: req.body?.key, config: req.body?.config },
      GLOBAL_PROVIDER_SCOPE,
    )
    return res.json({ ok: result.ok, message: result.message, result })
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "test_failed" })
  }
})

/* ──────────────────────────── platform tools / feature flags ──────────────────────────── */

router.get("/tools", async (_req: AuthRequest, res: Response) => {
  const stored = await masterService.getSetting<typeof DEFAULT_PLATFORM_TOOLS>("platform_tools")
  const tools = stored
    ? {
        ...DEFAULT_PLATFORM_TOOLS,
        ...stored,
        modules: { ...DEFAULT_PLATFORM_TOOLS.modules, ...(stored.modules || {}) },
      }
    : DEFAULT_PLATFORM_TOOLS
  return res.json({ tools })
})

/* ──────────────────────────── push notification center ──────────────────────────── */

router.get("/push/events", async (req: AuthRequest, res: Response) => {
  const push = getPushNotificationService()
  const appContext = req.query.app_context ? String(req.query.app_context) : undefined
  const events = await push.listEventPolicies(appContext as any)
  return res.json({
    events,
    contexts: PUSH_APP_CONTEXT_LABELS,
    sounds: PUSH_SOUND_OPTIONS,
  })
})

router.patch("/push/events/:id", async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || "")
  const push = getPushNotificationService()
  await push.updateEventPolicy(id, {
    label: req.body?.label,
    description: req.body?.description,
    default_priority: req.body?.default_priority,
    default_enabled: req.body?.default_enabled,
    mandatory: req.body?.mandatory,
    sound_key: req.body?.sound_key,
    is_active: req.body?.is_active,
    sort_order: req.body?.sort_order,
  })
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "push_event.update",
    resource: `push_event_policies/${id}`,
    payload: req.body,
    ip: ipOf(req),
  })
  return res.json({ ok: true })
})

router.get("/push/deliveries", async (req: AuthRequest, res: Response) => {
  const push = getPushNotificationService()
  const limit = Math.min(500, Math.max(20, parseInt(String(req.query?.limit || "100"), 10)))
  const entries = await push.listDeliveryAudit(limit)
  return res.json({ entries })
})

router.get("/push/vapid", async (_req: AuthRequest, res: Response) => {
  const push = getPushNotificationService()
  const publicKey = await push.getPublicVapidKey()
  return res.json({ publicKey, configured: !!publicKey })
})

router.get("/notifications/events", async (req: AuthRequest, res: Response) => {
  const { getNotificationPlatformService } = await import("../services/notificationPlatform")
  const platform = getNotificationPlatformService()
  const appContext = req.query.app_context ? String(req.query.app_context) : undefined
  const events = await platform.listEventTypes(appContext as any)
  const withTemplates = await Promise.all(
    events.map(async (ev) => ({
      ...ev,
      template: await platform.getTemplate(ev.id),
    })),
  )
  return res.json({ events: withTemplates })
})

router.patch("/notifications/events/:id", async (req: AuthRequest, res: Response) => {
  const { getNotificationPlatformService } = await import("../services/notificationPlatform")
  const platform = getNotificationPlatformService()
  await platform.updateEventType(String(req.params.id), req.body || {})
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "notification_event.update",
    resource: `notification_event_types/${req.params.id}`,
    payload: req.body,
    ip: ipOf(req),
  })
  return res.json({ ok: true })
})

router.patch("/notifications/templates/:eventTypeId", async (req: AuthRequest, res: Response) => {
  const { getNotificationPlatformService } = await import("../services/notificationPlatform")
  const platform = getNotificationPlatformService()
  await platform.updateTemplate(String(req.params.eventTypeId), req.body || {})
  return res.json({ ok: true })
})

router.get("/notifications/escalation", async (_req: AuthRequest, res: Response) => {
  const { getNotificationPlatformService } = await import("../services/notificationPlatform")
  const platform = getNotificationPlatformService()
  const rules = await platform.listEscalationRules()
  return res.json({ rules })
})

router.patch("/notifications/escalation/:id", async (req: AuthRequest, res: Response) => {
  const { getNotificationPlatformService } = await import("../services/notificationPlatform")
  const platform = getNotificationPlatformService()
  await platform.updateEscalationRule(String(req.params.id), req.body || {})
  return res.json({ ok: true })
})

router.get("/notifications/logs", async (req: AuthRequest, res: Response) => {
  const { getNotificationPlatformService } = await import("../services/notificationPlatform")
  const platform = getNotificationPlatformService()
  const limit = Math.min(500, Math.max(20, parseInt(String(req.query?.limit || "100"), 10)))
  const logs = await platform.listLogs({
    limit,
    user_id: req.query.user_id ? String(req.query.user_id) : undefined,
    event_key: req.query.event_key ? String(req.query.event_key) : undefined,
  })
  return res.json({ logs })
})

router.get("/notifications/devices", async (req: AuthRequest, res: Response) => {
  const push = getPushNotificationService()
  const userId = req.query.user_id ? String(req.query.user_id) : undefined
  if (!userId) {
    const rows = await query<any[]>(
      `SELECT id, user_id, app_context, device_id, browser, operating_system,
              permission_status, is_active, sound_enabled, last_seen_at, created_at
       FROM push_subscriptions
       WHERE is_active = TRUE
       ORDER BY last_seen_at DESC NULLS LAST
       LIMIT 200`,
    )
    return res.json({ devices: rows || [] })
  }
  const devices = await push.listDevices(userId, req.query.app_context as any)
  return res.json({
    devices: devices.map((d) => ({ ...d, push_endpoint: undefined })),
  })
})

router.put("/tools", async (req: AuthRequest, res: Response) => {
  const incoming = req.body?.tools || req.body || {}
  const current = (await masterService.getSetting<typeof DEFAULT_PLATFORM_TOOLS>("platform_tools")) || DEFAULT_PLATFORM_TOOLS
  const merged = {
    ...current,
    ...incoming,
    modules: { ...DEFAULT_PLATFORM_TOOLS.modules, ...(current.modules || {}), ...(incoming.modules || {}) },
    default_ai_preferences: {
      ...DEFAULT_PREFERENCES,
      ...(current.default_ai_preferences || {}),
      ...(incoming.default_ai_preferences || {}),
    },
  }
  await masterService.setSetting("platform_tools", merged, req.userId)
  await masterService.log({
    actor_user_id: req.userId!,
    actor_email: (req.user as any)?.email || "",
    action: "tools.update",
    resource: "platform_tools",
    payload: incoming,
    ip: ipOf(req),
  })
  return res.json({ tools: merged })
})

export default router
