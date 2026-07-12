/**
 * Global JSON error envelope with request_id for client correlation.
 */

import type { Request, Response, NextFunction } from "express"
import { logger } from "../utils/logger"
import { safeErrorPayload } from "../utils/safeError"
import { getRequestId } from "./requestContext"
import { EntitlementError } from "../services/planEntitlements"

export function notFoundHandler(req: Request, res: Response): void {
  if (!req.path.startsWith("/api")) {
    res.status(404).end()
    return
  }
  res.status(404).json({
    error: "not_found",
    message: "Rota não encontrada",
    request_id: getRequestId(req),
    path: req.path,
  })
}

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = getRequestId(req)

  if (err instanceof EntitlementError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      details: err.details,
      request_id: requestId,
    })
    return
  }

  const status = Number(err?.status || err?.statusCode || 500)
  const safe = safeErrorPayload(err)

  if (status >= 500) {
    logger.error(
      {
        requestId,
        err: err?.message || String(err),
        stack: err?.stack,
        path: req.path,
        method: req.method,
      },
      "unhandled_error",
    )
  }

  res.status(status >= 400 && status < 600 ? status : 500).json({
    ...safe,
    request_id: requestId,
  })
}
