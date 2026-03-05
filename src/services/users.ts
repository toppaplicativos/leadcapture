import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne, insert, update } from "../config/database";
import { config } from "../config";
import { AuthPayload } from "../types";
import { logger } from "../utils/logger";

export interface DBUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  phone?: string;
  role: "admin" | "manager" | "operator";
  avatar_url?: string;
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreateDTO {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: "admin" | "manager" | "operator";
}

export interface UserLoginDTO {
  email: string;
  password: string;
}

type SafeUser = Omit<DBUser, "password_hash">;

export class UsersService {
  async create(dto: UserCreateDTO): Promise<SafeUser> {
    const existing = await queryOne<DBUser>(
      "SELECT id FROM users WHERE email = ?",
      [dto.email]
    );
    if (existing) {
      throw new Error("Email already registered");
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(dto.password, 12);

    await query(
      `INSERT INTO users (id, email, password_hash, name, phone, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, true)`,
      [id, dto.email, password_hash, dto.name, dto.phone || null, dto.role || "operator"]
    );

    logger.info(`User created: ${dto.email} (ID: ${id})`);
    const user = await this.getById(id);
    return user!;
  }

  async login(dto: UserLoginDTO): Promise<{ token: string; user: SafeUser }> {
    const user = await queryOne<DBUser>(
      "SELECT * FROM users WHERE email = ? AND is_active = true",
      [dto.email]
    );
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    await query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    const payload: AuthPayload = {
      userId: user.id as any,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as any,
    });

    const { password_hash, ...safeUser } = user;
    logger.info(`User logged in: ${dto.email}`);
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
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name) { fields.push("name = ?"); values.push(data.name); }
    if (data.email) { fields.push("email = ?"); values.push(data.email); }
    if (data.phone) { fields.push("phone = ?"); values.push(data.phone); }
    if (data.role) { fields.push("role = ?"); values.push(data.role); }
    if (data.password) {
      const hash = await bcrypt.hash(data.password, 12);
      fields.push("password_hash = ?");
      values.push(hash);
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    await query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
    logger.info(`User updated: ID ${id}`);
    return this.getById(id);
  }

  async deactivate(id: string): Promise<boolean> {
    const rows = await query("UPDATE users SET is_active = false WHERE id = ?", [id]);
    return (rows as any).affectedRows > 0;
  }

  static verifyToken(token: string): AuthPayload {
    return jwt.verify(token, config.jwtSecret) as AuthPayload;
  }
}

