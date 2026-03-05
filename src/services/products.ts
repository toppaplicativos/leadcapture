import mysql from "mysql2/promise";
import { Product, ProductCategory, PriceTable, ProductPriceEntry } from "../types";
import { logger } from "../utils/logger";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "leadcapture",
  password: process.env.DB_PASSWORD || "@Milionarios2026",
  database: process.env.DB_NAME || "leadcapture",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
});

export class ProductsService {
  private imageColumnReady: boolean | null = null;
  private coverSchemaReady = false;
  private coverSchemaPromise: Promise<void> | null = null;
  private ownershipSchemaReady = false;
  private ownershipSchemaReadyPromise: Promise<void> | null = null;
  private tableColumnsCache: Record<string, Set<string>> = {};

  private normalizeBrandId(brandId?: string | null): string | null {
    const normalized = String(brandId || "").trim();
    return normalized || null;
  }

  private async getTableColumns(table: string): Promise<Set<string>> {
    if (this.tableColumnsCache[table]) return this.tableColumnsCache[table];
    const [rows] = await pool.query(`SHOW COLUMNS FROM ${table}`);
    const cols = new Set(
      (rows as any[])
        .map((row) => String(row.Field || "").trim())
        .filter(Boolean)
    );
    this.tableColumnsCache[table] = cols;
    return cols;
  }

