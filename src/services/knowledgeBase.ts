import { randomUUID } from "crypto";
import { query, queryOne, update } from "../config/database";
import { KnowledgeBase, KnowledgeBaseCreateDTO } from "../types";
import { logger } from "../utils/logger";

type ColumnMeta = {
  field: string;
  type: string;
  nullable: boolean;
  defaultValue: unknown;
  extra: string;
};

export class KnowledgeBaseService {
  private columnsCache: Map<string, ColumnMeta> | null = null;
  private tableColumnsCache: Map<string, Map<string, ColumnMeta>> = new Map();

  private async getColumns(): Promise<Map<string, ColumnMeta>> {
    if (this.columnsCache) return this.columnsCache;

    const rows = await query<any[]>("SHOW COLUMNS FROM knowledge_base");
    const map = new Map<string, ColumnMeta>();

    for (const row of rows) {
      map.set(String(row.Field), {
        field: String(row.Field),
        type: String(row.Type || ""),
        nullable: String(row.Null || "").toUpperCase() === "YES",
        defaultValue: row.Default,
        extra: String(row.Extra || ""),
      });
    }

    this.columnsCache = map;
    return map;
  }

  private hasColumn(columns: Map<string, ColumnMeta>, name: string): boolean {
    return columns.has(name);
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return Number(row?.total || 0) > 0;
  }

  private async getTableColumns(tableName: string): Promise<Map<string, ColumnMeta>> {
    const cached = this.tableColumnsCache.get(tableName);
    if (cached) return cached;

    try {
      const rows = await query<any[]>(`SHOW COLUMNS FROM ${tableName}`);
      const map = new Map<string, ColumnMeta>();
      for (const row of rows) {
        map.set(String(row.Field), {
          field: String(row.Field),
          type: String(row.Type || ""),
          nullable: String(row.Null || "").toUpperCase() === "YES",
          defaultValue: row.Default,
          extra: String(row.Extra || ""),
        });
      }
      this.tableColumnsCache.set(tableName, map);
      return map;
    } catch {
      const empty = new Map<string, ColumnMeta>();
      this.tableColumnsCache.set(tableName, empty);
      return empty;
    }
  }

