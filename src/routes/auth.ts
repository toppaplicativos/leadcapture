import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { UsersService } from "../services/users";
import { AffiliatesService } from "../services/affiliates";
import { affiliateGlobalService } from "../services/affiliateGlobal";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { config } from "../config";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

const router = Router();
const usersService = new UsersService();
const affiliatesService = new AffiliatesService();
let stockSchemaReady = false;
let affiliateSchemaReady = false;

type StockCredentialRow = {
  id: string;
  owner_user_id: string;
  manager_user_id: string;
  brand_id: string;
  email: string;
  credential_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AffiliateCredentialRow = {
  id: string;
  owner_user_id: string;
  affiliate_user_id: string;
  brand_id: string;
  email: string;
  credential_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BrandLookupRow = {
  id: string;
  user_id: string;
  slug: string | null;
  name: string;
  logo_url: string | null;
};

async function ensureStockCredentialSchema(): Promise<void> {
  if (stockSchemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS stock_app_credentials (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      manager_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      email VARCHAR(190) NOT NULL,
      credential_type VARCHAR(40) NOT NULL DEFAULT 'estoque',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_stock_access_brand_email (brand_id, email),
      UNIQUE KEY uq_stock_access_brand_manager (brand_id, manager_user_id)
    )
  `);

  stockSchemaReady = true;
}

async function ensureAffiliateCredentialSchema(): Promise<void> {
  if (affiliateSchemaReady) return;
  await affiliatesService.ensureSchema();
  affiliateSchemaReady = true;
}

function resolveRequestedBrandId(req: Request): string {
  return String(
    req.headers["x-brand-id"] ||
      req.body?.brand_id ||
      req.body?.brand ||
      req.body?.brandId ||
      req.query?.brand_id ||
      req.query?.brand ||
      ""
  )
    .trim();
}

async function resolveBrandReference(
  brandRef: string,
  ownerUserId?: string | null
): Promise<BrandLookupRow | null> {
  const normalized = String(brandRef || "").trim();
  if (!normalized) return null;

  const byId = await queryOne<BrandLookupRow>(
    `SELECT id, user_id, slug, name, logo_url
     FROM brand_units
     WHERE id = ?
       ${ownerUserId ? "AND user_id = ?" : ""}
     LIMIT 1`,
    ownerUserId ? [normalized, String(ownerUserId)] : [normalized]
  );
  if (byId) return byId;

  const bySlug = await queryOne<BrandLookupRow>(
    `SELECT id, user_id, slug, name, logo_url
     FROM brand_units
     WHERE LOWER(COALESCE(slug, '')) = LOWER(?)
       ${ownerUserId ? "AND user_id = ?" : ""}
     LIMIT 1`,
    ownerUserId ? [normalized, String(ownerUserId)] : [normalized]
  );
  if (bySlug) return bySlug;

  // Fallback: storefront public slug (ex.: alhopronto) → brand vinculada
  const byStoreSlug = await queryOne<BrandLookupRow>(
    `SELECT b.id, b.user_id, COALESCE(NULLIF(TRIM(b.slug), ''), s.slug) AS slug, b.name, b.logo_url
     FROM storefront_stores s
     INNER JOIN brand_units b ON b.id = s.brand_id
     WHERE LOWER(s.slug) = LOWER(?)
       ${ownerUserId ? "AND s.owner_user_id = ?" : ""}
     ORDER BY (s.status = 'active') DESC, s.updated_at DESC
     LIMIT 1`,
    ownerUserId ? [normalized, String(ownerUserId)] : [normalized]
  );

  return byStoreSlug || null;
}

function signStockToken(input: {
  managerUserId: string;
  email: string;
  ownerUserId: string;
  brandId: string;
}): string {
  return jwt.sign(
    {
      userId: input.managerUserId,
      email: input.email,
      role: "manager",
      account_kind: "staff",
      credential_type: "estoque",
      owner_user_id: input.ownerUserId,
      brand_id: input.brandId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

function signAffiliateToken(input: {
  affiliateUserId: string;
  email: string;
  ownerUserId: string;
  brandId: string;
  credentialId: string;
}): string {
  return jwt.sign(
    {
      userId: input.affiliateUserId,
      email: input.email,
      role: "affiliate",
      account_kind: "affiliate",
      credential_type: "afiliado",
      owner_user_id: input.ownerUserId,
      brand_id: input.brandId,
      credential_id: input.credentialId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

function signPartnersGlobalToken(input: {
  affiliateUserId: string;
  email: string;
}): string {
  return jwt.sign(
    {
      userId: input.affiliateUserId,
      email: input.email,
      role: "affiliate",
      account_kind: "affiliate",
      credential_type: "parceiro",
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

// POST /api/auth/register
// Creates an ORGANIZATION principal (account_kind=org). Client cannot self-assign admin/platform.
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, brand_name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password and name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Force org principal — ignore body.role / body.account_kind (privilege escalation)
    const user = await usersService.create({
      email,
      password,
      name,
      phone,
      accountKind: "org",
      role: "org",
    });
    const token = usersService.signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      account_kind: user.account_kind,
      is_super_admin: Boolean((user as any).is_super_admin),
    });

    // Create default organization (brand_units) + RBAC seed + owner membership
    const brandNameFinal = String(brand_name || name || "").trim();
    if (brandNameFinal) {
      try {
        const { BrandUnitsService } = await import("../services/brandUnits");
        const brands = new BrandUnitsService();
        const brand = await brands.create(user.id, { name: brandNameFinal, is_default: true });
        logger.info(`Organization created for new user: ${brandNameFinal} (ID: ${brand.id})`);
      } catch (brandErr: any) {
        logger.warn(`Org brand create on register failed: ${brandErr?.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: "Organization registered successfully",
      token,
      user,
    });
  } catch (error: any) {
    logger.error(`Registration error: ${error.message}`);
    if (error.message === "Email already registered") {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await usersService.login({ email, password });

    res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    logger.error(`Login error: ${error.message}`);
    if (error.message === "Invalid credentials") {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me - Get current user profile
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await usersService.getById(req.user!.userId as any);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/me - Update current user profile (sem senha — use /me/password)
router.put("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone } = req.body;
    const user = await usersService.updateUser(req.user!.userId as any, {
      name, email, phone,
    });
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao atualizar perfil" });
  }
});

// POST /api/auth/me/password - Redefinir senha (exige senha atual)
router.post("/me/password", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const current_password = String(req.body?.current_password || req.body?.currentPassword || "");
    const new_password = String(req.body?.new_password || req.body?.newPassword || req.body?.password || "");
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias" });
    }
    await usersService.changePassword(String(req.user!.userId), current_password, new_password);
    res.json({ success: true, message: "Senha atualizada" });
  } catch (error: any) {
    const msg = error?.message || "Falha ao redefinir senha";
    const status = /incorreta|não encontrado/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// GET /api/auth/users - List all platform users (Admin Master only)
router.get("/users", authMiddleware, requireRole(["admin"]), async (req: AuthRequest, res: Response) => {
  try {
    // Platform-wide user listing is master-only (not org owners)
    if (!req.user?.is_super_admin) {
      return res.status(403).json({
        error: "Listagem global de usuários restrita ao Admin Master",
        code: "MASTER_ONLY",
      });
    }
    const users = await usersService.getAll();
    res.json({ success: true, users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/users/:id - Update user (admin only)
router.put("/users/:id", authMiddleware, requireRole(["admin"]), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, role, password } = req.body;
    const user = await usersService.updateUser(req.params.id as string, {
      name, email, phone, role, password,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/auth/users/:id - Deactivate user (admin only)
router.delete("/users/:id", authMiddleware, requireRole(["admin"]), async (req: AuthRequest, res: Response) => {
  try {
    const success = await usersService.deactivate(req.params.id as string);
    if (!success) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, message: "User deactivated" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/stock-access", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureStockCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });

    const brandRef = resolveRequestedBrandId(req);
    if (!brandRef) return res.status(400).json({ error: "brand é obrigatório" });

    const brand = await resolveBrandReference(brandRef, ownerUserId);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada para este usuário" });
    const brandId = String(brand.id);

    const rows = await query<any[]>(
      `SELECT s.id, s.brand_id, s.email, s.credential_type, s.is_active, s.created_at, s.updated_at,
              u.id AS manager_user_id, u.name AS manager_name, u.phone AS manager_phone,
              b.slug AS brand_slug, b.name AS brand_name, b.logo_url AS brand_logo_url
       FROM stock_app_credentials s
       INNER JOIN users u ON u.id = s.manager_user_id
       INNER JOIN brand_units b ON b.id = s.brand_id
       WHERE s.owner_user_id = ? AND s.brand_id = ?
       ORDER BY s.created_at DESC`,
      [ownerUserId, brandId]
    );

    res.json({
      success: true,
      credentials: rows.map((item) => ({
        id: item.id,
        brand_id: item.brand_id,
        email: item.email,
        credential_type: item.credential_type || "estoque",
        is_active: !!item.is_active,
        brand_slug: String(item.brand_slug || "").trim() || null,
        brand_name: String(item.brand_name || "").trim() || null,
        brand_logo_url: String(item.brand_logo_url || "").trim() || null,
        manager_user_id: item.manager_user_id,
        manager_name: item.manager_name,
        manager_phone: item.manager_phone || null,
        created_at: item.created_at,
        updated_at: item.updated_at,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list stock credentials" });
  }
});

router.post("/stock-access", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureStockCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });

    const brandRef = resolveRequestedBrandId(req);
    if (!brandRef) return res.status(400).json({ error: "brand é obrigatório" });

    const brand = await resolveBrandReference(brandRef, ownerUserId);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada para este usuário" });
    const brandId = String(brand.id);

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const name = String(req.body?.name || "").trim() || "Gerente de Estoque";
    const phone = String(req.body?.phone || "").trim() || null;

    if (!email || !password) {
      return res.status(400).json({ error: "email e password são obrigatórios" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "password deve ter pelo menos 6 caracteres" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let manager = await queryOne<any>(
      `SELECT id, email, role, account_kind, COALESCE(is_super_admin, false) AS is_super_admin
       FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [email]
    );

    let managerUserId = String(manager?.id || "").trim();
    if (!managerUserId) {
      managerUserId = randomUUID();
      await query(
        `INSERT INTO users (id, email, password_hash, name, phone, role, account_kind, is_active)
         VALUES (?, ?, ?, ?, ?, 'manager', 'staff', TRUE)`,
        [managerUserId, email, passwordHash, name, phone]
      );
    } else {
      // Never demote org owners / platform masters to stock manager
      const protectedPrincipal = await usersService.isProtectedPrincipal(managerUserId);
      if (protectedPrincipal) {
        return res.status(409).json({
          error:
            "Este e-mail já pertence a uma Organização ou ao Admin Master. Use outro e-mail para o gerente de estoque.",
          code: "PRINCIPAL_PROTECTED",
        });
      }
      await query(
        `UPDATE users
         SET email = ?, password_hash = ?, name = ?, phone = ?, role = 'manager', account_kind = 'staff', is_active = TRUE, updated_at = NOW()
         WHERE id = ?`,
        [email, passwordHash, name, phone, managerUserId]
      );
    }

    const existing = await queryOne<StockCredentialRow>(
      `SELECT * FROM stock_app_credentials
       WHERE owner_user_id = ? AND brand_id = ? AND manager_user_id = ?
       LIMIT 1`,
      [ownerUserId, brandId, managerUserId]
    );

    if (existing) {
      await query(
        `UPDATE stock_app_credentials
         SET email = ?, credential_type = 'estoque', is_active = TRUE, updated_at = NOW()
         WHERE id = ?`,
        [email, existing.id]
      );
    } else {
      await query(
        `INSERT INTO stock_app_credentials
         (id, owner_user_id, manager_user_id, brand_id, email, credential_type, is_active)
         VALUES (?, ?, ?, ?, ?, 'estoque', TRUE)`,
        [randomUUID(), ownerUserId, managerUserId, brandId, email]
      );
    }

    const loginRef = String(brand.slug || "").trim() || brandId;
    const loginUrl = loginRef
      ? `/app-estoque/${encodeURIComponent(loginRef)}`
      : `/app-estoque?brand=${encodeURIComponent(brandId)}`;

    res.status(201).json({
      success: true,
      credential: {
        email,
        credential_type: "estoque",
        brand_id: brandId,
        brand_slug: String(brand.slug || "").trim() || null,
        brand_name: String(brand.name || "").trim() || null,
        brand_logo_url: String(brand.logo_url || "").trim() || null,
        manager_user_id: managerUserId,
        login_url: loginUrl,
      },
      message: "Acesso ao app de estoque criado/atualizado com sucesso",
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Já existe um acesso de estoque para este e-mail nesta brand" });
    }
    res.status(500).json({ error: message || "Failed to create stock credential" });
  }
});

router.patch("/stock-access/:id/deactivate", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureStockCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id inválido" });

    await query(
      `UPDATE stock_app_credentials
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = ? AND owner_user_id = ?`,
      [id, ownerUserId]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to deactivate stock credential" });
  }
});

router.patch("/stock-access/:id/reactivate", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureStockCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id inválido" });
    await query(
      `UPDATE stock_app_credentials SET is_active = TRUE, updated_at = NOW()
       WHERE id = ? AND owner_user_id = ?`,
      [id, ownerUserId]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to reactivate stock credential" });
  }
});

router.patch("/stock-access/:id", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureStockCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id inválido" });

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : null;
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : null;
    const email = req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : null;

    // Find the credential + manager user
    const cred = await queryOne<any>(
      `SELECT s.id, s.manager_user_id, s.email FROM stock_app_credentials s
       WHERE s.id = ? AND s.owner_user_id = ? LIMIT 1`,
      [id, ownerUserId]
    );
    if (!cred) return res.status(404).json({ error: "Acesso não encontrado" });

    // Update users table (name/phone)
    if (name !== null || phone !== null) {
      const fields: string[] = [];
      const values: any[] = [];
      if (name !== null) { fields.push("name = ?"); values.push(name); }
      if (phone !== null) { fields.push("phone = ?"); values.push(phone); }
      if (fields.length > 0) {
        values.push(String(cred.manager_user_id));
        await query(`UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`, values);
      }
    }

    // Update email (in both tables)
    if (email !== null && email !== String(cred.email || "").toLowerCase()) {
      // Check if email is already in use
      const existing = await queryOne<any>(
        `SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1`,
        [email, String(cred.manager_user_id)]
      );
      if (existing) return res.status(409).json({ error: "Email já em uso por outro usuário" });
      await query(`UPDATE users SET email = ?, updated_at = NOW() WHERE id = ?`, [email, String(cred.manager_user_id)]);
      await query(`UPDATE stock_app_credentials SET email = ?, updated_at = NOW() WHERE id = ?`, [email, id]);
    } else {
      await query(`UPDATE stock_app_credentials SET updated_at = NOW() WHERE id = ?`, [id]);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update stock credential" });
  }
});

router.patch("/stock-access/:id/password", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureStockCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });
    const id = String(req.params.id || "").trim();
    const password = String(req.body?.password || "").trim();
    if (!id) return res.status(400).json({ error: "id inválido" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres" });

    const cred = await queryOne<any>(
      `SELECT manager_user_id FROM stock_app_credentials WHERE id = ? AND owner_user_id = ? LIMIT 1`,
      [id, ownerUserId]
    );
    if (!cred) return res.status(404).json({ error: "Acesso não encontrado" });

    const password_hash = await bcrypt.hash(password, 10);
    await query(`UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?`, [password_hash, String(cred.manager_user_id)]);
    await query(`UPDATE stock_app_credentials SET updated_at = NOW() WHERE id = ?`, [id]);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update password" });
  }
});

router.delete("/stock-access/:id", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureStockCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id inválido" });
    await query(
      `DELETE FROM stock_app_credentials WHERE id = ? AND owner_user_id = ?`,
      [id, ownerUserId]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to delete stock credential" });
  }
});

router.get("/stock-brand", async (req: Request, res: Response) => {
  try {
    const brandRef = resolveRequestedBrandId(req);
    if (!brandRef) return res.status(400).json({ error: "brand é obrigatório" });

    const brand = await resolveBrandReference(brandRef, null);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada" });

    res.json({
      success: true,
      brand: {
        id: String(brand.id),
        slug: String(brand.slug || "").trim() || null,
        name: String(brand.name || "").trim() || null,
        logo_url: String(brand.logo_url || "").trim() || null,
        primary_color: String((brand as any).primary_color || "").trim() || null,
        secondary_color: String((brand as any).secondary_color || "").trim() || null,
        slogan: String((brand as any).slogan || "").trim() || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to resolve brand" });
  }
});

router.post("/stock-login", async (req: Request, res: Response) => {
  try {
    await ensureStockCredentialSchema();

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const brandRef = String(req.body?.brand_id || req.body?.brandId || req.body?.brand || "").trim();

    if (!email || !password || !brandRef) {
      return res.status(400).json({ error: "email, password e brand são obrigatórios" });
    }

    const brand = await resolveBrandReference(brandRef, null);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada" });
    const brandId = String(brand.id || "").trim();

    const user = await queryOne<any>(
      `SELECT id, email, password_hash, name, role, is_active
       FROM users
       WHERE LOWER(email) = LOWER(?) AND is_active = TRUE
       LIMIT 1`,
      [email]
    );

    if (!user) return res.status(401).json({ error: "Credenciais inválidas" });

    const isValidPassword = await bcrypt.compare(password, String(user.password_hash || ""));
    if (!isValidPassword) return res.status(401).json({ error: "Credenciais inválidas" });

    let stockAccess = await queryOne<StockCredentialRow>(
      `SELECT *
       FROM stock_app_credentials
       WHERE manager_user_id = ?
         AND brand_id = ?
         AND credential_type = 'estoque'
         AND is_active = TRUE
       LIMIT 1`,
      [String(user.id), brandId]
    );

    /* Auto-grant: if user is the brand owner, create credential on-the-fly */
    if (!stockAccess) {
      const isOwner = brand.user_id && String(brand.user_id).trim() === String(user.id).trim();
      if (isOwner) {
        const credId = randomUUID();
        await query(
          `INSERT INTO stock_app_credentials (id, owner_user_id, manager_user_id, brand_id, email, credential_type, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, 'estoque', TRUE, NOW())`,
          [credId, String(user.id), String(user.id), brandId, email]
        );
        stockAccess = await queryOne<StockCredentialRow>(
          `SELECT * FROM stock_app_credentials WHERE id = ? LIMIT 1`,
          [credId]
        );
        logger.info(`[stock-login] Auto-created credential for brand owner ${email} on brand ${brandId}`);
      }
    }

    if (!stockAccess) {
      return res.status(403).json({ error: "Usuário sem acesso ativo ao app de estoque para esta brand" });
    }

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [String(user.id)]);

    const token = signStockToken({
      managerUserId: String(user.id),
      email,
      ownerUserId: String(stockAccess.owner_user_id),
      brandId: String(stockAccess.brand_id),
    });

    res.json({
      success: true,
      token,
      user: {
        id: String(user.id),
        email,
        name: String(user.name || "Gerente"),
        role: "manager",
        credential_type: "estoque",
        owner_user_id: String(stockAccess.owner_user_id),
        brand_id: String(stockAccess.brand_id),
        brand_slug: String(brand.slug || "").trim() || null,
        brand_name: String(brand.name || "").trim() || null,
        brand_logo_url: String(brand.logo_url || "").trim() || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Stock login failed" });
  }
});

/* ══════════════════════════════════════════════
   AFFILIATE APP — credentials & login
   ══════════════════════════════════════════════ */

router.get("/affiliate-access", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });

    const brandRef = resolveRequestedBrandId(req);
    if (!brandRef) return res.status(400).json({ error: "brand é obrigatório" });

    const brand = await resolveBrandReference(brandRef, ownerUserId);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada para este usuário" });
    const brandId = String(brand.id);

    const rows = await query<any[]>(
      `SELECT c.id, c.brand_id, c.email, c.credential_type, c.is_active, c.created_at, c.updated_at,
              u.id AS affiliate_user_id, u.name AS affiliate_name, u.phone AS affiliate_phone,
              b.slug AS brand_slug, b.name AS brand_name, b.logo_url AS brand_logo_url,
              a.id AS affiliate_id, a.code, a.coupon_code, a.display_name, a.status,
              a.commission_pct, a.commission_mode, a.commission_value,
              a.total_clicks, a.total_sales, a.total_commission
       FROM affiliate_app_credentials c
       INNER JOIN users u ON u.id = c.affiliate_user_id
       INNER JOIN brand_units b ON b.id = c.brand_id
       LEFT JOIN affiliates a ON a.credential_id = c.id
       WHERE c.owner_user_id = ? AND c.brand_id = ?
       ORDER BY c.created_at DESC`,
      [ownerUserId, brandId]
    );

    res.json({
      success: true,
      credentials: rows.map((item) => ({
        id: item.id,
        brand_id: item.brand_id,
        email: item.email,
        credential_type: item.credential_type || "afiliado",
        is_active: !!item.is_active,
        brand_slug: String(item.brand_slug || "").trim() || null,
        brand_name: String(item.brand_name || "").trim() || null,
        brand_logo_url: String(item.brand_logo_url || "").trim() || null,
        affiliate_user_id: item.affiliate_user_id,
        affiliate_name: item.affiliate_name,
        affiliate_phone: item.affiliate_phone || null,
        affiliate_id: item.affiliate_id || null,
        code: item.code || null,
        coupon_code: item.coupon_code || null,
        display_name: item.display_name || item.affiliate_name,
        status: item.status || "active",
        commission_pct: item.commission_pct,
        commission_mode: item.commission_mode || null,
        commission_value: item.commission_value != null ? Number(item.commission_value) : null,
        total_clicks: Number(item.total_clicks || 0),
        total_sales: Number(item.total_sales || 0),
        total_commission: Number(item.total_commission || 0),
        created_at: item.created_at,
        updated_at: item.updated_at,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list affiliate credentials" });
  }
});

router.post("/affiliate-access", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    if (!ownerUserId) return res.status(401).json({ error: "Unauthorized" });

    const brandRef = resolveRequestedBrandId(req);
    if (!brandRef) return res.status(400).json({ error: "brand é obrigatório" });

    const brand = await resolveBrandReference(brandRef, ownerUserId);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada para este usuário" });
    const brandId = String(brand.id);

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const name = String(req.body?.name || "").trim() || "Afiliado";
    const phone = String(req.body?.phone || "").trim() || null;
    const codeHint = String(req.body?.code || req.body?.affiliate_code || "").trim() || null;
    const region = String(req.body?.region || "").trim() || null;

    if (!email || !password) {
      return res.status(400).json({ error: "email e password são obrigatórios" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "password deve ter pelo menos 6 caracteres" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await affiliatesService.createAffiliateAccount({
      ownerUserId,
      brandId,
      email,
      passwordHash,
      name,
      phone,
      region,
      codeHint,
      autoApprove: true,
    });

    const credentialId = created.credentialId;
    const affiliateUserId = created.affiliateUserId;
    const affiliateProfile = created.affiliate;

    await affiliatesService.getOrCreateProgramConfig(ownerUserId, brandId);

    const loginRef = String(brand.slug || "").trim() || brandId;
    const loginUrl = loginRef
      ? `/central-afiliado/${encodeURIComponent(loginRef)}`
      : `/central-afiliado?brand=${encodeURIComponent(brandId)}`;

    res.status(201).json({
      success: true,
      credential: {
        id: credentialId,
        email,
        credential_type: "afiliado",
        brand_id: brandId,
        brand_slug: String(brand.slug || "").trim() || null,
        brand_name: String(brand.name || "").trim() || null,
        brand_logo_url: String(brand.logo_url || "").trim() || null,
        affiliate_user_id: affiliateUserId,
        login_url: loginUrl,
      },
      affiliate: affiliateProfile,
      message: "Acesso à Central do Afiliado criado/atualizado com sucesso",
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Já existe um afiliado com este código ou cupom nesta marca" });
    }
    res.status(500).json({ error: message || "Failed to create affiliate credential" });
  }
});

router.patch("/affiliate-access/:id/deactivate", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    const id = String(req.params.id || "").trim();
    await query(
      `UPDATE affiliate_app_credentials SET is_active = FALSE, updated_at = NOW()
       WHERE id = ? AND owner_user_id = ?`,
      [id, ownerUserId]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to deactivate affiliate credential" });
  }
});

router.patch("/affiliate-access/:id/reactivate", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    const id = String(req.params.id || "").trim();
    await query(
      `UPDATE affiliate_app_credentials SET is_active = TRUE, updated_at = NOW()
       WHERE id = ? AND owner_user_id = ?`,
      [id, ownerUserId]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to reactivate affiliate credential" });
  }
});

router.patch("/affiliate-access/:id/password", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    const id = String(req.params.id || "").trim();
    const password = String(req.body?.password || "").trim();
    if (!password || password.length < 6) return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres" });

    const cred = await queryOne<any>(
      `SELECT affiliate_user_id FROM affiliate_app_credentials WHERE id = ? AND owner_user_id = ? LIMIT 1`,
      [id, ownerUserId]
    );
    if (!cred) return res.status(404).json({ error: "Acesso não encontrado" });

    const password_hash = await bcrypt.hash(password, 10);
    await query(`UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?`, [password_hash, String(cred.affiliate_user_id)]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update password" });
  }
});

router.delete("/affiliate-access/:id", authMiddleware, requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    const id = String(req.params.id || "").trim();
    await query(`DELETE FROM affiliate_app_credentials WHERE id = ? AND owner_user_id = ?`, [id, ownerUserId]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to delete affiliate credential" });
  }
});

router.get("/affiliate-brand", async (req: Request, res: Response) => {
  try {
    const brandRef = resolveRequestedBrandId(req);
    if (!brandRef) return res.status(400).json({ error: "brand é obrigatório" });

    const brand = await resolveBrandReference(brandRef, null);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada" });

    const brandTheme = await queryOne<any>(
      `SELECT id, slug, name, logo_url, primary_color, secondary_color, slogan, user_id
       FROM brand_units WHERE id = ? LIMIT 1`,
      [String(brand.id)]
    );

    const program = await affiliatesService.getOrCreateProgramConfig(
      String(brandTheme?.user_id || brand.user_id),
      String(brand.id)
    );

    res.json({
      success: true,
      brand: {
        id: String(brand.id),
        slug: String(brandTheme?.slug || brand.slug || "").trim() || null,
        name: String(brandTheme?.name || brand.name || "").trim() || null,
        logo_url: String(brandTheme?.logo_url || brand.logo_url || "").trim() || null,
        primary_color: String(brandTheme?.primary_color || "").trim() || null,
        secondary_color: String(brandTheme?.secondary_color || "").trim() || null,
        slogan: String(brandTheme?.slogan || "").trim() || null,
      },
      program: {
        is_enabled: !!program.is_enabled,
        accept_new_affiliates: program.accept_new_affiliates !== false,
        auto_approve_affiliates: program.auto_approve_affiliates !== false,
        default_commission_pct: Number(program.default_commission_pct || 10),
        default_commission_mode: String(program.default_commission_mode || "percentage"),
        default_commission_value: Number(program.default_commission_value ?? program.default_commission_pct ?? 10),
        commission_rules: program.commission_rules || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to resolve brand" });
  }
});

router.post("/affiliate-register", async (req: Request, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const name = String(req.body?.name || "").trim() || "Afiliado";
    const phone = String(req.body?.phone || "").trim() || null;
    const region = String(req.body?.region || "").trim() || null;
    const codeHint = String(req.body?.code || req.body?.affiliate_code || "").trim() || null;
    const brandRef = String(req.body?.brand_id || req.body?.brandId || req.body?.brand || "").trim();

    if (!email || !password || !brandRef) {
      return res.status(400).json({ error: "nome, email, senha e marca são obrigatórios" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
    }

    const brand = await resolveBrandReference(brandRef, null);
    if (!brand) return res.status(404).json({ error: "Marca não encontrada" });
    const brandId = String(brand.id);
    const ownerUserId = String(brand.user_id);

    const program = await affiliatesService.getOrCreateProgramConfig(ownerUserId, brandId);
    if (!program.is_enabled) {
      return res.status(403).json({ error: "Programa de afiliados desativado para esta marca" });
    }
    if (program.accept_new_affiliates === false) {
      return res.status(403).json({ error: "Esta marca não está aceitando novos afiliados no momento" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const autoApprove = program.auto_approve_affiliates !== false;

    const created = await affiliatesService.createAffiliateAccount({
      ownerUserId,
      brandId,
      email,
      passwordHash,
      name,
      phone,
      region,
      codeHint,
      autoApprove,
    });

    if (!created.isActive) {
      return res.status(201).json({
        success: true,
        pending_approval: true,
        affiliate: created.affiliate,
        message: "Cadastro enviado! Aguarde a aprovação da marca para acessar a Central do Afiliado.",
      });
    }

    const token = signAffiliateToken({
      affiliateUserId: created.affiliateUserId,
      email,
      ownerUserId,
      brandId,
      credentialId: created.credentialId,
    });

    res.status(201).json({
      success: true,
      token,
      brand_id: brandId,
      affiliate: created.affiliate,
      user: {
        id: created.affiliateUserId,
        email,
        name,
        brand_slug: String(brand.slug || "").trim() || null,
        brand_name: String(brand.name || "").trim() || null,
      },
      message: "Cadastro realizado! Bem-vindo à Central do Afiliado.",
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Código ou cupom já em uso nesta marca. Tente outro nome." });
    }
    const status = message.includes("já está cadastrado") || message.includes("aguarda aprovação") ? 409 : 400;
    res.status(status).json({ error: message || "Falha no cadastro de afiliado" });
  }
});

router.get("/partners-invite", async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || req.query.invite || "").trim();
    if (!code) return res.status(400).json({ error: "code é obrigatório" });
    const preview = await affiliateGlobalService.getInvitationPreview(code);
    res.json({ success: true, ...preview });
  } catch (error: any) {
    const status = /não encontrado|expirou|inválido|limite|ativo/i.test(String(error?.message || "")) ? 404 : 400;
    res.status(status).json({ error: error.message || "Convite inválido" });
  }
});

router.get("/partners-brands", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ success: true, brands: [] });
    const brands = await query<any[]>(
      `SELECT DISTINCT b.id, b.name, b.slug, b.logo_url
       FROM brand_units b
       INNER JOIN affiliate_program_config cfg ON cfg.brand_id = b.id AND cfg.is_enabled = TRUE
       INNER JOIN affiliate_programs p ON p.brand_id = b.id AND p.status = 'active'
       WHERE LOWER(b.name) LIKE LOWER(?) OR LOWER(b.slug) LIKE LOWER(?)
       ORDER BY b.name ASC LIMIT 8`,
      [`%${q}%`, `%${q}%`],
    );
    res.json({ success: true, brands });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao buscar marcas" });
  }
});

router.post("/partners-register", async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const name = String(req.body?.name || "").trim();
    const brandId = String(req.body?.brand_id || "").trim() || null;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const created = await affiliateGlobalService.createGlobalAccount({
      email,
      passwordHash: password_hash,
      name,
      phone: null,
    });

    let brandAssociation: { brand_id: string; status: string } | null = null;
    if (brandId) {
      const brand = await queryOne<any>(
        `SELECT b.id, b.user_id AS owner_user_id,
                COALESCE(p.auto_approve_applications, FALSE) AS auto_approve
         FROM brand_units b
         INNER JOIN affiliate_program_config cfg ON cfg.brand_id = b.id AND cfg.is_enabled = TRUE
         LEFT JOIN affiliate_programs p ON p.brand_id = b.id AND p.status = 'active' AND p.is_default = TRUE
         WHERE b.id = ? LIMIT 1`,
        [brandId],
      );
      if (brand) {
        const autoApprove = brand.auto_approve === true || brand.auto_approve === 1;
        await affiliateGlobalService.linkToBrand({
          affiliateUserId: created.userId,
          email,
          brandId: String(brand.id),
          ownerUserId: String(brand.owner_user_id),
          displayName: name,
          phone: null,
          source: "global_signup_brand_search",
          autoApprove,
        });
        brandAssociation = { brand_id: String(brand.id), status: autoApprove ? "active" : "pending" };
      }
    }

    const token = signPartnersGlobalToken({
      affiliateUserId: created.userId,
      email,
    });

    res.status(201).json({
      success: true,
      token,
      profile: created.profile,
      brand_association: brandAssociation,
      user: {
        id: created.userId,
        email,
        name,
        role: "affiliate",
        credential_type: "parceiro",
      },
      message: "Conta de parceiro criada! Bem-vindo ao LeadCapture Parceiros.",
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = message.includes("já está cadastrado") ? 409 : 400;
    res.status(status).json({ error: message || "Falha no cadastro de parceiro" });
  }
});

router.post("/partners-login", async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios" });
    }

    const user = await queryOne<any>(
      `SELECT id, email, password_hash, name, role, is_active
       FROM users WHERE LOWER(email) = LOWER(?) AND is_active = TRUE LIMIT 1`,
      [email]
    );
    if (!user) {
      return res.status(401).json({
        error: "Conta não encontrada. Crie sua conta de parceiro.",
        code: "ACCOUNT_NOT_FOUND",
      });
    }

    const isValidPassword = await bcrypt.compare(password, String(user.password_hash || ""));
    if (!isValidPassword) return res.status(401).json({ error: "Credenciais inválidas" });

    const hasAffiliateAccess = await queryOne<any>(
      `SELECT id FROM affiliate_global_profiles WHERE user_id = ? LIMIT 1`,
      [String(user.id)]
    );
    const hasBrandAccess = await queryOne<any>(
      `SELECT id FROM affiliate_app_credentials WHERE affiliate_user_id = ? LIMIT 1`,
      [String(user.id)]
    );

    if (!hasAffiliateAccess && !hasBrandAccess && String(user.role || "") !== "affiliate") {
      return res.status(403).json({
        error: "Esta conta não é de parceiro. Cadastre-se no LeadCapture Parceiros.",
        code: "NOT_PARTNER",
      });
    }

    const profile = await affiliateGlobalService.getOrCreateGlobalProfile(String(user.id));
    await query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [String(user.id)]);

    const token = signPartnersGlobalToken({
      affiliateUserId: String(user.id),
      email,
    });

    res.json({
      success: true,
      token,
      profile,
      user: {
        id: String(user.id),
        email,
        name: String(user.name || profile.display_name || "Parceiro"),
        role: "affiliate",
        credential_type: "parceiro",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Partners login failed" });
  }
});

router.post("/affiliate-login", async (req: Request, res: Response) => {
  try {
    await ensureAffiliateCredentialSchema();

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const brandRef = String(req.body?.brand_id || req.body?.brandId || req.body?.brand || "").trim();

    if (!email || !password || !brandRef) {
      return res.status(400).json({ error: "email, password e brand são obrigatórios" });
    }

    const brand = await resolveBrandReference(brandRef, null);
    if (!brand) return res.status(404).json({ error: "Brand não encontrada" });
    const brandId = String(brand.id || "").trim();

    const program = await affiliatesService.getOrCreateProgramConfig(String(brand.user_id), brandId);
    if (!program.is_enabled) {
      return res.status(403).json({ error: "Programa de afiliados desativado para esta marca" });
    }

    const user = await queryOne<any>(
      `SELECT id, email, password_hash, name, role, is_active
       FROM users WHERE LOWER(email) = LOWER(?) AND is_active = TRUE LIMIT 1`,
      [email]
    );
    if (!user) {
      return res.status(401).json({
        error: program.accept_new_affiliates !== false
          ? "Conta não encontrada. Cadastre-se como afiliado desta marca."
          : "Credenciais inválidas",
        code: "ACCOUNT_NOT_FOUND",
      });
    }

    const isValidPassword = await bcrypt.compare(password, String(user.password_hash || ""));
    if (!isValidPassword) return res.status(401).json({ error: "Credenciais inválidas" });

    const affiliateAccess = await queryOne<AffiliateCredentialRow>(
      `SELECT * FROM affiliate_app_credentials
       WHERE affiliate_user_id = ? AND brand_id = ? AND credential_type = 'afiliado'
       LIMIT 1`,
      [String(user.id), brandId]
    );
    if (!affiliateAccess) {
      return res.status(403).json({
        error: program.accept_new_affiliates !== false
          ? "Você ainda não é afiliado desta marca. Faça seu cadastro."
          : "Sem acesso à Central do Afiliado para esta marca",
        code: "NOT_AFFILIATE",
      });
    }

    const affiliateProfile = await affiliatesService.getAffiliateByCredential(String(affiliateAccess.id), brandId);
    if (String(affiliateProfile?.status || "") === "pending" || !affiliateAccess.is_active) {
      return res.status(403).json({
        error: "Cadastro aguardando aprovação da marca. Tente novamente mais tarde.",
        code: "PENDING_APPROVAL",
      });
    }

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [String(user.id)]);

    const token = signAffiliateToken({
      affiliateUserId: String(user.id),
      email,
      ownerUserId: String(affiliateAccess.owner_user_id),
      brandId: String(affiliateAccess.brand_id),
      credentialId: String(affiliateAccess.id),
    });

    res.json({
      success: true,
      token,
      brand_id: brandId,
      user: {
        id: String(user.id),
        email,
        name: String(user.name || "Afiliado"),
        role: "affiliate",
        credential_type: "afiliado",
        owner_user_id: String(affiliateAccess.owner_user_id),
        brand_id: String(affiliateAccess.brand_id),
        brand_slug: String(brand.slug || "").trim() || null,
        brand_name: String(brand.name || "").trim() || null,
        brand_logo_url: String(brand.logo_url || "").trim() || null,
      },
      affiliate: affiliateProfile,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Affiliate login failed" });
  }
});

export default router;

