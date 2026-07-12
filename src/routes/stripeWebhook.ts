/**
 * POST /api/stripe/webhook — Stripe webhook receiver.
 *
 * IMPORTANT: This endpoint requires the RAW request body (not JSON-parsed)
 * to verify the Stripe signature. Mount it BEFORE express.json() in index.ts.
 *
 * Events handled:
 *   - checkout.session.completed         → activate subscription after Stripe Checkout
 *   - customer.subscription.created      → idempotent insert
 *   - customer.subscription.updated      → status / period changes
 *   - customer.subscription.deleted      → cancellation
 *   - invoice.payment_succeeded          → keep subscription active
 *   - invoice.payment_failed             → mark past_due
 */

import express, { type Request, type Response, type NextFunction } from "express"
import Stripe from "stripe"
import { v4 as uuidv4 } from "uuid"
import { masterService } from "../services/master"
import { emailService } from "../services/email"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"

const router = express.Router()

// Type alias for Stripe instance (the v22 default export is a constructor;
// using `any` here avoids namespace/type conflicts and the SDK does the
// heavy lifting at runtime).
type StripeClient = InstanceType<typeof Stripe>

/**
 * Lazy Stripe client — pulled from master_settings on every request.
 * (The webhook is rare, so the cost is negligible and lets us hot-swap keys
 * without restarting the server.)
 */
async function loadStripe(): Promise<{ stripe: StripeClient; webhookSecret: string } | null> {
  const secret = await masterService.getSetting<string>("stripe_secret_key")
  const webhookSecret = await masterService.getSetting<string>("stripe_webhook_secret")
  if (!secret || !webhookSecret) return null
  return {
    stripe: new Stripe(secret),
    webhookSecret,
  }
}

/**
 * Raw body parser — required by Stripe to verify the signature.
 * Only applied to this single route.
 */
const rawParser = express.raw({ type: "application/json", limit: "1mb" })

router.post("/", rawParser, async (req: Request, res: Response, _next: NextFunction) => {
  const sig = req.headers["stripe-signature"] as string | undefined
  if (!sig) return res.status(400).send("missing stripe-signature")

  const ctx = await loadStripe()
  if (!ctx) {
    logger.warn("stripe webhook hit but stripe_secret_key/stripe_webhook_secret not configured")
    return res.status(503).send("stripe not configured")
  }
  const { stripe, webhookSecret } = ctx

  let event: any
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (err: any) {
    logger.warn({ err: err?.message }, "stripe webhook signature verification failed")
    return res.status(400).send(`webhook error: ${err?.message}`)
  }

  /* ─────────────── Idempotency: keep a small log of processed event IDs ─────────────── */
  // Reuse master_settings table as a tiny KV — key prefix "stripe_evt_"
  // (cheaper than a new table for low-volume webhooks).
  const idemKey = `stripe_evt_${event.id}`
  const seen = await masterService
    .getSetting<{ ts: number }>(idemKey)
    .catch(() => null)
  if (seen) {
    logger.info(`stripe webhook ${event.id} already processed; skipping`)
    return res.json({ received: true, idempotent: true })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object, stripe)
        break
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await onSubscriptionUpdate(event.data.object)
        break
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event.data.object)
        break
      case "invoice.payment_succeeded":
        await onInvoicePaid(event.data.object)
        break
      case "invoice.payment_failed":
        await onInvoiceFailed(event.data.object)
        break
      default:
        logger.info(`stripe webhook ignored event type: ${event.type}`)
    }

    await masterService.setSetting(idemKey, { ts: Date.now(), type: event.type })
    return res.json({ received: true })
  } catch (err: any) {
    logger.error({ err: err?.message, eventType: event.type, eventId: event.id }, "stripe webhook handler error")
    // Return 500 so Stripe retries
    return res.status(500).json({ error: "handler_error" })
  }
})

/* ─────────────────────────── Handlers ─────────────────────────── */

