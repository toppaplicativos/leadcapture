/**
 * Traceable denials for plan/module/brand gates (ops + support).
 * Writes to master_audit_log when possible; always logs structured.
 */

import { logger } from "../utils/logger"
import { masterService } from "./master"

export async function logEntitlementDenial(entry: {
  code: string
  message: string
  userId?: string | null
  brandId?: string | null
  path?: string
  requestId?: string
  details?: Record<string, any>
}): Promise<void> {
  logger.warn(
    {
      event: "entitlement_denied",
      code: entry.code,
      userId: entry.userId || null,
      brandId: entry.brandId || null,
      path: entry.path || null,
      requestId: entry.requestId || null,
      details: entry.details || null,
    },
    entry.message,
  )

  /* Persist high-signal denials for master support (best-effort) */
  if (!entry.userId) return
  try {
    await masterService.log({
      actor_user_id: entry.userId,
      actor_email: "",
      action: "entitlement.denied",
      resource: entry.path || entry.code,
      payload: {
        code: entry.code,
        message: entry.message,
        brand_id: entry.brandId,
        request_id: entry.requestId,
        details: entry.details,
      },
      ip: null,
    })
  } catch {
    /* ignore */
  }
}
