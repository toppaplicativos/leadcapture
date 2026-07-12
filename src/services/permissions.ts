/**
 * PermissionsService — gerencia perfis (roles), permissões e associações usuário-brand.
 *
 * Tabelas:
 *   permissions       — catálogo global de permissões (resource:action)
 *   roles             — perfis por brand (+ perfis de sistema)
 *   role_permissions  — relacionamento N:N
 *   user_brand_roles  — atribuição de perfil a um usuário dentro de uma brand
 */

import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string;
}

export interface Role {
  id: string;
  brand_id: string | null;
  name: string;
  slug: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permissions?: Permission[];
}

export interface UserBrandRole {
  id: string;
  user_id: string;
  brand_id: string;
  role_id: string;
  is_blocked: boolean;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  user_name?: string;
  user_email?: string;
  role_name?: string;
  role_slug?: string;
}

// ─── Catálogo de permissões do sistema ────────────────────────────────────────

export const SYSTEM_PERMISSIONS: Omit<Permission, "id">[] = [
  // Leads
  { resource: "leads", action: "read",   description: "Visualizar leads" },
  { resource: "leads", action: "write",  description: "Criar e editar leads" },
  { resource: "leads", action: "delete", description: "Excluir leads" },
  // Clientes
  { resource: "clients", action: "read",   description: "Visualizar clientes" },
  { resource: "clients", action: "write",  description: "Criar e editar clientes" },
  { resource: "clients", action: "delete", description: "Excluir clientes" },
  // Produtos
  { resource: "products", action: "read",   description: "Visualizar produtos" },
  { resource: "products", action: "write",  description: "Criar e editar produtos" },
  { resource: "products", action: "delete", description: "Excluir produtos" },
  // Categorias
  { resource: "categories", action: "read",   description: "Visualizar categorias" },
  { resource: "categories", action: "write",  description: "Criar e editar categorias" },
  { resource: "categories", action: "delete", description: "Excluir categorias" },
  // Tabelas de preço
  { resource: "pricetables", action: "read",   description: "Visualizar tabelas de preço" },
  { resource: "pricetables", action: "write",  description: "Criar e editar tabelas de preço" },
  { resource: "pricetables", action: "delete", description: "Excluir tabelas de preço" },
  // Estoque
  { resource: "inventory", action: "read",   description: "Visualizar estoque" },
  { resource: "inventory", action: "write",  description: "Ajustar estoque" },
  { resource: "inventory", action: "delete", description: "Excluir registros de estoque" },
  // Pedidos
  { resource: "orders", action: "read",   description: "Visualizar pedidos" },
  { resource: "orders", action: "write",  description: "Criar e editar pedidos" },
  { resource: "orders", action: "delete", description: "Excluir pedidos" },
  { resource: "orders", action: "refund", description: "Realizar reembolso de pedidos" },
  // Pagamentos
  { resource: "payments", action: "read",  description: "Visualizar pagamentos e status de conexão" },
  { resource: "payments", action: "write", description: "Conectar provedores, criar cobranças e gerenciar pagamentos" },
  { resource: "payments", action: "refund", description: "Estornar pagamentos" },
  { resource: "payments", action: "manage", description: "Administrar conexão de gateways (OAuth)" },
  // Catálogo / Storefront
  { resource: "storefront", action: "read",  description: "Visualizar configurações da loja" },
  { resource: "storefront", action: "write", description: "Editar configurações da loja" },
  // Campanhas
  { resource: "campaigns", action: "read",   description: "Visualizar campanhas" },
  { resource: "campaigns", action: "write",  description: "Criar e editar campanhas" },
  { resource: "campaigns", action: "delete", description: "Excluir campanhas" },
  { resource: "campaigns", action: "send",   description: "Disparar campanhas" },
  // Caixa de entrada
  { resource: "inbox", action: "read",  description: "Ler mensagens da caixa de entrada" },
  { resource: "inbox", action: "write", description: "Responder mensagens" },
  // Relatórios
  { resource: "reports", action: "read", description: "Visualizar relatórios e métricas" },
  // Configurações da brand
  { resource: "settings", action: "read",  description: "Visualizar configurações" },
  { resource: "settings", action: "write", description: "Editar configurações" },
  // Gerenciamento de usuários e perfis (admin da brand)
  { resource: "users", action: "read",   description: "Visualizar usuários da equipe" },
  { resource: "users", action: "write",  description: "Convidar e editar usuários" },
  { resource: "users", action: "delete", description: "Remover usuários da equipe" },
  { resource: "roles", action: "read",   description: "Visualizar perfis de acesso" },
  { resource: "roles", action: "write",  description: "Criar e editar perfis de acesso" },
  { resource: "roles", action: "delete", description: "Excluir perfis de acesso" },
];

