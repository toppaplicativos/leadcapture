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
  private brandColumnChecked: boolean = false;
  private hasBrandColumn: boolean = false;

  private async ensureBrandColumn(): Promise<void> {
    if (this.brandColumnChecked) return;

    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>("SHOW COLUMNS FROM companies LIKE 'brand_id'");
    if (!rows.length) {
      await pool.execute("ALTER TABLE companies ADD COLUMN brand_id VARCHAR(36) NULL");
    }
    this.hasBrandColumn = true;
    this.brandColumnChecked = true;
  }

  async create(userId: string, data: CompanyCreateDTO, brandId?: string | null): Promise<Company> {
    await this.ensureBrandColumn();
    const pool = getPool();
    const id = uuidv4();
    const normalizedBrandId = String(brandId || "").trim() || null;

    if (this.hasBrandColumn) {
      await pool.execute(
        `INSERT INTO companies (id, user_id, brand_id, name, cnpj, phone, email, address, city, state, zip_code, logo_url, website, industry, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, normalizedBrandId, data.name, data.cnpj || null, data.phone || null, data.email || null,
         data.address || null, data.city || null, data.state || null, data.zip_code || null,
         data.logo_url || null, data.website || null, data.industry || null, data.description || null]
      );
    } else {
      await pool.execute(
        `INSERT INTO companies (id, user_id, name, cnpj, phone, email, address, city, state, zip_code, logo_url, website, industry, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, data.name, data.cnpj || null, data.phone || null, data.email || null,
         data.address || null, data.city || null, data.state || null, data.zip_code || null,
         data.logo_url || null, data.website || null, data.industry || null, data.description || null]
      );
    }

    return this.getById(id, userId, brandId) as Promise<Company>;
  }

  async getById(id: string, userId: string, brandId?: string | null): Promise<Company | null> {
    await this.ensureBrandColumn();
    const pool = getPool();
    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = this.hasBrandColumn
      ? normalizedBrandId
        ? " AND brand_id = ?"
        : " AND brand_id IS NULL"
      : "";
    const params = this.hasBrandColumn
      ? normalizedBrandId
        ? [id, userId, normalizedBrandId]
        : [id, userId]
      : [id, userId];

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM companies WHERE id = ? AND user_id = ?${brandClause} AND is_active = TRUE`,
      params
    );
    return (rows[0] as Company) || null;
  }

  async getAll(userId: string, brandId?: string | null): Promise<Company[]> {
    await this.ensureBrandColumn();
    const pool = getPool();
    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = this.hasBrandColumn
      ? normalizedBrandId
        ? " AND brand_id = ?"
        : " AND brand_id IS NULL"
      : "";
    const params = this.hasBrandColumn
      ? normalizedBrandId
        ? [userId, normalizedBrandId]
        : [userId]
      : [userId];

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM companies WHERE user_id = ?${brandClause} AND is_active = TRUE ORDER BY created_at DESC`,
      params
    );
    return rows as Company[];
  }

  async update(id: string, userId: string, data: Partial<CompanyCreateDTO>, brandId?: string | null): Promise<Company | null> {
    await this.ensureBrandColumn();
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return this.getById(id, userId, brandId);

    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = this.hasBrandColumn
      ? normalizedBrandId
        ? " AND brand_id = ?"
        : " AND brand_id IS NULL"
      : "";

    if (this.hasBrandColumn && normalizedBrandId) {
      values.push(id, userId, normalizedBrandId);
    } else {
      values.push(id, userId);
    }

    await pool.execute(
      `UPDATE companies SET ${fields.join(", ")} WHERE id = ? AND user_id = ?${brandClause}`,
      values
    );
    return this.getById(id, userId, brandId);
  }

  async delete(id: string, userId: string, brandId?: string | null): Promise<boolean> {
    await this.ensureBrandColumn();
    const pool = getPool();
    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = this.hasBrandColumn
      ? normalizedBrandId
        ? " AND brand_id = ?"
        : " AND brand_id IS NULL"
      : "";
    const params = this.hasBrandColumn
      ? normalizedBrandId
        ? [id, userId, normalizedBrandId]
        : [id, userId]
      : [id, userId];

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE companies SET is_active = FALSE WHERE id = ? AND user_id = ?${brandClause}`,
      params
    );
    return result.affectedRows > 0;
  }
}
