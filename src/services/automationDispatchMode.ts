/**
 * Brand-level dispatch mode for Instagram event automations.
 * Default remains `catalog` until hybrid is enabled per brand or env.
 */

import { query, queryOne, insert, update } from "../config/database";
import { logger } from "../utils/logger";
import type { DispatchMode } from "./automationMatchLogic";
import { resolveSendReal } from "./automationMatchLogic";

export type { DispatchMode };

let flagsReady = false;

export async function ensureBrandAutomationFlagsSchema(): Promise<void> {
  if (flagsReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS brand_automation_flags (
      brand_id VARCHAR(36) NOT NULL PRIMARY KEY,
      dispatch_mode VARCHAR(20) NOT NULL DEFAULT 'catalog',
      replies_paused BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch((err) => logger.warn(`brand_automation_flags DDL: ${err?.message || err}`));

  await query(`
    CREATE TABLE IF NOT EXISTS automation_migration_audit (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      slug VARCHAR(120) NOT NULL,
      old_ba_status VARCHAR(40) NULL,
      new_def_id VARCHAR(36) NULL,
      ativa BOOLEAN NULL,
      payload_json JSONB NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch((err) => logger.warn(`automation_migration_audit DDL: ${err?.message || err}`));

  flagsReady = true;
}

function parseEnvMode(): DispatchMode {
  const raw = String(process.env.AUTOMATIONS_V2_DISPATCH || "catalog").toLowerCase();
  if (raw === "hybrid" || raw === "definitions" || raw === "catalog") return raw;
  return "catalog";
}

export async function getBrandDispatchMode(brandId: string): Promise<DispatchMode> {
  await ensureBrandAutomationFlagsSchema();
  const row = await queryOne<any>(
    `SELECT dispatch_mode FROM brand_automation_flags WHERE brand_id = ? LIMIT 1`,
    [brandId],
  );
  if (row?.dispatch_mode === "hybrid" || row?.dispatch_mode === "definitions" || row?.dispatch_mode === "catalog") {
    return row.dispatch_mode;
  }
  return parseEnvMode();
}

export async function setBrandDispatchMode(
  brandId: string,
  mode: DispatchMode,
  options: { allowWithoutSendReal?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  await ensureBrandAutomationFlagsSchema();
  const sendReal = isIgSendEnabled() && resolveSendReal(mode, process.env.AUTOMATIONS_V2_IG_SEND);
  if ((mode === "hybrid" || mode === "definitions") && !sendReal && !options.allowWithoutSendReal) {
    return {
      ok: false,
      error: "Recusado: mode hybrid/definitions exige send real (AUTOMATIONS_V2_IG_SEND !== false)",
    };
  }

  const existing = await queryOne<any>(
    `SELECT brand_id FROM brand_automation_flags WHERE brand_id = ? LIMIT 1`,
    [brandId],
  );
  if (existing) {
    await update(
      `UPDATE brand_automation_flags SET dispatch_mode = ?, updated_at = NOW() WHERE brand_id = ?`,
      [mode, brandId],
    );
  } else {
    await insert(
      `INSERT INTO brand_automation_flags (brand_id, dispatch_mode) VALUES (?, ?)`,
      [brandId, mode],
    );
  }
  return { ok: true };
}

export async function isBrandRepliesPaused(brandId: string): Promise<boolean> {
  await ensureBrandAutomationFlagsSchema();
  const row = await queryOne<any>(
    `SELECT replies_paused FROM brand_automation_flags WHERE brand_id = ? LIMIT 1`,
    [brandId],
  );
  return Boolean(row?.replies_paused);
}

/** Default true in production; explicit false disables definition real send. */
export function isIgSendEnabled(): boolean {
  const v = process.env.AUTOMATIONS_V2_IG_SEND;
  if (v === undefined || v === null || v === "") return true;
  if (v === "false" || v === "0") return false;
  return true;
}

export function computeSendRealForMode(mode: DispatchMode): boolean {
  return resolveSendReal(mode, isIgSendEnabled() ? true : false) && isIgSendEnabled();
}

/** Catalog path AI gates apply only when mode is catalog (or hybrid catalog fallback). */
export function shouldApplyGlobalAutoReplyGates(mode: DispatchMode): boolean {
  return mode === "catalog";
}
