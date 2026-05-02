/**
 * Stripe product/price/payment-link sync for plans.
 *
 * Flow when admin clicks "Gerar link" on a plan:
 *   1. Ensure a Stripe Product exists (create if first time, update name/description otherwise)
 *   2. Ensure a Stripe Price exists matching current price_cents + billing_type
 *      → Stripe prices are immutable, so on price change we create a new one and archive the old
 *   3. Create a Payment Link bound to that price (or reuse existing if still valid)
 *   4. Persist stripe_product_id, stripe_price_id, payment_link, payment_link_id back into plans
 *
 * Idempotent. Safe to call multiple times for the same plan.
 */

import Stripe from "stripe"
import { masterService } from "./master"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"

type StripeClient = InstanceType<typeof Stripe>

interface DBPlan {
  id: string
  slug: string
  name: string
  tagline: string | null
  price_cents: number
  interval: string
  billing_type: string  // 'subscription' | 'one_time'
  stripe_product_id: string | null
  stripe_price_id: string | null
  payment_link: string | null
  payment_link_id: string | null
  is_active: boolean
}

async function getStripe(): Promise<StripeClient> {
  const secret = await masterService.getSetting<string>("stripe_secret_key")
  if (!secret || typeof secret !== "string" || !secret.startsWith("sk_")) {
    throw new Error(
      "Chave Stripe não configurada. Vá em Integrações e cole a secret key.",
    )
  }
  return new Stripe(secret)
}

function intervalToStripe(interval: string): "month" | "year" | "week" | "day" {
  switch (interval) {
    case "yearly":
    case "year":
      return "year"
    case "weekly":
    case "week":
      return "week"
    case "daily":
    case "day":
      return "day"
    case "monthly":
    case "month":
    default:
      return "month"
  }
}

/**
 * Synchronize a plan with Stripe:
 *   - upsert product
 *   - create new price if price_cents/billing_type changed (and archive the old)
 *   - generate a payment link (or recreate if price changed)
 *
 * Returns the updated plan row.
 */
export async function syncPlanWithStripe(planId: string): Promise<DBPlan> {
  const plan = await queryOne<DBPlan>(`SELECT * FROM plans WHERE id = ?`, [planId])
  if (!plan) throw new Error(`Plan not found: ${planId}`)
  if (plan.price_cents <= 0) {
    throw new Error("Preço deve ser maior que zero pra gerar link de pagamento.")
  }

  const stripe = await getStripe()

  /* ───────── 1. Product ───────── */
  let productId = plan.stripe_product_id
  if (productId) {
    try {
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.tagline || undefined,
        active: !!plan.is_active,
        metadata: { plan_id: plan.id, plan_slug: plan.slug },
      })
    } catch (err: any) {
      // If product was deleted on Stripe side, recreate
      logger.warn(`stripe product update failed (${err?.message}); will create new`)
      productId = null
    }
  }
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.tagline || undefined,
      active: !!plan.is_active,
      metadata: { plan_id: plan.id, plan_slug: plan.slug },
    })
    productId = product.id
    await query(`UPDATE plans SET stripe_product_id = ? WHERE id = ?`, [productId, plan.id])
  }

  /* ───────── 2. Price (immutable — recreate if changed) ───────── */
  let priceId = plan.stripe_price_id
  let needNewPrice = !priceId
  if (priceId) {
    try {
      const existing = (await stripe.prices.retrieve(priceId)) as any
      const sameAmount = existing.unit_amount === plan.price_cents
      const sameRecurring =
        plan.billing_type === "subscription"
          ? existing.recurring && existing.recurring.interval === intervalToStripe(plan.interval)
          : !existing.recurring
      const sameCurrency = existing.currency === "brl"
      const stillActive = existing.active
      if (!sameAmount || !sameRecurring || !sameCurrency || !stillActive) {
        needNewPrice = true
      }
    } catch {
      needNewPrice = true
    }
  }
  if (needNewPrice) {
    // Archive old price (Stripe keeps it for historical refs but stops new charges)
    if (priceId) {
      await stripe.prices.update(priceId, { active: false }).catch(() => undefined)
    }
    const priceParams: any = {
      product: productId,
      unit_amount: plan.price_cents,
      currency: "brl",
      metadata: { plan_id: plan.id, plan_slug: plan.slug },
    }
    if (plan.billing_type === "subscription") {
      priceParams.recurring = { interval: intervalToStripe(plan.interval) }
    }
    const price = await stripe.prices.create(priceParams)
    priceId = price.id
    await query(`UPDATE plans SET stripe_price_id = ? WHERE id = ?`, [priceId, plan.id])
  }

  /* ───────── 3. Payment Link ───────── */
  // Deactivate old link if price changed
  if (plan.payment_link_id && needNewPrice) {
    await stripe.paymentLinks
      .update(plan.payment_link_id, { active: false })
      .catch(() => undefined)
  }

  let paymentLink = plan.payment_link
  let paymentLinkId = plan.payment_link_id

  if (!paymentLinkId || needNewPrice) {
    const linkParams: any = {
      line_items: [{ price: priceId!, quantity: 1 }],
      metadata: { plan_id: plan.id, plan_slug: plan.slug },
      after_completion: {
        type: "redirect",
        redirect: {
          // Stripe replaces {CHECKOUT_SESSION_ID} on the URL automatically
          url: `https://app.leadcapture.online/cadastro/sucesso?session={CHECKOUT_SESSION_ID}`,
        },
      },
      // Capture the customer email (used to create the user account in webhook)
      customer_creation:
        plan.billing_type === "subscription" ? undefined : "always",
    }
    if (plan.billing_type === "subscription") {
      linkParams.subscription_data = {
        metadata: { plan_id: plan.id, plan_slug: plan.slug },
      }
    }
    const link = await stripe.paymentLinks.create(linkParams)
    paymentLink = link.url
    paymentLinkId = link.id
    await query(
      `UPDATE plans SET payment_link = ?, payment_link_id = ?, updated_at = NOW() WHERE id = ?`,
      [paymentLink, paymentLinkId, plan.id],
    )
  }

  const updated = await queryOne<DBPlan>(`SELECT * FROM plans WHERE id = ?`, [planId])
  if (!updated) throw new Error("plan vanished during sync")
  return updated
}

/**
 * Manual disable (when admin wants to take a plan offline).
 */
export async function disablePlanLink(planId: string): Promise<void> {
  const plan = await queryOne<DBPlan>(`SELECT * FROM plans WHERE id = ?`, [planId])
  if (!plan || !plan.payment_link_id) return
  const stripe = await getStripe()
  await stripe.paymentLinks
    .update(plan.payment_link_id, { active: false })
    .catch(() => undefined)
  await query(`UPDATE plans SET payment_link = NULL WHERE id = ?`, [planId])
}
