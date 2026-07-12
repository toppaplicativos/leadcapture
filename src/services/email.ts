/**
 * EmailService â€” transactional emails using SMTP from master_settings.
 *
 * Templates live in `email_templates` table. Two scopes:
 *   - `system` â€” used by the platform itself (signup confirmation, payment receipts, etc.)
 *   - `tenant` â€” per-brand templates a user can customize for their own customers
 *
 * Rendering: simple Mustache-like â€” `{{var}}` is replaced. No conditionals.
 * For complex needs we can swap to Handlebars later â€” but {{var}} keeps the
 * editor approachable in the UI.
 */

import { v4 as uuidv4 } from "uuid"
import { masterService } from "./master"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"
import {
  EMAIL_CATALOG_VERSION,
  SYSTEM_TEMPLATES,
  TENANT_TEMPLATES,
  type CatalogTemplate,
} from "./email/catalog"

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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Substitute `{{var}}` and `{{ var.path }}` placeholders. Missing keys are
 * replaced with empty string (no throws â€” emails should not crash because
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SMTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function loadSmtp() {
  const host = await masterService.getSetting<string>("smtp_host")
  const port = Number(await masterService.getSetting<string | number>("smtp_port")) || 465
  const user = await masterService.getSetting<string>("smtp_user")
  const password = await masterService.getSetting<string>("smtp_password")
  const from = (await masterService.getSetting<string>("smtp_from")) || user
  if (!host || !user || !password) {
    throw new Error(
      "SMTP nÃ£o configurado. VÃ¡ em Master â†’ IntegraÃ§Ãµes e preencha host, usuÃ¡rio e senha.",
    )
  }
  return { host, port, user, password, from: from || user }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class EmailService {
  /**
   * Send a raw email (subject + html already rendered).
   */
  async send(opts: SendOptions): Promise<SendResult> {
    let nodemailer: any
    try {
      nodemailer = await import("nodemailer")
    } catch {
      const msg = "nodemailer nÃ£o instalado. Execute: npm i nodemailer @types/nodemailer"
      logger.error(msg)
      return { ok: false, message: msg }
    }

    let cfg
    try {
      cfg = await loadSmtp()
    } catch (err: any) {
      return { ok: false, message: err?.message || "SMTP nÃ£o configurado" }
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
    const mergedVars: Record<string, any> = {
      brand_color: "#0a0a0a",
      brand_logo_url: "https://app.leadcapture.online/brand-mark.png",
      brand_name: "LeadCapture",
      ...vars,
    }
    if (
      !mergedVars.brand_logo_url ||
      String(mergedVars.brand_logo_url).includes("{{") ||
      String(mergedVars.brand_logo_url).includes("/logo.png")
    ) {
      mergedVars.brand_logo_url = "https://app.leadcapture.online/brand-mark.png"
    }
    const subject = renderTemplate(tpl.subject_template, mergedVars)
    const html = renderTemplate(tpl.html_template, mergedVars)
    const text = tpl.text_template ? renderTemplate(tpl.text_template, mergedVars) : undefined

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

  /**
   * Seed + refresh default templates from catalog.
   * - Always inserts missing slugs
   * - When EMAIL_CATALOG_VERSION changes, UPDATES html/subject of brand_id NULL defaults
   *   (tenant brand overrides are preserved)
   */
  private async upsertCatalogTemplates(
    list: readonly CatalogTemplate[],
    scope: "system" | "tenant",
    forceRefresh: boolean,
  ): Promise<number> {
    let changed = 0
    for (const tpl of list) {
      if (tpl.scope !== scope) continue
      const exists = await queryOne<{ id: string }>(
        `SELECT id FROM email_templates WHERE slug = ? AND scope = ? AND brand_id IS NULL`,
        [tpl.slug, scope],
      )
      if (!exists) {
        await query(
          `INSERT INTO email_templates (id, slug, scope, brand_id, subject_template, html_template, text_template, variables, description, is_active)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, true)`,
          [
            uuidv4(),
            tpl.slug,
            scope,
            tpl.subject,
            tpl.html,
            tpl.text || null,
            JSON.stringify(tpl.variables),
            tpl.description,
          ],
        )
        changed++
        logger.info(`Seeded email template: ${scope}/${tpl.slug}`)
      } else if (forceRefresh) {
        await query(
          `UPDATE email_templates
              SET subject_template = ?, html_template = ?, text_template = ?,
                  variables = ?, description = ?, updated_at = NOW()
            WHERE id = ?`,
          [
            tpl.subject,
            tpl.html,
            tpl.text || null,
            JSON.stringify(tpl.variables),
            tpl.description,
            exists.id,
          ],
        )
        changed++
      }
    }
    return changed
  }

  async seedSystemTemplates(): Promise<void> {
    const ver = await masterService.getSetting<string>("email_catalog_version")
    const force = ver !== EMAIL_CATALOG_VERSION
    const n = await this.upsertCatalogTemplates(SYSTEM_TEMPLATES, "system", force)
    if (force) {
      await masterService.setSetting("email_catalog_version", EMAIL_CATALOG_VERSION)
      logger.info(`Email catalog refreshed to ${EMAIL_CATALOG_VERSION} (${n} system templates touched)`)
    }
  }

  /**
   * Idempotent seed of tenant default templates (brand_id = NULL).
   * Brand overrides are never overwritten by catalog refresh.
   */
  async seedTenantTemplates(): Promise<void> {
    const ver = await masterService.getSetting<string>("email_catalog_version")
    const force = ver !== EMAIL_CATALOG_VERSION
    /* system seed may have already set version; tenant still needs force once per version */
    const tenantFlag = await masterService.getSetting<string>("email_catalog_tenant_version")
    const forceTenant = tenantFlag !== EMAIL_CATALOG_VERSION
    const n = await this.upsertCatalogTemplates(TENANT_TEMPLATES, "tenant", force || forceTenant)
    if (forceTenant) {
      await masterService.setSetting("email_catalog_tenant_version", EMAIL_CATALOG_VERSION)
      logger.info(`Email tenant catalog refreshed to ${EMAIL_CATALOG_VERSION} (${n} templates touched)`)
    }
  }

  /**
   * Resolve which template a tenant edit should patch / preview against.
   * If the brand has its own row â†’ return it. Otherwise, clone the default
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
