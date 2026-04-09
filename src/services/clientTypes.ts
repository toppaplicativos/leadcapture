import { v4 as uuidv4 } from "uuid";
import { getPool } from "../config/database";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface ClientType {
  id: string;
  user_id: string;
  brand_id?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  created_at: Date;
  updated_at: Date;
}

export class ClientTypesService {
  private async ensureTable(): Promise<void> {
    const pool = getPool();
    const client = await pool.getConnection();
    try {
      // Check if table exists
      const [tables] = await client.query<RowDataPacket[]>(
        "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_types'"
      );

      if (tables.length === 0) {
        await client.execute(`
          CREATE TABLE client_types (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            brand_id VARCHAR(36),
            name VARCHAR(100) NOT NULL,
            description TEXT,
            color VARCHAR(7),
            icon VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_brand_id (brand_id),
            UNIQUE KEY unique_brand_name (user_id, brand_id, name)
          )
        `);
      }
    } finally {
      client.release();
    }
  }

  async ensureByName(userId: string, name: string, opts: { color?: string; icon?: string; description?: string } = {}, brandId?: string): Promise<ClientType | null> {
    await this.ensureTable();
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM client_types WHERE user_id = ? AND name = ? AND (brand_id = ? OR brand_id IS NULL) LIMIT 1`,
      [userId, name, brandId || null]
    );
    if (rows[0]) return rows[0] as ClientType;
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO client_types (id, user_id, brand_id, name, description, color, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, brandId || null, name, opts.description || null, opts.color || null, opts.icon || null]
    );
    return this.getById(id, userId, brandId);
  }

  async create(userId: string, data: { name: string; description?: string; color?: string; icon?: string }, brandId?: string): Promise<ClientType | null> {
    await this.ensureTable();
    const pool = getPool();
    const id = uuidv4();

    await pool.execute(
      `INSERT INTO client_types (id, user_id, brand_id, name, description, color, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, brandId || null, data.name, data.description || null, data.color || null, data.icon || null]
    );

    return this.getById(id, userId, brandId);
  }

  async list(userId: string, brandId?: string): Promise<ClientType[]> {
    await this.ensureTable();
    const pool = getPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM client_types
       WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL)
       ORDER BY name ASC`,
      [userId, brandId || null]
    );

    return rows as ClientType[];
  }

  async getById(id: string, userId: string, brandId?: string): Promise<ClientType | null> {
    await this.ensureTable();
    const pool = getPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM client_types
       WHERE id = ? AND user_id = ? AND (brand_id = ? OR brand_id IS NULL)`,
      [id, userId, brandId || null]
    );

    return rows[0] ? (rows[0] as ClientType) : null;
  }

  async update(id: string, userId: string, data: Partial<Omit<ClientType, 'id' | 'user_id' | 'created_at' | 'updated_at'>>, brandId?: string): Promise<ClientType | null> {
    await this.ensureTable();
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

    values.push(id, userId);
    if (brandId) values.push(brandId);

    const whereClause = brandId
      ? `WHERE id = ? AND user_id = ? AND brand_id = ?`
      : `WHERE id = ? AND user_id = ? AND brand_id IS NULL`;

    await pool.execute(`UPDATE client_types SET ${fields.join(", ")} ${whereClause}`, values);
    return this.getById(id, userId, brandId);
  }

  async delete(id: string, userId: string, brandId?: string): Promise<boolean> {
    await this.ensureTable();
    const pool = getPool();

    const whereClause = brandId
      ? `WHERE id = ? AND user_id = ? AND brand_id = ?`
      : `WHERE id = ? AND user_id = ? AND brand_id IS NULL`;

    const params = brandId ? [id, userId, brandId] : [id, userId];

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM client_types ${whereClause}`,
      params
    );

    return result.affectedRows > 0;
  }
}
