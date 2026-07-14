/**
 * Email triggers — fire-and-forget transactional sends bound to product events.
 * Never throw to callers; log failures only.
 */

import { emailService } from "./email"
import { queryOne } from "../config/database"
import { logger } from "../utils/logger"

const DEFAULT_BRAND_COLOR = "#0a0a0a"
const APP_LOGIN = "https://app.leadcapture.online/login"
const APP_ADMIN = "https://app.leadcapture.online/admin"
const BILLING = "https://app.leadcapture.online/admin"
const CADASTRO = "https://leadcapture.online/cadastro"

function moneyBR(v: number | string | null | undefined): string {
  const n = Number(v || 0)
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

async function brandContext(userId: string, brandId?: string | null) {
  let brand: any = null
  if (brandId) {
    brand = await queryOne<any>(
      `SELECT id, name, slug, primary_color, secondary_color, logo_url, whatsapp_phone, domain
         FROM brand_units WHERE id = ? LIMIT 1`,
      [brandId],
    ).catch(() => null)
  }
  if (!brand) {
    brand = await queryOne<any>(
      `SELECT id, name, slug, primary_color, secondary_color, logo_url, whatsapp_phone, domain
         FROM brand_units WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1`,
      [userId],
    ).catch(() => null)
  }

  const owner = await queryOne<{ email: string; name: string }>(
    `SELECT email, name FROM users WHERE id = ? LIMIT 1`,
    [userId],
  ).catch(() => null)

  const name = brand?.name || "Sua loja"
  const color =
    String(brand?.primary_color || brand?.secondary_color || "").trim() || DEFAULT_BRAND_COLOR
  const slug = brand?.slug || ""
  const storeUrl = brand?.domain
    ? `https://${String(brand.domain).replace(/^https?:\/\//, "")}`
    : slug
      ? `https://app.leadcapture.online/catalogo/${slug}`
      : "https://app.leadcapture.online"
  const phone = String(brand?.whatsapp_phone || "").replace(/\D/g, "")
  const whatsappUrl = phone ? `https://wa.me/${phone}` : storeUrl

  const logo =
    String(brand?.logo_url || "").trim() ||
    "https://app.leadcapture.online/brand-mark.png"

  return {
    brand_id: brand?.id || brandId || null,
    brand_name: name,
    brand_color: color,
    brand_logo_url: logo.startsWith("http") ? logo : `https://app.leadcapture.online${logo.startsWith("/") ? "" : "/"}${logo}`,
    store_url: storeUrl,
    whatsapp_url: whatsappUrl,
    seller_email: owner?.email || null,
    seller_name: owner?.name || name,
    logo_url: brand?.logo_url || null,
  }
}

function fire(label: string, p: Promise<any>) {
  p.catch((err: any) => logger.warn(`[emailTriggers] ${label}: ${err?.message || err}`))
}

export const emailTriggers = {
  /** Org owner after paid signup */
  async welcomeOwner(params: {
    email: string
    user_name: string
    brand_name: string
    plan_name: string
    userId?: string
  }) {
    fire(
      "welcome-owner",
      emailService.sendTemplate(
        "welcome-owner",
        params.email,
        {
          user_name: params.user_name,
          brand_name: params.brand_name,
          plan_name: params.plan_name,
          login_url: APP_LOGIN,
        },
        { scope: "system", actorUserId: params.userId },
      ),
    )
    /* also send legacy slug for any old listeners / previews */
    fire(
      "welcome",
      emailService.sendTemplate(
        "welcome",
        params.email,
        {
          user_name: params.user_name,
          brand_name: params.brand_name,
          plan_name: params.plan_name,
          login_url: APP_LOGIN,
        },
        { scope: "system", actorUserId: params.userId },
      ),
    )
  },

  async invoicePaid(params: {
    email: string
    user_name: string
    plan_name: string
    amount: string
    next_billing: string
    invoice_url: string
    userId?: string
  }) {
    fire(
      "invoice-paid",
      emailService.sendTemplate("invoice-paid", params.email, params, {
        scope: "system",
        actorUserId: params.userId,
      }),
    )
  },

  async paymentFailed(params: {
    email: string
    user_name: string
    plan_name: string
    billing_url?: string
    userId?: string
  }) {
    fire(
      "payment-failed",
      emailService.sendTemplate(
        "payment-failed",
        params.email,
        {
          ...params,
          billing_url: params.billing_url || BILLING,
        },
        { scope: "system", actorUserId: params.userId },
      ),
    )
  },

  async subscriptionCanceled(params: {
    email: string
    user_name: string
    plan_name: string
    ends_at: string
    userId?: string
  }) {
    fire(
      "subscription-canceled",
      emailService.sendTemplate(
        "subscription-canceled",
        params.email,
        {
          ...params,
          reactivate_url: CADASTRO,
        },
        { scope: "system", actorUserId: params.userId },
      ),
    )
  },

  /** Client/customer welcome — picks template by client_type when possible */
  async welcomeCustomer(params: {
    userId: string
    brandId?: string | null
    customer_name: string
    customer_email: string
    client_type?: string | null
  }) {
    if (!params.customer_email) return
    const ctx = await brandContext(params.userId, params.brandId)
    const type = String(params.client_type || "").toLowerCase()
    let slug = "welcome-customer"
    if (/b2b|atacad|revend|distrib|empres/.test(type)) slug = "welcome-customer-b2b"
    else if (/servi[cç]o|agenda|consult/.test(type)) slug = "welcome-customer-service"
    else if (/varej|final|consum|pf|retail/.test(type)) slug = "welcome-customer-retail"

    const welcome_message =
      slug === "welcome-customer-b2b"
        ? "Sua conta comercial está pronta. Nossa equipe pode orientar sobre condições, prazos e atendimento."
        : slug === "welcome-customer-service"
          ? "Seu cadastro está ativo. Quando precisar, é só falar conosco ou agendar um horário."
          : "É um prazer ter você conosco. Estamos à disposição para atender e tirar dúvidas."

    fire(
      slug,
      emailService.sendTemplate(
        slug,
        params.customer_email,
        {
          customer_name: params.customer_name,
          brand_name: ctx.brand_name,
          brand_color: ctx.brand_color,
          brand_logo_url: ctx.brand_logo_url,
          store_url: ctx.store_url,
          whatsapp_url: ctx.whatsapp_url,
          welcome_message,
          client_type: params.client_type || "Cliente",
        },
        { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
      ),
    )
  },

  async welcomeAffiliate(params: {
    userId: string
    brandId?: string | null
    affiliate_name: string
    affiliate_email: string
    commission_rate?: string
    program_name?: string
    panel_url?: string
  }) {
    if (!params.affiliate_email) return
    const ctx = await brandContext(params.userId, params.brandId)
    const panel =
      params.panel_url ||
      (ctx.brand_id
        ? `https://parceiros.leadcapture.online`
        : "https://parceiros.leadcapture.online")

    fire(
      "welcome-affiliate",
      emailService.sendTemplate(
        "welcome-affiliate",
        params.affiliate_email,
        {
          affiliate_name: params.affiliate_name,
          brand_name: ctx.brand_name,
          brand_color: ctx.brand_color,
          brand_logo_url: ctx.brand_logo_url,
          affiliate_panel_url: panel,
          commission_rate: params.commission_rate || "conforme programa",
          program_name: params.program_name || "Programa de parceiros",
        },
        { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
      ),
    )
  },

  /** Boas-vindas global (cadastro em parceiros.leadcapture.online) */
  async welcomePartners(params: {
    affiliate_name: string
    affiliate_email: string
    panel_url?: string
  }) {
    if (!params.affiliate_email) return
    fire(
      "welcome-partners",
      emailService.sendTemplate(
        "welcome-partners",
        params.affiliate_email,
        {
          user_name: params.affiliate_name,
          panel_url: params.panel_url || "https://parceiros.leadcapture.online",
        },
        { scope: "system" },
      ),
    )
  },

  async affiliateApproved(params: {
    userId: string
    brandId?: string | null
    affiliate_name: string
    affiliate_email: string
    program_name?: string
    panel_url?: string
    commission_rate?: string
  }) {
    if (!params.affiliate_email) return
    const ctx = await brandContext(params.userId, params.brandId)
    fire(
      "affiliate-approved",
      emailService.sendTemplate(
        "affiliate-approved",
        params.affiliate_email,
        {
          affiliate_name: params.affiliate_name,
          brand_name: ctx.brand_name,
          brand_color: ctx.brand_color,
          brand_logo_url: ctx.brand_logo_url,
          program_name: params.program_name || "Programa de parceiros",
          affiliate_panel_url: params.panel_url || "https://parceiros.leadcapture.online",
          commission_rate: params.commission_rate || "conforme programa",
        },
        { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
      ),
    )
  },

  async orderCreated(params: {
    userId: string
    brandId?: string | null
    order_id: string
    total: number
    customer_name?: string | null
    customer_email?: string | null
    customer_phone?: string | null
    items_summary?: string
    checkout_url?: string
    status?: string
  }) {
    const ctx = await brandContext(params.userId, params.brandId)
    const total = moneyBR(params.total)
    const items = params.items_summary || "Itens do pedido"
    const track = params.checkout_url || ctx.store_url
    const shortId = String(params.order_id).slice(0, 8)

    if (ctx.seller_email) {
      fire(
        "order-received-seller",
        emailService.sendTemplate(
          "order-received-seller",
          ctx.seller_email,
          {
            seller_name: ctx.seller_name,
            brand_name: ctx.brand_name,
            brand_color: ctx.brand_color,
            order_id: shortId,
            total,
            customer_name: params.customer_name || "Cliente",
            customer_phone: params.customer_phone || "—",
            items_summary: items,
            admin_url: APP_ADMIN,
          },
          { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
        ),
      )
    }

    if (params.customer_email) {
      fire(
        "order-confirmed-buyer",
        emailService.sendTemplate(
          "order-confirmed-buyer",
          params.customer_email,
          {
            customer_name: params.customer_name || "Cliente",
            brand_name: ctx.brand_name,
            brand_color: ctx.brand_color,
            order_id: shortId,
            total,
            items_summary: items,
            tracking_url: track,
            payment_status: params.status === "pago" ? "Pago" : "Aguardando pagamento",
          },
          { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
        ),
      )

      if (params.status !== "pago") {
        fire(
          "payment-pending-buyer",
          emailService.sendTemplate(
            "payment-pending-buyer",
            params.customer_email,
            {
              customer_name: params.customer_name || "Cliente",
              brand_name: ctx.brand_name,
              brand_color: ctx.brand_color,
              order_id: shortId,
              total,
              checkout_url: track,
              expires_at: "24 horas",
            },
            { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
          ),
        )
      }
    }
  },

  async orderPaid(params: {
    userId: string
    brandId?: string | null
    order_id: string
    total: number
    customer_name?: string | null
    customer_email?: string | null
    tracking_url?: string
  }) {
    if (!params.customer_email) return
    const ctx = await brandContext(params.userId, params.brandId)
    fire(
      "order-paid-buyer",
      emailService.sendTemplate(
        "order-paid-buyer",
        params.customer_email,
        {
          customer_name: params.customer_name || "Cliente",
          brand_name: ctx.brand_name,
          brand_color: ctx.brand_color,
          order_id: String(params.order_id).slice(0, 8),
          total: moneyBR(params.total),
          tracking_url: params.tracking_url || ctx.store_url,
        },
        { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
      ),
    )
  },

  async cartAbandoned(params: {
    userId: string
    brandId?: string | null
    customer_name?: string | null
    customer_email: string
    cart_url: string
    items_summary?: string
    total?: number
    discount_code?: string
  }) {
    if (!params.customer_email) return
    const ctx = await brandContext(params.userId, params.brandId)
    fire(
      "cart-abandoned",
      emailService.sendTemplate(
        "cart-abandoned",
        params.customer_email,
        {
          customer_name: params.customer_name || "Cliente",
          brand_name: ctx.brand_name,
          brand_color: ctx.brand_color,
          cart_url: params.cart_url,
          discount_code: params.discount_code || "VOLTA10",
          items_summary: params.items_summary || "Itens selecionados",
          total: moneyBR(params.total || 0),
        },
        { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
      ),
    )
    /* legacy slug */
    fire(
      "abandono-carrinho",
      emailService.sendTemplate(
        "abandono-carrinho",
        params.customer_email,
        {
          customer_name: params.customer_name || "Cliente",
          brand_name: ctx.brand_name,
          brand_color: ctx.brand_color,
          cart_url: params.cart_url,
          discount_code: params.discount_code || "VOLTA10",
          items_summary: params.items_summary || "Itens selecionados",
          total: moneyBR(params.total || 0),
        },
        { scope: "tenant", brandId: ctx.brand_id, actorUserId: params.userId },
      ),
    )
  },
}
