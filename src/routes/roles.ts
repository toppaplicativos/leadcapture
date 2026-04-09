/**
 * Rotas de gerenciamento de perfis (roles) e permissões.
 *
 * Todas as rotas exigem autenticação + contexto de brand (x-brand-id header ou body).
 * Funções administrativas sobre perfis exigem roles:write / roles:delete.
 * O owner (JWT role=admin) sempre passa.
 *
 * Prefixo registrado em index.ts: /api/roles
 */

import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { permissionsService } from "../services/permissions";
import { requirePermission, resolveRequestBrandId } from "../middleware/permissions";

const router = Router();

// Aplica autenticação em todas as rotas deste router
router.use(authMiddleware);

// ─── Helper ──────────────────────────────────────────────────────────────────

function resolveBrand(req: AuthRequest): string | null {
  return resolveRequestBrandId(req);
}

function isOwnerAdmin(req: AuthRequest): boolean {
  // Usuário dono da plataforma (JWT role = "admin") tem acesso irrestrito
  return req.user?.role === "admin";
}

// ─── Permissões (catálogo global) ────────────────────────────────────────────

/**
 * GET /api/roles/permissions
 * Lista todas as permissões disponíveis no sistema.
 */
router.get("/permissions", async (req: AuthRequest, res: Response) => {
  try {
    const permissions = await permissionsService.listPermissions();
    res.json({ success: true, permissions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Roles CRUD ──────────────────────────────────────────────────────────────

/**
 * GET /api/roles
 * Lista perfis de uma brand.
 * Requer: roles:read  (ou admin JWT)
 */
router.get(
  "/",
  requirePermission("roles:read"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const roles = await permissionsService.listRoles(brandId);
      res.json({ success: true, roles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/roles
 * Cria perfil customizado.
 * Requer: roles:write
 */
router.post(
  "/",
  requirePermission("roles:write"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const { name, description, permission_ids } = req.body || {};
      const role = await permissionsService.createRole(
        brandId,
        { name, description, permissionIds: permission_ids },
        req.user?.userId as string
      );
      res.status(201).json({ success: true, role });
    } catch (err: any) {
      const status = err.message?.includes("Já existe") ? 409 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * GET /api/roles/seed
 * (Re)inicializa os perfis padrão de uma brand.
 * Útil para onboarding de novas brands ou rollback.
 * Requer: admin JWT ou roles:write
 */
router.post(
  "/seed",
  requirePermission("roles:write"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      await permissionsService.seedDefaultRolesForBrand(brandId);
      const roles = await permissionsService.listRoles(brandId);
      res.json({ success: true, message: "Perfis padrão criados/atualizados", roles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /api/roles/:id
 * Detalhe de um perfil (com permissões).
 * Requer: roles:read
 */
router.get(
  "/:id",
  requirePermission("roles:read"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const role = await permissionsService.getRole(String(req.params.id), brandId);
      if (!role) return res.status(404).json({ error: "Perfil não encontrado" });

      res.json({ success: true, role });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PUT /api/roles/:id
 * Atualiza nome/descrição de um perfil customizado.
 * Requer: roles:write
 */
router.put(
  "/:id",
  requirePermission("roles:write"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const { name, description } = req.body || {};
      const role = await permissionsService.updateRole(String(req.params.id), brandId, {
        name,
        description,
      });
      res.json({ success: true, role });
    } catch (err: any) {
      const status = err.message?.includes("não encontrado") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/roles/:id
 * Exclui perfil customizado (não pode ter usuários).
 * Requer: roles:delete
 */
router.delete(
  "/:id",
  requirePermission("roles:delete"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      await permissionsService.deleteRole(String(req.params.id), brandId);
      res.json({ success: true, message: "Perfil excluído" });
    } catch (err: any) {
      const status = err.message?.includes("não encontrado") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * PATCH /api/roles/:id/toggle
 * Ativa ou desativa um perfil.
 * Requer: roles:write
 */
router.patch(
  "/:id/toggle",
  requirePermission("roles:write"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const role = await permissionsService.toggleRoleActive(String(req.params.id), brandId);
      res.json({ success: true, role });
    } catch (err: any) {
      const status = err.message?.includes("não encontrado") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// ─── Permissões de um perfil ─────────────────────────────────────────────────

/**
 * GET /api/roles/:id/permissions
 * Lista permissões vinculadas ao perfil.
 * Requer: roles:read
 */
router.get(
  "/:id/permissions",
  requirePermission("roles:read"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const role = await permissionsService.getRole(String(req.params.id), brandId);
      if (!role) return res.status(404).json({ error: "Perfil não encontrado" });

      res.json({ success: true, permissions: role.permissions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PUT /api/roles/:id/permissions
 * Substitui conjunto de permissões do perfil.
 * Body: { permission_ids: string[] }
 * Requer: roles:write
 */
router.put(
  "/:id/permissions",
  requirePermission("roles:write"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const { permission_ids } = req.body || {};
      if (!Array.isArray(permission_ids)) {
        return res.status(400).json({ error: "permission_ids deve ser um array de strings" });
      }

      const role = await permissionsService.setRolePermissions(
        String(req.params.id),
        brandId,
        permission_ids
      );
      res.json({ success: true, role });
    } catch (err: any) {
      const status = err.message?.includes("não encontrado") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// ─── Usuários da brand ───────────────────────────────────────────────────────

/**
 * GET /api/roles/team/users
 * Lista todos os usuários com perfis atribuídos na brand.
 * Requer: users:read
 */
router.get(
  "/team/users",
  requirePermission("users:read"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const users = await permissionsService.listBrandUsers(brandId);
      res.json({ success: true, users });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/roles/team/users
 * Atribui perfil a um usuário na brand.
 * Body: { user_id, role_id }
 * Requer: users:write
 */
router.post(
  "/team/users",
  requirePermission("users:write"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const { user_id, role_id } = req.body || {};
      if (!user_id || !role_id) {
        return res.status(400).json({ error: "user_id e role_id são obrigatórios" });
      }

      const result = await permissionsService.assignUserRole(
        user_id,
        brandId,
        role_id,
        req.user?.userId as string
      );

      permissionsService.invalidateUserCache(user_id, brandId);

      res.status(201).json({ success: true, assignment: result });
    } catch (err: any) {
      const status = err.message?.includes("não encontrado") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/roles/team/users/:userId
 * Remove perfil de um usuário da brand.
 * Requer: users:delete
 */
router.delete(
  "/team/users/:userId",
  requirePermission("users:delete"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      await permissionsService.removeUserRole(String(req.params.userId), brandId);
      permissionsService.invalidateUserCache(String(req.params.userId), brandId);

      res.json({ success: true, message: "Usuário removido da equipe" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PATCH /api/roles/team/users/:userId/block
 * Bloqueia ou desbloqueia um usuário na brand.
 * Body: { blocked: boolean }
 * Requer: users:write
 */
router.patch(
  "/team/users/:userId/block",
  requirePermission("users:write"),
  async (req: AuthRequest, res: Response) => {
    try {
      const brandId = resolveBrand(req);
      if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

      const blocked =
        req.body?.blocked === true || req.body?.blocked === "true" || req.body?.blocked === 1;

      const result = await permissionsService.setUserBlocked(
        String(req.params.userId),
        brandId,
        blocked
      );

      permissionsService.invalidateUserCache(String(req.params.userId), brandId);

      res.json({
        success: true,
        message: blocked ? "Usuário bloqueado" : "Usuário desbloqueado",
        assignment: result,
      });
    } catch (err: any) {
      const status = err.message?.includes("não associado") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * GET /api/roles/team/users/me
 * Retorna o perfil e permissões efetivas do usuário autenticado em uma brand.
 */
router.get("/team/users/me", async (req: AuthRequest, res: Response) => {
  try {
    const brandId = resolveBrand(req);
    if (!brandId) return res.status(400).json({ error: "x-brand-id é obrigatório" });

    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Não autenticado" });

    const perms = await permissionsService.getUserEffectivePermissions(userId, brandId);
    res.json({
      success: true,
      user_id: userId,
      brand_id: brandId,
      permissions: Array.from(perms),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