async function onCheckoutCompleted(session: any, stripe: StripeClient) {
  const metadata = (session.metadata || {}) as Record<string, string>
  const userId = metadata.user_id
  const planId = metadata.plan_id
  const subscriptionId = session.subscription as string | null
  const customerId = session.customer as string | null

  if (!planId) {
    logger.warn(`checkout.session.completed without plan_id; session=${session.id}`)
    return
  }

  /* 1. Resolve user — either existing or create from signup metadata */
  let resolvedUserId = userId
  let isNewUser = false
  if (!resolvedUserId && metadata.signup_email && metadata.signup_password_hash) {
    // Check if email got registered between checkout creation and webhook
    const existingByEmail = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [metadata.signup_email.toLowerCase()],
    )
    if (existingByEmail) {
      resolvedUserId = existingByEmail.id
    } else {
      resolvedUserId = uuidv4()
      try {
        const { identityService } = await import("../services/identity")
        await identityService.ensureSchema()
      } catch {
        /* best-effort */
      }
      await query(
        `INSERT INTO users (id, email, password_hash, name, role, account_kind, is_active)
         VALUES (?, ?, ?, ?, 'org', 'org', true)`,
        [
          resolvedUserId,
          metadata.signup_email.toLowerCase(),
          metadata.signup_password_hash,
          metadata.signup_name || metadata.signup_email.split("@")[0],
        ],
      )
      isNewUser = true
      logger.info(`created user from checkout: ${metadata.signup_email}`)
    }
  }

  if (!resolvedUserId) {
    logger.warn(`checkout.session.completed with no user_id and no signup_email; session=${session.id}`)
    return
  }

  /* 2. Auto-create brand for new signup — keep brand_id for subscription link */
  let createdBrandId: string | null = metadata.brand_id || null
  if (isNewUser && metadata.signup_brand_name) {
    try {
      const { BrandUnitsService } = await import("../services/brandUnits")
      const svc = new BrandUnitsService()
      const brand = await svc.create(resolvedUserId, {
        name: metadata.signup_brand_name,
      } as any)
      createdBrandId = brand?.id ? String(brand.id) : createdBrandId
    } catch (err: any) {
      logger.warn(`failed to auto-create brand: ${err?.message}`)
    }
  }
  if (!createdBrandId) {
    const existingBrand = await queryOne<{ id: string }>(
      `SELECT id FROM brand_units WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1`,
      [resolvedUserId],
    ).catch(() => null)
    createdBrandId = existingBrand?.id || null
  }

  /* 3. Subscription details */
  let status = "active"
  let periodStart: Date | null = null
  let periodEnd: Date | null = null
  if (subscriptionId) {
    const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any
    status = sub.status
    periodStart = new Date(sub.current_period_start * 1000)
    periodEnd = new Date(sub.current_period_end * 1000)
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM subscriptions WHERE gateway_subscription_id = ?`,
    [subscriptionId || ""],
  )

  if (existing) {
    await query(
      `UPDATE subscriptions SET status = ?, brand_id = COALESCE(brand_id, ?), current_period_start = ?, current_period_end = ?, updated_at = NOW() WHERE id = ?`,
      [status, createdBrandId, periodStart, periodEnd, existing.id],
    )
  } else {
    await query(
      `INSERT INTO subscriptions
        (id, user_id, brand_id, plan_id, status, gateway, gateway_customer_id, gateway_subscription_id,
         current_period_start, current_period_end, metadata)
       VALUES (?, ?, ?, ?, ?, 'stripe', ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        resolvedUserId,
        createdBrandId,
        planId,
        status,
        customerId,
        subscriptionId,
        periodStart,
        periodEnd,
        JSON.stringify({ checkout_session: session.id }),
      ],
    )
  }

  logger.info(`stripe: activated subscription ${subscriptionId} for user ${resolvedUserId} on plan ${planId}`)

  /* 4. Welcome email (only on new signup) */
  if (isNewUser) {
    try {
      const plan = await queryOne<{ name: string }>(`SELECT name FROM plans WHERE id = ?`, [planId])
      const { emailTriggers } = await import("../services/emailTriggers")
      await emailTriggers.welcomeOwner({
        email: metadata.signup_email!,
        user_name: metadata.signup_name || metadata.signup_email!.split("@")[0],
        brand_name: metadata.signup_brand_name || metadata.signup_name || "sua marca",
        plan_name: plan?.name || "LeadCapture",
        userId: resolvedUserId,
      })
    } catch (err: any) {
      logger.warn(`welcome email failed: ${err?.message}`)
    }
  }
}

