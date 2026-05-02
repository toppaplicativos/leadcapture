/**
 * EmailService — transactional emails using SMTP from master_settings.
 *
 * Templates live in `email_templates` table. Two scopes:
 *   - `system` — used by the platform itself (signup confirmation, payment receipts, etc.)
 *   - `tenant` — per-brand templates a user can customize for their own customers
 *
 * Rendering: simple Mustache-like — `{{var}}` is replaced. No conditionals.
 * For complex needs we can swap to Handlebars later — but {{var}} keeps the
 * editor approachable in the UI.
 */

import { v4 as uuidv4 } from "uuid"
import { masterService } from "./master"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"

export interface EmailTemplate {
  id: string
  slug: string
  scope: "system" | "tenant" | string
  brand_id: string | null
  subject_template: string
  html_template: string
  text_template: string | null
  variables: string[] | string
  description: string | null
  is_active: boolean
  updated_by: string | null
  created_at: Date
  updated_at: Date
}

export interface SendOptions {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export interface SendResult {
  ok: boolean
  message: string
  message_id?: string
}

/* ───────────────────────────── Renderer ───────────────────────────── */

/**
 * Substitute `{{var}}` and `{{ var.path }}` placeholders. Missing keys are
 * replaced with empty string (no throws — emails should not crash because
 * a variable is missing).
 */
export function renderTemplate(template: string, vars: Record<string, any> = {}): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const parts = path.split(".")
    let cur: any = vars
    for (const p of parts) {
      if (cur == null) return ""
      cur = cur[p]
    }
    return cur == null ? "" : String(cur)
  })
}

/* ───────────────────────────── SMTP ───────────────────────────── */

async function loadSmtp() {
  const host = await masterService.getSetting<string>("smtp_host")
  const port = Number(await masterService.getSetting<string | number>("smtp_port")) || 465
  const user = await masterService.getSetting<string>("smtp_user")
  const password = await masterService.getSetting<string>("smtp_password")
  const from = (await masterService.getSetting<string>("smtp_from")) || user
  if (!host || !user || !password) {
    throw new Error(
      "SMTP não configurado. Vá em Master → Integrações e preencha host, usuário e senha.",
    )
  }
  return { host, port, user, password, from: from || user }
}

/* ───────────────────────────── Public API ───────────────────────────── */

