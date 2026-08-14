import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";

export type AppRegistrationContext = {
  app_id: string;
  app_name: string;
  organization_id: string | null;
  organization_name: string | null;
  event_key: string;
  unit_price: number;
  currency: string;
};

let ready: Promise<void> | null = null;
async function ensureSchema() {
  if (!ready) ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS usage_apps (
      id VARCHAR(64) PRIMARY KEY, brand_id VARCHAR(64) NULL, name VARCHAR(160) NOT NULL,
      slug VARCHAR(160) NOT NULL UNIQUE, description TEXT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE IF NOT EXISTS app_registration_links (
      id VARCHAR(64) PRIMARY KEY, organization_id VARCHAR(64) NULL, app_id VARCHAR(64) NOT NULL,
      token VARCHAR(160) NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE TABLE IF NOT EXISTS customer_apps (
      id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, brand_id VARCHAR(64) NULL,
      app_id VARCHAR(64) NOT NULL, registration_link_id VARCHAR(64) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active', activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_customer_app (user_id, app_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS usage_billing_rules (
      id VARCHAR(64) PRIMARY KEY, app_id VARCHAR(64) NOT NULL, event_key VARCHAR(120) NOT NULL,
      event_label VARCHAR(160) NOT NULL, unit_price DECIMAL(14,4) NOT NULL DEFAULT 0,
      currency CHAR(3) NOT NULL DEFAULT 'BRL', active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE KEY uq_usage_rule (app_id, event_key)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS usage_events (
      id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, brand_id VARCHAR(64) NULL,
      app_id VARCHAR(64) NOT NULL, event_key VARCHAR(120) NOT NULL, external_id VARCHAR(255) NOT NULL,
      quantity DECIMAL(14,4) NOT NULL DEFAULT 1, unit_price DECIMAL(14,4) NOT NULL,
      total_amount DECIMAL(14,4) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'BRL',
      status VARCHAR(32) NOT NULL DEFAULT 'pending', occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_usage_event (user_id, app_id, event_key, external_id)
    )`);
  })().catch((err) => { ready = null; throw err; });
  return ready;
}

export async function resolveRegistrationToken(token: string): Promise<AppRegistrationContext | null> {
  await ensureSchema();
  const row = await queryOne<any>(`SELECT a.id app_id, a.name app_name, l.organization_id,
    b.name organization_name, r.event_key, r.unit_price, r.currency
    FROM app_registration_links l JOIN usage_apps a ON a.id = l.app_id
    LEFT JOIN brand_units b ON b.id = l.organization_id
    LEFT JOIN usage_billing_rules r ON r.app_id = a.id AND r.active = TRUE
    WHERE l.token = ? AND l.active = TRUE AND a.active = TRUE LIMIT 1`, [token]);
  if (!row) return null;
  return { app_id: String(row.app_id), app_name: String(row.app_name), organization_id: row.organization_id ? String(row.organization_id) : null,
    organization_name: row.organization_name ? String(row.organization_name) : null, event_key: String(row.event_key || ""),
    unit_price: Number(row.unit_price || 0), currency: String(row.currency || "BRL") };
}

export async function attachCustomerApp(input: { userId: string; brandId?: string | null; token?: string | null }) {
  if (!input.token) return null;
  const ctx = await resolveRegistrationToken(input.token);
  if (!ctx) return null;
  const existing = await queryOne<any>(`SELECT id FROM customer_apps WHERE user_id = ? AND app_id = ? LIMIT 1`, [input.userId, ctx.app_id]);
  if (!existing) await query(`INSERT INTO customer_apps (id,user_id,brand_id,app_id) VALUES (?,?,?,?)`, [randomUUID(), input.userId, input.brandId || null, ctx.app_id]);
  return ctx;
}

export async function recordUsage(input: { userId: string; brandId?: string | null; appId: string; eventKey: string; externalId: string; quantity?: number }) {
  await ensureSchema();
  const rule = await queryOne<any>(`SELECT unit_price, currency FROM usage_billing_rules WHERE app_id = ? AND event_key = ? AND active = TRUE LIMIT 1`, [input.appId, input.eventKey]);
  if (!rule) throw new Error("usage_rule_not_found");
  const quantity = Math.max(0, Number(input.quantity || 1));
  const existing = await queryOne<any>(`SELECT * FROM usage_events WHERE user_id=? AND app_id=? AND event_key=? AND external_id=? LIMIT 1`, [input.userId, input.appId, input.eventKey, input.externalId]);
  if (existing) return { duplicate: true, event: existing };
  const unit = Number(rule.unit_price || 0), total = Number((unit * quantity).toFixed(4));
  const id = randomUUID();
  await query(`INSERT INTO usage_events (id,user_id,brand_id,app_id,event_key,external_id,quantity,unit_price,total_amount,currency) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, input.userId, input.brandId || null, input.appId, input.eventKey, input.externalId, quantity, unit, total, String(rule.currency || "BRL")]);
  return { duplicate: false, event: { id, app_id: input.appId, event_key: input.eventKey, quantity, unit_price: unit, total_amount: total, currency: String(rule.currency || "BRL") } };
}
