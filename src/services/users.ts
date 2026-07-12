import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne } from "../config/database";
import { config } from "../config";
import { AuthPayload } from "../types";
import { logger } from "../utils/logger";
import { AccountKind } from "../config/identity";
import { identityService } from "./identity";

export interface DBUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  phone?: string;
  role: string;
  account_kind?: AccountKind | string | null;
  avatar_url?: string;
  is_active: boolean;
  is_super_admin?: boolean;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreateDTO {
  email: string;
  password: string;
  name: string;
  phone?: string;
  /** @deprecated Prefer accountKind. "admin" is rejected for self-serve. */
  role?: string;
  accountKind?: AccountKind | string;
}

export interface UserLoginDTO {
  email: string;
  password: string;
}

type SafeUser = Omit<DBUser, "password_hash">;

export type TokenUser = Pick<DBUser, "id" | "email" | "role"> & {
  account_kind?: string | null;
  is_super_admin?: boolean;
  brand_id?: string | null;
  credential_type?: string | null;
  owner_user_id?: string | null;
  credential_id?: string | null;
};

export class UsersService {
  signToken(user: TokenUser): string {
    const payload: AuthPayload & Record<string, unknown> = {
      userId: user.id as any,
      email: user.email,
      role: user.role,
      account_kind: user.account_kind || undefined,
      is_super_admin: user.is_super_admin === true ? true : undefined,
    };
    if (user.brand_id) payload.brand_id = user.brand_id;
    if (user.credential_type) payload.credential_type = user.credential_type;
    if (user.owner_user_id) payload.owner_user_id = user.owner_user_id;
    if (user.credential_id) payload.credential_id = user.credential_id;

    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as any,
    });
  }

  async create(dto: UserCreateDTO): Promise<SafeUser> {
    await identityService.ensureSchema();

    const normalizedEmail = String(dto.email || "").trim().toLowerCase();
    const normalizedName = String(dto.name || "").trim();
    const normalizedPhone = String(dto.phone || "").trim() || undefined;
    const normalizedPassword = String(dto.password || "");

    const existing = await queryOne<DBUser>(
      "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
      [normalizedEmail]
    );
    if (existing) {
      throw new Error("Email already registered");
    }

    const identity = identityService.resolveCreateIdentity({
      kind: dto.accountKind || null,
      role: dto.role || null,
      isSuperAdmin: false,
    });

    const id = uuidv4();
    const password_hash = await bcrypt.hash(normalizedPassword, 12);

    await query(
      `INSERT INTO users (id, email, password_hash, name, phone, role, account_kind, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, true)`,
      [
        id,
        normalizedEmail,
        password_hash,
        normalizedName,
        normalizedPhone || null,
        identity.role,
        identity.account_kind,
      ]
    );

    logger.info(
      `User created: ${normalizedEmail} (ID: ${id}) kind=${identity.account_kind} role=${identity.role}`,
    );
    const user = await this.getById(id);
    return user!;
  }

  async login(dto: UserLoginDTO): Promise<{ token: string; user: SafeUser }> {
    await identityService.ensureSchema();

    const normalizedEmail = String(dto.email || "").trim().toLowerCase();
    const normalizedPassword = String(dto.password || "").trim();

    const user = await queryOne<DBUser>(
      "SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND is_active = true",
      [normalizedEmail]
    );
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const valid = await bcrypt.compare(normalizedPassword, user.password_hash);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    await query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    const token = this.signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      account_kind: user.account_kind,
      is_super_admin: Boolean(user.is_super_admin),
    });

    const { password_hash, ...safeUser } = user;
    logger.info(`User logged in: ${normalizedEmail} kind=${user.account_kind || "?"} role=${user.role}`);
    return { token, user: safeUser };
  }

  async getById(id: string): Promise<SafeUser | null> {
    const user = await queryOne<DBUser>("SELECT * FROM users WHERE id = ?", [id]);
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  async getAll(): Promise<SafeUser[]> {
    const users = await query<DBUser[]>("SELECT * FROM users ORDER BY created_at DESC");
    return users.map(({ password_hash, ...u }) => u);
  }

  async updateUser(id: string, data: Partial<UserCreateDTO>): Promise<SafeUser | null> {
    await identityService.ensureSchema();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      const name = String(data.name || "").trim();
      if (name) { fields.push("name = ?"); values.push(name); }
    }
    if (data.email !== undefined) {
      const email = String(data.email || "").trim().toLowerCase();
      if (email) { fields.push("email = ?"); values.push(email); }
    }
    if (data.phone !== undefined) {
      const phone = String(data.phone || "").trim();
      fields.push("phone = ?");
      values.push(phone || null);
    }
    if (data.accountKind || data.role) {
      const identity = identityService.resolveCreateIdentity({
        kind: data.accountKind || null,
        role: data.role || null,
      });
      fields.push("role = ?");
      values.push(identity.role);
      fields.push("account_kind = ?");
      values.push(identity.account_kind);
    }
    if (data.password) {
      const hash = await bcrypt.hash(data.password, 12);
      fields.push("password_hash = ?");
      values.push(hash);
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    await query(`UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`, values);
    logger.info(`User updated: ID ${id}`);
    return this.getById(id);
  }

  /** Redefine senha exigindo a senha atual (conta do dono). */
  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await queryOne<DBUser>("SELECT * FROM users WHERE id = ? AND is_active = true LIMIT 1", [id]);
    if (!user) throw new Error("Usuário não encontrado");
    const ok = await bcrypt.compare(String(currentPassword || ""), user.password_hash);
    if (!ok) throw new Error("Senha atual incorreta");
    if (String(newPassword || "").length < 6) throw new Error("Nova senha deve ter pelo menos 6 caracteres");
    const hash = await bcrypt.hash(String(newPassword), 12);
    await query(`UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?`, [hash, id]);
    logger.info(`Password changed for user ID ${id}`);
  }

  async deactivate(id: string): Promise<boolean> {
    const rows = await query("UPDATE users SET is_active = false WHERE id = ?", [id]);
    return (rows as any).affectedRows > 0;
  }

  /**
   * Whether this user must not be demoted to manager/affiliate
   * (owns orgs, is platform master, or is already org principal).
   */
  async isProtectedPrincipal(userId: string): Promise<boolean> {
    const user = await queryOne<{
      role: string
      account_kind: string | null
      is_super_admin: boolean
    }>(
      `SELECT role, account_kind, COALESCE(is_super_admin, false) AS is_super_admin FROM users WHERE id = ?`,
      [userId],
    )
    if (!user) return false
    if (user.is_super_admin) return true
    const kind = String(user.account_kind || "").toLowerCase()
    if (kind === "platform" || kind === "org") return true
    const role = String(user.role || "").toLowerCase()
    if (role === "org" || role === "admin") return true
    const owns = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM brand_units WHERE user_id = ?`,
      [userId],
    )
    return Number(owns?.total || 0) > 0
  }

  static verifyToken(token: string): AuthPayload {
    return jwt.verify(token, config.jwtSecret) as AuthPayload;
  }
}

export const usersService = new UsersService();
