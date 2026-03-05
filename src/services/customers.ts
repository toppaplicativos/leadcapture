import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import { Customer, CustomerCreateDTO } from "../types";
import { logger } from "../utils/logger";

type ColumnMeta = {
  field: string;
  type: string;
  nullable: boolean;
  key: string;
  defaultValue: unknown;
  extra: string;
};

export type LeadCaptureContext = {
  query: string;
  location: string;
  radius?: number;
};

export type CapturedGeoPoint = {
  id: string | number;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  category?: string;
  queryLabels: string[];
};

export type LeadStats = {
  total: number;
  today_count: number;
  week_count: number;
  month_count: number;
  with_whatsapp: number;
  without_whatsapp: number;
  whatsapp_validated_count: number;
};

export type WhatsAppValidationUpdateInput = {
  hasWhatsApp: boolean;
  checkedAt?: string;
  instanceId?: string;
  normalizedPhone?: string;
  jid?: string;
  status?: "valid" | "invalid" | "error";
};

export class CustomersService {
  private columnsCache: Map<string, ColumnMeta> | null = null;
  private schemaEnsured = false;
  private schemaEnsurePromise: Promise<void> | null = null;

  private async ensureIsolationSchema(): Promise<void> {
    if (this.schemaEnsured) return;
    if (this.schemaEnsurePromise) {
      await this.schemaEnsurePromise;
      return;
    }

    this.schemaEnsurePromise = (async () => {
      const ownerUserIdExists = await queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'customers'
           AND COLUMN_NAME = 'owner_user_id'`
      );

      if (Number(ownerUserIdExists?.total || 0) === 0) {
        await query(`ALTER TABLE customers ADD COLUMN owner_user_id VARCHAR(36) NULL`);
      }

      const userIdExists = await queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'customers'
           AND COLUMN_NAME = 'user_id'`
      );

      if (Number(userIdExists?.total || 0) > 0) {
        await query(
          `UPDATE customers
           SET owner_user_id = user_id
           WHERE owner_user_id IS NULL
             AND user_id IS NOT NULL`
        );
      }

      const ownerIndexExists = await queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'customers'
           AND INDEX_NAME = 'idx_customers_owner_user'`
      );
      if (Number(ownerIndexExists?.total || 0) === 0) {
        await query(`CREATE INDEX idx_customers_owner_user ON customers (owner_user_id)`);
      }

      this.schemaEnsured = true;
    })().finally(() => {
      this.schemaEnsurePromise = null;
    });

    await this.schemaEnsurePromise;
  }

  private async getColumns(): Promise<Map<string, ColumnMeta>> {
    await this.ensureIsolationSchema();
    if (this.columnsCache) return this.columnsCache;

    const rows = await query<any[]>("SHOW COLUMNS FROM customers");
    const map = new Map<string, ColumnMeta>();

    for (const row of rows) {
      map.set(String(row.Field), {
        field: String(row.Field),
        type: String(row.Type || ""),
        nullable: String(row.Null || "").toUpperCase() === "YES",
        key: String(row.Key || ""),
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

  private resolveOwnerColumn(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "owner_user_id")) return "owner_user_id";
    if (this.hasColumn(columns, "user_id")) return "user_id";
    return null;
  }

  private requireOwnerColumn(columns: Map<string, ColumnMeta>): string {
    const ownerColumn = this.resolveOwnerColumn(columns);
    if (!ownerColumn) {
      throw new Error("Customers isolation column missing (owner_user_id/user_id)");
    }
    return ownerColumn;
  }

  private appendOwnerClause(
    columns: Map<string, ColumnMeta>,
    where: string,
    params: any[],
    ownerUserId?: string
  ): { where: string; params: any[] } {
    const ownerColumn = this.requireOwnerColumn(columns);
    if (!ownerUserId) {
      throw new Error("Missing owner user context for customer query");
    }
    where += ` AND ${ownerColumn} = ?`;
    params.push(ownerUserId);
    return { where, params };
  }

  private resolveBrandColumn(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "brand_id")) return "brand_id";
    return null;
  }

  private appendBrandClause(
    columns: Map<string, ColumnMeta>,
    where: string,
    params: any[],
    brandId?: string | null
  ): { where: string; params: any[] } {
    const brandColumn = this.resolveBrandColumn(columns);
    const normalizedBrandId = String(brandId || "").trim();
    if (brandColumn && normalizedBrandId) {
      where += ` AND ${brandColumn} = ?`;
      params.push(normalizedBrandId);
    }
    return { where, params };
  }

  private normalizeColumnValue(columnMeta: ColumnMeta | undefined, value: any): any {
    if (!columnMeta) return value;
    if (value === undefined) return undefined;

    const type = String(columnMeta.type || "").toLowerCase();
    if (!type.includes("json")) {
      return value;
    }

    if (value === null) return null;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;

      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch {
        const tags = trimmed
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        return JSON.stringify(tags.length > 0 ? tags : [trimmed]);
      }
    }

    return JSON.stringify(value);
  }

  private async insertDynamicCustomer(record: Record<string, any>): Promise<string | number> {
    const columns = await this.getColumns();
    const entries = Object.entries(record).filter(
      ([key, value]) => this.hasColumn(columns, key) && value !== undefined
    );

    if (entries.length === 0) {
      throw new Error("No compatible columns found to insert customer");
    }

    const idMeta = columns.get("id");
    const needsManualId =
      !!idMeta &&
      !String(idMeta.extra || "").toLowerCase().includes("auto_increment") &&
      (idMeta.defaultValue === null || idMeta.defaultValue === undefined);

    const hasIdInRecord = entries.some(([key]) => key === "id");
    if (needsManualId && !hasIdInRecord) {
      entries.unshift(["id", randomUUID()]);
    }

    const normalizedEntries = entries.map(([key, value]) => [
      key,
      this.normalizeColumnValue(columns.get(key), value),
    ]) as [string, any][];

    const sqlColumns = normalizedEntries.map(([key]) => key).join(", ");
    const placeholders = entries.map(() => "?").join(", ");
    const values = normalizedEntries.map(([, value]) => value);
    const sql = `INSERT INTO customers (${sqlColumns}) VALUES (${placeholders})`;

    const idValue = normalizedEntries.find(([key]) => key === "id")?.[1];
    if (idValue) {
      await query(sql, values);
      return idValue;
    }

    return insert(sql, values);
  }

  private normalizePhone(phone?: string): string {
    return String(phone || "").replace(/\D/g, "");
  }

  private normalizeQueryLabel(query?: string): string | null {
    const value = String(query || "").trim().toLowerCase();
    if (!value) return null;
    return value.slice(0, 120);
  }

  private extractAddress(place: any): string | null {
    const formatted = String(place?.formattedAddress || place?.shortFormattedAddress || "").trim();
    if (formatted) return formatted;

    const components = Array.isArray(place?.addressComponents) ? place.addressComponents : [];
    if (components.length === 0) return null;

    const firstLine = components
      .filter((item: any) =>
        Array.isArray(item?.types) &&
        item.types.some((type: string) =>
          ["street_number", "route", "sublocality", "neighborhood", "premise"].includes(type)
        )
      )
      .map((item: any) => String(item?.longText || item?.shortText || "").trim())
      .filter(Boolean)
      .join(", ");

    const locality = components
      .filter((item: any) =>
        Array.isArray(item?.types) &&
        item.types.some((type: string) =>
          ["locality", "administrative_area_level_2", "administrative_area_level_1", "country"].includes(type)
        )
      )
      .map((item: any) => String(item?.longText || item?.shortText || "").trim())
      .filter(Boolean)
      .join(", ");

    const joined = [firstLine, locality].filter(Boolean).join(" - ").trim();
    return joined || null;
  }

  private extractCityState(address?: string): { city: string | null; state: string | null } {
    if (!address) return { city: null, state: null };

    const chunks = address
      .split(" - ")
      .map((part) => part.trim())
      .filter(Boolean);

    const cityStateSource = chunks.length >= 2 ? chunks[chunks.length - 2] : chunks[0] || "";
    const csParts = cityStateSource
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const city = csParts.length >= 1 ? csParts[0] : null;
    let state: string | null = null;

    for (const part of csParts) {
      const stMatch = part.match(/\b([A-Z]{2})\b/);
      if (stMatch) {
        state = stMatch[1];
        break;
      }
    }

    return { city, state };
  }

  private parseSourceDetails(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === "object") return raw as Record<string, any>;
    if (typeof raw !== "string") return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
    } catch {
      return {};
    }
  }

  private parseTags(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch {
        // fall through
      }
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private resolveHasWhatsAppExpression(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "has_whatsapp")) {
      return "has_whatsapp = 1";
    }
    if (this.hasColumn(columns, "whatsapp_valid")) {
      return "whatsapp_valid = 1";
    }
    if (this.hasColumn(columns, "source_details")) {
      return "LOWER(JSON_UNQUOTE(JSON_EXTRACT(source_details, '$.whatsapp_validation.has_whatsapp'))) IN ('true', '1')";
    }
    return null;
  }

  private resolveWithoutWhatsAppExpression(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "has_whatsapp")) {
      return "has_whatsapp = 0";
    }
    if (this.hasColumn(columns, "whatsapp_valid")) {
      return "whatsapp_valid = 0";
    }
    if (this.hasColumn(columns, "source_details")) {
      return "LOWER(JSON_UNQUOTE(JSON_EXTRACT(source_details, '$.whatsapp_validation.has_whatsapp'))) IN ('false', '0')";
    }
    return null;
  }

  private resolveWhatsAppValidatedExpression(columns: Map<string, ColumnMeta>): string | null {
    const timestampColumn = ["whatsapp_verified_at", "whatsapp_validated_at", "whatsapp_checked_at"].find(
      (columnName) => this.hasColumn(columns, columnName)
    );
    if (timestampColumn) {
      return `${timestampColumn} IS NOT NULL`;
    }

    if (this.hasColumn(columns, "source_details")) {
      return "JSON_EXTRACT(source_details, '$.whatsapp_validation.checked_at') IS NOT NULL";
    }

    return null;
  }

  private async updateCaptureMetadata(
    customerId: string | number,
    ownerUserId: string | undefined,
    captureContext: LeadCaptureContext | undefined,
    existingSourceDetails: unknown,
    existingTags: unknown
  ): Promise<void> {
    if (!captureContext) return;

    const queryLabel = this.normalizeQueryLabel(captureContext.query);
    if (!queryLabel) return;

    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    if (!ownerUserId) {
      throw new Error("Missing owner user context for capture metadata update");
    }
    const fields: string[] = [];
    const values: any[] = [];

    if (this.hasColumn(columns, "source_details")) {
      const details = this.parseSourceDetails(existingSourceDetails);
      const currentQueries = Array.isArray(details.capture_queries)
        ? details.capture_queries.map((item: unknown) => String(item).trim()).filter(Boolean)
        : [];

      if (!currentQueries.includes(queryLabel)) {
        currentQueries.unshift(queryLabel);
      }

      details.capture_queries = currentQueries.slice(0, 24);
      details.last_capture_query = queryLabel;
      details.last_capture_location = String(captureContext.location || "").trim() || null;
      details.last_capture_radius =
        typeof captureContext.radius === "number" && Number.isFinite(captureContext.radius)
          ? Math.round(captureContext.radius)
          : null;
      details.last_capture_at = new Date().toISOString();
      details.capture_count = Number(details.capture_count || 0) + 1;

      fields.push("source_details = ?");
      values.push(this.normalizeColumnValue(columns.get("source_details"), details));
    }

    if (this.hasColumn(columns, "tags")) {
      const tags = this.parseTags(existingTags);
      const queryTag = `busca:${queryLabel}`;
      if (!tags.includes(queryTag)) tags.push(queryTag);
      fields.push("tags = ?");
      values.push(this.normalizeColumnValue(columns.get("tags"), tags));
    }

    if (fields.length === 0) return;
    if (this.hasColumn(columns, "updated_at")) fields.push("updated_at = NOW()");

    let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
    values.push(customerId);

    sql += ` AND ${ownerColumn} = ?`;
    values.push(ownerUserId);

    await update(sql, values);
  }

  private async findExistingByPlaceOrPhone(
    place: any,
    ownerUserId?: string,
    brandId?: string | null
  ): Promise<Customer | null> {
    const columns = await this.getColumns();
    if (!ownerUserId) {
      throw new Error("Missing owner user context for lead lookup");
    }
    const placeId = place?.id || null;
    const phone = this.normalizePhone(place?.internationalPhoneNumber || place?.nationalPhoneNumber || "");
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const normalizedBrandId = String(brandId || "").trim();

    if (placeId) {
      if (this.hasColumn(columns, "google_place_id")) {
        const ownerWhere = ` AND ${ownerColumn} = ?`;
        const brandWhere = brandColumn && normalizedBrandId ? ` AND ${brandColumn} = ?` : "";
        const params = [placeId, ownerUserId, ...(brandColumn && normalizedBrandId ? [normalizedBrandId] : [])];
        const byLegacyPlace = await queryOne<Customer>(
          `SELECT id, source_details, tags FROM customers WHERE google_place_id = ?${ownerWhere}${brandWhere} LIMIT 1`,
          params
        );
        if (byLegacyPlace) return byLegacyPlace;
      }

      if (this.hasColumn(columns, "source_details")) {
        const ownerWhere = ` AND ${ownerColumn} = ?`;
        const brandWhere = brandColumn && normalizedBrandId ? ` AND ${brandColumn} = ?` : "";
        const params = [placeId, ownerUserId, ...(brandColumn && normalizedBrandId ? [normalizedBrandId] : [])];
        const bySourceDetails = await queryOne<Customer>(
          `SELECT id, source_details, tags
           FROM customers
           WHERE JSON_UNQUOTE(JSON_EXTRACT(source_details, '$.google_place_id')) = ?${ownerWhere}${brandWhere}
           LIMIT 1`,
          params
        );
        if (bySourceDetails) return bySourceDetails;
      }
    }

    if (phone && this.hasColumn(columns, "phone")) {
      const normalizedPhoneExpr =
        "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')";
      const ownerWhere = ` AND ${ownerColumn} = ?`;
      const brandWhere = brandColumn && normalizedBrandId ? ` AND ${brandColumn} = ?` : "";
      const params = [phone, ownerUserId, ...(brandColumn && normalizedBrandId ? [normalizedBrandId] : [])];
      const byPhone = await queryOne<Customer>(
        `SELECT id, source_details, tags
         FROM customers
         WHERE ${normalizedPhoneExpr} = ?${ownerWhere}${brandWhere}
         LIMIT 1`,
        params
      );
      if (byPhone) return byPhone;
    }

    return null;
  }

  async create(dto: CustomerCreateDTO, ownerUserId?: string, brandId?: string | null): Promise<Customer> {
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    if (!ownerUserId) {
      throw new Error("Missing owner user context for customer creation");
    }
    const brandColumn = this.resolveBrandColumn(columns);
    const sourceDetails = {
      google_place_id: dto.google_place_id || null,
      website: dto.website || null,
      rating: dto.google_rating || null,
      google_reviews_count: dto.google_reviews_count || null,
      google_maps_uri: dto.google_maps_uri || null,
      business_status: dto.business_status || null,
      category: dto.category || null,
      subcategory: dto.subcategory || null,
      address: dto.address || null,
    };

    const record: Record<string, any> = {
      name: dto.name,
      phone: dto.phone || "",
      email: dto.email || null,
      source: dto.source || "manual",
      status: dto.status || "new",
      notes: dto.notes || null,
      assigned_to: dto.assigned_to || null,
      tags: dto.tags || null,

      company_id: dto.company_id || null,
      google_place_id: dto.google_place_id || null,
      trade_name: dto.trade_name || null,
      phone_secondary: dto.phone_secondary || null,
      website: dto.website || null,
      address: dto.address || null,
      city: dto.city || null,
      state: dto.state || null,
      zip_code: dto.zip_code || null,
      latitude: dto.latitude || null,
      longitude: dto.longitude || null,
      category: dto.category || null,
      subcategory: dto.subcategory || null,
      google_rating: dto.google_rating || null,
      google_reviews_count: dto.google_reviews_count || null,
      google_maps_uri: dto.google_maps_uri || null,
      business_status: dto.business_status || null,

      source_details: this.hasColumn(columns, "source_details")
        ? JSON.stringify(sourceDetails)
        : undefined,
      address_street: dto.address || null,
      address_city: dto.city || null,
      address_state: dto.state || null,
      address_zip: dto.zip_code || null,
    };

    record[ownerColumn] = ownerUserId;
    if (brandColumn && brandId) {
      record[brandColumn] = String(brandId);
    }

    const id = await this.insertDynamicCustomer(record);
    logger.info(`Customer created: ${dto.name} (ID: ${id})`);
    return (await this.getById(id, ownerUserId, brandId))!;
  }

  async bulkCreateFromPlaces(
    places: any[],
    ownerUserId?: string,
    captureContext?: LeadCaptureContext,
    brandId?: string | null
  ): Promise<{
    created: number;
    skipped: number;
    createdPlaceIds: string[];
    createdLeadIds: string[];
    existingPlaceIds: string[];
  }> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for bulk lead import");
    }
    let created = 0;
    let skipped = 0;
    const createdPlaceIds: string[] = [];
    const createdLeadIds: string[] = [];
    const existingPlaceIds: string[] = [];

    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const queryLabel = this.normalizeQueryLabel(captureContext?.query);

    for (const place of places) {
      try {
        const existing = await this.findExistingByPlaceOrPhone(place, ownerUserId, brandId);
        if (existing) {
          skipped++;
          if (place?.id) existingPlaceIds.push(String(place.id));
          await this.updateCaptureMetadata(
            (existing as any).id,
            ownerUserId,
            captureContext,
            (existing as any).source_details,
            (existing as any).tags
          );
          continue;
        }

        const name = place.displayName?.text || place.name || "Unknown";
        const types = Array.isArray(place.types) ? place.types : [];
        const category = types[0] || null;
        const subcategory = types[1] || null;
        const phone = this.normalizePhone(place.internationalPhoneNumber || place.nationalPhoneNumber || "");
        const address = this.extractAddress(place);
        const { city, state } = this.extractCityState(address || undefined);

        const sourceDetails = {
          google_place_id: place.id || null,
          website: place.websiteUri || null,
          rating: place.rating || null,
          google_reviews_count: place.userRatingCount || null,
          google_maps_uri: place.googleMapsUri || null,
          business_status: place.businessStatus || null,
          category,
          subcategory,
          address: address || null,
          capture_queries: queryLabel ? [queryLabel] : [],
          last_capture_query: queryLabel || null,
          last_capture_location: captureContext?.location ? String(captureContext.location).trim() : null,
          last_capture_radius:
            typeof captureContext?.radius === "number" && Number.isFinite(captureContext.radius)
              ? Math.round(captureContext.radius)
              : null,
          last_capture_at: new Date().toISOString(),
          capture_count: 1,
        };

        const record: Record<string, any> = {
          name,
          phone,
          source: "google_places",
          status: "new",

          google_place_id: place.id || null,
          website: place.websiteUri || null,
          address: address || null,
          city,
          state,
          latitude: place.location?.latitude || null,
          longitude: place.location?.longitude || null,
          category,
          subcategory,
          google_rating: place.rating || null,
          google_reviews_count: place.userRatingCount || null,
          google_maps_uri: place.googleMapsUri || null,
          business_status: place.businessStatus || null,

          source_details: this.hasColumn(columns, "source_details")
            ? JSON.stringify(sourceDetails)
            : undefined,
          address_street: address || null,
          address_city: city,
          address_state: state,
          tags: queryLabel ? [`busca:${queryLabel}`] : undefined,
        };

        record[ownerColumn] = ownerUserId;
        if (brandColumn && brandId) {
          record[brandColumn] = String(brandId);
        }

        const insertedId = await this.insertDynamicCustomer(record);
        created++;
        createdLeadIds.push(String(insertedId));
        if (place?.id) createdPlaceIds.push(String(place.id));
      } catch (err: any) {
        logger.error(`Error creating customer from place: ${err.message}`);
        skipped++;
      }
    }

    logger.info(`Bulk import: ${created} created, ${skipped} skipped`);
    return {
      created,
      skipped,
      createdPlaceIds: Array.from(new Set(createdPlaceIds)),
      createdLeadIds: Array.from(new Set(createdLeadIds)),
      existingPlaceIds: Array.from(new Set(existingPlaceIds)),
    };
  }

  async getCapturedGeoPoints(
    ownerUserId?: string,
    limit = 500,
    brandId?: string | null
  ): Promise<CapturedGeoPoint[]> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for geo points query");
    }
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);

    if (!this.hasColumn(columns, "latitude") || !this.hasColumn(columns, "longitude")) {
      return [];
    }

    const safeLimit = Math.max(10, Math.min(1500, Math.floor(limit || 500)));
    let where = "WHERE latitude IS NOT NULL AND longitude IS NOT NULL";
    const params: any[] = [];

    if (this.hasColumn(columns, "source")) {
      where += " AND source = 'google_places'";
    }

    where += ` AND ${ownerColumn} = ?`;
    params.push(ownerUserId);

    const brandColumn = this.resolveBrandColumn(columns);
    if (brandColumn && brandId) {
      where += ` AND ${brandColumn} = ?`;
      params.push(String(brandId));
    }

    const statusColumn = this.hasColumn(columns, "status") ? "status" : "'new' AS status";
    const categoryColumn = this.hasColumn(columns, "category") ? "category" : "NULL AS category";
    const sourceDetailsColumn = this.hasColumn(columns, "source_details")
      ? "source_details"
      : "NULL AS source_details";

    const orderColumn = this.hasColumn(columns, "updated_at")
      ? "updated_at"
      : this.hasColumn(columns, "created_at")
      ? "created_at"
      : "id";

    const rows = await query<any[]>(
      `SELECT id, name, latitude, longitude, ${statusColumn}, ${categoryColumn}, ${sourceDetailsColumn}
       FROM customers
       ${where}
       ORDER BY ${orderColumn} DESC
       LIMIT ${safeLimit}`,
      params
    );

    return rows
      .map((row) => {
        const latitude = Number(row.latitude);
        const longitude = Number(row.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

        const details = this.parseSourceDetails(row.source_details);
        const queryLabels = Array.isArray(details.capture_queries)
          ? details.capture_queries.map((item: unknown) => String(item).trim()).filter(Boolean)
          : [];

        return {
          id: row.id,
          name: String(row.name || "Lead captado"),
          latitude,
          longitude,
          status: String(row.status || "new"),
          category: row.category ? String(row.category) : undefined,
          queryLabels,
        } as CapturedGeoPoint;
      })
      .filter((row): row is CapturedGeoPoint => !!row);
  }

  async getById(
    id: string | number,
    ownerUserId?: string,
    brandId?: string | null
  ): Promise<Customer | null> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for customer query");
    }
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const ownerWhere = ` AND ${ownerColumn} = ?`;
    const brandWhere = brandColumn && brandId ? ` AND ${brandColumn} = ?` : "";
    const params = [
      id,
      ownerUserId,
      ...(brandColumn && brandId ? [String(brandId)] : []),
    ];
    return queryOne<Customer>(`SELECT * FROM customers WHERE id = ?${ownerWhere}${brandWhere}`, params);
  }

  async getAll(filters?: {
    status?: string;
    source?: string;
    category?: string;
    city?: string;
    search?: string;
    limit?: number;
    offset?: number;
    ownerUserId?: string;
    brandId?: string | null;
    whatsappFilter?: "pending" | "confirmed" | "unconfirmed";
  }): Promise<{ customers: Customer[]; total: number }> {
    const columns = await this.getColumns();
    let where = "WHERE 1=1";
    const params: any[] = [];

    const ownerFiltered = this.appendOwnerClause(columns, where, params, filters?.ownerUserId);
    where = ownerFiltered.where;

    const brandFiltered = this.appendBrandClause(columns, where, params, filters?.brandId);
    where = brandFiltered.where;

    if (filters?.status && this.hasColumn(columns, "status")) {
      where += " AND status = ?";
      params.push(filters.status);
    }

    if (filters?.source && this.hasColumn(columns, "source")) {
      where += " AND source = ?";
      params.push(filters.source);
    }

    if (filters?.category) {
      if (this.hasColumn(columns, "category")) {
        where += " AND category = ?";
        params.push(filters.category);
      } else if (this.hasColumn(columns, "source_details")) {
        where += " AND JSON_UNQUOTE(JSON_EXTRACT(source_details, '$.category')) = ?";
        params.push(filters.category);
      }
    }

    if (filters?.city) {
      if (this.hasColumn(columns, "city")) {
        where += " AND city LIKE ?";
        params.push(`%${filters.city}%`);
      } else if (this.hasColumn(columns, "address_city")) {
        where += " AND address_city LIKE ?";
        params.push(`%${filters.city}%`);
      }
    }

    if (filters?.search) {
      const searchFields = ["name", "trade_name", "phone", "email"].filter((field) =>
        this.hasColumn(columns, field)
      );

      if (searchFields.length > 0) {
        where += ` AND (${searchFields.map((field) => `${field} LIKE ?`).join(" OR ")})`;
        const s = `%${filters.search}%`;
        searchFields.forEach(() => params.push(s));
      }
    }

    // WhatsApp validation filter
    if (filters?.whatsappFilter === "confirmed") {
      const expr = this.resolveHasWhatsAppExpression(columns);
      if (expr) where += ` AND ${expr}`;
    } else if (filters?.whatsappFilter === "unconfirmed") {
      const expr = this.resolveWithoutWhatsAppExpression(columns);
      if (expr) where += ` AND ${expr}`;
    } else if (filters?.whatsappFilter === "pending") {
      // Pending = has phone but has_whatsapp is NULL (never validated)
      const phoneCol = this.hasColumn(columns, "phone") ? "phone" : null;
      if (this.hasColumn(columns, "has_whatsapp")) {
        where += " AND has_whatsapp IS NULL";
        if (phoneCol) where += ` AND ${phoneCol} IS NOT NULL AND ${phoneCol} != ''`;
      } else if (this.hasColumn(columns, "whatsapp_valid")) {
        where += " AND whatsapp_valid IS NULL";
        if (phoneCol) where += ` AND ${phoneCol} IS NOT NULL AND ${phoneCol} != ''`;
      } else if (this.hasColumn(columns, "source_details")) {
        where += " AND (JSON_EXTRACT(source_details, '$.whatsapp_validation.has_whatsapp') IS NULL)";
        if (phoneCol) where += ` AND ${phoneCol} IS NOT NULL AND ${phoneCol} != ''`;
      }
    }

    const countResult = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM customers ${where}`,
      [...params]
    );
    const total = countResult?.total || 0;

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const customers = await query<Customer[]>(
      `SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ${Math.floor(limit)} OFFSET ${Math.floor(
        offset
      )}`,
      [...params]
    );

    return { customers, total };
  }

