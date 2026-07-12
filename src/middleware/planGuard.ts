/**
 * Plan feature / limit guards for tenant APIs.
 */

import { Response, NextFunction } from "express"
import type { AuthRequest } from "./auth"
import {
  assertPlanFeature,
  assertBrandActive,
  assertBrandLimit,
  assertInstanceLimit,
  assertLeadCaptureLimit,
  EntitlementError,
  type PlanFeatureKey,
  MODULE_PLAN_FEATURE,
} from "../services/planEntitlements"
import { isSuperAdminUser } from "../services/planEntitlements"
import { resolveRequestBrandId } from "./permissions"
import type { PlatformModules } from "../services/platformTools"
import { getRequestId } from "./requestContext"
import { logEntitlementDenial } from "../services/entitlementAudit"

function userIdOf(req: AuthRequest): string | undefined {
  return (req.userId || (req.user as any)?.userId || (req.user as any)?.sub) as string | undefined
}

function sendEntitlementError(req: AuthRequest, res: Response, err: any): void {
  const requestId = getRequestId(req)
  if (err instanceof EntitlementError) {
    void logEntitlementDenial({
      code: err.code,
      message: err.message,
      userId: userIdOf(req),
      brandId: resolveRequestBrandId(req) || (req as any).brandId,
      path: req.originalUrl || req.path,
      requestId,
      details: err.details,
    })
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      details: err.details,
      request_id: requestId,
    })
    return
  }
  res.status(500).json({
    error: "entitlement_check_failed",
    message: err?.message,
    request_id: requestId,
  })
}

export function requirePlanFeature(feature: PlanFeatureKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = userIdOf(req)
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" })
        return
      }
      const brandId = resolveRequestBrandId(req) || (req as any).brandId
      await assertPlanFeature(userId, feature, brandId)
      next()
    } catch (err: any) {
      sendEntitlementError(req, res, err)
    }
  }
}

/** Gate a platform module also by plan feature when mapped */
export function requireModuleAndPlan(module: keyof PlatformModules) {
  const feature = MODULE_PLAN_FEATURE[module]
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = userIdOf(req)
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" })
        return
      }
      if (await isSuperAdminUser(userId)) return next()

      const brandId = resolveRequestBrandId(req) || (req as any).brandId
      await assertBrandActive(brandId)

      if (feature) {
        await assertPlanFeature(userId, feature, brandId)
      }
      next()
    } catch (err: any) {
      sendEntitlementError(req, res, err)
    }
  }
}

export async function requireActiveBrand(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = userIdOf(req)
    if (userId && (await isSuperAdminUser(userId))) return next()
    const brandId = resolveRequestBrandId(req) || (req as any).brandId
    await assertBrandActive(brandId)
    next()
  } catch (err: any) {
    sendEntitlementError(req, res, err)
  }
}

export async function guardCreateBrand(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = userIdOf(req)
    if (!userId) {
      res.status(401).json({ error: "Não autenticado" })
      return
    }
    await assertBrandLimit(userId)
    next()
  } catch (err: any) {
    sendEntitlementError(req, res, err)
  }
}

export async function guardCreateInstance(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = userIdOf(req)
    if (!userId) {
      res.status(401).json({ error: "Não autenticado" })
      return
    }
    await assertInstanceLimit(userId)
    next()
  } catch (err: any) {
    sendEntitlementError(req, res, err)
  }
}

export async function guardLeadCapture(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = userIdOf(req)
    if (!userId) {
      res.status(401).json({ error: "Não autenticado" })
      return
    }
    await assertLeadCaptureLimit(userId)
    next()
  } catch (err: any) {
    sendEntitlementError(req, res, err)
  }
}
