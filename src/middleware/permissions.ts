/**
 * Middleware de autorização baseado em permissões granulares.
 *
 * Uso:
 *   router.get("/rota", authMiddleware, requirePermission("orders:read"), handler)
 *
 * Bypass (nesta ordem):
 *   1. Admin Master (is_super_admin no JWT ou account_kind=platform)
 *   2. Dono da organização/brand (brand_units.user_id) — via permissionsService
 *   3. RBAC user_brand_roles + role_permissions
 *
 * NÃO há mais bypass cego por JWT role==="admin" em qualquer brand.
 * Donos de org usam role "org" (legado "admin" ainda aceito no requireRole).
 */

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { permissionsService } from "../services/permissions";
import { isPlatformPrincipal } from "../config/identity";

// ─── Helper: resolve brand_id da requisição ──────────────────────────────────

export function resolveRequestBrandId(req: AuthRequest): string | null {
  const fromHeader = String(req.headers["x-brand-id"] || "").trim();
  if (fromHeader) return fromHeader;

  const fromQuery = String((req.query as any)?.brand_id || "").trim();
  if (fromQuery) return fromQuery;

  const body = (req.body || {}) as Record<string, any>;
  const fromBody = String(body.brand_id || body.brandId || "").trim();
  if (fromBody) return fromBody;

  // Também aceita brand_id do JWT (gerentes de estoque têm brand_id no token)
  const fromToken = String(req.user?.brand_id || "").trim();
  if (fromToken) return fromToken;

  return null;
}

// ─── Middleware factory ───────────────────────────────────────────────────────

function resolveUserId(req: AuthRequest): string | undefined {
  return (
    (req.userId as string | undefined) ||
    (req.user?.userId as string | undefined) ||
    (req.user?.sub as string | undefined)
  );
}

function isMaster(req: AuthRequest): boolean {
  return isPlatformPrincipal({
    role: req.user?.role,
    account_kind: req.user?.account_kind,
    is_super_admin: req.user?.is_super_admin,
  });
}

export function requirePermission(permission: string) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      if (isMaster(req)) {
        next();
        return;
      }

      const brandId = resolveRequestBrandId(req);
      if (!brandId) {
        res.status(400).json({
          error: "x-brand-id é obrigatório para verificar permissões",
          code: "BRAND_REQUIRED",
        });
        return;
      }

      const allowed = await permissionsService.hasPermission(userId, brandId, permission);
      if (!allowed) {
        res.status(403).json({
          error: `Acesso negado — permissão '${permission}' necessária`,
          code: "PERMISSION_DENIED",
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}

export function requireAnyPermission(permissions: string[]) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      if (isMaster(req)) {
        next();
        return;
      }

      const brandId = resolveRequestBrandId(req);
      if (!brandId) {
        res.status(400).json({ error: "x-brand-id é obrigatório", code: "BRAND_REQUIRED" });
        return;
      }

      if (await permissionsService.isBrandOwner(userId, brandId)) {
        next();
        return;
      }

      const effectivePerms = await permissionsService.getUserEffectivePermissions(userId, brandId);
      const allowed = permissions.some((p) => effectivePerms.has(p));

      if (!allowed) {
        res.status(403).json({
          error: `Acesso negado — requer uma das permissões: ${permissions.join(", ")}`,
          code: "PERMISSION_DENIED",
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}

export function requireAllPermissions(permissions: string[]) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      if (isMaster(req)) {
        next();
        return;
      }

      const brandId = resolveRequestBrandId(req);
      if (!brandId) {
        res.status(400).json({ error: "x-brand-id é obrigatório", code: "BRAND_REQUIRED" });
        return;
      }

      if (await permissionsService.isBrandOwner(userId, brandId)) {
        next();
        return;
      }

      const effectivePerms = await permissionsService.getUserEffectivePermissions(userId, brandId);
      const missing = permissions.filter((p) => !effectivePerms.has(p));

      if (missing.length > 0) {
        res.status(403).json({
          error: `Acesso negado — permissões faltantes: ${missing.join(", ")}`,
          code: "PERMISSION_DENIED",
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}
