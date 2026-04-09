/**
 * Middleware de autorização baseado em permissões granulares.
 *
 * Uso:
 *   router.get("/rota", authMiddleware, requirePermission("orders:read"), handler)
 *
 * Lógica de bypass (nenhuma verificação no banco):
 *   - JWT role === "admin"  →  dono da plataforma, acesso irrestrito
 *
 * Caso contrário, consulta user_brand_roles + role_permissions para decidir.
 */

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { permissionsService } from "../services/permissions";

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

/**
 * Retorna um middleware Express que verifica se o usuário autenticado
 * possui a permissão requerida para a brand em contexto.
 *
 * @param permission  String no formato "resource:action" (ex.: "orders:read")
 */
export function requirePermission(permission: string) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId as string | undefined;
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      // Dono da plataforma → acesso irrestrito
      if (req.user?.role === "admin") {
        next();
        return;
      }

      const brandId = resolveRequestBrandId(req);
      if (!brandId) {
        res.status(400).json({
          error: "x-brand-id é obrigatório para verificar permissões",
        });
        return;
      }

      const allowed = await permissionsService.hasPermission(userId, brandId, permission);
      if (!allowed) {
        res.status(403).json({
          error: `Acesso negado — permissão '${permission}' necessária`,
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}

/**
 * Retorna um middleware que exige qualquer uma das permissões listadas (OR).
 *
 * @param permissions  Array de "resource:action"
 */
export function requireAnyPermission(permissions: string[]) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId as string | undefined;
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      if (req.user?.role === "admin") {
        next();
        return;
      }

      const brandId = resolveRequestBrandId(req);
      if (!brandId) {
        res.status(400).json({ error: "x-brand-id é obrigatório" });
        return;
      }

      const effectivePerms = await permissionsService.getUserEffectivePermissions(userId, brandId);
      const allowed = permissions.some((p) => effectivePerms.has(p));

      if (!allowed) {
        res.status(403).json({
          error: `Acesso negado — requer uma das permissões: ${permissions.join(", ")}`,
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}

/**
 * Retorna um middleware que exige TODAS as permissões listadas (AND).
 *
 * @param permissions  Array de "resource:action"
 */
export function requireAllPermissions(permissions: string[]) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId as string | undefined;
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      if (req.user?.role === "admin") {
        next();
        return;
      }

      const brandId = resolveRequestBrandId(req);
      if (!brandId) {
        res.status(400).json({ error: "x-brand-id é obrigatório" });
        return;
      }

      const effectivePerms = await permissionsService.getUserEffectivePermissions(userId, brandId);
      const missing = permissions.filter((p) => !effectivePerms.has(p));

      if (missing.length > 0) {
        res.status(403).json({
          error: `Acesso negado — permissões faltantes: ${missing.join(", ")}`,
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}
