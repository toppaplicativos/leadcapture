import { v4 as uuidv4 } from "uuid";
import { getPool } from "../config/database";
import { logger } from "../utils/logger";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Client {
  id: string;
  user_id: string;
  company_id?: string;
  name: string;
  phone?: string;
  email?: string;
  cpf?: string;
  birth_date?: Date;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  tags?: string[];
  notes?: string;
  source: string;
  lead_score: number;
  status: string;
  last_contact_at?: Date;
  custom_fields?: Record<string, any>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ClientCreateDTO {
  name: string;
  company_id?: string;
  phone?: string;
  email?: string;
  cpf?: string;
  birth_date?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  tags?: string[];
  notes?: string;
  source?: string;
  lead_score?: number;
  status?: string;
  custom_fields?: Record<string, any>;
}

export interface ClientFilters {
  status?: string;
  source?: string;
  company_id?: string;
  brand_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class ClientsService {
  private columnsCache: Set<string> | null = null;

  private async getClientColumns(): Promise<Set<string>> {
    if (!this.columnsCache) {
      const pool = getPool();
      const [rows] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM clients");
      this.columnsCache = new Set(rows.map((row: any) => String(row.Field || "")));
    }
    return this.columnsCache;
  }

  async create(userId: string, data: ClientCreateDTO, brandId?: string | null): Promise<Client> {
    const pool = getPool();
    const id = uuidv4();
    const cols = await this.getClientColumns();
    const normalizedBrandId = String(brandId || "").trim();

    if (cols.has("brand_id")) {
      await pool.execute(
        `INSERT INTO clients (id, user_id, brand_id, company_id, name, phone, email, cpf, birth_date, address, city, state, zip_code, tags, notes, source, lead_score, status, custom_fields)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, normalizedBrandId || null, data.company_id || null, data.name, data.phone || null, data.email || null,
         data.cpf || null, data.birth_date || null, data.address || null, data.city || null,
         data.state || null, data.zip_code || null, data.tags ? JSON.stringify(data.tags) : null,
         data.notes || null, data.source || "manual", data.lead_score || 0,
         data.status || "new", data.custom_fields ? JSON.stringify(data.custom_fields) : null]
      );
    } else {
      await pool.execute(
        `INSERT INTO clients (id, user_id, company_id, name, phone, email, cpf, birth_date, address, city, state, zip_code, tags, notes, source, lead_score, status, custom_fields)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, data.company_id || null, data.name, data.phone || null, data.email || null,
         data.cpf || null, data.birth_date || null, data.address || null, data.city || null,
         data.state || null, data.zip_code || null, data.tags ? JSON.stringify(data.tags) : null,
         data.notes || null, data.source || "manual", data.lead_score || 0,
         data.status || "new", data.custom_fields ? JSON.stringify(data.custom_fields) : null]
      );
    }

    return this.getById(id, userId, brandId) as Promise<Client>;
  }

  async getById(id: string, userId: string, brandId?: string | null): Promise<Client | null> {
    const pool = getPool();
    const cols = await this.getClientColumns();
    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = cols.has("brand_id") ? (normalizedBrandId ? " AND brand_id = ?" : " AND brand_id IS NULL") : "";
    const params: any[] = cols.has("brand_id") && normalizedBrandId ? [id, userId, normalizedBrandId] : [id, userId];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM clients WHERE id = ? AND user_id = ?${brandClause} AND is_active = TRUE`,
      params
    );
    if (!rows[0]) return null;
    const client = rows[0] as any;
    if (typeof client.tags === "string") client.tags = JSON.parse(client.tags);
    if (typeof client.custom_fields === "string") client.custom_fields = JSON.parse(client.custom_fields);
    return client as Client;
  }

  async getAll(userId: string, filters: ClientFilters = {}): Promise<{ clients: Client[]; total: number }> {
    const pool = getPool();
    const cols = await this.getClientColumns();
    const { status, source, company_id, brand_id, search, page = 1, limit = 50 } = filters;
    let where = "user_id = ? AND is_active = TRUE";
    const params: any[] = [userId];
    const normalizedBrandId = String(brand_id || "").trim();

    if (cols.has("brand_id")) {
      if (normalizedBrandId) {
        where += " AND brand_id = ?";
        params.push(normalizedBrandId);
      } else {
        where += " AND brand_id IS NULL";
      }
    }

    if (status) { where += " AND status = ?"; params.push(status); }
    if (source) { where += " AND source = ?"; params.push(source); }
    if (company_id) { where += " AND company_id = ?"; params.push(company_id); }
    if (search) { where += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const [countRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) as total FROM clients WHERE ${where}`, params);
    const total = (countRows[0] as any).total;

    const offset = (page - 1) * limit;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM clients WHERE ${where} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, params
    );

    const clients = (rows as any[]).map(c => {
      if (typeof c.tags === "string") c.tags = JSON.parse(c.tags);
      if (typeof c.custom_fields === "string") c.custom_fields = JSON.parse(c.custom_fields);
      return c;
    });

    return { clients: clients as Client[], total };
  }

  async update(id: string, userId: string, data: Partial<ClientCreateDTO>, brandId?: string | null): Promise<Client | null> {
    const pool = getPool();
    const cols = await this.getClientColumns();
    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = cols.has("brand_id") ? (normalizedBrandId ? " AND brand_id = ?" : " AND brand_id IS NULL") : "";
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === "tags" || key === "custom_fields" ? JSON.stringify(value) : value);
      }
    }
    if (fields.length === 0) return this.getById(id, userId, brandId);
    values.push(id, userId);
    if (cols.has("brand_id") && normalizedBrandId) values.push(normalizedBrandId);
    await pool.execute(`UPDATE clients SET ${fields.join(", ")} WHERE id = ? AND user_id = ?${brandClause}`, values);
    return this.getById(id, userId, brandId);
  }

  async updateStatus(id: string, userId: string, status: string, brandId?: string | null): Promise<Client | null> {
    const pool = getPool();
    const cols = await this.getClientColumns();
    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = cols.has("brand_id") ? (normalizedBrandId ? " AND brand_id = ?" : " AND brand_id IS NULL") : "";
    const params: any[] = cols.has("brand_id") && normalizedBrandId ? [status, id, userId, normalizedBrandId] : [status, id, userId];
    await pool.execute(`UPDATE clients SET status = ? WHERE id = ? AND user_id = ?${brandClause}`, params);
    return this.getById(id, userId, brandId);
  }

  async delete(id: string, userId: string, brandId?: string | null): Promise<boolean> {
    const pool = getPool();
    const cols = await this.getClientColumns();
    const normalizedBrandId = String(brandId || "").trim();
    const brandClause = cols.has("brand_id") ? (normalizedBrandId ? " AND brand_id = ?" : " AND brand_id IS NULL") : "";
    const params: any[] = cols.has("brand_id") && normalizedBrandId ? [id, userId, normalizedBrandId] : [id, userId];
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE clients SET is_active = FALSE WHERE id = ? AND user_id = ?${brandClause}`,
      params
    );
    return result.affectedRows > 0;
  }

  async importFromLeads(userId: string, leads: any[], source: string = "google_places", brandId?: string | null): Promise<number> {
    let imported = 0;
    for (const lead of leads) {
      try {
        await this.create(userId, {
          name: lead.displayName || lead.name || "Sem nome",
          phone: lead.nationalPhoneNumber || lead.phone || null,
          address: lead.formattedAddress || lead.address || null,
          source,
          notes: `Rating: ${lead.rating || "N/A"} | Website: ${lead.websiteUri || "N/A"}`,
          tags: lead.types || [],
          custom_fields: { google_place_id: lead.id, rating: lead.rating, website: lead.websiteUri }
        }, brandId);
        imported++;
      } catch (err: any) {
        logger.error(err, `Erro ao importar lead: ${lead.displayName}`);
      }
    }
    return imported;
  }
}
