/**
 * Request correlation — every API response gets X-Request-Id for traceability.
 */

import { randomUUID } from "crypto"
import type { Request, Response, NextFunction } from "express"
import { logger } from "../utils/logger"

export interface RequestContext {
  requestId: string
  startedAt: number
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string
      startedAt?: number
    }
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = String(req.headers["x-request-id"] || "").trim()
  const requestId =
    incoming && incoming.length <= 80 && /^[a-zA-Z0-9._-]+$/.test(incoming)
      ? incoming
      : randomUUID()

  req.requestId = requestId
  req.startedAt = Date.now()
  res.setHeader("X-Request-Id", requestId)

  const started = req.startedAt
  res.on("finish", () => {
    const ms = Date.now() - started
    const path = String(req.originalUrl || req.url || "").split("?")[0]
    /* Skip noisy static / health spam unless error */
    if (res.statusCode < 400 && (path === "/api/health" || path.startsWith("/assets"))) return
    if (res.statusCode >= 400) {
      logger.warn(
        {
          requestId,
          method: req.method,
          path,
          status: res.statusCode,
          ms,
          userId: (req as any).userId || (req as any).user?.userId || null,
        },
        "http_error",
      )
    } else if (ms > 3000) {
      logger.warn({ requestId, method: req.method, path, status: res.statusCode, ms }, "http_slow")
    }
  })

  next()
}

export function getRequestId(req: Request): string {
  return req.requestId || String(req.headers["x-request-id"] || "") || "unknown"
}