  private resolveCompaniesOwnerColumn(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "owner_user_id")) return "owner_user_id";
    if (this.hasColumn(columns, "user_id")) return "user_id";
    if (this.hasColumn(columns, "created_by")) return "created_by";
    return null;
  }

  private async findOrCreateCompanyId(tableName: string, userId: string): Promise<string | null> {
    const columns = await this.getTableColumns(tableName);
    if (columns.size === 0 || !this.hasColumn(columns, "id")) return null;

    const ownerCol = this.resolveCompaniesOwnerColumn(columns);
    const existing = ownerCol
      ? await queryOne<{ id: string }>(`SELECT id FROM ${tableName} WHERE ${ownerCol} = ? ORDER BY created_at ASC LIMIT 1`, [userId])
      : await queryOne<{ id: string }>(`SELECT id FROM ${tableName} ORDER BY created_at ASC LIMIT 1`);

    if (existing?.id) return String(existing.id);

    const idMeta = columns.get("id");
    const needsManualId =
      !!idMeta &&
      !String(idMeta.extra || "").toLowerCase().includes("auto_increment") &&
      (idMeta.defaultValue === null || idMeta.defaultValue === undefined);

    const values: Array<[string, any]> = [];
    if (needsManualId) values.push(["id", randomUUID()]);
    if (ownerCol) values.push([ownerCol, userId]);
    if (this.hasColumn(columns, "name")) values.push(["name", "Empresa Principal"]);
    if (this.hasColumn(columns, "is_active")) values.push(["is_active", 1]);
    if (this.hasColumn(columns, "active")) values.push(["active", 1]);

    const nonNullNoDefault = Array.from(columns.values())
      .filter(
        (col) =>
          !col.nullable &&
          col.defaultValue == null &&
          !String(col.extra || "").toLowerCase().includes("auto_increment")
      )
      .map((col) => col.field);

    const provided = new Set(values.map(([field]) => field));
    const missingRequired = nonNullNoDefault.filter((field) => !provided.has(field));
    if (missingRequired.length > 0) {
      return null;
    }

    if (values.length === 0) return null;

    const cols = values.map(([field]) => field).join(", ");
    const placeholders = values.map(() => "?").join(", ");
    const params = values.map(([, value]) => value);
    await query(`INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`, params);

    if (provided.has("id")) {
      const idValue = values.find(([field]) => field === "id")?.[1];
      if (idValue) return String(idValue);
    }

    const created = ownerCol
      ? await queryOne<{ id: string }>(`SELECT id FROM ${tableName} WHERE ${ownerCol} = ? ORDER BY created_at DESC LIMIT 1`, [userId])
      : await queryOne<{ id: string }>(`SELECT id FROM ${tableName} ORDER BY created_at DESC LIMIT 1`);

    return created?.id ? String(created.id) : null;
  }

  private async resolveCompanyIdForInsert(userId: string, requestedCompanyId?: string): Promise<string | null> {
    const normalizedRequested = String(requestedCompanyId || "").trim();
    if (normalizedRequested) return normalizedRequested;

    const knowledgeColumns = await this.getColumns();
    const companyMeta = knowledgeColumns.get("company_id");
    if (!companyMeta) return null;

    const requiresCompany = !companyMeta.nullable && companyMeta.defaultValue == null;
    if (!requiresCompany) return null;

    const candidates = ["company", "companies"];
    for (const tableName of candidates) {
      if (!(await this.tableExists(tableName))) continue;
      const id = await this.findOrCreateCompanyId(tableName, userId);
      if (id) return id;
    }

    throw new Error("company_id is required for knowledge base entries");
  }

  private resolveOwnerColumn(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "user_id")) return "user_id";
    if (this.hasColumn(columns, "created_by")) return "created_by";
    return null;
  }

  private resolveActiveColumn(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "active")) return "active";
    if (this.hasColumn(columns, "is_active")) return "is_active";
    return null;
  }

  private parseEnumValues(columnMeta?: ColumnMeta): string[] {
    if (!columnMeta) return [];
    const type = String(columnMeta.type || "").trim();
    const enumMatch = type.match(/^enum\((.*)\)$/i);
    if (!enumMatch) return [];

    const payload = enumMatch[1] || "";
    const values = payload
      .split(",")
      .map((item) => item.trim().replace(/^'/, "").replace(/'$/, "").replace(/\\'/g, "'"))
      .filter(Boolean);

    return values;
  }

  private normalizeCategory(columns: Map<string, ColumnMeta>, category?: string): string | null {
    if (!this.hasColumn(columns, "category")) return null;
    const normalized = String(category || "").trim();
    const enumValues = this.parseEnumValues(columns.get("category"));

    if (!enumValues.length) {
      return normalized || null;
    }

    if (normalized && enumValues.includes(normalized)) return normalized;
    if (enumValues.includes("custom")) return "custom";
    return enumValues[0] || null;
  }

  private normalizeTags(columns: Map<string, ColumnMeta>, tags?: string): any {
    if (!this.hasColumn(columns, "tags")) return undefined;
    if (tags === undefined) return undefined;

    const meta = columns.get("tags");
    const isJson = String(meta?.type || "").toLowerCase().includes("json");
    if (!isJson) return tags || null;

    const raw = String(tags || "").trim();
    if (!raw) return JSON.stringify([]);

    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
    } catch {
      const parts = raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return JSON.stringify(parts.length ? parts : [raw]);
    }
  }

  async create(userId: string, dto: KnowledgeBaseCreateDTO): Promise<KnowledgeBase> {
    const columns = await this.getColumns();
    const ownerColumn = this.resolveOwnerColumn(columns);
    if (!ownerColumn) {
      throw new Error("knowledge_base owner column not found");
    }

    const activeColumn = this.resolveActiveColumn(columns);
    const entries: Array<[string, any]> = [];

    const idMeta = columns.get("id");
    const needsManualId =
      !!idMeta &&
      !String(idMeta.extra || "").toLowerCase().includes("auto_increment") &&
      (idMeta.defaultValue === null || idMeta.defaultValue === undefined);
    if (needsManualId && this.hasColumn(columns, "id")) {
      entries.push(["id", randomUUID()]);
    }

    entries.push([ownerColumn, userId]);
    if (this.hasColumn(columns, "company_id")) {
      const companyId = await this.resolveCompanyIdForInsert(userId, dto.company_id);
      if (companyId !== null && companyId !== undefined && String(companyId).trim()) {
        entries.push(["company_id", companyId]);
      }
    }
    if (this.hasColumn(columns, "title")) entries.push(["title", dto.title]);
    if (this.hasColumn(columns, "content")) entries.push(["content", dto.content]);
    if (this.hasColumn(columns, "category")) {
      entries.push(["category", this.normalizeCategory(columns, dto.category)]);
    }

    const normalizedTags = this.normalizeTags(columns, dto.tags);
    if (normalizedTags !== undefined) entries.push(["tags", normalizedTags]);

    if (activeColumn) entries.push([activeColumn, dto.active !== false ? 1 : 0]);

    const sqlColumns = entries.map(([name]) => name).join(", ");
    const placeholders = entries.map(() => "?").join(", ");
    const values = entries.map(([, value]) => value);
    await query(`INSERT INTO knowledge_base (${sqlColumns}) VALUES (${placeholders})`, values);

    const insertedId = entries.find(([name]) => name === "id")?.[1];
    logger.info(`Knowledge base entry created: ${dto.title}${insertedId ? ` (ID: ${insertedId})` : ""}`);

    if (insertedId !== undefined) {
      const inserted = await this.getById(insertedId, userId);
      if (inserted) return inserted;
    }

    const latest = await this.getAll({ user_id: userId, search: dto.title, active: dto.active !== false });
    if (latest[0]) return latest[0];

    throw new Error("Failed to create knowledge base entry");
  }

  async getById(id: string | number, userId: string): Promise<KnowledgeBase | null> {
    const columns = await this.getColumns();
    const ownerColumn = this.resolveOwnerColumn(columns);
    if (!ownerColumn) return null;
    return queryOne<KnowledgeBase>(
      `SELECT * FROM knowledge_base WHERE id = ? AND ${ownerColumn} = ?`,
      [id, userId]
    );
  }

  async getAll(filters?: {
    category?: string;
    search?: string;
    active?: boolean;
    company_id?: string;
    user_id?: string;
  }): Promise<KnowledgeBase[]> {
    const columns = await this.getColumns();
    const ownerColumn = this.resolveOwnerColumn(columns);
    const activeColumn = this.resolveActiveColumn(columns);

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (filters?.user_id && ownerColumn) { where += ` AND ${ownerColumn} = ?`; params.push(filters.user_id); }
    if (filters?.category && this.hasColumn(columns, "category")) {
      where += " AND category = ?";
      params.push(this.normalizeCategory(columns, filters.category));
    }
    if (filters?.active !== undefined && activeColumn) {
      where += ` AND ${activeColumn} = ?`;
      params.push(filters.active ? 1 : 0);
    }
    if (filters?.company_id && this.hasColumn(columns, "company_id")) {
      where += " AND company_id = ?";
      params.push(filters.company_id);
    }
    if (filters?.search) {
      where += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    return query<KnowledgeBase[]>(
      `SELECT * FROM knowledge_base ${where} ORDER BY created_at DESC`, params
    );
  }

  async update(id: string | number, userId: string, data: Partial<KnowledgeBaseCreateDTO>): Promise<KnowledgeBase | null> {
    const columns = await this.getColumns();
    const ownerColumn = this.resolveOwnerColumn(columns);
    if (!ownerColumn) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined && this.hasColumn(columns, "title")) { fields.push("title = ?"); values.push(data.title); }
    if (data.content !== undefined && this.hasColumn(columns, "content")) { fields.push("content = ?"); values.push(data.content); }
    if (data.category !== undefined && this.hasColumn(columns, "category")) {
      fields.push("category = ?");
      values.push(this.normalizeCategory(columns, data.category));
    }
    if (data.tags !== undefined && this.hasColumn(columns, "tags")) {
      fields.push("tags = ?");
      values.push(this.normalizeTags(columns, data.tags));
    }

    const activeColumn = this.resolveActiveColumn(columns);
    if (data.active !== undefined && activeColumn) {
      fields.push(`${activeColumn} = ?`);
      values.push(data.active ? 1 : 0);
    }

    if (fields.length === 0) return this.getById(id, userId);

    values.push(id, userId);
    await update(`UPDATE knowledge_base SET ${fields.join(", ")} WHERE id = ? AND ${ownerColumn} = ?`, values);
    logger.info(`Knowledge base updated: ID ${id}`);
    return this.getById(id, userId);
  }

  async delete(id: string | number, userId: string): Promise<boolean> {
    const columns = await this.getColumns();
    const ownerColumn = this.resolveOwnerColumn(columns);
    if (!ownerColumn) return false;
    const affected = await update(`DELETE FROM knowledge_base WHERE id = ? AND ${ownerColumn} = ?`, [id, userId]);
    return affected > 0;
  }

  // Search knowledge base for AI context (used by Gemini for message generation)
  async searchForContext(searchQuery: string, userId: string, companyId?: string): Promise<string> {
    const columns = await this.getColumns();
    const ownerColumn = this.resolveOwnerColumn(columns);
    const activeColumn = this.resolveActiveColumn(columns);

    let where = "WHERE active = true";
    const params: any[] = [];

    if (activeColumn) {
      where = `WHERE ${activeColumn} = ?`;
      params.push(1);
    } else {
      where = "WHERE 1=1";
    }

    if (ownerColumn) {
      where += ` AND ${ownerColumn} = ?`;
      params.push(userId);
    }

    if (companyId && this.hasColumn(columns, "company_id")) { where += " AND company_id = ?"; params.push(companyId); }

    where += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)";
    const s = `%${searchQuery}%`;
    params.push(s, s, s);

    const entries = await query<KnowledgeBase[]>(
      `SELECT title, content FROM knowledge_base ${where} LIMIT 5`, params
    );

    if (entries.length === 0) return "";

    return entries.map(e => `## ${e.title}\n${e.content}`).join("\n\n---\n\n");
  }
}