  async updateCustomer(
    id: string | number,
    data: Partial<CustomerCreateDTO>,
    ownerUserId?: string,
    brandId?: string | null
  ): Promise<Customer | null> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for customer update");
    }
    const columns = await this.getColumns();
    const fields: string[] = [];
    const values: any[] = [];
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);

    const legacyOrModernMap: Record<string, string[]> = {
      name: ["name"],
      trade_name: ["trade_name"],
      phone: ["phone"],
      phone_secondary: ["phone_secondary"],
      email: ["email"],
      website: ["website"],
      address: ["address", "address_street"],
      city: ["city", "address_city"],
      state: ["state", "address_state"],
      zip_code: ["zip_code", "address_zip"],
      category: ["category"],
      subcategory: ["subcategory"],
      tags: ["tags"],
      notes: ["notes"],
      status: ["status"],
      assigned_to: ["assigned_to"],
    };

    for (const [dtoField, columnCandidates] of Object.entries(legacyOrModernMap)) {
      const value = (data as any)[dtoField];
      if (value === undefined) continue;

      const targetColumn = columnCandidates.find((candidate) => this.hasColumn(columns, candidate));
      if (!targetColumn) continue;

      fields.push(`${targetColumn} = ?`);
      values.push(this.normalizeColumnValue(columns.get(targetColumn), value));
    }

    if (fields.length === 0) return this.getById(id, ownerUserId, brandId);

    let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
    values.push(id);
    sql += ` AND ${ownerColumn} = ?`;
    values.push(ownerUserId);
    if (brandColumn && brandId) {
      sql += ` AND ${brandColumn} = ?`;
      values.push(String(brandId));
    }
    await update(sql, values);

    logger.info(`Customer updated: ID ${id}`);
    return this.getById(id, ownerUserId, brandId);
  }

  async updateStatus(
    id: string | number,
    status: string,
    ownerUserId?: string,
    brandId?: string | null
  ): Promise<boolean> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for status update");
    }
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const params: any[] = [status, id];
    let sql = "UPDATE customers SET status = ? WHERE id = ?";
    sql += ` AND ${ownerColumn} = ?`;
    params.push(ownerUserId);
    if (brandColumn && brandId) {
      sql += ` AND ${brandColumn} = ?`;
      params.push(String(brandId));
    }
    const affected = await update(sql, params);
    return affected > 0;
  }

  async delete(id: string | number, ownerUserId?: string, brandId?: string | null): Promise<boolean> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for customer delete");
    }
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const params: any[] = [id];
    let sql = "DELETE FROM customers WHERE id = ?";
    sql += ` AND ${ownerColumn} = ?`;
    params.push(ownerUserId);
    if (brandColumn && brandId) {
      sql += ` AND ${brandColumn} = ?`;
      params.push(String(brandId));
    }
    const affected = await update(sql, params);
    return affected > 0;
  }

  async getLeadStats(ownerUserId?: string, brandId?: string | null): Promise<LeadStats> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for lead stats query");
    }
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    let where = "WHERE 1=1";
    const params: any[] = [];

    where += ` AND ${ownerColumn} = ?`;
    params.push(ownerUserId);

    const brandColumn = this.resolveBrandColumn(columns);
    if (brandColumn && brandId) {
      where += ` AND ${brandColumn} = ?`;
      params.push(String(brandId));
    }

    const createdColumn = this.hasColumn(columns, "created_at") ? "created_at" : null;
    const todayExpr = createdColumn ? `DATE(${createdColumn}) = CURDATE()` : "FALSE";
    const weekExpr = createdColumn ? `${createdColumn} >= DATE_SUB(NOW(), INTERVAL 7 DAY)` : "FALSE";
    const monthExpr = createdColumn ? `${createdColumn} >= DATE_SUB(NOW(), INTERVAL 30 DAY)` : "FALSE";

    const hasWhatsExpr = this.resolveHasWhatsAppExpression(columns) || "FALSE";
    const noWhatsExpr = this.resolveWithoutWhatsAppExpression(columns) || "FALSE";
    const validatedExpr = this.resolveWhatsAppValidatedExpression(columns) || "FALSE";

    const result = await queryOne<any>(
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN ${todayExpr} THEN 1 ELSE 0 END) AS today_count,
          SUM(CASE WHEN ${weekExpr} THEN 1 ELSE 0 END) AS week_count,
          SUM(CASE WHEN ${monthExpr} THEN 1 ELSE 0 END) AS month_count,
          SUM(CASE WHEN ${hasWhatsExpr} THEN 1 ELSE 0 END) AS with_whatsapp,
          SUM(CASE WHEN ${noWhatsExpr} THEN 1 ELSE 0 END) AS without_whatsapp,
          SUM(CASE WHEN ${validatedExpr} THEN 1 ELSE 0 END) AS whatsapp_validated_count
       FROM customers
       ${where}`,
      params
    );

    return {
      total: Number(result?.total || 0),
      today_count: Number(result?.today_count || 0),
      week_count: Number(result?.week_count || 0),
      month_count: Number(result?.month_count || 0),
      with_whatsapp: Number(result?.with_whatsapp || 0),
      without_whatsapp: Number(result?.without_whatsapp || 0),
      whatsapp_validated_count: Number(result?.whatsapp_validated_count || 0),
    };
  }

  async updateWhatsAppValidation(
    id: string | number,
    payload: WhatsAppValidationUpdateInput,
    ownerUserId?: string,
    brandId?: string | null
  ): Promise<Customer | null> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for WhatsApp validation update");
    }
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const ownerWhere = ` AND ${ownerColumn} = ?`;
    const brandWhere = brandColumn && brandId ? ` AND ${brandColumn} = ?` : "";
    const ownerParams = [ownerUserId];
    const brandParams = brandColumn && brandId ? [String(brandId)] : [];

    const selectFields = ["id"];
    if (this.hasColumn(columns, "source_details")) selectFields.push("source_details");
    if (this.hasColumn(columns, "phone")) selectFields.push("phone");

    const existing = await queryOne<any>(
      `SELECT ${selectFields.join(", ")} FROM customers WHERE id = ?${ownerWhere}${brandWhere} LIMIT 1`,
      [id, ...ownerParams, ...brandParams]
    );

    if (!existing) return null;

    const checkedAt = payload.checkedAt || new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (this.hasColumn(columns, "source_details")) {
      const details = this.parseSourceDetails(existing.source_details);
      details.whatsapp_validation = {
        has_whatsapp: payload.hasWhatsApp,
        status: payload.status || (payload.hasWhatsApp ? "valid" : "invalid"),
        checked_at: checkedAt,
        checked_instance_id: payload.instanceId || null,
        normalized_phone:
          payload.normalizedPhone || this.normalizePhone(String(existing.phone || "")) || null,
        jid: payload.jid || null,
      };

      fields.push("source_details = ?");
      values.push(this.normalizeColumnValue(columns.get("source_details"), details));
    }

    if (this.hasColumn(columns, "has_whatsapp")) {
      fields.push("has_whatsapp = ?");
      values.push(payload.hasWhatsApp ? 1 : 0);
    }

    if (this.hasColumn(columns, "whatsapp_valid")) {
      fields.push("whatsapp_valid = ?");
      values.push(payload.hasWhatsApp ? 1 : 0);
    }

    if (this.hasColumn(columns, "whatsapp_validation_status")) {
      fields.push("whatsapp_validation_status = ?");
      values.push(payload.status || (payload.hasWhatsApp ? "valid" : "invalid"));
    }

    if (this.hasColumn(columns, "whatsapp_jid")) {
      fields.push("whatsapp_jid = ?");
      values.push(payload.jid || null);
    }

    if (this.hasColumn(columns, "whatsapp_number")) {
      fields.push("whatsapp_number = ?");
      values.push(payload.normalizedPhone || this.normalizePhone(String(existing.phone || "")) || null);
    }

    const checkedAtColumn = ["whatsapp_verified_at", "whatsapp_validated_at", "whatsapp_checked_at"].find(
      (columnName) => this.hasColumn(columns, columnName)
    );
    if (checkedAtColumn) {
      fields.push(`${checkedAtColumn} = ?`);
      values.push(checkedAt);
    }

    if (fields.length === 0) return this.getById(id, ownerUserId, brandId);
    if (this.hasColumn(columns, "updated_at")) fields.push("updated_at = NOW()");

    let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
    values.push(id);
    sql += ` AND ${ownerColumn} = ?`;
    values.push(ownerUserId);
    if (brandColumn && brandId) {
      sql += ` AND ${brandColumn} = ?`;
      values.push(String(brandId));
    }

    await update(sql, values);
    return this.getById(id, ownerUserId, brandId);
  }

  async getStats(ownerUserId?: string, brandId?: string | null): Promise<any> {
    if (!ownerUserId) {
      throw new Error("Missing owner user context for customer stats query");
    }
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);

    const clauses: string[] = [];
    const params: any[] = [];
    clauses.push(`${ownerColumn} = ?`);
    params.push(ownerUserId);
    if (brandColumn && brandId) {
      clauses.push(`${brandColumn} = ?`);
      params.push(String(brandId));
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const normalizedStatusExpr = "LOWER(TRIM(COALESCE(status, '')))";

    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN ${normalizedStatusExpr} IN ('new', 'novo', 'lead novo', 'novo lead') THEN 1 ELSE 0 END), 0) as new_count,
        COALESCE(SUM(CASE WHEN ${normalizedStatusExpr} IN ('contacted', 'contatado', 'contatados', 'contato iniciado', 'em contato') THEN 1 ELSE 0 END), 0) as contacted,
        COALESCE(SUM(CASE WHEN ${normalizedStatusExpr} IN ('qualified', 'qualificado', 'interested', 'interessado') THEN 1 ELSE 0 END), 0) as qualified,
        COALESCE(SUM(CASE WHEN ${normalizedStatusExpr} IN ('replied', 'respondeu', 'respondido', 'engajado') THEN 1 ELSE 0 END), 0) as replied,
        COALESCE(SUM(CASE WHEN ${normalizedStatusExpr} IN ('negotiating', 'negociando', 'em negociacao') THEN 1 ELSE 0 END), 0) as negotiating,
        COALESCE(SUM(CASE WHEN ${normalizedStatusExpr} IN ('converted', 'convertido', 'cliente', 'won', 'fechado') THEN 1 ELSE 0 END), 0) as converted,
        COALESCE(SUM(CASE WHEN ${normalizedStatusExpr} IN ('lost', 'perdido', 'descartado', 'nao interessado') THEN 1 ELSE 0 END), 0) as lost
      FROM customers
      ${whereClause}
    `, params);
    return stats[0];
  }
}