class EmailService {
  /**
   * Send a raw email (subject + html already rendered).
   */
  async send(opts: SendOptions): Promise<SendResult> {
    let nodemailer: any
    try {
      nodemailer = await import("nodemailer")
    } catch {
      const msg = "nodemailer não instalado. Execute: npm i nodemailer @types/nodemailer"
      logger.error(msg)
      return { ok: false, message: msg }
    }

    let cfg
    try {
      cfg = await loadSmtp()
    } catch (err: any) {
      return { ok: false, message: err?.message || "SMTP não configurado" }
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.password },
    })

    try {
      const info = await transporter.sendMail({
        from: cfg.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        replyTo: opts.replyTo,
      })
      return { ok: true, message: "enviado", message_id: info.messageId }
    } catch (err: any) {
      logger.error({ err: err?.message }, "smtp send failed")
      return { ok: false, message: err?.message || "falha SMTP" }
    }
  }

  /**
   * Resolve a template by slug + scope (+ optional brand_id for tenant overrides).
   */
  async getTemplate(
    slug: string,
    scope: "system" | "tenant" = "system",
    brandId?: string | null,
  ): Promise<EmailTemplate | null> {
    if (scope === "tenant" && brandId) {
      const branded = await queryOne<EmailTemplate>(
        `SELECT * FROM email_templates
          WHERE slug = ? AND scope = 'tenant' AND brand_id = ? AND is_active = true
          LIMIT 1`,
        [slug, brandId],
      )
      if (branded) return this.normalize(branded)
    }
    const row = await queryOne<EmailTemplate>(
      `SELECT * FROM email_templates
        WHERE slug = ? AND scope = ? AND brand_id IS NULL AND is_active = true
        LIMIT 1`,
      [slug, scope],
    )
    return row ? this.normalize(row) : null
  }

  private normalize(t: EmailTemplate): EmailTemplate {
    if (typeof t.variables === "string") {
      try {
        t.variables = JSON.parse(t.variables)
      } catch {
        t.variables = []
      }
    }
    return t
  }

  /**
   * Render + send a template. Logs to email_logs.
   */
  async sendTemplate(
    slug: string,
    to: string,
    vars: Record<string, any> = {},
    opts: { scope?: "system" | "tenant"; brandId?: string | null; actorUserId?: string } = {},
  ): Promise<SendResult> {
    const scope = opts.scope || "system"
    const tpl = await this.getTemplate(slug, scope, opts.brandId || null)
    if (!tpl) {
      const msg = `template not found: ${slug} (${scope})`
      logger.warn(msg)
      return { ok: false, message: msg }
    }
    const subject = renderTemplate(tpl.subject_template, vars)
    const html = renderTemplate(tpl.html_template, vars)
    const text = tpl.text_template ? renderTemplate(tpl.text_template, vars) : undefined

    const result = await this.send({ to, subject, html, text })

    // Log
    try {
      await query(
        `INSERT INTO email_logs (id, template_slug, to_email, subject, scope, brand_id, actor_user_id, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          slug,
          to,
          subject,
          scope,
          opts.brandId || null,
          opts.actorUserId || null,
          result.ok ? "sent" : "failed",
          result.ok ? null : result.message,
        ],
      )
    } catch (err: any) {
      logger.warn(`email_logs insert failed: ${err?.message}`)
    }

    return result
  }

  async listTemplates(scope: "system" | "tenant" = "system", brandId?: string | null): Promise<EmailTemplate[]> {
    const rows = await query<EmailTemplate[]>(
      brandId
        ? `SELECT * FROM email_templates
             WHERE scope = ? AND (brand_id = ? OR brand_id IS NULL)
             ORDER BY slug ASC`
        : `SELECT * FROM email_templates
             WHERE scope = ? AND brand_id IS NULL
             ORDER BY slug ASC`,
      brandId ? [scope, brandId] : [scope],
    )
    return (rows || []).map(t => this.normalize(t))
  }

  async updateTemplate(
    id: string,
    patch: Partial<Pick<EmailTemplate, "subject_template" | "html_template" | "text_template" | "is_active" | "description">>,
    actorUserId?: string,
  ): Promise<EmailTemplate | null> {
    const fields: string[] = []
    const values: any[] = []
    for (const k of ["subject_template", "html_template", "text_template", "is_active", "description"] as const) {
      if (k in patch) {
        fields.push(`${k} = ?`)
        values.push((patch as any)[k])
      }
    }
    if (fields.length === 0) return null
    fields.push(`updated_at = NOW()`, `updated_by = ?`)
    values.push(actorUserId || null)
    values.push(id)
    await query(`UPDATE email_templates SET ${fields.join(", ")} WHERE id = ?`, values)
    return await queryOne<EmailTemplate>(`SELECT * FROM email_templates WHERE id = ?`, [id]) as any
  }

  /** Idempotent seed of the system templates. Runs at startup. */
  async seedSystemTemplates(): Promise<void> {
    for (const tpl of SYSTEM_TEMPLATES) {
      const exists = await queryOne<{ id: string }>(
        `SELECT id FROM email_templates WHERE slug = ? AND scope = 'system' AND brand_id IS NULL`,
        [tpl.slug],
      )
      if (exists) continue
      await query(
        `INSERT INTO email_templates (id, slug, scope, brand_id, subject_template, html_template, text_template, variables, description, is_active)
         VALUES (?, ?, 'system', NULL, ?, ?, ?, ?, ?, true)`,
        [
          uuidv4(),
          tpl.slug,
          tpl.subject,
          tpl.html,
          tpl.text || null,
          JSON.stringify(tpl.variables),
          tpl.description,
        ],
      )
      logger.info(`Seeded email template: ${tpl.slug}`)
    }
  }

  /**
   * Idempotent seed of tenant default templates (brand_id = NULL).
   * Each customer can override per-brand by inserting a row with their brand_id;
   * the resolver in getTemplate picks the branded version first, then falls
   * back to this default.
   */
  async seedTenantTemplates(): Promise<void> {
    for (const tpl of TENANT_TEMPLATES) {
      const exists = await queryOne<{ id: string }>(
        `SELECT id FROM email_templates WHERE slug = ? AND scope = 'tenant' AND brand_id IS NULL`,
        [tpl.slug],
      )
      if (exists) continue
      await query(
        `INSERT INTO email_templates (id, slug, scope, brand_id, subject_template, html_template, text_template, variables, description, is_active)
         VALUES (?, ?, 'tenant', NULL, ?, ?, ?, ?, ?, true)`,
        [
          uuidv4(),
          tpl.slug,
          tpl.subject,
          tpl.html,
          tpl.text || null,
          JSON.stringify(tpl.variables),
          tpl.description,
        ],
      )
      logger.info(`Seeded tenant template: ${tpl.slug}`)
    }
  }

  /**
   * Resolve which template a tenant edit should patch / preview against.
   * If the brand has its own row → return it. Otherwise, clone the default
   * (brand_id NULL) into a new branded row first, so edits never affect the
   * platform default.
   */
  async getOrCloneTenantTemplate(slug: string, brandId: string): Promise<EmailTemplate | null> {
    const branded = await queryOne<EmailTemplate>(
      `SELECT * FROM email_templates
        WHERE slug = ? AND scope = 'tenant' AND brand_id = ? LIMIT 1`,
      [slug, brandId],
    )
    if (branded) return this.normalize(branded)

    const def = await queryOne<EmailTemplate>(
      `SELECT * FROM email_templates
        WHERE slug = ? AND scope = 'tenant' AND brand_id IS NULL LIMIT 1`,
      [slug],
    )
    if (!def) return null

    const newId = uuidv4()
    await query(
      `INSERT INTO email_templates
        (id, slug, scope, brand_id, subject_template, html_template, text_template, variables, description, is_active)
       VALUES (?, ?, 'tenant', ?, ?, ?, ?, ?, ?, true)`,
      [
        newId,
        def.slug,
        brandId,
        def.subject_template,
        def.html_template,
        def.text_template,
        typeof def.variables === "string" ? def.variables : JSON.stringify(def.variables || []),
        def.description,
      ],
    )
    const fresh = await queryOne<EmailTemplate>(`SELECT * FROM email_templates WHERE id = ?`, [newId])
    return fresh ? this.normalize(fresh) : null
  }

  /**
   * List tenant templates merged: returns one row per slug — branded if it
   * exists, else the default. Used by the admin UI grid.
   */
  async listTenantTemplatesForBrand(brandId: string): Promise<Array<EmailTemplate & { is_overridden: boolean }>> {
    const defaults = await query<EmailTemplate[]>(
      `SELECT * FROM email_templates WHERE scope = 'tenant' AND brand_id IS NULL ORDER BY slug ASC`,
    )
    const branded = await query<EmailTemplate[]>(
      `SELECT * FROM email_templates WHERE scope = 'tenant' AND brand_id = ?`,
      [brandId],
    )
    const brandedBySlug = new Map<string, EmailTemplate>()
    for (const t of branded || []) brandedBySlug.set(t.slug, t)

    return (defaults || []).map(d => {
      const ov = brandedBySlug.get(d.slug)
      const winner = ov || d
      return { ...this.normalize(winner), is_overridden: !!ov }
    })
  }
}

export const emailService = new EmailService()

/* ───────────────────────────── Default templates ───────────────────────────── */

const baseLayout = (content: string) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{subject}}</title>
</head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ededed">
      <tr><td style="padding:32px 32px 0">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="vertical-align:middle">
            <div style="width:32px;height:32px;border-radius:8px;background:#0a0a0a;display:inline-block;vertical-align:middle"></div>
          </td><td style="padding-left:10px;vertical-align:middle">
            <span style="font-size:15px;font-weight:700;letter-spacing:-0.01em">LeadCapture</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 32px 32px">
${content}
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #ededed;background:#fafafa;font-size:11px;color:#737373;line-height:1.6">
        Este é um e-mail transacional do LeadCapture.<br>
        Se não foi você, ignore esta mensagem.
      </td></tr>
    </table>
    <p style="font-size:11px;color:#a3a3a3;margin:16px 0 0">© LeadCapture · leadcapture.online</p>
  </td></tr>
</table>
</body>
</html>`

const SYSTEM_TEMPLATES = [
  {
    slug: "welcome",
    description: "Boas-vindas após cadastro pago confirmado.",
    variables: ["user_name", "brand_name", "plan_name", "login_url"],
    subject: "Bem-vindo(a) ao LeadCapture, {{user_name}} 🚀",
    html: baseLayout(`
      <h1 style="font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">Pagamento confirmado</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 16px">
        Olá <strong>{{user_name}}</strong>, sua assinatura do <strong>{{plan_name}}</strong> está ativa.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 24px">
        Sua marca <strong>{{brand_name}}</strong> já está pronta no painel. Bora capturar os primeiros leads no mapa?
      </p>
      <p style="margin:0 0 8px">
        <a href="{{login_url}}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px">
          Entrar no painel
        </a>
      </p>
    `),
    text: `Bem-vindo(a) ao LeadCapture, {{user_name}}!

Sua assinatura do {{plan_name}} está ativa. Marca: {{brand_name}}.

Acesse: {{login_url}}`,
  },
  {
    slug: "payment-failed",
    description: "Cobrança recorrente falhou — tentar atualizar cartão.",
    variables: ["user_name", "plan_name", "billing_url"],
    subject: "Não conseguimos cobrar sua assinatura {{plan_name}}",
    html: baseLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px;color:#b91c1c">Falha no pagamento</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 16px">
        Olá {{user_name}}, tentamos cobrar a renovação do seu plano <strong>{{plan_name}}</strong> e não conseguimos.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 24px">
        Sua conta segue ativa por mais alguns dias. Atualize o método de pagamento pra evitar suspensão.
      </p>
      <p style="margin:0">
        <a href="{{billing_url}}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px">
          Atualizar pagamento
        </a>
      </p>
    `),
    text: "Olá {{user_name}}, falha ao cobrar {{plan_name}}. Atualize: {{billing_url}}",
  },
  {
    slug: "subscription-canceled",
    description: "Confirmação de cancelamento da assinatura.",
    variables: ["user_name", "plan_name", "ends_at"],
    subject: "Sua assinatura foi cancelada",
    html: baseLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">Assinatura cancelada</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 16px">
        Olá {{user_name}}, confirmamos o cancelamento do plano <strong>{{plan_name}}</strong>.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 16px">
        Você continua com acesso até <strong>{{ends_at}}</strong>. Depois disso, a conta será suspensa.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#737373;margin:0">
        Mudou de ideia? É só reativar em <a href="https://leadcapture.online/cadastro" style="color:#0a0a0a">leadcapture.online/cadastro</a>.
      </p>
    `),
    text: "Plano {{plan_name}} cancelado. Acesso até {{ends_at}}.",
  },
  {
    slug: "password-reset",
    description: "Link para redefinir senha.",
    variables: ["user_name", "reset_url", "expires_in"],
    subject: "Redefinição de senha — LeadCapture",
    html: baseLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">Redefinir senha</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 16px">
        Olá {{user_name}}, você solicitou redefinir sua senha.
      </p>
      <p style="margin:0 0 16px">
        <a href="{{reset_url}}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px">
          Definir nova senha
        </a>
      </p>
      <p style="font-size:13px;color:#737373;margin:0">
        O link expira em {{expires_in}}. Se você não pediu, ignore este e-mail.
      </p>
    `),
    text: "Redefinir senha: {{reset_url}} (expira em {{expires_in}})",
  },
  {
    slug: "trial-ending",
    description: "Aviso 3 dias antes do fim do trial.",
    variables: ["user_name", "plan_name", "ends_at", "billing_url"],
    subject: "Seu trial acaba em breve",
    html: baseLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">Trial terminando</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 16px">
        Olá {{user_name}}, seu trial do <strong>{{plan_name}}</strong> termina em <strong>{{ends_at}}</strong>.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 24px">
        Se está fazendo sentido pro seu negócio, é só confirmar o pagamento pra continuar.
      </p>
      <p style="margin:0">
        <a href="{{billing_url}}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px">
          Manter assinatura
        </a>
      </p>
    `),
    text: "Trial do {{plan_name}} termina em {{ends_at}}. Manter: {{billing_url}}",
  },
  {
    slug: "invoice-paid",
    description: "Recibo de cobrança recorrente bem-sucedida.",
    variables: ["user_name", "plan_name", "amount", "next_billing", "invoice_url"],
    subject: "Recibo — assinatura {{plan_name}}",
    html: baseLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">Pagamento recebido</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 8px">
        Olá {{user_name}}, recebemos o pagamento de <strong>{{amount}}</strong> referente ao plano <strong>{{plan_name}}</strong>.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 24px">
        Próxima cobrança: <strong>{{next_billing}}</strong>.
      </p>
      <p style="margin:0">
        <a href="{{invoice_url}}" style="display:inline-block;background:#fafafa;color:#171717;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:12px;border:1px solid #ededed">
          Ver fatura
        </a>
      </p>
    `),
    text: "Recibo: {{amount}} pago em {{plan_name}}. Próxima: {{next_billing}}.",
  },
] as const

/* ───────────────────────────── Tenant default templates ─────────────────────────────
 *
 * Layout used by all tenant emails. Uses {{brand_name}} for the header and
 * {{brand_color}} (with fallback) for the accent button — this way the
 * customer's own brand identity comes through without them needing to edit
 * the HTML.
 */

const tenantLayout = (content: string) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{subject}}</title>
</head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ededed">
      <tr><td style="padding:28px 32px 0">
        <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#171717">{{brand_name}}</p>
      </td></tr>
      <tr><td style="padding:20px 32px 32px">
${content}
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #ededed;background:#fafafa;font-size:11px;color:#737373;line-height:1.6">
        Você está recebendo este e-mail de <strong>{{brand_name}}</strong>.<br>
        Caso não queira mais receber, responda este e-mail com o assunto "remover".
      </td></tr>
    </table>
    <p style="font-size:11px;color:#a3a3a3;margin:16px 0 0">Enviado por {{brand_name}} via LeadCapture</p>
  </td></tr>
</table>
</body>
</html>`

const cta = (url: string, label: string) =>
  `<a href="${url}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px">${label}</a>`

const TENANT_TEMPLATES = [
  {
    slug: "followup-lead",
    description: "Follow-up para leads que não responderam à primeira mensagem.",
    variables: ["customer_name", "brand_name", "agent_name", "whatsapp_url"],
    subject: "Oi {{customer_name}}, ainda posso ajudar?",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Tudo certo por aí?</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Oi {{customer_name}}, aqui é {{agent_name}} da {{brand_name}}.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Vi que você demonstrou interesse e queria saber se posso ajudar com alguma dúvida.
        Tô aqui pra te orientar — sem pressão.
      </p>
      <p style="margin:18px 0 0">${cta("{{whatsapp_url}}", "Falar no WhatsApp")}</p>
    `),
    text: "Oi {{customer_name}}, ainda posso ajudar? Fale: {{whatsapp_url}}",
  },
  {
    slug: "agradecimento-pedido",
    description: "Agradecimento pós-compra com resumo do pedido.",
    variables: ["customer_name", "brand_name", "order_id", "total", "tracking_url"],
    subject: "Obrigado pela compra na {{brand_name}}!",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Pedido confirmado 🎉</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        {{customer_name}}, recebemos seu pedido <strong>#{{order_id}}</strong> no valor de <strong>{{total}}</strong>.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Vamos preparar tudo com carinho e te avisar assim que enviar.
      </p>
      <p style="margin:18px 0 0">${cta("{{tracking_url}}", "Acompanhar pedido")}</p>
    `),
    text: "Pedido #{{order_id}} de {{total}} confirmado. Acompanhe: {{tracking_url}}",
  },
  {
    slug: "abandono-carrinho",
    description: "Cliente colocou itens no carrinho mas não finalizou.",
    variables: ["customer_name", "brand_name", "cart_url", "discount_code"],
    subject: "Você esqueceu algo no carrinho 👀",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Voltou pra terminar?</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Oi {{customer_name}}, vi que você deixou alguns itens no carrinho da {{brand_name}}.
        Posso reservar enquanto você decide.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#171717;background:#fafafa;border:1px dashed #ededed;border-radius:12px;padding:14px 16px;margin:0 0 16px">
        Use o cupom <strong style="font-family:Menlo,monospace">{{discount_code}}</strong> e ganhe um desconto especial pra fechar agora.
      </p>
      <p style="margin:18px 0 0">${cta("{{cart_url}}", "Finalizar compra")}</p>
    `),
    text: "Cupom {{discount_code}} pra finalizar: {{cart_url}}",
  },
  {
    slug: "recuperacao-cliente",
    description: "Cliente inativo há um tempo — chamada para voltar.",
    variables: ["customer_name", "brand_name", "days_inactive", "store_url", "discount_code"],
    subject: "Sentimos sua falta, {{customer_name}}",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Faz tempo, hein?</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        {{customer_name}}, faz {{days_inactive}} dias que não te vemos por aqui.
        Atualizamos várias coisas no catálogo e queríamos te mostrar.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#171717;background:#fafafa;border:1px dashed #ededed;border-radius:12px;padding:14px 16px;margin:0 0 16px">
        Cupom de boas-vindas de volta: <strong style="font-family:Menlo,monospace">{{discount_code}}</strong>
      </p>
      <p style="margin:18px 0 0">${cta("{{store_url}}", "Ver novidades")}</p>
    `),
    text: "Sentimos sua falta. Cupom {{discount_code}} em {{store_url}}",
  },
  {
    slug: "novo-produto",
    description: "Lançamento de produto para a base.",
    variables: ["customer_name", "brand_name", "product_name", "product_image", "product_url"],
    subject: "Lançamento: {{product_name}}",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Novidade fresca 🆕</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Oi {{customer_name}}, acabou de chegar na {{brand_name}}: <strong>{{product_name}}</strong>.
      </p>
      <p style="margin:0 0 16px;text-align:center">
        <img src="{{product_image}}" alt="{{product_name}}" style="max-width:100%;border-radius:12px;border:1px solid #ededed">
      </p>
      <p style="margin:18px 0 0">${cta("{{product_url}}", "Conferir agora")}</p>
    `),
    text: "Novo: {{product_name}} — veja em {{product_url}}",
  },
  {
    slug: "aniversario",
    description: "E-mail automático no aniversário do cliente.",
    variables: ["customer_name", "brand_name", "discount_code", "store_url"],
    subject: "Feliz aniversário, {{customer_name}} 🎂",
    html: tenantLayout(`
      <h1 style="font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Parabéns! 🎉</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        {{customer_name}}, a {{brand_name}} deseja um dia incrível pra você.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#171717;background:#fffbeb;border:1px dashed #fde68a;border-radius:12px;padding:14px 16px;margin:0 0 16px">
        Pra comemorar, separamos o cupom <strong style="font-family:Menlo,monospace">{{discount_code}}</strong> só pra você.
      </p>
      <p style="margin:18px 0 0">${cta("{{store_url}}", "Aproveitar")}</p>
    `),
    text: "Feliz aniversário! Cupom {{discount_code}} em {{store_url}}",
  },
  {
    slug: "lembrete-agendamento",
    description: "Lembrete de reserva/agendamento próximo.",
    variables: ["customer_name", "brand_name", "appointment_date", "appointment_time", "address", "confirm_url"],
    subject: "Lembrete: seu horário em {{appointment_date}}",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Seu horário tá chegando</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 8px">
        Olá {{customer_name}}, lembrando do seu agendamento na <strong>{{brand_name}}</strong>:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#fafafa;border-radius:12px;border:1px solid #ededed">
        <tr><td style="padding:14px 18px;font-size:14px;color:#171717">
          <strong>Data:</strong> {{appointment_date}}<br>
          <strong>Horário:</strong> {{appointment_time}}<br>
          <strong>Local:</strong> {{address}}
        </td></tr>
      </table>
      <p style="margin:18px 0 0">${cta("{{confirm_url}}", "Confirmar presença")}</p>
    `),
    text: "Lembrete: {{appointment_date}} às {{appointment_time}} em {{address}}. Confirme: {{confirm_url}}",
  },
  {
    slug: "status-pedido",
    description: "Atualização de status do pedido (despachado / entregue).",
    variables: ["customer_name", "brand_name", "order_id", "status_label", "tracking_url", "carrier"],
    subject: "Pedido #{{order_id}} — {{status_label}}",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">{{status_label}} 📦</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        {{customer_name}}, seu pedido <strong>#{{order_id}}</strong> da {{brand_name}} foi atualizado.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#404040;margin:0 0 14px">
        Transportadora: <strong>{{carrier}}</strong>
      </p>
      <p style="margin:18px 0 0">${cta("{{tracking_url}}", "Rastrear envio")}</p>
    `),
    text: "Pedido #{{order_id}}: {{status_label}}. Rastreio: {{tracking_url}}",
  },
  {
    slug: "pesquisa-satisfacao",
    description: "Pesquisa de satisfação após entrega.",
    variables: ["customer_name", "brand_name", "survey_url", "order_id"],
    subject: "Como foi sua experiência, {{customer_name}}?",
    html: tenantLayout(`
      <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Sua opinião vale ouro ⭐</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        {{customer_name}}, esperamos que tenha curtido o pedido <strong>#{{order_id}}</strong> da {{brand_name}}.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Dá uma força e responde nossa pesquisa rápida? Leva 1 minuto e ajuda a gente a melhorar.
      </p>
      <p style="margin:18px 0 0">${cta("{{survey_url}}", "Responder pesquisa")}</p>
    `),
    text: "Como foi a experiência? {{survey_url}}",
  },
  {
    slug: "boas-vindas-cliente",
    description: "Cliente novo na base — primeiro contato.",
    variables: ["customer_name", "brand_name", "store_url", "whatsapp_url"],
    subject: "Bem-vindo(a) à {{brand_name}}!",
    html: tenantLayout(`
      <h1 style="font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">Que bom ter você aqui 👋</h1>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Olá {{customer_name}}, sou da equipe da {{brand_name}}. Obrigado por se cadastrar!
      </p>
      <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 14px">
        Aqui você encontra novidades, ofertas e atendimento personalizado pelo WhatsApp.
        Salve nosso contato pra não perder nada.
      </p>
      <p style="margin:18px 0 8px">${cta("{{store_url}}", "Ver catálogo")}</p>
      <p style="margin:0;font-size:13px;color:#737373">
        Ou fale direto com a gente: <a href="{{whatsapp_url}}" style="color:#0a0a0a">WhatsApp</a>
      </p>
    `),
    text: "Bem-vindo(a) à {{brand_name}}! Catálogo: {{store_url}}",
  },
] as const
