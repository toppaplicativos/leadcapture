import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { UsersService } from "../services/users";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { config } from "../config";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

const router = Router();
const usersService = new UsersService();
let stockSchemaReady = false;

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

  return bySlug || null;
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
      credential_type: "estoque",
      owner_user_id: input.ownerUserId,
      brand_id: input.brandId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password and name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await usersService.create({ email, password, name, phone, role });
    const token = usersService.signToken(user);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
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

// PUT /api/auth/me - Update current user profile
router.put("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;
    const user = await usersService.updateUser(req.user!.userId as any, {
      name, email, phone, password,
    });
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/users - List all users (admin only)
router.get("/users", authMiddleware, requireRole(["admin"]), async (req: AuthRequest, res: Response) => {
  try {
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
      `SELECT id, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [email]
    );

    let managerUserId = String(manager?.id || "").trim();
    if (!managerUserId) {
      managerUserId = randomUUID();
      await query(
        `INSERT INTO users (id, email, password_hash, name, phone, role, is_active)
         VALUES (?, ?, ?, ?, ?, 'manager', TRUE)`,
        [managerUserId, email, passwordHash, name, phone]
      );
    } else {
      await query(
        `UPDATE users
         SET email = ?, password_hash = ?, name = ?, phone = ?, role = 'manager', is_active = TRUE, updated_at = NOW()
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
    const loginUrl = `/app-estoque?brand=${encodeURIComponent(loginRef)}`;

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

export default router;

