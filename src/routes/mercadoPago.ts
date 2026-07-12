/**
 * Mercado Pago OAuth + Checkout Pro routes (multitenant by brand_id).
 */

import { Router, Request, Response } from "express"
import { AuthRequest, authMiddleware } from "../middleware/auth"
import { BrandRequest, requireBrandContext } from "../middleware/brandContext"
import { mercadoPagoOAuthService, mercadoPagoConfig } from "../services/mercadoPagoOAuth"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"
import { permissionsService } from "../services/permissions"

const router = Router()
const publicRouter = Router()

async function canManagePayments(userId: string, brandId: string): Promise<boolean> {
  // Brand owner
  const owner = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM brand_units WHERE id = ? LIMIT 1`,
    [brandId],
  )
  if (owner && String(owner.user_id) === String(userId)) return true
  // Super admin
  const sa = await queryOne<{ is_super_admin: boolean }>(
    `SELECT COALESCE(is_super_admin, false) AS is_super_admin FROM users WHERE id = ?`,
    [userId],
  )
  if (sa?.is_super_admin) return true
  // RBAC
  try {
    return await permissionsService.hasPermission(userId, brandId, "payments:write")
  } catch {
    return false
  }
}

function getUserId(req: AuthRequest): string | null {
  return String(req.userId || req.user?.userId || req.user?.sub || "").trim() || null
}

/** Resolve brand owner for account_id */
async function resolveBrandOwner(brandId: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM brand_units WHERE id = ? LIMIT 1`,
    [brandId],
  )
  return row?.user_id ? String(row.user_id) : null
}

// ── Authenticated org routes ──────────────────────────────────────────────

router.use(authMiddleware, requireBrandContext)

router.get("/mercado-pago/status", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "").trim()
    if (!brandId) return res.status(400).json({ error: "brand_id obrigatório" })
    const cfg = mercadoPagoConfig()
    const connection = await mercadoPagoOAuthService.getConnection(brandId)
    res.json({
      success: true,
      platform: {
        enabled: cfg.enabled,
        configured: cfg.configured,
        environment: cfg.environment,
        fee_enabled: cfg.feeEnabled,
      },
      connection,
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "status_failed" })
  }
})

router.post("/mercado-pago/connect", async (req: BrandRequest, res: Response) => {
  try {
    const userId = getUserId(req)
    const brandId = String(req.brandId || "").trim()
    if (!userId || !brandId) return res.status(400).json({ error: "auth_and_brand_required" })

    if (!(await canManagePayments(userId, brandId))) {
      return res.status(403).json({ error: "Sem permissão payments:write", code: "PERMISSION_DENIED" })
    }

    const ownerUserId = await resolveBrandOwner(brandId)
    if (!ownerUserId) return res.status(404).json({ error: "organization_not_found" })

    const redirectAfter = String(req.body?.redirect_after || "/pagamentos").trim()
    const result = await mercadoPagoOAuthService.startConnect({
      organizationId: brandId,
      ownerUserId,
      userId,
      redirectAfter,
    })

    res.json({
      success: true,
      authorizationUrl: result.authorizationUrl,
      attemptId: result.attemptId,
    })
  } catch (err: any) {
    const status = err?.status || 500
    res.status(status).json({ error: err?.message || "connect_failed", code: err?.code })
  }
})

router.post("/mercado-pago/disconnect", async (req: BrandRequest, res: Response) => {
  try {
    const userId = getUserId(req)
    const brandId = String(req.brandId || "").trim()
    if (!userId || !brandId) return res.status(400).json({ error: "auth_and_brand_required" })
    if (!(await canManagePayments(userId, brandId))) {
      return res.status(403).json({ error: "Sem permissão payments:write", code: "PERMISSION_DENIED" })
    }
    await mercadoPagoOAuthService.disconnect(brandId, userId)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "disconnect_failed" })
  }
})

router.post("/mercado-pago/reconnect", async (req: BrandRequest, res: Response) => {
  try {
    const userId = getUserId(req)
    const brandId = String(req.brandId || "").trim()
    if (!userId || !brandId) return res.status(400).json({ error: "auth_and_brand_required" })
    if (!(await canManagePayments(userId, brandId))) {
      return res.status(403).json({ error: "Sem permissão payments:write", code: "PERMISSION_DENIED" })
    }
    const ownerUserId = await resolveBrandOwner(brandId)
    if (!ownerUserId) return res.status(404).json({ error: "organization_not_found" })
    const result = await mercadoPagoOAuthService.startConnect({
      organizationId: brandId,
      ownerUserId,
      userId,
      redirectAfter: String(req.body?.redirect_after || "/pagamentos").trim(),
    })
    res.json({ success: true, authorizationUrl: result.authorizationUrl, attemptId: result.attemptId })
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || "reconnect_failed", code: err?.code })
  }
})

