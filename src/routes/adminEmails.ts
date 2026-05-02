/**
 * /api/admin/emails — tenant-scope email templates for the user admin.
 *
 * Each customer (brand) gets a copy-on-write workspace: when they hit save
 * on a default template, we clone the system default into a row tagged with
 * their brand_id, then update that. The platform default stays untouched
 * so other customers keep getting it.
 *
 * Routes:
 *   GET    /api/admin/emails                     — list templates (defaults merged with brand overrides)
 *   PUT    /api/admin/emails/:slug               — patch (clones default if needed)
 *   POST   /api/admin/emails/preview             — render subject + html with sample vars (no DB write)
 *   POST   /api/admin/emails/:slug/send-test     — send a real email to a test address
 *   GET    /api/admin/emails/logs                — last 100 sends from this brand
 *   POST   /api/admin/emails/:slug/reset         — drop the brand override, fall back to default
 */

import { Router, type Response } from "express"
import { authenticateToken, type AuthRequest } from "../middleware/auth"
import { attachBrandContext, type BrandRequest } from "../middleware/brandContext"
import { emailService, renderTemplate } from "../services/email"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"

const router = Router()

router.use(authenticateToken, attachBrandContext)

function requireBrand(req: BrandRequest, res: Response): string | null {
  const id = req.brandId
  if (!id) {
    res.status(400).json({ error: "brand_required", message: "Selecione uma marca antes de gerenciar emails." })
    return null
  }
  return id
}

/* ──────────────────────────── list ──────────────────────────── */

router.get("/", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res)
  if (!brandId) return
  try {
    const templates = await emailService.listTenantTemplatesForBrand(brandId)
    return res.json({ templates })
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin emails list error")
    return res.status(500).json({ error: "list_failed" })
  }
})

/* ──────────────────────────── update (copy-on-write) ──────────────────────────── */

router.put("/:slug", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res)
  if (!brandId) return
  const slug = String(req.params.slug || "")
  try {
    const tpl = await emailService.getOrCloneTenantTemplate(slug, brandId)
    if (!tpl) return res.status(404).json({ error: "not_found" })

    const patch = {
      subject_template: req.body?.subject_template,
      html_template: req.body?.html_template,
      text_template: req.body?.text_template,
      is_active: req.body?.is_active,
    }
    const updated = await emailService.updateTemplate(tpl.id, patch, req.userId)
    return res.json({ template: updated })
  } catch (err: any) {
    logger.error({ err: err?.message, slug }, "admin email update error")
    return res.status(500).json({ error: "update_failed", message: err?.message })
  }
})

/* ──────────────────────────── reset to default ──────────────────────────── */

router.post("/:slug/reset", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res)
  if (!brandId) return
  const slug = String(req.params.slug || "")
  try {
    await query(
      `DELETE FROM email_templates WHERE slug = ? AND scope = 'tenant' AND brand_id = ?`,
      [slug, brandId],
    )
    return res.json({ ok: true })
  } catch (err: any) {
    logger.error({ err: err?.message, slug }, "admin email reset error")
    return res.status(500).json({ error: "reset_failed" })
  }
})

/* ──────────────────────────── preview ──────────────────────────── */

router.post("/preview", async (req: BrandRequest, res: Response) => {
  const subject = String(req.body?.subject_template || "")
  const html = String(req.body?.html_template || "")
  const vars = req.body?.variables || {}
  return res.json({
    subject: renderTemplate(subject, vars),
    html: renderTemplate(html, vars),
  })
})

/* ──────────────────────────── send test ──────────────────────────── */

router.post("/:slug/send-test", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res)
  if (!brandId) return
  const slug = String(req.params.slug || "")
  const to = String(req.body?.to || "").trim()
  if (!to) return res.status(400).json({ error: "missing_to" })

  // Make sure the row exists in branded form before sending — keeps the
  // tenant-scoped logs accurate even if they haven't edited yet.
  const tpl = await emailService.getOrCloneTenantTemplate(slug, brandId)
  if (!tpl) return res.status(404).json({ error: "not_found" })

  // Pull brand info for {{brand_name}} variable
  const brand = await queryOne<{ name: string }>(
    `SELECT name FROM brand_units WHERE id = ?`,
    [brandId],
  ).catch(() => null)
  const brandName = brand?.name || "sua marca"

  const sampleVars: Record<string, any> = req.body?.variables || {
    customer_name: "Cliente Teste",
    brand_name: brandName,
    agent_name: "Equipe",
    whatsapp_url: "https://wa.me/5511999999999",
    order_id: "1042",
    total: "R$ 297,00",
    tracking_url: "https://leadcapture.online/pedido/1042",
    cart_url: "https://leadcapture.online/carrinho",
    discount_code: "VOLTA10",
    days_inactive: "30",
    store_url: "https://leadcapture.online",
    product_name: "Novo Lançamento",
    product_image: "https://placehold.co/600x400",
    product_url: "https://leadcapture.online/produto/novo",
    appointment_date: new Date(Date.now() + 86400000).toLocaleDateString("pt-BR"),
    appointment_time: "14h00",
    address: "Av. Brasil, 100",
    confirm_url: "https://leadcapture.online/confirmar",
    status_label: "Pedido despachado",
    carrier: "Correios",
    survey_url: "https://leadcapture.online/pesquisa",
  }
  // Make sure brand_name is always set
  sampleVars.brand_name = sampleVars.brand_name || brandName

  const result = await emailService.sendTemplate(slug, to, sampleVars, {
    scope: "tenant",
    brandId,
    actorUserId: req.userId,
  })
  return res.json(result)
})

/* ──────────────────────────── logs ──────────────────────────── */

router.get("/logs", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res)
  if (!brandId) return
  try {
    const rows = await query(
      `SELECT id, template_slug, to_email, subject, status, error_message, created_at
         FROM email_logs
        WHERE scope = 'tenant' AND brand_id = ?
        ORDER BY created_at DESC LIMIT 100`,
      [brandId],
    )
    return res.json({ logs: rows })
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin email logs error")
    return res.status(500).json({ error: "logs_failed" })
  }
})

export default router
