import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import { config } from "../config";

export type BrandUnit = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  cover_image?: string | null;
  site_url?: string | null;
  sales_page_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  tiktok_url?: string | null;
  slogan?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  whatsapp_phone?: string | null;
  theme_json?: any;
  voice_json?: any;
  domain?: string | null;
  status: "active" | "archived";
  is_default: number;
  created_at?: string;
  updated_at?: string;
};

function toSlug(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeLogoUrl(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  /* Force https:// — the app is served exclusively over HTTPS, so any saved
   * http:// URL would trigger Mixed Content in the browser. localhost stays http. */
  if (normalized.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(normalized)) {
    return "https://" + normalized.slice("http://".length);
  }
  return normalized;
}

export class BrandUnitsService {
  private schemaReady = false;
  private schemaReadyPromise: Promise<void> | null = null;

  private async tableExists(tableName: string): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return Number(row?.total || 0) > 0;
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return Number(row?.total || 0) > 0;
  }

  private async indexExists(tableName: string, indexName: string): Promise<boolean> {
    try {
      const row = await queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM pg_indexes
         WHERE tablename = ?
           AND indexname = ?`,
        [tableName, indexName]
      );
      return Number(row?.total || 0) > 0;
    } catch {
      try {
        const row = await queryOne<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
          [tableName, indexName]
        );
        return Number(row?.total || 0) > 0;
      } catch {
        try {
          const rows = await query<any[]>(`SHOW INDEX FROM ${tableName} WHERE Key_name = ?`, [indexName]);
          return Array.isArray(rows) && rows.length > 0;
        } catch {
          return false;
        }
      }
    }
  }

  private async ensureTableBrandColumnAndIndex(
    tableName: string,
    columnName: string,
    indexName: string
  ): Promise<void> {
    const exists = await this.tableExists(tableName);
    if (!exists) return;

    const hasColumn = await this.columnExists(tableName, columnName);
    if (!hasColumn) {
      await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} VARCHAR(36) NULL`);
    }

    const hasIndex = await this.indexExists(tableName, indexName);
    if (!hasIndex) {
      await query(`CREATE INDEX ${indexName} ON ${tableName} (${columnName})`);
    }
  }

  private async ensureTableColumn(tableName: string, columnName: string, columnDefinition: string): Promise<void> {
    const exists = await this.tableExists(tableName);
    if (!exists) return;
    const hasColumn = await this.columnExists(tableName, columnName);
    if (!hasColumn) {
      await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }

  async ensureSchema(): Promise<void> {
    if (config.postgres.connectionString || config.postgres.host) {
      if (this.schemaReady) return;
      if (this.schemaReadyPromise) {
        await this.schemaReadyPromise;
        return;
      }

      this.schemaReadyPromise = (async () => {
        await query(`
          CREATE TABLE IF NOT EXISTS brand_units (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            name VARCHAR(120) NOT NULL,
            slug VARCHAR(140) NOT NULL,
            logo_url TEXT NULL,
            cover_image TEXT NULL,
            site_url TEXT NULL,
            sales_page_url TEXT NULL,
            instagram_url TEXT NULL,
            facebook_url TEXT NULL,
            twitter_url TEXT NULL,
            tiktok_url TEXT NULL,
            slogan VARCHAR(255) NULL,
            primary_color VARCHAR(24) NULL,
            secondary_color VARCHAR(24) NULL,
            theme_json JSON NULL,
            voice_json JSON NULL,
            domain VARCHAR(255) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, slug)
          )
        `);

        await query(`
          CREATE TABLE IF NOT EXISTS user_brand_context (
            user_id VARCHAR(36) PRIMARY KEY,
            active_brand_id VARCHAR(36) NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await this.ensureTableColumn("brand_units", "cover_image", "TEXT NULL");
        await this.ensureTableColumn("brand_units", "site_url", "TEXT NULL");
        await this.ensureTableColumn("brand_units", "sales_page_url", "TEXT NULL");
        await this.ensureTableColumn("brand_units", "instagram_url", "TEXT NULL");
        await this.ensureTableColumn("brand_units", "facebook_url", "TEXT NULL");
        await this.ensureTableColumn("brand_units", "twitter_url", "TEXT NULL");
        await this.ensureTableColumn("brand_units", "tiktok_url", "TEXT NULL");
        await this.ensureTableColumn("brand_units", "slogan", "VARCHAR(255) NULL");
        await this.ensureTableColumn("brand_units", "primary_color", "VARCHAR(24) NULL");
        await this.ensureTableColumn("brand_units", "secondary_color", "VARCHAR(24) NULL");
        await this.ensureTableColumn("brand_units", "whatsapp_phone", "VARCHAR(40) NULL");
        /* Panfleteiro V2: estado de busca isolado por brand (resolve vazamento entre operacoes) */
        await this.ensureTableColumn("brand_units", "last_search_state", "JSONB NULL");
        /* Master org status: active | suspended | archived (VARCHAR, not ENUM) */
        try {
          await query(
            `ALTER TABLE brand_units ALTER COLUMN status TYPE VARCHAR(20)`,
          )
        } catch {
          /* ignore if already varchar or MySQL path */
        }

        this.schemaReady = true;
      })().finally(() => {
        this.schemaReadyPromise = null;
      });

      await this.schemaReadyPromise;
      this.schemaReady = true;
      return;
    }

    if (this.schemaReady) return;

    if (this.schemaReadyPromise) {
      await this.schemaReadyPromise;
      return;
    }

    this.schemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS brand_units (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          name VARCHAR(120) NOT NULL,
          slug VARCHAR(140) NOT NULL,
          logo_url TEXT NULL,
          cover_image TEXT NULL,
          site_url TEXT NULL,
          sales_page_url TEXT NULL,
          instagram_url TEXT NULL,
          facebook_url TEXT NULL,
          twitter_url TEXT NULL,
          tiktok_url TEXT NULL,
          slogan VARCHAR(255) NULL,
          primary_color VARCHAR(24) NULL,
          secondary_color VARCHAR(24) NULL,
          theme_json JSON NULL,
          voice_json JSON NULL,
          domain VARCHAR(255) NULL,
          status ENUM('active','archived') NOT NULL DEFAULT 'active',
          is_default TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_brand_user_slug (user_id, slug),
          KEY idx_brand_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.ensureTableColumn("brand_units", "cover_image", "TEXT NULL");
      await this.ensureTableColumn("brand_units", "site_url", "TEXT NULL");
      await this.ensureTableColumn("brand_units", "sales_page_url", "TEXT NULL");
      await this.ensureTableColumn("brand_units", "instagram_url", "TEXT NULL");
      await this.ensureTableColumn("brand_units", "facebook_url", "TEXT NULL");
      await this.ensureTableColumn("brand_units", "twitter_url", "TEXT NULL");
      await this.ensureTableColumn("brand_units", "tiktok_url", "TEXT NULL");
      await this.ensureTableColumn("brand_units", "slogan", "VARCHAR(255) NULL");
      await this.ensureTableColumn("brand_units", "primary_color", "VARCHAR(24) NULL");
      await this.ensureTableColumn("brand_units", "secondary_color", "VARCHAR(24) NULL");

      await query(`
        CREATE TABLE IF NOT EXISTS user_brand_context (
          user_id VARCHAR(36) PRIMARY KEY,
          active_brand_id VARCHAR(36) NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_brand_context_active (active_brand_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.ensureTableBrandColumnAndIndex("customers", "brand_id", "idx_customers_brand");
      await this.ensureTableBrandColumnAndIndex("message_log", "brand_id", "idx_message_log_brand");
      await this.ensureTableBrandColumnAndIndex("products", "brand_id", "idx_products_brand");
      await this.ensureTableBrandColumnAndIndex("categories", "brand_id", "idx_categories_brand");
      await this.ensureTableBrandColumnAndIndex("price_tables", "brand_id", "idx_price_tables_brand");
      await this.ensureTableBrandColumnAndIndex("expedition_dispatchers", "brand_id", "idx_expedition_dispatchers_brand");
      await this.ensureTableBrandColumnAndIndex("expedition_orders", "brand_id", "idx_expedition_orders_brand");
      await this.ensureTableBrandColumnAndIndex("whatsapp_instances", "brand_id", "idx_whatsapp_instances_brand");
      await this.ensureTableColumn("ai_agent_profiles", "company_id", "VARCHAR(36) NULL");
      const aiProfileCompanyIndexExists = await this.indexExists("ai_agent_profiles", "idx_ai_agent_profiles_company");
      if (!aiProfileCompanyIndexExists) {
        await query("CREATE INDEX idx_ai_agent_profiles_company ON ai_agent_profiles (company_id)");
      }

      this.schemaReady = true;
    })().finally(() => {
      this.schemaReadyPromise = null;
    });

    await this.schemaReadyPromise;
  }

  async list(userId: string): Promise<BrandUnit[]> {
    await this.ensureSchema();
    const rows = await query<BrandUnit[]>(
      `SELECT * FROM brand_units WHERE user_id = ? ORDER BY is_default DESC, created_at ASC`,
      [userId]
    );
    return (rows || []).map((item) => this.hydrateBrandUnit(item));
  }

  async getById(userId: string, brandId: string): Promise<BrandUnit | null> {
    await this.ensureSchema();
    const row =
      (await queryOne<BrandUnit>(
        `SELECT * FROM brand_units WHERE id = ? AND user_id = ? LIMIT 1`,
        [brandId, userId]
      )) || null;
    return row ? this.hydrateBrandUnit(row) : null;
  }

  /**
   * Panfleteiro V2 — estado de busca persistido por brand.
   * Cada brand guarda lat/lng/zoom/keyword/locationLabel/radius/filters separados,
   * resolvendo o vazamento entre operacoes ao trocar brand.
   */
  async getSearchState(userId: string, brandId: string): Promise<Record<string, any> | null> {
    await this.ensureSchema();
    const row = await queryOne<{ last_search_state: any }>(
      `SELECT last_search_state FROM brand_units WHERE id = ? AND user_id = ? LIMIT 1`,
      [brandId, userId]
    );
    if (!row || !row.last_search_state) return null;
    if (typeof row.last_search_state === "string") {
      try { return JSON.parse(row.last_search_state); } catch { return null; }
    }
    return row.last_search_state as Record<string, any>;
  }

  async setSearchState(userId: string, brandId: string, state: Record<string, any>): Promise<Record<string, any>> {
    await this.ensureSchema();
    /* Anexa updated_at para timeline interno */
    const payload = { ...state, updated_at: new Date().toISOString() };
    await update(
      `UPDATE brand_units SET last_search_state = ? WHERE id = ? AND user_id = ?`,
      [JSON.stringify(payload), brandId, userId]
    );
    return payload;
  }

  private hydrateBrandUnit(item: BrandUnit): BrandUnit {
    const next = { ...(item || {}) } as BrandUnit;

    let themeJsonParsed: any = next.theme_json;
    if (typeof themeJsonParsed === "string") {
      try {
        themeJsonParsed = JSON.parse(themeJsonParsed);
      } catch {
        themeJsonParsed = null;
      }
    }

    const fallbackLogo = normalizeLogoUrl(
      themeJsonParsed?.logo_url || themeJsonParsed?.logoUrl || themeJsonParsed?.logo
    );

    next.logo_url = normalizeLogoUrl(next.logo_url) || fallbackLogo;
    return next;
  }

  async create(
    userId: string,
    payload: {
      name: string;
      slug?: string;
      logo_url?: string;
      cover_image?: string;
      site_url?: string;
      sales_page_url?: string;
      instagram_url?: string;
      facebook_url?: string;
      twitter_url?: string;
      tiktok_url?: string;
      slogan?: string;
      primary_color?: string;
      secondary_color?: string;
      theme_json?: any;
      voice_json?: any;
      domain?: string;
      is_default?: boolean;
    }
  ): Promise<BrandUnit> {
    await this.ensureSchema();

    const name = String(payload.name || "").trim();
    if (!name) throw new Error("Brand name is required");

    const existingCount = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM brand_units WHERE user_id = ?`,
      [userId]
    );
    const shouldBeDefault = Number(existingCount?.total || 0) === 0 || Boolean(payload.is_default);
    const slug = toSlug(payload.slug || name);
    if (!slug) throw new Error("Brand slug is invalid");

    if (shouldBeDefault) {
      await update(`UPDATE brand_units SET is_default = FALSE WHERE user_id = ?`, [userId]);
    }

    const id = randomUUID();
    await query(
      `INSERT INTO brand_units
       (id, user_id, name, slug, logo_url, cover_image, site_url, sales_page_url, instagram_url, facebook_url, twitter_url, tiktok_url, slogan, primary_color, secondary_color, theme_json, voice_json, domain, status, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        id,
        userId,
        name,
        slug,
        normalizeLogoUrl(payload.logo_url),
        normalizeLogoUrl(payload.cover_image),
        payload.site_url || null,
        payload.sales_page_url || null,
        payload.instagram_url || null,
        payload.facebook_url || null,
        payload.twitter_url || null,
        payload.tiktok_url || null,
        payload.slogan || null,
        payload.primary_color || null,
        payload.secondary_color || null,
        payload.theme_json ? JSON.stringify(payload.theme_json) : null,
        payload.voice_json ? JSON.stringify(payload.voice_json) : null,
        payload.domain || null,
        shouldBeDefault,
      ]
    );

    if (shouldBeDefault) {
      await this.setActiveBrand(userId, id);
    }

    const created = await this.getById(userId, id);
    if (!created) throw new Error("Failed to create brand unit");
    return created;
  }

  async update(
    userId: string,
    brandId: string,
    payload: Partial<{
      name: string;
      slug: string;
      logo_url: string;
      cover_image: string;
      site_url: string;
      sales_page_url: string;
      instagram_url: string;
      facebook_url: string;
      twitter_url: string;
      tiktok_url: string;
      slogan: string;
      primary_color: string;
      secondary_color: string;
      whatsapp_phone: string;
      theme_json: any;
      voice_json: any;
      domain: string;
      status: "active" | "archived";
      is_default: boolean;
    }>
  ): Promise<BrandUnit | null> {
    await this.ensureSchema();
    const fields: string[] = [];
    const values: any[] = [];

    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("Brand name is required");
      fields.push("name = ?");
      values.push(name);
    }
    if (payload.slug !== undefined) {
      const slug = toSlug(payload.slug);
      if (!slug) throw new Error("Brand slug is invalid");
      fields.push("slug = ?");
      values.push(slug);
    }
    if (payload.logo_url !== undefined) {
      fields.push("logo_url = ?");
      values.push(normalizeLogoUrl(payload.logo_url));
    }
    if (payload.cover_image !== undefined) {
      fields.push("cover_image = ?");
      values.push(normalizeLogoUrl(payload.cover_image));
    }
    if (payload.site_url !== undefined) {
      fields.push("site_url = ?");
      values.push(payload.site_url || null);
    }
    if (payload.sales_page_url !== undefined) {
      fields.push("sales_page_url = ?");
      values.push(payload.sales_page_url || null);
    }
    if (payload.instagram_url !== undefined) {
      fields.push("instagram_url = ?");
      values.push(payload.instagram_url || null);
    }
    if (payload.facebook_url !== undefined) {
      fields.push("facebook_url = ?");
      values.push(payload.facebook_url || null);
    }
    if (payload.twitter_url !== undefined) {
      fields.push("twitter_url = ?");
      values.push(payload.twitter_url || null);
    }
    if (payload.tiktok_url !== undefined) {
      fields.push("tiktok_url = ?");
      values.push(payload.tiktok_url || null);
    }
    if (payload.slogan !== undefined) {
      fields.push("slogan = ?");
      values.push(payload.slogan || null);
    }
    if (payload.primary_color !== undefined) {
      fields.push("primary_color = ?");
      values.push(payload.primary_color || null);
    }
    if (payload.secondary_color !== undefined) {
      fields.push("secondary_color = ?");
      values.push(payload.secondary_color || null);
    }
    if ((payload as any).whatsapp_phone !== undefined) {
      fields.push("whatsapp_phone = ?");
      const wpp = String((payload as any).whatsapp_phone || "").replace(/\D/g, "");
      values.push(wpp || null);
    }
    if (payload.theme_json !== undefined) {
      fields.push("theme_json = ?");
      values.push(payload.theme_json ? JSON.stringify(payload.theme_json) : null);
    }
    if (payload.voice_json !== undefined) {
      fields.push("voice_json = ?");
      values.push(payload.voice_json ? JSON.stringify(payload.voice_json) : null);
    }
    if (payload.domain !== undefined) {
      fields.push("domain = ?");
      values.push(String(payload.domain || "").trim() || null);
    }
    if (payload.status !== undefined) {
      if (payload.status !== "active" && payload.status !== "archived") {
        throw new Error("Brand status is invalid");
      }
      fields.push("status = ?");
      values.push(payload.status);
    }

    if (payload.is_default === true) {
      await update(`UPDATE brand_units SET is_default = FALSE WHERE user_id = ?`, [userId]);
      fields.push("is_default = TRUE");
    }

    if (fields.length === 0) return this.getById(userId, brandId);

    values.push(brandId, userId);
    await update(
      `UPDATE brand_units SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ? AND user_id = ?`,
      values
    );

    if (payload.is_default === true) {
      await this.setActiveBrand(userId, brandId);
    }

    return this.getById(userId, brandId);
  }

  async setActiveBrand(userId: string, brandId: string): Promise<boolean> {
    await this.ensureSchema();
    const brand = await this.getById(userId, brandId);
    if (!brand) return false;

    const affected = await update(
      `UPDATE user_brand_context SET active_brand_id = ? WHERE user_id = ?`,
      [brandId, userId]
    );

    if (affected === 0) {
      await query(`INSERT INTO user_brand_context (user_id, active_brand_id) VALUES (?, ?)`, [
        userId,
        brandId,
      ]);
    }

    return true;
  }

  async getActiveBrandId(userId: string): Promise<string | null> {
    await this.ensureSchema();
    const ctx = await queryOne<{ active_brand_id: string | null }>(
      `SELECT active_brand_id FROM user_brand_context WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (ctx?.active_brand_id) return String(ctx.active_brand_id);

    const fallback = await queryOne<{ id: string }>(
      `SELECT id FROM brand_units WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1`,
      [userId]
    );

    return fallback?.id ? String(fallback.id) : null;
  }

  async delete(userId: string, brandId: string): Promise<boolean> {
    await this.ensureSchema();
    const brand = await this.getById(userId, brandId);
    if (!brand) return false;

    await update(`DELETE FROM brand_units WHERE id = ? AND user_id = ?`, [brandId, userId]);
    return true;
  }

  async resolveActiveBrandId(userId: string, requestedBrandId?: string | null): Promise<string | null> {
    await this.ensureSchema();
    const candidate = String(requestedBrandId || "").trim();

    if (candidate) {
      const requested = await this.getById(userId, candidate);
      if (requested) {
        await this.setActiveBrand(userId, candidate);
        return candidate;
      }
      // Membro da equipe (user_brand_roles) — não é dono, mas tem acesso à brand
      const membership = await queryOne<{ brand_id: string }>(
        `SELECT brand_id FROM user_brand_roles
         WHERE user_id = ? AND brand_id = ? AND COALESCE(is_blocked, FALSE) = FALSE
         LIMIT 1`,
        [userId, candidate],
      ).catch(() => null);
      if (membership?.brand_id) {
        await this.setActiveBrand(userId, candidate);
        return candidate;
      }
      // Marca alheia ou inválida — não lança 500; caller trata null (lista vazia / 400).
      return null;
    }

    return this.getActiveBrandId(userId);
  }
}