async function resolveSubUser(gatewaySubId: string) {
  return queryOne<{
    user_id: string
    email: string
    name: string
    plan_name: string
    current_period_end: Date | null
  }>(
    `SELECT s.user_id, u.email, u.name, p.name AS plan_name, s.current_period_end
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN plans p ON p.id = s.plan_id
      WHERE s.gateway_subscription_id = ?
      LIMIT 1`,
    [gatewaySubId],
  )
}

async function onSubscriptionUpdate(sub: any) {
  await query(
    `UPDATE subscriptions
        SET status = ?,
            current_period_start = ?,
            current_period_end = ?,
            updated_at = NOW()
      WHERE gateway_subscription_id = ?`,
    [
      sub.status,
      new Date(sub.current_period_start * 1000),
      new Date(sub.current_period_end * 1000),
      sub.id,
    ],
  )
  logger.info(`stripe: subscription ${sub.id} → ${sub.status}`)
}

async function onSubscriptionDeleted(sub: any) {
  await query(
    `UPDATE subscriptions
        SET status = 'canceled',
            canceled_at = NOW(),
            updated_at = NOW()
      WHERE gateway_subscription_id = ?`,
    [sub.id],
  )
  logger.info(`stripe: subscription ${sub.id} canceled`)
  try {
    const row = await resolveSubUser(sub.id)
    if (row?.email) {
      const { emailTriggers } = await import("../services/emailTriggers")
      await emailTriggers.subscriptionCanceled({
        email: row.email,
        user_name: row.name || row.email.split("@")[0],
        plan_name: row.plan_name || "LeadCapture",
        ends_at: row.current_period_end
          ? new Date(row.current_period_end).toLocaleDateString("pt-BR")
          : "fim do período",
        userId: row.user_id,
      })
    }
  } catch (err: any) {
    logger.warn(`cancel email failed: ${err?.message}`)
  }
}

async function onInvoicePaid(inv: any) {
  if (!inv.subscription) return
  await query(
    `UPDATE subscriptions
        SET status = 'active', updated_at = NOW()
      WHERE gateway_subscription_id = ?`,
    [inv.subscription as string],
  )
  logger.info(`stripe: invoice paid for subscription ${inv.subscription}`)
  try {
    const row = await resolveSubUser(String(inv.subscription))
    if (row?.email) {
      const { emailTriggers } = await import("../services/emailTriggers")
      const amount =
        inv.amount_paid != null
          ? (Number(inv.amount_paid) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "—"
      const next =
        inv.lines?.data?.[0]?.period?.end
          ? new Date(inv.lines.data[0].period.end * 1000).toLocaleDateString("pt-BR")
          : "—"
      await emailTriggers.invoicePaid({
        email: row.email,
        user_name: row.name || row.email.split("@")[0],
        plan_name: row.plan_name || "LeadCapture",
        amount,
        next_billing: next,
        invoice_url: inv.hosted_invoice_url || inv.invoice_pdf || "https://app.leadcapture.online/admin",
        userId: row.user_id,
      })
    }
  } catch (err: any) {
    logger.warn(`invoice-paid email failed: ${err?.message}`)
  }
}

async function onInvoiceFailed(inv: any) {
  if (!inv.subscription) return
  await query(
    `UPDATE subscriptions
        SET status = 'past_due', updated_at = NOW()
      WHERE gateway_subscription_id = ?`,
    [inv.subscription as string],
  )
  logger.warn(`stripe: invoice payment FAILED for subscription ${inv.subscription}`)
  try {
    const row = await resolveSubUser(String(inv.subscription))
    if (row?.email) {
      const { emailTriggers } = await import("../services/emailTriggers")
      await emailTriggers.paymentFailed({
        email: row.email,
        user_name: row.name || row.email.split("@")[0],
        plan_name: row.plan_name || "LeadCapture",
        userId: row.user_id,
      })
    }
  } catch (err: any) {
    logger.warn(`payment-failed email failed: ${err?.message}`)
  }
}

export default router
