import { v4 as uuidv4 } from "uuid";
import { getPool } from "../config/database";
import { logger } from "../utils/logger";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  logo_url?: string;
  website?: string;
  industry?: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CompanyCreateDTO {
  name: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  logo_url?: string;
  website?: string;
  industry?: string;
  description?: string;
}

export class CompaniesService {
  async create(userId: string, data: CompanyCreateDTO): Promise<Company> {
    const pool = getPool();
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO companies (id, user_id, name, cnpj, phone, email, address, city, state, zip_code, logo_url, website, industry, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, data.name, data.cnpj || null, data.phone || null, data.email || null,
       data.address || null, data.city || null, data.state || null, data.zip_code || null,
       data.logo_url || null, data.website || null, data.industry || null, data.description || null]
    );
    return this.getById(id, userId) as Promise<Company>;
  }

  async getById(id: string, userId: string): Promise<Company | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM companies WHERE id = ? AND user_id = ? AND is_active = TRUE", [id, userId]
    );
    return (rows[0] as Company) || null;
  }

  async getAll(userId: string): Promise<Company[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM companies WHERE user_id = ? AND is_active = TRUE ORDER BY created_at DESC", [userId]
    );
    return rows as Company[];
  }

  async update(id: string, userId: string, data: Partial<CompanyCreateDTO>): Promise<Company | null> {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return this.getById(id, userId);
    values.push(id, userId);
    await pool.execute(
      `UPDATE companies SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, values
    );
    return this.getById(id, userId);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE companies SET is_active = FALSE WHERE id = ? AND user_id = ?", [id, userId]
    );
    return result.affectedRows > 0;
  }
}
