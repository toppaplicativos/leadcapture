/**
 * Validate Meta App ID + App Secret against Graph API.
 * Wrong secret is the #1 reason real Instagram webhooks get 401 HMAC
 * while local signed smoke tests still pass (same wrong secret both sides).
 */

import { settingsService } from "./settings";
import { logger } from "../utils/logger";

export type MetaAppValidation = {
  ok: boolean;
  appId: string;
  secretLen: number;
  error?: string;
  checkedAt: number;
};

let cache: MetaAppValidation | null = null;
const CACHE_MS = 60_000;

export async function getMetaAppIdAndSecret(): Promise<{ appId: string; secret: string }> {
  const appId =
    process.env.META_APP_ID ||
    (await settingsService.getSetting("meta_app_id")) ||
    "";
  const secret =
    process.env.META_APP_SECRET ||
    (await settingsService.getSetting("meta_app_secret")) ||
    "";
  return { appId: appId.trim(), secret: secret.trim() };
}

export async function validateMetaAppCredentials(force = false): Promise<MetaAppValidation> {
  if (!force && cache && Date.now() - cache.checkedAt < CACHE_MS) return cache;

  const { appId, secret } = await getMetaAppIdAndSecret();
  if (!appId || !secret) {
    cache = {
      ok: false,
      appId,
      secretLen: secret.length,
      error: "meta_app_id ou meta_app_secret ausente",
      checkedAt: Date.now(),
    };
    return cache;
  }

  try {
    const appToken = `${appId}|${secret}`;
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/app?access_token=${encodeURIComponent(appToken)}`,
    );
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      cache = {
        ok: false,
        appId,
        secretLen: secret.length,
        error: data?.error?.message || `HTTP ${resp.status}`,
        checkedAt: Date.now(),
      };
      logger.warn(
        `[MetaCreds] App Secret INVALIDO app_id=${appId} len=${secret.length}: ${cache.error}`,
      );
      return cache;
    }
    cache = {
      ok: true,
      appId: String(data.id || appId),
      secretLen: secret.length,
      checkedAt: Date.now(),
    };
    return cache;
  } catch (err: any) {
    cache = {
      ok: false,
      appId,
      secretLen: secret.length,
      error: err?.message || "validate_failed",
      checkedAt: Date.now(),
    };
    return cache;
  }
}

/** Sync secret into connection rows so HMAC candidates stay aligned. */
export async function syncAppSecretToConnections(appId: string, secret: string): Promise<void> {
  try {
    const { update } = await import("../config/database");
    if (appId) {
      await update(
        `UPDATE instagram_connections
         SET app_id = COALESCE(NULLIF(?, ''), app_id),
             app_secret = ?,
             updated_at = NOW()
         WHERE is_active = TRUE OR app_id = ? OR app_id IS NULL OR app_id = ''`,
        [appId, secret, appId],
      );
    } else {
      await update(
        `UPDATE instagram_connections SET app_secret = ?, updated_at = NOW() WHERE is_active = TRUE`,
        [secret],
      );
    }
  } catch (err: any) {
    logger.warn(`[MetaCreds] sync connections: ${err?.message || err}`);
  }
}

export function invalidateMetaAppCredentialsCache(): void {
  cache = null;
}