/** Create Checkout Pro charge for an order (backend-calculated amount only via order id) */
router.post("/mercado-pago/checkout", async (req: BrandRequest, res: Response) => {
  try {
    const userId = getUserId(req)
    const brandId = String(req.brandId || "").trim()
    if (!userId || !brandId) return res.status(400).json({ error: "auth_and_brand_required" })

    // payments:write or brand owner for creating charges; also allow payments:read for test?
    const allowed =
      (await canManagePayments(userId, brandId)) ||
      (await permissionsService.hasPermission(userId, brandId, "payments:read").catch(() => false))
    if (!allowed) {
      return res.status(403).json({ error: "Sem permissão", code: "PERMISSION_DENIED" })
    }

    const ownerUserId = await resolveBrandOwner(brandId)
    if (!ownerUserId) return res.status(404).json({ error: "organization_not_found" })

    const orderId = String(req.body?.order_id || "").trim()
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" })

    // Load order amount from DB — never trust client amount
    let order = await queryOne<any>(
      `SELECT id, user_id, brand_id, valor_total, customer_name, customer_email, customer_phone, status
       FROM pedidos WHERE id = ? LIMIT 1`,
      [orderId],
    ).catch(() => null)

    if (!order) {
      order = await queryOne<any>(
        `SELECT id, user_id, brand_id, total AS valor_total, customer_name, customer_email, customer_phone, status
         FROM commerce_orders WHERE id = ? LIMIT 1`,
        [orderId],
      ).catch(() => null)
    }

    if (!order) return res.status(404).json({ error: "order_not_found" })

    // Tenant isolation
    const orderBrand = String(order.brand_id || "").trim()
    if (orderBrand && orderBrand !== brandId) {
      return res.status(403).json({ error: "Pedido de outra organização", code: "TENANT_MISMATCH" })
    }
    if (String(order.user_id) !== String(ownerUserId) && String(order.user_id) !== String(userId)) {
      // still ok if brand matches owner
      if (String(order.user_id) !== String(ownerUserId)) {
        return res.status(403).json({ error: "Pedido não pertence a esta organização" })
      }
    }

    const amount = Number(order.valor_total || order.total || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Pedido sem valor válido" })
    }

    const result = await mercadoPagoOAuthService.createCheckoutPro({
      organizationId: brandId,
      ownerUserId,
      orderId,
      amount,
      description: `Pedido ${orderId.slice(0, 8)}`,
      payer: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
      },
      methodType: "wallet",
      createdByUserId: userId,
    })

    // Persist payment_link on order when column exists
    await query(
      `UPDATE pedidos SET payment_link = ?, updated_at = NOW() WHERE id = ?`,
      [result.payment_url, orderId],
    ).catch(() => undefined)

    res.json({
      success: true,
      payment_url: result.payment_url,
      preference_id: result.provider_preference_id,
      transaction_id: result.transaction_id,
      platform_fee_amount: result.platform_fee_amount,
    })
  } catch (err: any) {
    const status = err?.status || 500
    res.status(status).json({ error: err?.message || "checkout_failed", code: err?.code })
  }
})

// ── Public OAuth callback + webhook ───────────────────────────────────────

publicRouter.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const result = await mercadoPagoOAuthService.handleCallback({
      code: String(req.query.code || ""),
      state: String(req.query.state || ""),
      error: String(req.query.error || ""),
      errorDescription: String(req.query.error_description || ""),
    })

    const appBase = String(
      process.env.FRONTEND_PUBLIC_URL ||
        process.env.PUBLIC_APP_URL ||
        process.env.CHECKOUT_BASE_URL ||
        "https://app.leadcapture.online",
    ).replace(/\/+$/, "")

    // Redirect into SPA admin payments
    const path = result.redirectPath.startsWith("/") ? result.redirectPath : `/${result.redirectPath}`
    // Prefer /pagamentos in admin app
    const target = path.includes("pagamentos")
      ? `${appBase}${path.startsWith("/pagamentos") ? path : path}`
      : `${appBase}/pagamentos${path.includes("?") ? path.slice(path.indexOf("?")) : "?provider=mercado_pago&connection=success"}`

    res.redirect(302, target)
  } catch (err: any) {
    logger.error(`[mp-oauth] callback error: ${err?.message}`)
    const appBase = String(process.env.FRONTEND_PUBLIC_URL || "https://app.leadcapture.online").replace(
      /\/+$/,
      "",
    )
    res.redirect(302, `${appBase}/pagamentos?provider=mercado_pago&connection=error`)
  }
})

publicRouter.post("/webhook", async (req: Request, res: Response) => {
  try {
    // Always 200 quickly for MP retries; process async-ish but we await for reliability
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      headers[String(k).toLowerCase()] = Array.isArray(v) ? String(v[0]) : String(v || "")
    }
    const result = await mercadoPagoOAuthService.processWebhook({
      body: req.body,
      headers,
      rawPayload: typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}),
    })
    res.status(200).json({ ok: result.ok, duplicate: result.duplicate || false })
  } catch (err: any) {
    logger.error(`[mp-webhook] ${err?.message}`)
    // Still 200 to avoid infinite MP retries on our bugs — event stored as error when possible
    res.status(200).json({ ok: false, error: "processing_error" })
  }
})

/** GET webhook validation / health */
publicRouter.get("/webhook", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, provider: "mercado_pago" })
})

export const mercadoPagoPublicRoutes = publicRouter
export default router