  private async indexExists(table: string, indexName: string): Promise<boolean> {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, indexName]
    );
    const first = Array.isArray(rows) ? (rows[0] as any) : null;
    return Number(first?.total || 0) > 0;
  }

  private async ensureColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
    const cols = await this.getTableColumns(table);
    if (!cols.has(column)) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      this.tableColumnsCache = {};
    }
  }

  private async ensureIndexIfMissing(table: string, indexName: string, column: string): Promise<void> {
    const exists = await this.indexExists(table, indexName);
    if (!exists) {
      await pool.query(`CREATE INDEX ${indexName} ON ${table} (${column})`);
    }
  }

  private async ensureOwnershipSchema(): Promise<void> {
    if (this.ownershipSchemaReady) return;
    if (this.ownershipSchemaReadyPromise) {
      await this.ownershipSchemaReadyPromise;
      return;
    }

    this.ownershipSchemaReadyPromise = (async () => {
      await this.ensureColumnIfMissing("products", "brand_id", "VARCHAR(36) NULL");
      await this.ensureColumnIfMissing("categories", "brand_id", "VARCHAR(36) NULL");
      await this.ensureColumnIfMissing("price_tables", "brand_id", "VARCHAR(36) NULL");

      await this.ensureIndexIfMissing("products", "idx_products_brand", "brand_id");
      await this.ensureIndexIfMissing("categories", "idx_categories_brand", "brand_id");
      await this.ensureIndexIfMissing("price_tables", "idx_price_tables_brand", "brand_id");

      this.tableColumnsCache = {};
      this.ownershipSchemaReady = true;
    })().finally(() => {
      this.ownershipSchemaReadyPromise = null;
    });

    await this.ownershipSchemaReadyPromise;
  }

  private hasUserColumn(columns: Set<string>): boolean {
    return columns.has("user_id") || columns.has("created_by");
  }

  private userColumn(columns: Set<string>): string {
    if (columns.has("user_id")) return "user_id";
    if (columns.has("created_by")) return "created_by";
    return "";
  }

  private appendOwnershipWhere(
    columns: Set<string>,
    userId: string | undefined,
    brandId: string | null | undefined,
    alias?: string
  ): { sql: string; params: any[] } {
    const where: string[] = [];
    const params: any[] = [];
    const prefix = alias ? `${alias}.` : "";

    if (userId && this.hasUserColumn(columns)) {
      where.push(`${prefix}${this.userColumn(columns)} = ?`);
      params.push(userId);
    }

    if (columns.has("brand_id")) {
      const normalizedBrandId = this.normalizeBrandId(brandId);
      if (normalizedBrandId) {
        where.push(`${prefix}brand_id = ?`);
        params.push(normalizedBrandId);
      } else {
        where.push(`${prefix}brand_id IS NULL`);
      }
    }

    return {
      sql: where.length ? ` WHERE ${where.join(" AND ")}` : "",
      params,
    };
  }

  private async resolveCategoryId(
    rawCategory?: string | null,
    userId?: string,
    brandId?: string | null
  ): Promise<string | null> {
    const value = String(rawCategory || "").trim();
    if (!value) return null;

    const categoryColumns = await this.getTableColumns("categories");
    const scope = this.appendOwnershipWhere(categoryColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";

    const [byIdRows] = await pool.query(
      `SELECT id FROM categories WHERE id = ?${andScope} LIMIT 1`,
      [value, ...scope.params]
    );
    if (Array.isArray(byIdRows) && byIdRows.length > 0) {
      return String((byIdRows as any[])[0].id);
    }

    const [byNameRows] = await pool.query(
      `SELECT id FROM categories WHERE LOWER(name) = LOWER(?)${andScope} LIMIT 1`,
      [value, ...scope.params]
    );
    if (Array.isArray(byNameRows) && byNameRows.length > 0) {
      return String((byNameRows as any[])[0].id);
    }

    const createdId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const insertColumns = ["id", "name", "description", "color"];
    const insertValues: any[] = [createdId, value, "", "#3b82f6"];
    if (categoryColumns.has("user_id") && userId) {
      insertColumns.push("user_id");
      insertValues.push(userId);
    } else if (categoryColumns.has("created_by") && userId) {
      insertColumns.push("created_by");
      insertValues.push(userId);
    }
    if (categoryColumns.has("brand_id")) {
      insertColumns.push("brand_id");
      insertValues.push(this.normalizeBrandId(brandId));
    }

    await pool.query(
      `INSERT INTO categories (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`,
      insertValues
    );
    return createdId;
  }

  private async ensureImageColumn(): Promise<boolean> {
    if (this.imageColumnReady !== null) return this.imageColumnReady;

    try {
      const [rows] = await pool.query("SHOW COLUMNS FROM products LIKE 'image_url'");
      if (Array.isArray(rows) && rows.length > 0) {
        this.imageColumnReady = true;
        return true;
      }

      await pool.query("ALTER TABLE products ADD COLUMN image_url TEXT NULL");
      this.imageColumnReady = true;
      return true;
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("duplicate column")) {
        this.imageColumnReady = true;
        return true;
      }

      logger.warn(`Product image column unavailable: ${error?.message || error}`);
      this.imageColumnReady = false;
      return false;
    }
  }

  private parseTagsInput(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
    }
    const raw = String(value || "").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
      }
    } catch {
      // noop
    }
    return [...new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
  }

  private async ensureDynamicCoverSchema(): Promise<void> {
    if (this.coverSchemaReady) return;
    if (this.coverSchemaPromise) {
      await this.coverSchemaPromise;
      return;
    }

    this.coverSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS product_dynamic_covers (
          id VARCHAR(36) PRIMARY KEY,
          product_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) DEFAULT NULL,
          brand_id VARCHAR(36) DEFAULT NULL,
          title VARCHAR(140) DEFAULT NULL,
          image_url TEXT NOT NULL,
          tags_json JSON,
          priority INT NOT NULL DEFAULT 100,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_pdc_product (product_id),
          KEY idx_pdc_user (user_id),
          KEY idx_pdc_brand (brand_id),
          KEY idx_pdc_active_priority (active, priority)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      this.coverSchemaReady = true;
    })().finally(() => {
      this.coverSchemaPromise = null;
    });

    await this.coverSchemaPromise;
  }

  async listDynamicCovers(productId: string, userId?: string, brandId?: string | null): Promise<any[]> {
    await this.ensureOwnershipSchema();
    await this.ensureDynamicCoverSchema();

    const product = await this.getProduct(productId, userId, brandId);
    if (!product) return [];

    const normalizedBrand = this.normalizeBrandId(brandId);
    const where: string[] = ["product_id = ?"];
    const params: any[] = [productId];

    if (userId) {
      where.push("(user_id = ? OR user_id IS NULL)");
      params.push(userId);
    }

    if (normalizedBrand) {
      where.push("(brand_id = ? OR brand_id IS NULL)");
      params.push(normalizedBrand);
    } else {
      where.push("brand_id IS NULL");
    }

    const [rows] = await pool.query(
      `SELECT * FROM product_dynamic_covers WHERE ${where.join(" AND ")} ORDER BY priority ASC, created_at DESC`,
      params
    );

    return (rows as any[]).map((row) => ({
      id: String(row.id),
      product_id: String(row.product_id),
      title: row.title ? String(row.title) : null,
      image_url: String(row.image_url || ""),
      tags: this.parseTagsInput(row.tags_json),
      priority: Number(row.priority || 100),
      active: Boolean(row.active),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async createDynamicCover(
    productId: string,
    input: { title?: string; imageUrl: string; tags?: string[]; priority?: number; active?: boolean },
    userId?: string,
    brandId?: string | null,
  ): Promise<any | null> {
    await this.ensureOwnershipSchema();
    await this.ensureDynamicCoverSchema();

    const product = await this.getProduct(productId, userId, brandId);
    if (!product) return null;

    const id = `pdc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tags = this.parseTagsInput(input.tags || []);
    const normalizedBrand = this.normalizeBrandId(brandId);

    await pool.query(
      `INSERT INTO product_dynamic_covers
       (id, product_id, user_id, brand_id, title, image_url, tags_json, priority, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        productId,
        userId || null,
        normalizedBrand,
        input.title ? String(input.title).trim() : null,
        String(input.imageUrl).trim(),
        JSON.stringify(tags),
        Number(input.priority ?? 100),
        input.active === false ? 0 : 1,
      ]
    );

    const created = await this.listDynamicCovers(productId, userId, brandId);
    return created.find((item) => item.id === id) || null;
  }

  async updateDynamicCover(
    productId: string,
    coverId: string,
    input: Partial<{ title: string; imageUrl: string; tags: string[]; priority: number; active: boolean }>,
    userId?: string,
    brandId?: string | null,
  ): Promise<any | null> {
    await this.ensureOwnershipSchema();
    await this.ensureDynamicCoverSchema();

    const product = await this.getProduct(productId, userId, brandId);
    if (!product) return null;

    const fields: string[] = [];
    const params: any[] = [];

    if (input.title !== undefined) {
      fields.push("title = ?");
      params.push(String(input.title || "").trim() || null);
    }
    if (input.imageUrl !== undefined) {
      fields.push("image_url = ?");
      params.push(String(input.imageUrl || "").trim());
    }
    if (input.tags !== undefined) {
      fields.push("tags_json = ?");
      params.push(JSON.stringify(this.parseTagsInput(input.tags)));
    }
    if (input.priority !== undefined) {
      fields.push("priority = ?");
      params.push(Number(input.priority || 100));
    }
    if (input.active !== undefined) {
      fields.push("active = ?");
      params.push(input.active ? 1 : 0);
    }

    if (!fields.length) {
      const list = await this.listDynamicCovers(productId, userId, brandId);
      return list.find((item) => item.id === coverId) || null;
    }

    const normalizedBrand = this.normalizeBrandId(brandId);
    const where: string[] = ["id = ?", "product_id = ?"];
    const whereParams: any[] = [coverId, productId];

    if (userId) {
      where.push("(user_id = ? OR user_id IS NULL)");
      whereParams.push(userId);
    }
    if (normalizedBrand) {
      where.push("(brand_id = ? OR brand_id IS NULL)");
      whereParams.push(normalizedBrand);
    } else {
      where.push("brand_id IS NULL");
    }

    await pool.query(
      `UPDATE product_dynamic_covers SET ${fields.join(", ")}, updated_at = NOW() WHERE ${where.join(" AND ")}`,
      [...params, ...whereParams]
    );

    const list = await this.listDynamicCovers(productId, userId, brandId);
    return list.find((item) => item.id === coverId) || null;
  }

  async deleteDynamicCover(productId: string, coverId: string, userId?: string, brandId?: string | null): Promise<boolean> {
    await this.ensureOwnershipSchema();
    await this.ensureDynamicCoverSchema();

    const product = await this.getProduct(productId, userId, brandId);
    if (!product) return false;

    const normalizedBrand = this.normalizeBrandId(brandId);
    const where: string[] = ["id = ?", "product_id = ?"];
    const params: any[] = [coverId, productId];

    if (userId) {
      where.push("(user_id = ? OR user_id IS NULL)");
      params.push(userId);
    }
    if (normalizedBrand) {
      where.push("(brand_id = ? OR brand_id IS NULL)");
      params.push(normalizedBrand);
    } else {
      where.push("brand_id IS NULL");
    }

    const [result] = await pool.query(
      `DELETE FROM product_dynamic_covers WHERE ${where.join(" AND ")}`,
      params
    );

    return Number((result as any)?.affectedRows || 0) > 0;
  }

  async resolveDynamicCover(
    productId: string,
    input: { tags?: string[] },
    userId?: string,
    brandId?: string | null,
  ): Promise<any | null> {
    const covers = await this.listDynamicCovers(productId, userId, brandId);
    const activeCovers = covers.filter((cover) => cover.active);
    if (!activeCovers.length) return null;

    const targetTags = new Set(this.parseTagsInput(input.tags || []));
    let best: any | null = null;
    let bestScore = -1;

    for (const cover of activeCovers) {
      const coverTags = this.parseTagsInput(cover.tags || []);
      if (coverTags.length === 0) {
        if (bestScore < 0) {
          best = cover;
          bestScore = 0;
        }
        continue;
      }

      let score = 0;
      for (const tag of coverTags) {
        if (targetTags.has(tag)) score += 1;
      }

      if (score > bestScore) {
        best = cover;
        bestScore = score;
      } else if (score === bestScore && best && Number(cover.priority || 100) < Number(best.priority || 100)) {
        best = cover;
      }
    }

    if (!best) return null;
    if (bestScore <= 0 && this.parseTagsInput(best.tags || []).length > 0) return null;
    return best;
  }

  // ==================== PRODUCTS ====================
  async getProducts(userId?: string, brandId?: string | null): Promise<Product[]> {
    await this.ensureOwnershipSchema();
    const productColumns = await this.getTableColumns("products");
    const scope = this.appendOwnershipWhere(productColumns, userId, brandId, "p");
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category
       ${scope.sql}
       ORDER BY p.created_at DESC`,
      scope.params
    );
    return (rows as any[]).map(this.mapProduct);
  }

  async getProduct(id: string, userId?: string, brandId?: string | null): Promise<Product | undefined> {
    await this.ensureOwnershipSchema();
    const productColumns = await this.getTableColumns("products");
    const scope = this.appendOwnershipWhere(productColumns, userId, brandId, "p");
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category
       WHERE p.id = ?${andScope}`,
      [id, ...scope.params]
    );
    const arr = rows as any[];
    return arr.length > 0 ? this.mapProduct(arr[0]) : undefined;
  }

  async getProductsByCategory(category: string, userId?: string, brandId?: string | null): Promise<Product[]> {
    await this.ensureOwnershipSchema();
    const productColumns = await this.getTableColumns("products");
    const scope = this.appendOwnershipWhere(productColumns, userId, brandId, "p");
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category
       WHERE (p.category = ? OR LOWER(c.name) = LOWER(?))${andScope}`,
      [category, category, ...scope.params]
    );
    return (rows as any[]).map(this.mapProduct);
  }

  async getActiveProducts(userId?: string, brandId?: string | null): Promise<Product[]> {
    await this.ensureOwnershipSchema();
    const productColumns = await this.getTableColumns("products");
    const scope = this.appendOwnershipWhere(productColumns, userId, brandId);
    const where = ["active = true"];
    if (scope.sql) where.push(scope.sql.replace(/^\s*WHERE\s+/i, ""));
    const [rows] = await pool.query(
      `SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY created_at DESC`,
      scope.params
    );
    return (rows as any[]).map(this.mapProduct);
  }

  async createProduct(
    data: Omit<Product, "id" | "createdAt" | "updatedAt">,
    userId?: string,
    brandId?: string | null
  ): Promise<Product> {
    await this.ensureOwnershipSchema();
    const id = `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date();
    const features = Array.isArray(data.features) ? JSON.stringify(data.features) : "[]";
    const categoryId = await this.resolveCategoryId(data.category, userId, brandId);
    const productColumns = await this.getTableColumns("products");
    const insertColumns = ["id", "name", "description", "category", "price", "promo_price", "unit", "features", "active", "created_at", "updated_at"];
    const insertValues: any[] = [
      id,
      data.name,
      data.description || "",
      categoryId,
      data.price || 0,
      data.promoPrice || null,
      data.unit || "unidade",
      features,
      data.active !== false,
      now,
      now,
    ];

    if (productColumns.has("user_id") && userId) {
      insertColumns.push("user_id");
      insertValues.push(userId);
    } else if (productColumns.has("created_by") && userId) {
      insertColumns.push("created_by");
      insertValues.push(userId);
    }
    if (productColumns.has("brand_id")) {
      insertColumns.push("brand_id");
      insertValues.push(this.normalizeBrandId(brandId));
    }

    await pool.query(
      `INSERT INTO products (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`,
      insertValues
    );
    logger.info(`Product created: ${data.name} (${id})`);
    return (await this.getProduct(id, userId, brandId))!;
  }

  async updateProduct(id: string, data: Partial<Product>, userId?: string, brandId?: string | null): Promise<Product | null> {
    await this.ensureOwnershipSchema();
    const existing = await this.getProduct(id, userId, brandId);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.category !== undefined) {
      const categoryId = await this.resolveCategoryId(data.category, userId, brandId);
      fields.push("category = ?");
      values.push(categoryId);
    }
    if (data.price !== undefined) { fields.push("price = ?"); values.push(data.price); }
    if (data.promoPrice !== undefined) { fields.push("promo_price = ?"); values.push(data.promoPrice); }
    if (data.unit !== undefined) { fields.push("unit = ?"); values.push(data.unit); }
    if (data.features !== undefined) { fields.push("features = ?"); values.push(JSON.stringify(data.features)); }
    if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active); }
    if (data.imageUrl !== undefined || data.image !== undefined) {
      const canPersistImage = await this.ensureImageColumn();
      if (canPersistImage) {
        const imageUrl = data.imageUrl !== undefined ? data.imageUrl : data.image;
        fields.push("image_url = ?");
        values.push(imageUrl || null);
      }
    }
    if (fields.length === 0) return existing;
    const productColumns = await this.getTableColumns("products");
    const scope = this.appendOwnershipWhere(productColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    fields.push("updated_at = ?"); values.push(new Date());
    values.push(id, ...scope.params);
    await pool.query(`UPDATE products SET ${fields.join(", ")} WHERE id = ?${andScope}`, values);
    logger.info(`Product updated: ${data.name || existing.name} (${id})`);
    return (await this.getProduct(id, userId, brandId))!;
  }

  async deleteProduct(id: string, userId?: string, brandId?: string | null): Promise<boolean> {
    await this.ensureOwnershipSchema();
    const productColumns = await this.getTableColumns("products");
    const scope = this.appendOwnershipWhere(productColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const [result] = await pool.query(`DELETE FROM products WHERE id = ?${andScope}`, [id, ...scope.params]);
    const deleted = (result as any).affectedRows > 0;
    if (deleted) logger.info(`Product deleted: ${id}`);
    return deleted;
  }

  private mapProduct(row: any): Product {
    const imageUrl = row.image_url || row.image || undefined;
    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      category: row.category_name || row.category || "",
      price: parseFloat(row.price) || 0,
      promoPrice: row.promo_price ? parseFloat(row.promo_price) : undefined,
      unit: row.unit || "unidade",
      features: typeof row.features === "string" ? JSON.parse(row.features) : (row.features || []),
      imageUrl,
      image: imageUrl,
      active: Boolean(row.active),
      is_active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==================== CATEGORIES ====================
  async getCategories(userId?: string, brandId?: string | null): Promise<ProductCategory[]> {
    await this.ensureOwnershipSchema();
    const categoryColumns = await this.getTableColumns("categories");
    const scope = this.appendOwnershipWhere(categoryColumns, userId, brandId);
    const [rows] = await pool.query(`SELECT * FROM categories${scope.sql} ORDER BY created_at DESC`, scope.params);
    return (rows as any[]).map((r: any) => ({ id: r.id, name: r.name, description: r.description || "", color: r.color || "#3b82f6" }));
  }

  async createCategory(data: Omit<ProductCategory, "id">, userId?: string, brandId?: string | null): Promise<ProductCategory> {
    await this.ensureOwnershipSchema();
    const id = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const categoryColumns = await this.getTableColumns("categories");
    const insertColumns = ["id", "name", "description", "color"];
    const insertValues: any[] = [id, data.name, data.description || "", data.color || "#3b82f6"];

    if (categoryColumns.has("user_id") && userId) {
      insertColumns.push("user_id");
      insertValues.push(userId);
    } else if (categoryColumns.has("created_by") && userId) {
      insertColumns.push("created_by");
      insertValues.push(userId);
    }
    if (categoryColumns.has("brand_id")) {
      insertColumns.push("brand_id");
      insertValues.push(this.normalizeBrandId(brandId));
    }

    await pool.query(
      `INSERT INTO categories (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`,
      insertValues
    );
    logger.info(`Category created: ${data.name}`);
    return { id, name: data.name, description: data.description, color: data.color || "#3b82f6" };
  }

  async updateCategory(id: string, data: Partial<ProductCategory>, userId?: string, brandId?: string | null): Promise<ProductCategory | null> {
    await this.ensureOwnershipSchema();
    const categoryColumns = await this.getTableColumns("categories");
    const scope = this.appendOwnershipWhere(categoryColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const [existing] = await pool.query(`SELECT * FROM categories WHERE id = ?${andScope}`, [id, ...scope.params]);
    if ((existing as any[]).length === 0) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.color !== undefined) { fields.push("color = ?"); values.push(data.color); }
    if (fields.length === 0) return (existing as any[])[0];
    values.push(id, ...scope.params);
    await pool.query(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?${andScope}`, values);
    const [updated] = await pool.query(`SELECT * FROM categories WHERE id = ?${andScope}`, [id, ...scope.params]);
    const r = (updated as any[])[0];
    return { id: r.id, name: r.name, description: r.description, color: r.color };
  }

  async deleteCategory(id: string, userId?: string, brandId?: string | null): Promise<boolean> {
    await this.ensureOwnershipSchema();
    const categoryColumns = await this.getTableColumns("categories");
    const scope = this.appendOwnershipWhere(categoryColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const [result] = await pool.query(`DELETE FROM categories WHERE id = ?${andScope}`, [id, ...scope.params]);
    return (result as any).affectedRows > 0;
  }

  // ==================== PRICE TABLES ====================
  async getPriceTables(userId?: string, brandId?: string | null): Promise<PriceTable[]> {
    await this.ensureOwnershipSchema();
    const priceTableColumns = await this.getTableColumns("price_tables");
    const scope = this.appendOwnershipWhere(priceTableColumns, userId, brandId);
    const [rows] = await pool.query(`SELECT * FROM price_tables${scope.sql} ORDER BY created_at DESC`, scope.params);
    const tables: PriceTable[] = [];
    for (const row of rows as any[]) {
      const [items] = await pool.query("SELECT * FROM price_table_items WHERE price_table_id = ?", [row.id]);
      tables.push(this.mapPriceTable(row, items as any[]));
    }
    return tables;
  }

  async getPriceTable(id: string, userId?: string, brandId?: string | null): Promise<PriceTable | undefined> {
    await this.ensureOwnershipSchema();
    const priceTableColumns = await this.getTableColumns("price_tables");
    const scope = this.appendOwnershipWhere(priceTableColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const [rows] = await pool.query(`SELECT * FROM price_tables WHERE id = ?${andScope}`, [id, ...scope.params]);
    if ((rows as any[]).length === 0) return undefined;
    const [items] = await pool.query("SELECT * FROM price_table_items WHERE price_table_id = ?", [id]);
    return this.mapPriceTable((rows as any[])[0], items as any[]);
  }

  async createPriceTable(
    data: Omit<PriceTable, "id" | "createdAt">,
    userId?: string,
    brandId?: string | null
  ): Promise<PriceTable> {
    await this.ensureOwnershipSchema();
    const id = `pt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date();
    const priceTableColumns = await this.getTableColumns("price_tables");
    const insertColumns = ["id", "name", "description", "valid_from", "valid_until", "active", "created_at"];
    const insertValues: any[] = [id, data.name, data.description || "", data.validFrom || null, data.validUntil || null, data.active !== false, now];

    if (priceTableColumns.has("user_id") && userId) {
      insertColumns.push("user_id");
      insertValues.push(userId);
    } else if (priceTableColumns.has("created_by") && userId) {
      insertColumns.push("created_by");
      insertValues.push(userId);
    }
    if (priceTableColumns.has("brand_id")) {
      insertColumns.push("brand_id");
      insertValues.push(this.normalizeBrandId(brandId));
    }

    await pool.query(
      `INSERT INTO price_tables (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`,
      insertValues
    );
    if (data.products && data.products.length > 0) {
      for (const p of data.products) {
        await pool.query(
          "INSERT INTO price_table_items (price_table_id, product_id, custom_price, custom_promo_price, include_in_campaign) VALUES (?, ?, ?, ?, ?)",
          [id, p.productId, p.customPrice || null, p.customPromoPrice || null, p.includeInCampaign !== false]
        );
      }
    }
    logger.info(`Price table created: ${data.name}`);
    return (await this.getPriceTable(id, userId, brandId))!;
  }

  async updatePriceTable(id: string, data: Partial<PriceTable>, userId?: string, brandId?: string | null): Promise<PriceTable | null> {
    await this.ensureOwnershipSchema();
    const existing = await this.getPriceTable(id, userId, brandId);
    if (!existing) return null;
    const priceTableColumns = await this.getTableColumns("price_tables");
    const scope = this.appendOwnershipWhere(priceTableColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.validFrom !== undefined) { fields.push("valid_from = ?"); values.push(data.validFrom); }
    if (data.validUntil !== undefined) { fields.push("valid_until = ?"); values.push(data.validUntil); }
    if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active); }
    if (fields.length > 0) {
      values.push(id, ...scope.params);
      await pool.query(`UPDATE price_tables SET ${fields.join(", ")} WHERE id = ?${andScope}`, values);
    }
    if (data.products !== undefined) {
      await pool.query("DELETE FROM price_table_items WHERE price_table_id = ?", [id]);
      for (const p of data.products) {
        await pool.query(
          "INSERT INTO price_table_items (price_table_id, product_id, custom_price, custom_promo_price, include_in_campaign) VALUES (?, ?, ?, ?, ?)",
          [id, p.productId, p.customPrice || null, p.customPromoPrice || null, p.includeInCampaign !== false]
        );
      }
    }
    return (await this.getPriceTable(id, userId, brandId))!;
  }

  async deletePriceTable(id: string, userId?: string, brandId?: string | null): Promise<boolean> {
    await this.ensureOwnershipSchema();
    const priceTableColumns = await this.getTableColumns("price_tables");
    const scope = this.appendOwnershipWhere(priceTableColumns, userId, brandId);
    const andScope = scope.sql ? ` AND ${scope.sql.replace(/^\s*WHERE\s+/i, "")}` : "";
    const [result] = await pool.query(`DELETE FROM price_tables WHERE id = ?${andScope}`, [id, ...scope.params]);
    return (result as any).affectedRows > 0;
  }

  private mapPriceTable(row: any, items: any[]): PriceTable {
    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      active: Boolean(row.active),
      is_active: Boolean(row.active),
      createdAt: row.created_at,
      products: items.map((i: any) => ({
        productId: i.product_id,
        customPrice: i.custom_price ? parseFloat(i.custom_price) : undefined,
        customPromoPrice: i.custom_promo_price ? parseFloat(i.custom_promo_price) : undefined,
        includeInCampaign: Boolean(i.include_in_campaign),
      })),
    };
  }

  // ==================== CAMPAIGN HELPERS ====================
  async getProductsForCampaign(priceTableId?: string, userId?: string, brandId?: string | null): Promise<any[]> {
    const products = await this.getActiveProducts(userId, brandId);
    if (!priceTableId) {
      return products.map((p) => ({
        id: p.id, name: p.name, description: p.description, category: p.category,
        price: p.price, promoPrice: p.promoPrice, unit: p.unit, features: p.features,
      }));
    }
    const table = await this.getPriceTable(priceTableId, userId, brandId);
    if (!table) return [];
    return table.products
      .filter((entry) => entry.includeInCampaign)
      .map((entry) => {
        const product = products.find((p) => p.id === entry.productId);
        if (!product) return null;
        return {
          id: product.id, name: product.name, description: product.description, category: product.category,
          price: entry.customPrice || product.price, promoPrice: entry.customPromoPrice || product.promoPrice,
          unit: product.unit, features: product.features,
        };
      })
      .filter(Boolean);
  }

  async formatProductsForPrompt(priceTableId?: string, userId?: string, brandId?: string | null): Promise<string> {
    const products = await this.getProductsForCampaign(priceTableId, userId, brandId);
    if (products.length === 0) return "Nenhum produto cadastrado.";
    return products
      .map((p) => {
        let line = `- ${p.name} (${p.category}): R$ ${p.price.toFixed(2)}`;
        if (p.promoPrice) line += ` | Promo: R$ ${p.promoPrice.toFixed(2)}`;
        line += ` / ${p.unit}`;
        if (p.description) line += `\n  ${p.description}`;
        if (p.features && p.features.length > 0) line += `\n  Destaques: ${p.features.join(", ")}`;
        return line;
      })
      .join("\n");
  }
}

