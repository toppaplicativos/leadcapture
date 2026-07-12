/**
 * Abandoned checkout recovery — scans unpaid commerce orders near/past expiry
 * and sends cart-abandoned e-mails once per order.
 */

import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"
import { emailTriggers } from "./emailTriggers"
import { v4 as uuidv4 } from "uuid"

let started = false
let schemaReady = false

async function ensureSchema() {
  if (schemaReady) return
  await query(`
    CREATE TABLE IF NOT EXISTS email_dispatch_log (
      id VARCHAR(36) PRIMARY KEY,
      event_key VARCHAR(80) NOT NULL,
      resource_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (event_key, resource_id)
    )
  `).catch(async () => {
    /* MySQL fallback without TIMESTAMPTZ */
    await query(`
      CREATE TABLE IF NOT EXISTS email_dispatch_log (
        id VARCHAR(36) PRIMARY KEY,
        event_key VARCHAR(80) NOT NULL,
        resource_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_email_dispatch (event_key, resource_id)
      )
    `).catch(() => {})
  })
  schemaReady = true
}

async function alreadySent(eventKey: string, resourceId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM email_dispatch_log WHERE event_key = ? AND resource_id = ? LIMIT 1`,
    [eventKey, resourceId],
  ).catch(() => null)
  return !!row
}

async function markSent(eventKey: string, resourceId: string) {
  await query(
    `INSERT INTO email_dispatch_log (id, event_key, resource_id) VALUES (?, ?, ?)`,
    [uuidv4(), eventKey, resourceId],
  ).catch(() => {})
}

export async function processAbandonedCheckouts(): Promise<number> {
  await ensureSchema()
  let orders: any[] = []
  try {
    orders = (await query<any[]>(
      `SELECT id, user_id, brand_id, customer_name, customer_email, valor_total,
              payment_link, checkout_token, checkout_expires_at, status_pedido
         FROM commerce_orders
        WHERE status_pedido IN ('aguardando_pagamento', 'pendente')
          AND customer_email IS NOT NULL
          AND customer_email <> ''
          AND checkout_expires_at IS NOT NULL
          AND checkout_expires_at <= NOW() + INTERVAL '2 hours'
          AND checkout_expires_at >= NOW() - INTERVAL '48 hours'
        ORDER BY checkout_expires_at ASC
        LIMIT 40`,
    )) as any[]
  } catch {
    /* MySQL interval style */
    try {
      orders = (await query<any[]>(
        `SELECT id, user_id, brand_id, customer_name, customer_email, valor_total,
                payment_link, checkout_token, checkout_expires_at, status_pedido
           FROM commerce_orders
          WHERE status_pedido IN ('aguardando_pagamento', 'pendente')
            AND customer_email IS NOT NULL AND customer_email <> ''
            AND checkout_expires_at IS NOT NULL
            AND checkout_expires_at <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
            AND checkout_expires_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
          ORDER BY checkout_expires_at ASC
          LIMIT 40`,
      )) as any[]
    } catch (err: any) {
      logger.warn(`[emailCartRecovery] query failed: ${err?.message}`)
      return 0
    }
  }

  let sent = 0
  for (const o of orders || []) {
    const eventKey = "cart_abandoned"
    const resourceId = String(o.id)
    if (await alreadySent(eventKey, resourceId)) continue

    const items = await query<any[]>(
      `SELECT nome, quantidade FROM commerce_order_items WHERE order_id = ? LIMIT 8`,
      [o.id],
    ).catch(() => [])
    const summary = (items || [])
      .map((it: any) => `${it.quantidade}× ${it.nome}`)
      .join(", ")
      .slice(0, 160)

    emailTriggers.cartAbandoned({
      userId: String(o.user_id),
      brandId: o.brand_id,
      customer_name: o.customer_name,
      customer_email: String(o.customer_email),
      cart_url: o.payment_link || `https://app.leadcapture.online/pedido/${o.checkout_token}`,
      items_summary: summary || "Itens do carrinho",
      total: Number(o.valor_total || 0),
      discount_code: "VOLTA10",
    })
    await markSent(eventKey, resourceId)
    sent++
  }
  if (sent > 0) logger.info(`[emailCartRecovery] sent ${sent} abandoned-cart emails`)
  return sent
}

export function startCartRecoveryMonitor() {
  if (started) return
  started = true
  setTimeout(() => {
    processAbandonedCheckouts().catch(() => {})
  }, 45_000)
  setInterval(() => {
    processAbandonedCheckouts().catch(() => {})
  }, 30 * 60_000).unref?.()
  logger.info("[emailCartRecovery] monitor started (every 30min)")
}
