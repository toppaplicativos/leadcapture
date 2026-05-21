/**
 * OfferCatalog service — Variants & Collections (Fase 1 da arquitetura universal).
 * Variants: até N por produto (cor/tamanho/peso/etc). Cada variante pode sobrescrever preço/estoque.
 * Collections: agrupamentos de produtos para destaque (manual agora, auto-rules em fase futura).
 */
import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";

export interface ProductVariant {
  id: string;
  product_id: string;
  sku?: string | null;
  barcode?: string | null;
  name?: string | null;
  attributes: Record<string, any>;
  price: number | null;
  promo_price: number | null;
  stock_quantity: number | null;
  image_url?: string | null;
  position: number;
  is_active: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface VariantUpsertDTO {
  id?: string;
  sku?: string | null;
  barcode?: string | null;
  name?: string | null;
  attributes?: Record<string, any>;
  price?: number | null;
  promo_price?: number | null;
  stock_quantity?: number | null;
  image_url?: string | null;
  position?: number;
  is_active?: boolean;
}

export interface Collection {
  id: string;
  brand_id: string | null;
  user_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  type: "manual" | "auto";
  product_ids: string[];
  filter_rules: Record<string, any>;
  image_url: string | null;
  position: number;
  is_active: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CollectionUpsertDTO {
  name: string;
  slug?: string;
  description?: string | null;
  type?: "manual" | "auto";
  product_ids?: string[];
  filter_rules?: Record<string, any>;
  image_url?: string | null;
  position?: number;
  is_active?: boolean;
}

function toSlug(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export class OfferCatalogService {
  /** Map a row from product_variants to the public Variant shape. */
  private mapVariantRow(row: any): ProductVariant {
    return {
      id: String(row.id),
      product_id: String(row.product_id),
      sku: row.sku || null,
      barcode: row.barcode || null,
      name: row.name || null,
      attributes: parseJsonField<Record<string, any>>(row.attributes_json, {}),
      price: row.price != null ? parseFloat(row.price) : null,
      promo_price: row.promo_price != null && parseFloat(row.promo_price) > 0 ? parseFloat(row.promo_price) : null,
      stock_quantity: row.stock_quantity != null ? Number(row.stock_quantity) : null,
      image_url: row.image_url || null,
      position: Number(row.position || 0),
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async getVariantsByProduct(productId: string): Promise<ProductVariant[]> {
    const id = String(productId || "").trim();
    if (!id) return [];
    try {
      const rows = (await query<any[]>(
        `SELECT * FROM product_variants WHERE product_id = ? ORDER BY position ASC, created_at ASC`,
        [id]
      )) as any[];
      return rows.map((r) => this.mapVariantRow(r));
    } catch (e: any) {
      logger.warn(`getVariantsByProduct failed for ${id}: ${e?.message || e}`);
      return [];
    }
  }

  async getVariantsByProductIds(productIds: string[]): Promise<Map<string, ProductVariant[]>> {
    const ids = (productIds || []).map((x) => String(x || "").trim()).filter(Boolean);
    const out = new Map<string, ProductVariant[]>();
    if (ids.length === 0) return out;
    const placeholders = ids.map(() => "?").join(",");
    try {
      const rows = (await query<any[]>(
        `SELECT * FROM product_variants WHERE product_id IN (${placeholders}) ORDER BY position ASC, created_at ASC`,
        ids
      )) as any[];
      for (const r of rows) {
        const pid = String(r.product_id);
        const arr = out.get(pid) || [];
        arr.push(this.mapVariantRow(r));
        out.set(pid, arr);
      }
    } catch (e: any) {
      logger.warn(`getVariantsByProductIds failed: ${e?.message || e}`);
    }
    return out;
  }

  /**
   * Replace the entire variant set for a product (idempotent upsert).
   * Variants without `id` are inserted; existing ones are updated; ones not present in payload are deleted.
   */
  async replaceVariants(productId: string, variants: VariantUpsertDTO[]): Promise<ProductVariant[]> {
    const id = String(productId || "").trim();
    if (!id) throw new Error("productId is required");
    const payload = Array.isArray(variants) ? variants : [];

    const existing = await this.getVariantsByProduct(id);
    const existingById = new Map(existing.map((v) => [v.id, v]));
    const keepIds = new Set<string>();

    for (let i = 0; i < payload.length; i += 1) {
      const v = payload[i] || {};
      const variantId = String(v.id || "").trim();
      const position = Number(v.position ?? i);
      const data = {
        sku: v.sku || null,
        barcode: v.barcode || null,
        name: v.name || null,
        attributes: v.attributes && typeof v.attributes === "object" ? v.attributes : {},
        price: num(v.price),
        promo_price: num(v.promo_price),
        stock_quantity: num(v.stock_quantity),
        image_url: v.image_url || null,
        position,
        is_active: v.is_active !== false,
      };

      if (variantId && existingById.has(variantId)) {
        keepIds.add(variantId);
        await update(
          `UPDATE product_variants
           SET sku = ?, barcode = ?, name = ?, attributes_json = ?, price = ?, promo_price = ?,
               stock_quantity = ?, image_url = ?, position = ?, is_active = ?, updated_at = NOW()
           WHERE id = ? AND product_id = ?`,
          [
            data.sku, data.barcode, data.name, JSON.stringify(data.attributes),
            data.price, data.promo_price, data.stock_quantity, data.image_url,
            data.position, data.is_active, variantId, id,
          ]
        );
      } else {
        const newId = variantId || randomUUID();
        keepIds.add(newId);
        await insert(
          `INSERT INTO product_variants
            (id, product_id, sku, barcode, name, attributes_json, price, promo_price, stock_quantity, image_url, position, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId, id, data.sku, data.barcode, data.name, JSON.stringify(data.attributes),
            data.price, data.promo_price, data.stock_quantity, data.image_url,
            data.position, data.is_active,
          ]
        );
      }
    }

    /* Delete the ones not present in the payload */
    for (const v of existing) {
      if (!keepIds.has(v.id)) {
        await update(`DELETE FROM product_variants WHERE id = ?`, [v.id]);
      }
    }

    return this.getVariantsByProduct(id);
  }

  // ────────────────────────────  COLLECTIONS  ────────────────────────────

  private mapCollectionRow(row: any): Collection {
    return {
      id: String(row.id),
      brand_id: row.brand_id || null,
      user_id: row.user_id || null,
      slug: String(row.slug),
      name: String(row.name),
      description: row.description || null,
      type: (row.type === "auto" ? "auto" : "manual") as "manual" | "auto",
      product_ids: parseJsonField<string[]>(row.product_ids, []),
      filter_rules: parseJsonField<Record<string, any>>(row.filter_rules, {}),
      image_url: row.image_url || null,
      position: Number(row.position || 0),
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async listCollections(userId: string, brandId: string | null): Promise<Collection[]> {
    const rows = brandId
      ? ((await query<any[]>(
          `SELECT * FROM collections WHERE user_id = ? AND brand_id = ? ORDER BY position ASC, created_at DESC`,
          [userId, brandId]
        )) as any[])
      : ((await query<any[]>(
          `SELECT * FROM collections WHERE user_id = ? AND brand_id IS NULL ORDER BY position ASC, created_at DESC`,
          [userId]
        )) as any[]);
    return rows.map((r) => this.mapCollectionRow(r));
  }

  async listActiveCollectionsByBrand(brandId: string | null): Promise<Collection[]> {
    const rows = brandId
      ? ((await query<any[]>(
          `SELECT * FROM collections WHERE is_active = TRUE AND brand_id = ? ORDER BY position ASC, created_at DESC`,
          [brandId]
        )) as any[])
      : ((await query<any[]>(
          `SELECT * FROM collections WHERE is_active = TRUE AND brand_id IS NULL ORDER BY position ASC, created_at DESC`,
          []
        )) as any[]);
    return rows.map((r) => this.mapCollectionRow(r));
  }

  async getCollection(id: string, userId: string): Promise<Collection | null> {
    const row = await queryOne<any>(`SELECT * FROM collections WHERE id = ? AND user_id = ? LIMIT 1`, [id, userId]);
    return row ? this.mapCollectionRow(row) : null;
  }

  async createCollection(dto: CollectionUpsertDTO, userId: string, brandId: string | null): Promise<Collection> {
    const name = String(dto.name || "").trim();
    if (!name) throw new Error("Collection name is required");
    const slug = toSlug(dto.slug || dto.name);
    const id = randomUUID();
    await insert(
      `INSERT INTO collections
        (id, brand_id, user_id, slug, name, description, type, product_ids, filter_rules, image_url, position, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        brandId,
        userId,
        slug,
        name,
        String(dto.description || "").trim() || null,
        dto.type === "auto" ? "auto" : "manual",
        JSON.stringify(Array.isArray(dto.product_ids) ? dto.product_ids : []),
        JSON.stringify(dto.filter_rules && typeof dto.filter_rules === "object" ? dto.filter_rules : {}),
        dto.image_url || null,
        Number(dto.position ?? 0),
        dto.is_active !== false,
      ]
    );
    const row = await queryOne<any>(`SELECT * FROM collections WHERE id = ?`, [id]);
    return this.mapCollectionRow(row);
  }

  async updateCollection(id: string, dto: Partial<CollectionUpsertDTO>, userId: string): Promise<Collection | null> {
    const existing = await this.getCollection(id, userId);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (dto.name !== undefined) { fields.push("name = ?"); values.push(String(dto.name).trim() || existing.name); }
    if (dto.slug !== undefined) { fields.push("slug = ?"); values.push(toSlug(dto.slug) || existing.slug); }
    if (dto.description !== undefined) { fields.push("description = ?"); values.push(String(dto.description || "").trim() || null); }
    if (dto.type !== undefined) { fields.push("type = ?"); values.push(dto.type === "auto" ? "auto" : "manual"); }
    if (dto.product_ids !== undefined) { fields.push("product_ids = ?"); values.push(JSON.stringify(Array.isArray(dto.product_ids) ? dto.product_ids : [])); }
    if (dto.filter_rules !== undefined) { fields.push("filter_rules = ?"); values.push(JSON.stringify(dto.filter_rules || {})); }
    if (dto.image_url !== undefined) { fields.push("image_url = ?"); values.push(dto.image_url || null); }
    if (dto.position !== undefined) { fields.push("position = ?"); values.push(Number(dto.position)); }
    if (dto.is_active !== undefined) { fields.push("is_active = ?"); values.push(dto.is_active !== false); }

    if (fields.length === 0) return existing;
    fields.push("updated_at = NOW()");
    values.push(id, userId);
    await update(`UPDATE collections SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, values);
    return this.getCollection(id, userId);
  }

  async deleteCollection(id: string, userId: string): Promise<boolean> {
    const affected = await update(`DELETE FROM collections WHERE id = ? AND user_id = ?`, [id, userId]);
    return affected > 0;
  }

  /**
   * Resolve product IDs for a collection — handles manual list directly and auto-rules
   * by filtering against a set of products provided by the caller.
   */
  resolveProductIds(collection: Collection, availableProducts: Array<{ id: string; price?: number; promoPrice?: number; category?: string; type?: string; cta_type?: string }>): string[] {
    if (collection.type === "manual") {
      return collection.product_ids || [];
    }
    const rules = collection.filter_rules || {};
    return availableProducts
      .filter((p) => {
        if (rules.price_max != null) {
          const effective = (p.promoPrice && p.promoPrice > 0) ? p.promoPrice : (p.price || 0);
          if (effective > Number(rules.price_max)) return false;
        }
        if (rules.price_min != null) {
          const effective = (p.promoPrice && p.promoPrice > 0) ? p.promoPrice : (p.price || 0);
          if (effective < Number(rules.price_min)) return false;
        }
        if (Array.isArray(rules.category_ids) && rules.category_ids.length > 0) {
          if (!rules.category_ids.includes(p.category)) return false;
        }
        if (Array.isArray(rules.types) && rules.types.length > 0) {
          if (!rules.types.includes(p.type || "physical_product")) return false;
        }
        if (Array.isArray(rules.cta_types) && rules.cta_types.length > 0) {
          if (!rules.cta_types.includes(p.cta_type || "buy")) return false;
        }
        return true;
      })
      .map((p) => p.id);
  }
}

export const offerCatalogService = new OfferCatalogService();

// ════════════════════════════════════════════════════════
//   ATTRIBUTE DEFINITIONS (Fase 2)
// ════════════════════════════════════════════════════════

export type AttributeType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multi_select"
  | "color"
  | "date";

export interface AttributeDefinition {
  id: string;
  brand_id: string | null;
  user_id: string | null;
  key: string;
  label: string;
  type: AttributeType;
  options: string[];
  required: boolean;
  is_filter: boolean;
  position: number;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface AttributeDefinitionUpsertDTO {
  key?: string;
  label: string;
  type?: AttributeType;
  options?: string[];
  required?: boolean;
  is_filter?: boolean;
  position?: number;
}

function toAttrKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

const ALLOWED_ATTR_TYPES = new Set<AttributeType>([
  "text", "textarea", "number", "boolean", "select", "multi_select", "color", "date",
]);

function normalizeAttrType(value: unknown): AttributeType {
  const v = String(value || "text").toLowerCase() as AttributeType;
  return ALLOWED_ATTR_TYPES.has(v) ? v : "text";
}

export class AttributeDefinitionService {
  private mapRow(row: any): AttributeDefinition {
    return {
      id: String(row.id),
      brand_id: row.brand_id || null,
      user_id: row.user_id || null,
      key: String(row.key),
      label: String(row.label),
      type: normalizeAttrType(row.type),
      options: parseJsonField<string[]>(row.options, []),
      required: Boolean(row.required),
      is_filter: row.is_filter !== false,
      position: Number(row.position || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async list(userId: string, brandId: string | null): Promise<AttributeDefinition[]> {
    const rows = brandId
      ? ((await query<any[]>(
          `SELECT * FROM attribute_definitions WHERE user_id = ? AND brand_id = ? ORDER BY position ASC, label ASC`,
          [userId, brandId]
        )) as any[])
      : ((await query<any[]>(
          `SELECT * FROM attribute_definitions WHERE user_id = ? AND brand_id IS NULL ORDER BY position ASC, label ASC`,
          [userId]
        )) as any[]);
    return rows.map((r) => this.mapRow(r));
  }

  async listForPublic(brandId: string | null): Promise<AttributeDefinition[]> {
    const rows = brandId
      ? ((await query<any[]>(
          `SELECT * FROM attribute_definitions WHERE brand_id = ? AND is_filter = TRUE ORDER BY position ASC, label ASC`,
          [brandId]
        )) as any[])
      : [];
    return rows.map((r) => this.mapRow(r));
  }

  async create(dto: AttributeDefinitionUpsertDTO, userId: string, brandId: string | null): Promise<AttributeDefinition> {
    const label = String(dto.label || "").trim();
    if (!label) throw new Error("Attribute label is required");
    const key = toAttrKey(dto.key || dto.label);
    if (!key) throw new Error("Attribute key is invalid");

    /* Reject duplicate keys per brand */
    const existing = brandId
      ? await queryOne<any>(`SELECT id FROM attribute_definitions WHERE user_id = ? AND brand_id = ? AND key = ? LIMIT 1`, [userId, brandId, key])
      : await queryOne<any>(`SELECT id FROM attribute_definitions WHERE user_id = ? AND brand_id IS NULL AND key = ? LIMIT 1`, [userId, key]);
    if (existing) throw new Error(`Attribute "${key}" já existe nesta marca`);

    const id = randomUUID();
    await insert(
      `INSERT INTO attribute_definitions
        (id, brand_id, user_id, key, label, type, options, required, is_filter, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, brandId, userId, key, label,
        normalizeAttrType(dto.type),
        JSON.stringify(Array.isArray(dto.options) ? dto.options : []),
        Boolean(dto.required),
        dto.is_filter !== false,
        Number(dto.position ?? 0),
      ]
    );
    const row = await queryOne<any>(`SELECT * FROM attribute_definitions WHERE id = ?`, [id]);
    return this.mapRow(row);
  }

  async update(id: string, dto: Partial<AttributeDefinitionUpsertDTO>, userId: string): Promise<AttributeDefinition | null> {
    const existing = await queryOne<any>(`SELECT * FROM attribute_definitions WHERE id = ? AND user_id = ? LIMIT 1`, [id, userId]);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    if (dto.label !== undefined) { fields.push("label = ?"); values.push(String(dto.label).trim() || existing.label); }
    if (dto.type !== undefined) { fields.push("type = ?"); values.push(normalizeAttrType(dto.type)); }
    if (dto.options !== undefined) { fields.push("options = ?"); values.push(JSON.stringify(Array.isArray(dto.options) ? dto.options : [])); }
    if (dto.required !== undefined) { fields.push("required = ?"); values.push(Boolean(dto.required)); }
    if (dto.is_filter !== undefined) { fields.push("is_filter = ?"); values.push(Boolean(dto.is_filter)); }
    if (dto.position !== undefined) { fields.push("position = ?"); values.push(Number(dto.position)); }
    if (fields.length === 0) return this.mapRow(existing);
    fields.push("updated_at = NOW()");
    values.push(id, userId);
    await update(`UPDATE attribute_definitions SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, values);
    const row = await queryOne<any>(`SELECT * FROM attribute_definitions WHERE id = ?`, [id]);
    return this.mapRow(row);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const affected = await update(`DELETE FROM attribute_definitions WHERE id = ? AND user_id = ?`, [id, userId]);
    return affected > 0;
  }
}

export const attributeDefinitionService = new AttributeDefinitionService();

// ════════════════════════════════════════════════════════
//   PRODUCT RELATIONS (Fase 6)
// ════════════════════════════════════════════════════════

export type RelationType = "related" | "upsell" | "cross_sell" | "bundle";

export interface ProductRelation {
  id: string;
  product_id: string;
  related_product_id: string;
  type: RelationType;
  position: number;
}

function normalizeRelationType(v: unknown): RelationType {
  const s = String(v || "related").toLowerCase();
  if (s === "upsell" || s === "cross_sell" || s === "bundle") return s as RelationType;
  return "related";
}

export class ProductRelationsService {
  private mapRow(row: any): ProductRelation {
    return {
      id: String(row.id),
      product_id: String(row.product_id),
      related_product_id: String(row.related_product_id),
      type: normalizeRelationType(row.type),
      position: Number(row.position || 0),
    };
  }

  async listForProduct(productId: string): Promise<ProductRelation[]> {
    const id = String(productId || "").trim();
    if (!id) return [];
    try {
      const rows = (await query<any[]>(
        `SELECT * FROM product_relations WHERE product_id = ? ORDER BY position ASC, created_at ASC`,
        [id]
      )) as any[];
      return rows.map((r) => this.mapRow(r));
    } catch (e: any) {
      logger.warn(`listForProduct relations failed: ${e?.message || e}`);
      return [];
    }
  }

  async listForProducts(productIds: string[]): Promise<Map<string, ProductRelation[]>> {
    const ids = (productIds || []).map((x) => String(x || "").trim()).filter(Boolean);
    const out = new Map<string, ProductRelation[]>();
    if (ids.length === 0) return out;
    const placeholders = ids.map(() => "?").join(",");
    try {
      const rows = (await query<any[]>(
        `SELECT * FROM product_relations WHERE product_id IN (${placeholders}) ORDER BY position ASC, created_at ASC`,
        ids
      )) as any[];
      for (const r of rows) {
        const pid = String(r.product_id);
        const arr = out.get(pid) || [];
        arr.push(this.mapRow(r));
        out.set(pid, arr);
      }
    } catch (e: any) {
      logger.warn(`listForProducts relations failed: ${e?.message || e}`);
    }
    return out;
  }

  /**
   * Replace the entire relation set for a product (idempotent upsert).
   * Pass an array of { related_product_id, type, position } — service generates IDs and clears the diff.
   */
  async replaceRelations(productId: string, relations: Array<{ related_product_id: string; type?: RelationType; position?: number }>): Promise<ProductRelation[]> {
    const id = String(productId || "").trim();
    if (!id) throw new Error("productId is required");
    await update(`DELETE FROM product_relations WHERE product_id = ?`, [id]);
    const payload = Array.isArray(relations) ? relations : [];
    for (let i = 0; i < payload.length; i += 1) {
      const r = payload[i] || {};
      const relId = String(r.related_product_id || "").trim();
      if (!relId || relId === id) continue;
      await insert(
        `INSERT INTO product_relations (id, product_id, related_product_id, type, position) VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), id, relId, normalizeRelationType(r.type), Number(r.position ?? i)]
      );
    }
    return this.listForProduct(id);
  }
}

export const productRelationsService = new ProductRelationsService();


