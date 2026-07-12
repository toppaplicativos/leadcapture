/**
 * Global platform guards: maintenance mode + module kill-switches.
 */

import { Response, NextFunction, Request } from "express"
import jwt from "jsonwebtoken"
import {
  getPlatformTools,
  ROUTE_MODULE_MAP,
  type PlatformModules,
} from "../services/platformTools"
import { masterService } from "../services/master"
import { config } from "../config"
import type { AuthRequest } from "./auth"

const BYPASS_PREFIXES = [
  "/api/master",
  "/api/public",
  "/api/stripe",
  "/api/meta/webhook",
  "/api/instagram/webhook",
  "/api/webhooks/meta/instagram",
  "/api/meta/privacy",
  "/api/meta/oauth",
  "/api/push",
  "/api/landing",
  "/api/img",
  "/api/health",
  "/health",
  "/api/auth",
  "/api/entitlements",
  "/api/storefront/public",
  "/api/commerce/public",
  "/api/payments/public",
  "/api/integrations/mercado-pago",
]

function extractUserIdFromRequest(req: AuthRequest): string | null {
  const fromReq = req.userId || (req.user as any)?.userId || (req.user as any)?.sub
  if (fromReq) return String(fromReq)
  const authHeader = String(req.headers["authorization"] || "")
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  if (!token) return null
  try {
    const decoded: any = jwt.verify(token, config.jwtSecret)
    return String(decoded.userId || decoded.sub || "") || null
  } catch {
    return null
  }
}

async function isSuperAdminRequest(req: AuthRequest): Promise<boolean> {
  const userId = extractUserIdFromRequest(req)
  if (!userId) return false
  try {
    return await masterService.isSuperAdmin(String(userId))
  } catch {
    return false
  }
}

function pathOf(req: Request): string {
  return String(req.originalUrl || req.path || "").split("?")[0]
}

function shouldBypass(path: string): boolean {
  return BYPASS_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p))
}

/**
 * Enforce maintenance mode for authenticated tenant APIs.
 * Mount AFTER auth for protected routes, or as global for /api/* with skip list.
 */
export async function enforceMaintenanceMode(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const path = pathOf(req)
    if (shouldBypass(path)) return next()
    if (req.method === "OPTIONS") return next()

    const tools = await getPlatformTools()
    if (!tools.maintenance_mode) return next()

    if (await isSuperAdminRequest(req)) return next()

    res.status(503).json({
      error: "maintenance_mode",
      message:
        tools.maintenance_message ||
        "Plataforma em manutenção. Tente novamente em alguns minutos.",
      request_id: req.requestId || null,
    })
  } catch {
    next()
  }
}

export function requirePlatformModule(module: keyof PlatformModules) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (await isSuperAdminRequest(req)) return next()
      const tools = await getPlatformTools()
      if (tools.modules[module] === false) {
        res.status(403).json({
          error: "module_disabled",
          message: `O módulo "${module}" está desabilitado na plataforma.`,
          module,
          request_id: req.requestId || null,
        })
        return
      }
      next()
    } catch (err: any) {
      res.status(500).json({ error: "module_check_failed", request_id: req.requestId || null })
    }
  }
}

/**
 * Auto-map request path → platform module and enforce.
 * Use as router-level middleware for /api/*
 */
/** GETs de status Meta — nunca matar com kill-switch de módulo (UI precisa ler conexão). */
function isMetaConnectionStatusGet(req: Request): boolean {
  if (req.method !== "GET") return false
  const path = pathOf(req)
  return /\/api\/(instagram|facebook)\/(connection|connection-status|profile)\/?$/.test(path)
}

export async function enforceRouteModule(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const path = pathOf(req)
    if (shouldBypass(path)) return next()
    if (isMetaConnectionStatusGet(req)) return next()
    if (await isSuperAdminRequest(req)) return next()

    const match = ROUTE_MODULE_MAP.find((m) => path === m.prefix || path.startsWith(m.prefix + "/"))
    if (!match) return next()

    const tools = await getPlatformTools()
    if (tools.modules[match.module] === false) {
      res.status(403).json({
        error: "module_disabled",
        message: `O módulo "${match.module}" está desabilitado na plataforma.`,
        module: match.module,
        request_id: req.requestId || null,
      })
      return
    }
    next()
  } catch {
    next()
  }
}
