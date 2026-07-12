/**
 * /api/public/signup — public signup flow with Stripe Checkout.
 *
 * Flow:
 *   1. Client submits { name, email, password, brand_name, plan_slug }
 *   2. We validate, hash the password, build a Stripe Checkout Session with
 *      metadata carrying signup data
 *   3. Response is { checkout_url } — frontend redirects there
 *   4. After Stripe payment, the webhook (/api/stripe/webhook) reads the
 *      metadata, creates the user + brand + subscription, and sends the
 *      welcome email
 */

import { Router, type Request, type Response } from "express"
import bcrypt from "bcryptjs"
import Stripe from "stripe"
import { masterService } from "../services/master"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"

const router = Router()

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/**
 * GET /api/public/plans — used by /cadastro and the landing pricing section
 * to render plans without requiring auth.
 */
router.get("/plans", async (_req: Request, res: Response) => {
  const plans = await query(
    `SELECT id, slug, name, tagline, price_cents, interval, billing_type, features,
            is_featured, is_active, sort_order
       FROM plans
      WHERE is_active = true
      ORDER BY sort_order ASC, created_at ASC`,
  )
  return res.json({ plans })
})

router.get("/platform-status", async (_req: Request, res: Response) => {
  try {
    const { getPublicPlatformStatus } = await import("../services/platformTools")
    const status = await getPublicPlatformStatus()
    return res.json({ status })
  } catch {
    return res.status(500).json({ error: "internal" })
  }
})

router.post("/signup", async (req: Request, res: Response) => {
  const name = String(req.body?.name || "").trim()
  const email = String(req.body?.email || "").trim().toLowerCase()
  const password = String(req.body?.password || "")
  const brandName = String(req.body?.brand_name || "").trim() || name
  const planSlug = String(req.body?.plan_slug || "").trim()

  /* platform flags — enforced */
  try {
    const { getPlatformTools } = await import("../services/platformTools")
    const tools = await getPlatformTools()
    if (tools.signup_enabled === false || tools.public_signup === false) {
      return res.status(403).json({
        error: "signup_disabled",
        message: "Cadastros públicos estão desabilitados no momento.",
      })
    }
    if (tools.maintenance_mode) {
      return res.status(503).json({
        error: "maintenance_mode",
        message: tools.maintenance_message || "Plataforma em manutenção.",
      })
    }
  } catch {
    /* if tools fail open for signup only when DB is down — still validate fields */
  }

  /* validations */
  if (!name) return res.status(400).json({ error: "name_required" })
  if (!isEmail(email)) return res.status(400).json({ error: "invalid_email" })
  if (password.length < 8) return res.status(400).json({ error: "password_too_short", message: "Senha deve ter ao menos 8 caracteres." })
  if (!planSlug) return res.status(400).json({ error: "plan_required" })

  /* check email uniqueness */
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND is_active = true LIMIT 1`,
    [email],
  )
  if (existing) return res.status(409).json({ error: "email_taken", message: "Já existe uma conta com este e-mail." })

  /* fetch plan */
  const plan = await queryOne<{
    id: string
    name: string
    slug: string
    price_cents: number
    billing_type: string
    stripe_price_id: string | null
    is_active: boolean
  }>(
    `SELECT id, name, slug, price_cents, billing_type, stripe_price_id, is_active
       FROM plans WHERE slug = ? AND is_active = true LIMIT 1`,
    [planSlug],
  )
  if (!plan) return res.status(404).json({ error: "plan_not_found" })
  if (!plan.stripe_price_id) {
    return res.status(503).json({
      error: "plan_not_synced",
      message: "Plano ainda não conectado ao Stripe. Tente em alguns minutos.",
    })
  }

  /* load Stripe */
  const secret = await masterService.getSetting<string>("stripe_secret_key")
  if (!secret) {
    return res.status(503).json({ error: "stripe_not_configured" })
  }
  const stripe = new Stripe(secret)

  /* hash password (carried in metadata, used by webhook to create user) */
  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const isSubscription = plan.billing_type === "subscription"
    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? "subscription" : "payment",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer_email: email,
      success_url: `https://leadcapture.online/cadastro/sucesso?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://leadcapture.online/cadastro?plano=${plan.slug}&canceled=1`,
      allow_promotion_codes: true,
      metadata: {
        plan_id: plan.id,
        plan_slug: plan.slug,
        signup_email: email,
        signup_password_hash: passwordHash,
        signup_name: name,
        signup_brand_name: brandName,
      },
      ...(isSubscription
        ? {
            subscription_data: {
              metadata: {
                plan_id: plan.id,
                plan_slug: plan.slug,
                signup_email: email,
              },
            },
          }
        : {}),
    } as any)

    if (!session.url) {
      throw new Error("Stripe não retornou URL de checkout")
    }

    logger.info(`signup checkout created for ${email} on plan ${plan.slug}`)
    return res.json({ checkout_url: session.url, session_id: session.id })
  } catch (err: any) {
    logger.error({ err: err?.message }, "signup checkout error")
    return res.status(500).json({ error: "checkout_failed", message: err?.message || "erro" })
  }
})

/**
 * GET /api/public/signup/session/:id
 * Frontend hits this from /cadastro/sucesso to verify the payment + get
 * a JWT token to auto-login the user.
 */
router.get("/signup/session/:id", async (req: Request, res: Response) => {
  const sessionId = String(req.params.id || "")
  if (!sessionId.startsWith("cs_")) return res.status(400).json({ error: "bad_session_id" })

  const secret = await masterService.getSetting<string>("stripe_secret_key")
  if (!secret) return res.status(503).json({ error: "stripe_not_configured" })
  const stripe = new Stripe(secret)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return res.json({ paid: false, status: session.status, payment_status: session.payment_status })
    }

    const meta = (session.metadata || {}) as Record<string, string>
    const email = meta.signup_email || (session.customer_details?.email || "").toLowerCase()
    if (!email) return res.json({ paid: true, message: "session paid but no email" })

    // The webhook should have created the user already. If it raced, retry briefly.
    let user = await queryOne<{ id: string; email: string; name: string; role: string }>(
      `SELECT id, email, name, role FROM users WHERE LOWER(email) = LOWER(?) AND is_active = true LIMIT 1`,
      [email],
    )
    if (!user) {
      // Wait up to 6s for webhook to create the user
      for (let i = 0; i < 6 && !user; i++) {
        await new Promise(r => setTimeout(r, 1000))
        user = await queryOne(
          `SELECT id, email, name, role, account_kind, COALESCE(is_super_admin, false) AS is_super_admin
           FROM users WHERE LOWER(email) = LOWER(?) AND is_active = true LIMIT 1`,
          [email],
        )
      }
    }
    if (!user) {
      return res.json({ paid: true, ready: false, message: "Conta sendo criada. Faça login em alguns instantes." })
    }

    // Issue token (lazy import to avoid circular)
    const { UsersService } = await import("../services/users")
    const us = new UsersService()
    const token = us.signToken({
      id: user.id,
      email: user.email,
      role: user.role as any,
      account_kind: (user as any).account_kind,
      is_super_admin: Boolean((user as any).is_super_admin),
    })
    return res.json({ paid: true, ready: true, token, user })
  } catch (err: any) {
    logger.error({ err: err?.message }, "signup session retrieve error")
    return res.status(500).json({ error: "session_failed", message: err?.message })
  }
})

export default router