// ─── Perfis padrão do sistema ─────────────────────────────────────────────────

type SystemRoleDef = {
  slug: string;
  name: string;
  description: string;
  permissions: string[]; // "resource:action"
};

export const SYSTEM_ROLE_DEFS: SystemRoleDef[] = [
  {
    slug: "admin",
    name: "Administrador",
    description: "Acesso total à brand — não pode ser excluído",
    permissions: ["*"], // marcador especial → todas as permissões
  },
  {
    slug: "gerente_estoque",
    name: "Gerente de Estoque",
    description: "Gerencia produtos, categorias, tabelas de preço e estoque",
    permissions: [
      "products:read", "products:write", "products:delete",
      "categories:read", "categories:write", "categories:delete",
      "pricetables:read", "pricetables:write",
      "inventory:read", "inventory:write",
      "reports:read",
    ],
  },
  {
    slug: "gerente_pedidos",
    name: "Gerente de Pedidos",
    description: "Gerencia pedidos, pagamentos e expedicão",
    permissions: [
      "orders:read", "orders:write", "orders:refund",
      "payments:read", "payments:write",
      "products:read",
      "clients:read",
      "reports:read",
    ],
  },
  {
    slug: "atendente",
    name: "Atendente",
    description: "Atende mensagens e gerencia clientes e leads",
    permissions: [
      "inbox:read", "inbox:write",
      "clients:read", "clients:write",
      "leads:read", "leads:write",
    ],
  },
  {
    slug: "viewer",
    name: "Somente Leitura",
    description: "Visualiza dados sem poder editar",
    permissions: [
      "leads:read", "clients:read", "products:read",
      "orders:read", "inventory:read", "payments:read",
      "campaigns:read", "storefront:read", "reports:read",
      "settings:read",
    ],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

let _schemaReady = false;

export class PermissionsService {
  // ── Schema ──────────────────────────────────────────────────────────────────

  async ensureSchema(): Promise<void> {
    if (_schemaReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id          VARCHAR(36) PRIMARY KEY,
        resource    VARCHAR(80)  NOT NULL,
        action      VARCHAR(80)  NOT NULL,
        description TEXT,
        UNIQUE (resource, action)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS roles (
        id          VARCHAR(36) PRIMARY KEY,
        brand_id    VARCHAR(36),
        name        VARCHAR(120)  NOT NULL,
        slug        VARCHAR(80)   NOT NULL,
        description TEXT,
        is_system   BOOLEAN       NOT NULL DEFAULT FALSE,
        is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id       VARCHAR(36) NOT NULL,
        permission_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (role_id, permission_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS user_brand_roles (
        id          VARCHAR(36) PRIMARY KEY,
        user_id     VARCHAR(36)  NOT NULL,
        brand_id    VARCHAR(36)  NOT NULL,
        role_id     VARCHAR(36)  NOT NULL,
        is_blocked  BOOLEAN      NOT NULL DEFAULT FALSE,
        assigned_by VARCHAR(36),
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, brand_id)
      )
    `);

    await this._seedSystemPermissions();
    _schemaReady = true;
  }

  // ── Seed permissões globais ───────────────────────────────────────────────

  private async _seedSystemPermissions(): Promise<void> {
    for (const p of SYSTEM_PERMISSIONS) {
      const existing = await queryOne<{ id: string }>(
        "SELECT id FROM permissions WHERE resource = ? AND action = ?",
        [p.resource, p.action]
      );
      if (!existing) {
        await query(
          "INSERT INTO permissions (id, resource, action, description) VALUES (?, ?, ?, ?)",
          [randomUUID(), p.resource, p.action, p.description]
        );
      }
    }
  }

  // ── Seed perfis padrão de uma brand ──────────────────────────────────────

  async seedDefaultRolesForBrand(brandId: string): Promise<void> {
    await this.ensureSchema();
    const allPerms = await this.listPermissions();
    const permMap: Record<string, string> = {};
    for (const p of allPerms) {
      permMap[`${p.resource}:${p.action}`] = p.id;
    }

    for (const def of SYSTEM_ROLE_DEFS) {
      const existing = await queryOne<{ id: string }>(
        "SELECT id FROM roles WHERE brand_id = ? AND slug = ?",
        [brandId, def.slug]
      );
      if (existing) continue;

      const roleId = randomUUID();
      await query(
        `INSERT INTO roles (id, brand_id, name, slug, description, is_system, is_active)
         VALUES (?, ?, ?, ?, ?, TRUE, TRUE)`,
        [roleId, brandId, def.name, def.slug, def.description]
      );

      // Resolve permissionIds
      let permIds: string[];
      if (def.permissions.includes("*")) {
        permIds = allPerms.map((p) => p.id);
      } else {
        permIds = def.permissions
          .map((key) => permMap[key])
          .filter(Boolean) as string[];
      }

      for (const permId of permIds) {
        await query(
          "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
          [roleId, permId]
        ).catch(() => {/* ignora duplicata */});
      }
    }
  }

  // ── Permissões ───────────────────────────────────────────────────────────

  async listPermissions(): Promise<Permission[]> {
    await this.ensureSchema();
    return query<Permission[]>(
      "SELECT id, resource, action, description FROM permissions ORDER BY resource, action"
    );
  }

  // ── Roles CRUD ───────────────────────────────────────────────────────────

  async listRoles(brandId: string): Promise<Role[]> {
    await this.ensureSchema();
    return query<Role[]>(
      "SELECT * FROM roles WHERE brand_id = ? ORDER BY is_system DESC, name ASC",
      [brandId]
    );
  }

  async getRole(roleId: string, brandId: string): Promise<Role | null> {
    await this.ensureSchema();
    const role = await queryOne<Role>(
      "SELECT * FROM roles WHERE id = ? AND brand_id = ?",
      [roleId, brandId]
    );
    if (!role) return null;
    role.permissions = await this.getRolePermissions(roleId);
    return role;
  }

  async createRole(
    brandId: string,
    data: { name: string; description?: string; permissionIds?: string[] },
    createdBy?: string
  ): Promise<Role> {
    await this.ensureSchema();
    const name = String(data.name || "").trim();
    if (!name) throw new Error("name é obrigatório");

    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const conflict = await queryOne<{ id: string }>(
      "SELECT id FROM roles WHERE brand_id = ? AND slug = ?",
      [brandId, slug]
    );
    if (conflict) throw new Error(`Já existe um perfil com o nome "${name}"`);

    const id = randomUUID();
    await query(
      `INSERT INTO roles (id, brand_id, name, slug, description, is_system, is_active)
       VALUES (?, ?, ?, ?, ?, FALSE, TRUE)`,
      [id, brandId, name, slug, data.description || ""]
    );

    if (data.permissionIds?.length) {
      await this._setRolePermissions(id, data.permissionIds);
    }

    return (await this.getRole(id, brandId))!;
  }

  async updateRole(
    roleId: string,
    brandId: string,
    data: { name?: string; description?: string }
  ): Promise<Role> {
    await this.ensureSchema();
    const role = await queryOne<Role>(
      "SELECT * FROM roles WHERE id = ? AND brand_id = ?",
      [roleId, brandId]
    );
    if (!role) throw new Error("Perfil não encontrado");
    if (role.is_system) throw new Error("Perfis de sistema não podem ser editados");

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new Error("name não pode ser vazio");
      updates.push("name = ?", "updated_at = CURRENT_TIMESTAMP");
      params.push(name);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      params.push(data.description);
    }

    if (updates.length) {
      params.push(roleId, brandId);
      await query(
        `UPDATE roles SET ${updates.join(", ")} WHERE id = ? AND brand_id = ?`,
        params
      );
    }

    return (await this.getRole(roleId, brandId))!;
  }

  async deleteRole(roleId: string, brandId: string): Promise<void> {
    await this.ensureSchema();
    const role = await queryOne<Role>(
      "SELECT * FROM roles WHERE id = ? AND brand_id = ?",
      [roleId, brandId]
    );
    if (!role) throw new Error("Perfil não encontrado");
    if (role.is_system) throw new Error("Perfis de sistema não podem ser excluídos");

    const inUse = await queryOne<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM user_brand_roles WHERE role_id = ?",
      [roleId]
    );
    if (inUse && inUse.count > 0) {
      throw new Error("Este perfil está em uso por usuários. Reatribua-os antes de excluir.");
    }

    await query("DELETE FROM role_permissions WHERE role_id = ?", [roleId]);
    await query("DELETE FROM roles WHERE id = ? AND brand_id = ?", [roleId, brandId]);
  }

  async toggleRoleActive(roleId: string, brandId: string): Promise<Role> {
    await this.ensureSchema();
    const role = await queryOne<Role>(
      "SELECT * FROM roles WHERE id = ? AND brand_id = ?",
      [roleId, brandId]
    );
    if (!role) throw new Error("Perfil não encontrado");
    if (role.is_system && role.slug === "admin") {
      throw new Error("O perfil Administrador não pode ser desativado");
    }

    await query(
      "UPDATE roles SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND brand_id = ?",
      [roleId, brandId]
    );
    return (await this.getRole(roleId, brandId))!;
  }

  // ── Permissões de um perfil ─────────────────────────────────────────────

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    return query<Permission[]>(
      `SELECT p.id, p.resource, p.action, p.description
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?
       ORDER BY p.resource, p.action`,
      [roleId]
    );
  }

  private async _setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await query("DELETE FROM role_permissions WHERE role_id = ?", [roleId]);
    for (const permId of permissionIds) {
      await query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
        [roleId, permId]
      ).catch(() => {});
    }
  }

  async setRolePermissions(
    roleId: string,
    brandId: string,
    permissionIds: string[]
  ): Promise<Role> {
    await this.ensureSchema();
    const role = await queryOne<Role>(
      "SELECT * FROM roles WHERE id = ? AND brand_id = ?",
      [roleId, brandId]
    );
    if (!role) throw new Error("Perfil não encontrado");

    await this._setRolePermissions(roleId, permissionIds);
    return (await this.getRole(roleId, brandId))!;
  }

  // ── Usuários na brand ───────────────────────────────────────────────────

  async listBrandUsers(brandId: string): Promise<UserBrandRole[]> {
    await this.ensureSchema();
    return query<UserBrandRole[]>(
      `SELECT ubr.id, ubr.user_id, ubr.brand_id, ubr.role_id,
              ubr.is_blocked, ubr.assigned_by, ubr.created_at, ubr.updated_at,
              u.name  AS user_name,
              u.email AS user_email,
              r.name  AS role_name,
              r.slug  AS role_slug
       FROM user_brand_roles ubr
       INNER JOIN users u ON u.id  = ubr.user_id
       INNER JOIN roles r ON r.id  = ubr.role_id
       WHERE ubr.brand_id = ?
       ORDER BY ubr.created_at DESC`,
      [brandId]
    );
  }

  async assignUserRole(
    userId: string,
    brandId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<UserBrandRole> {
    await this.ensureSchema();

    const user = await queryOne<{ id: string }>(
      "SELECT id FROM users WHERE id = ?",
      [userId]
    );
    if (!user) throw new Error("Usuário não encontrado");

    const role = await queryOne<Role>(
      "SELECT * FROM roles WHERE id = ? AND brand_id = ? AND is_active = TRUE",
      [roleId, brandId]
    );
    if (!role) throw new Error("Perfil não encontrado ou inativo");

    const existing = await queryOne<UserBrandRole>(
      "SELECT * FROM user_brand_roles WHERE user_id = ? AND brand_id = ?",
      [userId, brandId]
    );

    if (existing) {
      await query(
        `UPDATE user_brand_roles
         SET role_id = ?, assigned_by = ?, is_blocked = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND brand_id = ?`,
        [roleId, assignedBy || null, userId, brandId]
      );
    } else {
      await query(
        `INSERT INTO user_brand_roles (id, user_id, brand_id, role_id, is_blocked, assigned_by)
         VALUES (?, ?, ?, ?, FALSE, ?)`,
        [randomUUID(), userId, brandId, roleId, assignedBy || null]
      );
    }

    const result = await queryOne<UserBrandRole>(
      `SELECT ubr.*, u.name AS user_name, u.email AS user_email, r.name AS role_name, r.slug AS role_slug
       FROM user_brand_roles ubr
       INNER JOIN users u ON u.id = ubr.user_id
       INNER JOIN roles r ON r.id = ubr.role_id
       WHERE ubr.user_id = ? AND ubr.brand_id = ?`,
      [userId, brandId]
    );
    return result!;
  }

  async removeUserRole(userId: string, brandId: string): Promise<void> {
    await this.ensureSchema();
    await query(
      "DELETE FROM user_brand_roles WHERE user_id = ? AND brand_id = ?",
      [userId, brandId]
    );
  }

  async setUserBlocked(userId: string, brandId: string, blocked: boolean): Promise<UserBrandRole> {
    await this.ensureSchema();
    const existing = await queryOne<UserBrandRole>(
      "SELECT * FROM user_brand_roles WHERE user_id = ? AND brand_id = ?",
      [userId, brandId]
    );
    if (!existing) throw new Error("Usuário não associado a esta brand");

    await query(
      "UPDATE user_brand_roles SET is_blocked = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND brand_id = ?",
      [blocked, userId, brandId]
    );

    const result = await queryOne<UserBrandRole>(
      `SELECT ubr.*, u.name AS user_name, u.email AS user_email, r.name AS role_name, r.slug AS role_slug
       FROM user_brand_roles ubr
       INNER JOIN users u ON u.id = ubr.user_id
       INNER JOIN roles r ON r.id = ubr.role_id
       WHERE ubr.user_id = ? AND ubr.brand_id = ?`,
      [userId, brandId]
    );
    return result!;
  }

  // ── Verificação de permissão ────────────────────────────────────────────

  /**
   * Retorna as permissões efetivas de um usuário em uma brand.
   * Cache em memória de vida curta (TTL 60s) para evitar N queries por request.
   */
  private _permCache = new Map<string, { perms: Set<string>; exp: number }>();

  async getUserEffectivePermissions(userId: string, brandId: string): Promise<Set<string>> {
    const cacheKey = `${userId}:${brandId}`;
    const cached = this._permCache.get(cacheKey);
    if (cached && cached.exp > Date.now()) return cached.perms;

    await this.ensureSchema();

    const assignment = await queryOne<{ role_id: string; is_blocked: boolean }>(
      "SELECT role_id, is_blocked FROM user_brand_roles WHERE user_id = ? AND brand_id = ?",
      [userId, brandId]
    );

    if (!assignment || assignment.is_blocked) {
      const perms = new Set<string>();
      this._permCache.set(cacheKey, { perms, exp: Date.now() + 60_000 });
      return perms;
    }

    const permissions = await this.getRolePermissions(assignment.role_id);
    const perms = new Set(permissions.map((p) => `${p.resource}:${p.action}`));

    this._permCache.set(cacheKey, { perms, exp: Date.now() + 60_000 });
    return perms;
  }

  /** Invalida o cache de um usuário (chamar após reatribuição de perfil) */
  invalidateUserCache(userId: string, brandId?: string): void {
    if (brandId) {
      this._permCache.delete(`${userId}:${brandId}`);
    } else {
      for (const key of this._permCache.keys()) {
        if (key.startsWith(`${userId}:`)) this._permCache.delete(key);
      }
    }
  }

  async hasPermission(userId: string, brandId: string, permission: string): Promise<boolean> {
    /* Brand owner always has full access (even without explicit role row). */
    try {
      if (await this.isBrandOwner(userId, brandId)) return true;
    } catch {
      /* ignore */
    }
    const perms = await this.getUserEffectivePermissions(userId, brandId);
    return perms.has(permission);
  }

  async isBrandOwner(userId: string, brandId: string): Promise<boolean> {
    const owner = await queryOne<{ user_id: string }>(
      "SELECT user_id FROM brand_units WHERE id = ? LIMIT 1",
      [brandId],
    );
    return Boolean(owner && String(owner.user_id) === String(userId));
  }

  /**
   * After an organization (brand_units) is created, seed system roles and
   * assign the owner to the brand-level "admin" RBAC profile.
   */
  async ensureOrgOwnerMembership(ownerUserId: string, brandId: string): Promise<void> {
    await this.ensureSchema();
    await this.seedDefaultRolesForBrand(brandId);
    const adminRole = await queryOne<{ id: string }>(
      `SELECT id FROM roles WHERE brand_id = ? AND slug = 'admin' AND is_active = TRUE LIMIT 1`,
      [brandId],
    );
    if (!adminRole?.id) {
      logger.warn(`[permissions] no admin role after seed for brand ${brandId}`);
      return;
    }
    await this.assignUserRole(ownerUserId, brandId, adminRole.id, ownerUserId);
    this.invalidateUserCache(ownerUserId, brandId);
  }
}

export const permissionsService = new PermissionsService();
