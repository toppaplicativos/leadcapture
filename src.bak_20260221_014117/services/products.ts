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
  // ==================== PRODUCTS ====================
  async getProducts(): Promise<Product[]> {
    const [rows] = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
    return (rows as any[]).map(this.mapProduct);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [id]);
    const arr = rows as any[];
    return arr.length > 0 ? this.mapProduct(arr[0]) : undefined;
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    const [rows] = await pool.query("SELECT * FROM products WHERE category = ?", [category]);
    return (rows as any[]).map(this.mapProduct);
  }

  async getActiveProducts(): Promise<Product[]> {
    const [rows] = await pool.query("SELECT * FROM products WHERE active = true ORDER BY created_at DESC");
    return (rows as any[]).map(this.mapProduct);
  }

  async createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt">): Promise<Product> {
    const id = `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date();
    const features = Array.isArray(data.features) ? JSON.stringify(data.features) : "[]";
    await pool.query(
      `INSERT INTO products (id, name, description, category, price, promo_price, unit, features, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.description || "", data.category || null, data.price || 0, data.promoPrice || null, data.unit || "unidade", features, data.active !== false, now, now]
    );
    logger.info(`Product created: ${data.name} (${id})`);
    return (await this.getProduct(id))!;
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product | null> {
    const existing = await this.getProduct(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.category !== undefined) { fields.push("category = ?"); values.push(data.category); }
    if (data.price !== undefined) { fields.push("price = ?"); values.push(data.price); }
    if (data.promoPrice !== undefined) { fields.push("promo_price = ?"); values.push(data.promoPrice); }
    if (data.unit !== undefined) { fields.push("unit = ?"); values.push(data.unit); }
    if (data.features !== undefined) { fields.push("features = ?"); values.push(JSON.stringify(data.features)); }
    if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active); }
    if (fields.length === 0) return existing;
    fields.push("updated_at = ?"); values.push(new Date());
    values.push(id);
    await pool.query(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values);
    logger.info(`Product updated: ${data.name || existing.name} (${id})`);
    return (await this.getProduct(id))!;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const [result] = await pool.query("DELETE FROM products WHERE id = ?", [id]);
    const deleted = (result as any).affectedRows > 0;
    if (deleted) logger.info(`Product deleted: ${id}`);
    return deleted;
  }

  private mapProduct(row: any): Product {
    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      category: row.category || "",
      price: parseFloat(row.price) || 0,
      promoPrice: row.promo_price ? parseFloat(row.promo_price) : undefined,
      unit: row.unit || "unidade",
      features: typeof row.features === "string" ? JSON.parse(row.features) : (row.features || []),
      active: Boolean(row.active),
      is_active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==================== CATEGORIES ====================
  async getCategories(): Promise<ProductCategory[]> {
    const [rows] = await pool.query("SELECT * FROM categories ORDER BY created_at DESC");
    return (rows as any[]).map((r: any) => ({ id: r.id, name: r.name, description: r.description || "", color: r.color || "#3b82f6" }));
  }

  async createCategory(data: Omit<ProductCategory, "id">): Promise<ProductCategory> {
    const id = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    await pool.query(
      "INSERT INTO categories (id, name, description, color) VALUES (?, ?, ?, ?)",
      [id, data.name, data.description || "", data.color || "#3b82f6"]
    );
    logger.info(`Category created: ${data.name}`);
    return { id, name: data.name, description: data.description, color: data.color || "#3b82f6" };
  }

  async updateCategory(id: string, data: Partial<ProductCategory>): Promise<ProductCategory | null> {
    const [existing] = await pool.query("SELECT * FROM categories WHERE id = ?", [id]);
    if ((existing as any[]).length === 0) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.color !== undefined) { fields.push("color = ?"); values.push(data.color); }
    if (fields.length === 0) return (existing as any[])[0];
    values.push(id);
    await pool.query(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`, values);
    const [updated] = await pool.query("SELECT * FROM categories WHERE id = ?", [id]);
    const r = (updated as any[])[0];
    return { id: r.id, name: r.name, description: r.description, color: r.color };
  }

  async deleteCategory(id: string): Promise<boolean> {
    const [result] = await pool.query("DELETE FROM categories WHERE id = ?", [id]);
    return (result as any).affectedRows > 0;
  }

  // ==================== PRICE TABLES ====================
  async getPriceTables(): Promise<PriceTable[]> {
    const [rows] = await pool.query("SELECT * FROM price_tables ORDER BY created_at DESC");
    const tables: PriceTable[] = [];
    for (const row of rows as any[]) {
      const [items] = await pool.query("SELECT * FROM price_table_items WHERE price_table_id = ?", [row.id]);
      tables.push(this.mapPriceTable(row, items as any[]));
    }
    return tables;
  }

  async getPriceTable(id: string): Promise<PriceTable | undefined> {
    const [rows] = await pool.query("SELECT * FROM price_tables WHERE id = ?", [id]);
    if ((rows as any[]).length === 0) return undefined;
    const [items] = await pool.query("SELECT * FROM price_table_items WHERE price_table_id = ?", [id]);
    return this.mapPriceTable((rows as any[])[0], items as any[]);
  }

  async createPriceTable(data: Omit<PriceTable, "id" | "createdAt">): Promise<PriceTable> {
    const id = `pt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date();
    await pool.query(
      "INSERT INTO price_tables (id, name, description, valid_from, valid_until, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, data.name, data.description || "", data.validFrom || null, data.validUntil || null, data.active !== false, now]
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
    return (await this.getPriceTable(id))!;
  }

  async updatePriceTable(id: string, data: Partial<PriceTable>): Promise<PriceTable | null> {
    const existing = await this.getPriceTable(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.validFrom !== undefined) { fields.push("valid_from = ?"); values.push(data.validFrom); }
    if (data.validUntil !== undefined) { fields.push("valid_until = ?"); values.push(data.validUntil); }
    if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active); }
    if (fields.length > 0) {
      values.push(id);
      await pool.query(`UPDATE price_tables SET ${fields.join(", ")} WHERE id = ?`, values);
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
    return (await this.getPriceTable(id))!;
  }

  async deletePriceTable(id: string): Promise<boolean> {
    const [result] = await pool.query("DELETE FROM price_tables WHERE id = ?", [id]);
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
  async getProductsForCampaign(priceTableId?: string): Promise<any[]> {
    const products = await this.getActiveProducts();
    if (!priceTableId) {
      return products.map((p) => ({
        id: p.id, name: p.name, description: p.description, category: p.category,
        price: p.price, promoPrice: p.promoPrice, unit: p.unit, features: p.features,
      }));
    }
    const table = await this.getPriceTable(priceTableId);
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

  async formatProductsForPrompt(priceTableId?: string): Promise<string> {
    const products = await this.getProductsForCampaign(priceTableId);
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

