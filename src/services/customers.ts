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

      let ownerIndexExists: { total: number } | null = null;
      try {
        ownerIndexExists = await queryOne<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM pg_indexes
           WHERE tablename = 'customers'
             AND indexname = 'idx_customers_owner_user'`
        );
      } catch {
        try {
          ownerIndexExists = await queryOne<{ total: number }>(
            `SELECT COUNT(*) AS total
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'customers'
               AND INDEX_NAME = 'idx_customers_owner_user'`
          );
        } catch {
          const showRows = await query<any[]>("SHOW INDEX FROM customers WHERE Key_name = ?", ["idx_customers_owner_user"]);
          ownerIndexExists = { total: Array.isArray(showRows) && showRows.length > 0 ? 1 : 0 };
        }
      }
      if (Number(ownerIndexExists?.total || 0) === 0) {
        await query(`CREATE INDEX idx_customers_owner_user ON customers (owner_user_id)`);
      }

      // Dedupe + unique index (evita corrida de captura paralela gravar o mesmo place 2x)
      try {
        await this.ensureGooglePlaceUniqueConstraint();
      } catch (err: any) {
        logger.warn(`ensureGooglePlaceUniqueConstraint: ${err?.message || err}`);
      }

      this.schemaEnsured = true;
    })().finally(() => {
      this.schemaEnsurePromise = null;
    });

    await this.schemaEnsurePromise;
  }

  /**
   * 1) Remove duplicatas (mesmo owner+brand+google_place_id) mantendo o mais antigo
   * 2) Cria índice UNIQUE parcial — barreira definitiva no banco
   */
  private async ensureGooglePlaceUniqueConstraint(): Promise<void> {
    const columns = await this.getColumnsUncached();
    if (!this.hasColumn(columns, "google_place_id")) return;
    const ownerCol = this.resolveOwnerColumn(columns) || "owner_user_id";
    const hasBrand = this.hasColumn(columns, "brand_id");

    // Limpa duplicatas existentes (mantém created_at mais antigo; se empate, menor id)
    try {
      if (hasBrand) {
        await query(`
          DELETE FROM customers c
          USING customers d
          WHERE c.google_place_id IS NOT NULL
            AND TRIM(c.google_place_id) <> ''
            AND c.google_place_id = d.google_place_id
            AND COALESCE(c.${ownerCol}::text, '') = COALESCE(d.${ownerCol}::text, '')
            AND COALESCE(c.brand_id::text, '') = COALESCE(d.brand_id::text, '')
            AND (
              COALESCE(c.created_at, '1970-01-01'::timestamp) > COALESCE(d.created_at, '1970-01-01'::timestamp)
              OR (
                COALESCE(c.created_at, '1970-01-01'::timestamp) = COALESCE(d.created_at, '1970-01-01'::timestamp)
                AND c.id::text > d.id::text
              )
            )
        `);
      } else {
        await query(`
          DELETE FROM customers c
          USING customers d
          WHERE c.google_place_id IS NOT NULL
            AND TRIM(c.google_place_id) <> ''
            AND c.google_place_id = d.google_place_id
            AND COALESCE(c.${ownerCol}::text, '') = COALESCE(d.${ownerCol}::text, '')
            AND (
              COALESCE(c.created_at, '1970-01-01'::timestamp) > COALESCE(d.created_at, '1970-01-01'::timestamp)
              OR (
                COALESCE(c.created_at, '1970-01-01'::timestamp) = COALESCE(d.created_at, '1970-01-01'::timestamp)
                AND c.id::text > d.id::text
              )
            )
        `);
      }
      logger.info("Customers dedupe by google_place_id completed");
    } catch (err: any) {
      logger.warn(`Customers dedupe cleanup skipped: ${err?.message || err}`);
    }

    // Índice único (owner + brand + place)
    try {
      const idxName = "uq_customers_owner_brand_place";
      const exists = await queryOne<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM pg_indexes WHERE tablename = 'customers' AND indexname = ?`,
        [idxName]
      );
      if (Number(exists?.total || 0) === 0) {
        if (hasBrand) {
          await query(`
            CREATE UNIQUE INDEX ${idxName}
            ON customers (
              ${ownerCol},
              (COALESCE(brand_id::text, '')),
              google_place_id
            )
            WHERE google_place_id IS NOT NULL AND btrim(google_place_id) <> ''
          `);
        } else {
          await query(`
            CREATE UNIQUE INDEX ${idxName}
            ON customers (${ownerCol}, google_place_id)
            WHERE google_place_id IS NOT NULL AND btrim(google_place_id) <> ''
          `);
        }
        logger.info(`Created unique index ${idxName}`);
      }
    } catch (err: any) {
      logger.warn(`Unique place index create failed: ${err?.message || err}`);
    }
  }

  private async getColumnsUncached(): Promise<Map<string, ColumnMeta>> {
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
    return map;
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
    if (type.includes("bool")) {
      if (value === null) return null;
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return null;
        if (["1", "true", "t", "yes", "y", "sim"].includes(normalized)) return true;
        if (["0", "false", "f", "no", "n", "nao", "não"].includes(normalized)) return false;
      }
      return Boolean(value);
    }

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

  private extractCityState(address?: string): { city: string | null; state: string | null; neighborhood: string | null } {
    if (!address) return { city: null, state: null, neighborhood: null };

    // Brazilian Google Places format: "Rua X, 123 - Bairro, Cidade - UF, CEP, Pais"
    // Split by " - " to get segments
    const segments = address.split(" - ").map((s) => s.trim()).filter(Boolean);

    let city: string | null = null;
    let state: string | null = null;
    let neighborhood: string | null = null;

    // Find segment with UF (2 uppercase letters like MG, SP, RJ)
    for (const seg of segments) {
      const ufMatch = seg.match(/\b([A-Z]{2})\b/);
      if (ufMatch) {
        state = ufMatch[1];
        // Everything before UF in the same segment minus CEP
        const beforeUF = seg.split(/,?\s*[A-Z]{2}\b/)[0].trim();
        // Remove CEP pattern
        const cleanCity = beforeUF.replace(/\d{5}-?\d{3}/, "").replace(/,\s*$/, "").trim();
        // If we have the previous segment, it has "Bairro, Cidade"
        const prevIdx = segments.indexOf(seg) - 1;
        if (prevIdx >= 0) {
          const prevParts = segments[prevIdx].split(",").map((p: string) => p.trim()).filter(Boolean);
          if (prevParts.length >= 2) {
            // "Bairro, Cidade" → neighborhood = first, city = last
            neighborhood = prevParts[0];
            city = prevParts[prevParts.length - 1];
          } else if (prevParts.length === 1) {
            city = prevParts[0];
          }
        }
        if (!city && cleanCity) city = cleanCity;
        break;
      }
    }

    // Fallback: try "Bairro, Cidade" pattern from second-to-last segment
    if (!city && segments.length >= 2) {
      const parts = segments[segments.length - 2].split(",").map((p: string) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        neighborhood = parts[0];
        city = parts[1];
      } else {
        city = parts[0] || null;
      }
    }

    return { city, state, neighborhood };
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
      return "has_whatsapp = TRUE";
    }
    if (this.hasColumn(columns, "whatsapp_valid")) {
      return "whatsapp_valid = TRUE";
    }
    if (this.hasColumn(columns, "source_details")) {
      return "LOWER(COALESCE(source_details::jsonb->'whatsapp_validation'->>'has_whatsapp', '')) IN ('true', '1')";
    }
    return null;
  }

  private resolveWithoutWhatsAppExpression(columns: Map<string, ColumnMeta>): string | null {
    if (this.hasColumn(columns, "has_whatsapp")) {
      return "has_whatsapp = FALSE";
    }
    if (this.hasColumn(columns, "whatsapp_valid")) {
      return "whatsapp_valid = FALSE";
    }
    if (this.hasColumn(columns, "source_details")) {
      return "LOWER(COALESCE(source_details::jsonb->'whatsapp_validation'->>'has_whatsapp', '')) IN ('false', '0')";
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
      return "(source_details::jsonb->'whatsapp_validation'->>'checked_at') IS NOT NULL";
    }

    return null;
  }

  /**
   * SQL: lead JÁ revisado (não deve entrar de novo na validação).
   * Qualquer sinal de review conta: coluna booleana, checked_at, status, tag "validado".
   */
  private resolveWhatsAppAlreadyReviewedExpression(columns: Map<string, ColumnMeta>): string | null {
    const parts: string[] = [];

    if (this.hasColumn(columns, "has_whatsapp")) {
      parts.push("has_whatsapp IS NOT NULL");
    }
    if (this.hasColumn(columns, "whatsapp_valid")) {
      parts.push("whatsapp_valid IS NOT NULL");
    }
    if (this.hasColumn(columns, "whatsapp_validation_status")) {
      parts.push(
        "LOWER(TRIM(COALESCE(whatsapp_validation_status, ''))) IN ('valid', 'invalid', 'error', 'checked')"
      );
    }
    const tsCol = ["whatsapp_verified_at", "whatsapp_validated_at", "whatsapp_checked_at"].find((c) =>
      this.hasColumn(columns, c)
    );
    if (tsCol) {
      parts.push(`${tsCol} IS NOT NULL`);
    }
    if (this.hasColumn(columns, "source_details")) {
      parts.push(
        "(source_details::jsonb->'whatsapp_validation'->>'checked_at') IS NOT NULL"
      );
      parts.push(
        "LOWER(COALESCE(source_details::jsonb->'whatsapp_validation'->>'has_whatsapp', '')) IN ('true','false','1','0')"
      );
      parts.push(
        "LOWER(COALESCE(source_details::jsonb->'whatsapp_validation'->>'status', '')) IN ('valid','invalid','error','checked')"
      );
    }
    if (this.hasColumn(columns, "tags")) {
      parts.push("LOWER(COALESCE(tags::text, '')) LIKE '%\"validado\"%'");
      parts.push("LOWER(COALESCE(tags::text, '')) LIKE '%validado%'");
    }

    if (!parts.length) return null;
    return `(${parts.join(" OR ")})`;
  }

  /**
   * Lista SOMENTE leads nunca revisados (tem telefone + nunca validados).
   * Usado em "Validar pendentes" — NÃO carrega os 2k já ok.
   */
  async listPendingWhatsAppValidation(opts: {
    ownerUserId: string;
    brandId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<{ customers: Customer[]; total: number }> {
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);

    let where = `WHERE ${ownerColumn} = ?`;
    const params: any[] = [opts.ownerUserId];

    if (brandColumn && opts.brandId) {
      where += ` AND ${brandColumn} = ?`;
      params.push(String(opts.brandId));
    }

    if (this.hasColumn(columns, "phone")) {
      where += ` AND phone IS NOT NULL AND TRIM(phone::text) != '' AND LENGTH(REGEXP_REPLACE(phone::text, '\\D', '', 'g')) >= 8`;
    } else {
      return { customers: [], total: 0 };
    }

    const already = this.resolveWhatsAppAlreadyReviewedExpression(columns);
    if (already) {
      where += ` AND NOT ${already}`;
    }

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM customers ${where}`,
      params
    );
    const total = Number(countRow?.total || 0);

    const limit = Math.max(1, Math.min(200, Math.floor(Number(opts.limit) || 50)));
    const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));

    const customers = await query<Customer[]>(
      `SELECT * FROM customers ${where} ORDER BY created_at DESC NULLS LAST, id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return { customers: customers || [], total };
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
           WHERE source_details::jsonb->>'google_place_id' = ?${ownerWhere}${brandWhere}
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

  async findByPhone(phone: string, ownerUserId?: string, brandId?: string | null): Promise<any | null> {
    if (!phone) return null;
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const where = [`phone = ?`, `${ownerColumn} = ?`];
    const params: any[] = [phone.replace(/\D/g, ""), ownerUserId];
    if (brandColumn && brandId) { where.push(`${brandColumn} = ?`); params.push(brandId); }
    const row = await queryOne<any>(`SELECT * FROM customers WHERE ${where.join(" AND ")} LIMIT 1`, params);
    return row || null;
  }

  async create(dto: CustomerCreateDTO, ownerUserId?: string, brandId?: string | null): Promise<Customer> {
    /* LGPD opt-out gate (Fase 15.6) — block re-capture of opted-out contacts.
     * This is the main scrape destination (Google Maps results land here). */
    if ((dto as any).phone || (dto as any).email) {
      const { lgpdOptoutService } = await import("./lgpdOptout");
      const blocked = await lgpdOptoutService.isOptedOut((dto as any).phone, (dto as any).email);
      if (blocked) {
        const err: any = new Error("Este contato solicitou opt-out (LGPD) e não pode ser recapturado.");
        err.code = "LGPD_OPTED_OUT";
        throw err;
      }
    }

    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    if (!ownerUserId) {
      throw new Error("Missing owner user context for customer creation");
    }
    const brandColumn = this.resolveBrandColumn(columns);
    const sourceDetails: Record<string, any> = {
      google_place_id: dto.google_place_id || null,
      website: dto.website || null,
      rating: dto.google_rating || null,
      google_reviews_count: dto.google_reviews_count || null,
      google_maps_uri: dto.google_maps_uri || null,
      business_status: dto.business_status || null,
      category: dto.category || null,
      subcategory: dto.subcategory || null,
      address: dto.address || null,
      ...((dto as any).extra_source_details && typeof (dto as any).extra_source_details === "object"
        ? (dto as any).extra_source_details
        : {}),
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
    void this.notifyCampaignAutoFeed(ownerUserId, brandId, id);
    return (await this.getById(id, ownerUserId, brandId))!;
  }

  /** Alimenta campanhas com auto-feed quando um prospect/lead novo é criado. */
  private async notifyCampaignAutoFeed(
    ownerUserId: string,
    brandId: string | null | undefined,
    leadIds: string | number | Array<string | number>
  ): Promise<void> {
    try {
      const ids = Array.isArray(leadIds) ? leadIds : [leadIds];
      if (!ids.length) return;
      // Ref fraca — evita import circular customers ↔ index (que quebrava auto-feed)
      const { getCampaignEngineRef } = await import("./campaignEngineRef");
      const engine = getCampaignEngineRef();
      if (!engine?.autoFeedLeadsToCampaigns) {
        logger.warn("Campaign auto-feed skipped: engine ref not ready");
        return;
      }
      const result = await engine.autoFeedLeadsToCampaigns(ownerUserId, brandId, ids);
      if (result?.leadsQueued) {
        logger.info(
          `Campaign auto-feed: queued=${result.leadsQueued} campaigns=${result.campaignsTouched}`
        );
      }
    } catch (err: any) {
      logger.warn(`Campaign auto-feed skipped: ${err?.message || err}`);
    }
  }

  /** Garante tag "validado" em lead já checado (sem revalidar WA). */
  async ensureValidatedTag(
    id: string | number,
    ownerUserId?: string,
    brandId?: string | null
  ): Promise<void> {
    if (!ownerUserId) return;
    const columns = await this.getColumns();
    if (!this.hasColumn(columns, "tags")) return;
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);
    const brandWhere = brandColumn && brandId ? ` AND ${brandColumn} = ?` : "";
    const brandParams = brandColumn && brandId ? [String(brandId)] : [];
    const row = await queryOne<{ tags: any }>(
      `SELECT tags FROM customers WHERE id = ? AND ${ownerColumn} = ?${brandWhere} LIMIT 1`,
      [id, ownerUserId, ...brandParams]
    );
    if (!row) return;
    let tags: string[] = [];
    try {
      if (Array.isArray(row.tags)) tags = row.tags.map(String);
      else if (typeof row.tags === "string" && row.tags.trim()) tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }
    const has = tags.some((t) => String(t).toLowerCase() === "validado");
    if (has) return;
    tags.push("validado");
    await update(
      `UPDATE customers SET tags = ? WHERE id = ? AND ${ownerColumn} = ?${brandWhere}`,
      [
        this.normalizeColumnValue(columns.get("tags"), tags),
        id,
        ownerUserId,
        ...brandParams,
      ]
    );
  }

  async bulkCreateFromPlaces(
    places: any[],
    ownerUserId?: string,
    captureContext?: LeadCaptureContext,
    brandId?: string | null,
    options?: { skipMetadataUpdate?: boolean }
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
    const skipMeta = options?.skipMetadataUpdate === true;

    // Pré-carrega existentes em 1 query (em vez de N findExisting) — crítico pro capture-batch
    const placeIds = places.map((p) => String(p?.id || "")).filter(Boolean);
    const existingByPlaceId = new Map<string, Customer>();
    const existingByPhone = new Map<string, Customer>();
    const ownerWhere = ` AND ${ownerColumn} = ?`;
    const brandWhere = brandColumn && brandId ? ` AND ${brandColumn} = ?` : "";
    const brandParams = brandColumn && brandId ? [String(brandId)] : [];

    if (placeIds.length > 0 && this.hasColumn(columns, "google_place_id")) {
      // chunk IN queries (evita SQL gigante)
      for (let i = 0; i < placeIds.length; i += 80) {
        const chunk = placeIds.slice(i, i + 80);
        const placeholders = chunk.map(() => "?").join(",");
        try {
          const rows = await query<Customer[]>(
            `SELECT id, google_place_id, phone, source_details, tags FROM customers
             WHERE google_place_id IN (${placeholders})${ownerWhere}${brandWhere}`,
            [...chunk, ownerUserId, ...brandParams]
          );
          for (const row of rows || []) {
            const pid = String((row as any).google_place_id || "");
            if (pid) existingByPlaceId.set(pid, row);
            const ph = this.normalizePhone((row as any).phone || "");
            if (ph) existingByPhone.set(ph, row);
          }
        } catch (err: any) {
          logger.warn(`bulkCreate preload existing failed: ${err?.message || err}`);
        }
      }
    }

    // Dedupe o payload de entrada (mesmo place_id 2x na lista do Google)
    const seenInBatch = new Set<string>();

    for (const place of places) {
      try {
        const placeIdStr = place?.id ? String(place.id) : "";
        if (placeIdStr && seenInBatch.has(placeIdStr)) {
          skipped++;
          existingPlaceIds.push(placeIdStr);
          continue;
        }
        if (placeIdStr) seenInBatch.add(placeIdStr);

        const phone = this.normalizePhone(
          place.internationalPhoneNumber || place.nationalPhoneNumber || ""
        );

        let existing: Customer | null =
          placeIdStr && existingByPlaceId.has(placeIdStr)
            ? existingByPlaceId.get(placeIdStr) || null
            : null;
        if (!existing && phone && existingByPhone.has(phone)) {
          existing = existingByPhone.get(phone) || null;
        }
        if (!existing) {
          existing = await this.findExistingByPlaceOrPhone(place, ownerUserId, brandId);
        }
        if (existing) {
          skipped++;
          if (placeIdStr) {
            existingPlaceIds.push(placeIdStr);
            existingByPlaceId.set(placeIdStr, existing);
          }
          if (phone) existingByPhone.set(phone, existing);
          if (!skipMeta) {
            await this.updateCaptureMetadata(
              (existing as any).id,
              ownerUserId,
              captureContext,
              (existing as any).source_details,
              (existing as any).tags
            );
          }
          continue;
        }

        const name = place.displayName?.text || place.name || "Unknown";
        const types = Array.isArray(place.types) ? place.types : [];
        const category = types[0] || null;
        const subcategory = types[1] || null;
        const address = this.extractAddress(place);
        const { city, state, neighborhood } = this.extractCityState(address || undefined);

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

        let insertedId: string | number;
        try {
          insertedId = await this.insertDynamicCustomer(record);
        } catch (insErr: any) {
          // Corrida: outro request inseriu o mesmo place no mesmo instante (unique index)
          const msg = String(insErr?.message || insErr || "");
          const isDup =
            /unique|duplicate|23505/i.test(msg) ||
            Number(insErr?.code) === 23505 ||
            String(insErr?.code) === "23505";
          if (isDup && placeIdStr) {
            const again = await this.findExistingByPlaceOrPhone(place, ownerUserId, brandId);
            if (again) {
              skipped++;
              existingPlaceIds.push(placeIdStr);
              existingByPlaceId.set(placeIdStr, again);
              if (phone) existingByPhone.set(phone, again);
              continue;
            }
          }
          throw insErr;
        }

        created++;
        createdLeadIds.push(String(insertedId));
        if (placeIdStr) {
          createdPlaceIds.push(placeIdStr);
          // Marca como existente no batch/processo — evita 2º insert do mesmo place
          const stub = { id: insertedId, google_place_id: placeIdStr, phone, source_details: sourceDetails, tags: record.tags } as any;
          existingByPlaceId.set(placeIdStr, stub);
          if (phone) existingByPhone.set(phone, stub);
        }
      } catch (err: any) {
        logger.error(`Error creating customer from place: ${err.message}`);
        skipped++;
      }
    }

    logger.info(`Bulk import: ${created} created, ${skipped} skipped`);
    const uniqueCreated = Array.from(new Set(createdLeadIds));
    if (uniqueCreated.length) {
      void this.notifyCampaignAutoFeed(ownerUserId, brandId, uniqueCreated);
    }
    return {
      created,
      skipped,
      createdPlaceIds: Array.from(new Set(createdPlaceIds)),
      createdLeadIds: uniqueCreated,
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
    state?: string;
    search?: string;
    minRating?: number;
    maxRating?: number;
    tags?: string;
    tagsExclude?: string;
    hasWhatsapp?: "true" | "false";
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

    // status — supports comma-separated multi-value
    if (filters?.status && this.hasColumn(columns, "status")) {
      const vals = filters.status.split(",").map((v) => v.trim()).filter(Boolean);
      if (vals.length === 1) {
        where += " AND status = ?";
        params.push(vals[0]);
      } else if (vals.length > 1) {
        where += ` AND status IN (${vals.map(() => "?").join(", ")})`;
        params.push(...vals);
      }
    }

    // source — supports comma-separated multi-value
    if (filters?.source && this.hasColumn(columns, "source")) {
      const vals = filters.source.split(",").map((v) => v.trim()).filter(Boolean);
      if (vals.length === 1) {
        where += " AND source = ?";
        params.push(vals[0]);
      } else if (vals.length > 1) {
        where += ` AND source IN (${vals.map(() => "?").join(", ")})`;
        params.push(...vals);
      }
    }

    // category — supports comma-separated multi-value
    if (filters?.category) {
      const vals = filters.category.split(",").map((v) => v.trim()).filter(Boolean);
      if (this.hasColumn(columns, "category")) {
        if (vals.length === 1) {
          where += " AND category = ?";
          params.push(vals[0]);
        } else if (vals.length > 1) {
          where += ` AND category IN (${vals.map(() => "?").join(", ")})`;
          params.push(...vals);
        }
      } else if (this.hasColumn(columns, "source_details") && vals.length > 0) {
        if (vals.length === 1) {
          where += " AND source_details::jsonb->>'category' = ?";
          params.push(vals[0]);
        } else {
          where += ` AND source_details::jsonb->>'category' IN (${vals.map(() => "?").join(", ")})`;
          params.push(...vals);
        }
      }
    }

    // city — supports comma-separated multi-value
    if (filters?.city) {
      const vals = filters.city.split(",").map((v) => v.trim()).filter(Boolean);
      if (this.hasColumn(columns, "city")) {
        if (vals.length === 1) {
          where += " AND city LIKE ?";
          params.push(`%${vals[0]}%`);
        } else if (vals.length > 1) {
          where += ` AND (${vals.map(() => "city LIKE ?").join(" OR ")})`;
          params.push(...vals.map((v) => `%${v}%`));
        }
      } else if (this.hasColumn(columns, "address_city")) {
        if (vals.length === 1) {
          where += " AND address_city LIKE ?";
          params.push(`%${vals[0]}%`);
        } else if (vals.length > 1) {
          where += ` AND (${vals.map(() => "address_city LIKE ?").join(" OR ")})`;
          params.push(...vals.map((v) => `%${v}%`));
        }
      }
    }

    // state
    if (filters?.state && this.hasColumn(columns, "state")) {
      where += " AND state = ?";
      params.push(filters.state);
    }

    // search — case-insensitive + accent-insensitive via unaccent.
    // "Iguatu"/"iguatu"/"IGUATU" e "imobiliaria"/"imobiliária" todos batem.
    // Requer extensão `unaccent` habilitada (CREATE EXTENSION IF NOT EXISTS unaccent).
    if (filters?.search) {
      const searchFields = ["name", "trade_name", "phone", "email"].filter((field) =>
        this.hasColumn(columns, field)
      );

      if (searchFields.length > 0) {
        where += ` AND (${searchFields.map((f) => `LOWER(unaccent(COALESCE(${f}::text, ''))) LIKE LOWER(unaccent(?))`).join(" OR ")})`;
        const s = `%${filters.search}%`;
        searchFields.forEach(() => params.push(s));
      }
    }

    // rating range
    if (filters?.minRating !== undefined && this.hasColumn(columns, "rating")) {
      where += " AND rating >= ?";
      params.push(filters.minRating);
    }
    if (filters?.maxRating !== undefined && this.hasColumn(columns, "rating")) {
      where += " AND rating <= ?";
      params.push(filters.maxRating);
    }

    // tags include (comma-separated; cada tag deve aparecer no array de tags).
    // Coluna `tags` na pratica vem em formatos mistos:
    //   - JSONB array: ["a","b"]
    //   - PostgreSQL text array literal: {"a","b"} ou {a,b}
    //   - JSON string aninhada: "{\"a\",\"b\"}"
    // Cast pra jsonb com @> quebra em formatos PG-array. Usamos LIKE no texto
    // serializado, procurando a tag entre aspas (cobre JSONB, PG array com
    // aspas, e JSON string). Case-insensitive via LOWER.
    if (filters?.tags && this.hasColumn(columns, "tags")) {
      const tagList = filters.tags.split(",").map((t) => t.trim()).filter(Boolean);
      for (const tag of tagList) {
        where += " AND LOWER(COALESCE(tags::text, '')) LIKE LOWER(?)";
        params.push(`%"${tag}"%`);
      }
    }

    // tags exclude
    if (filters?.tagsExclude && this.hasColumn(columns, "tags")) {
      const tagList = filters.tagsExclude.split(",").map((t) => t.trim()).filter(Boolean);
      for (const tag of tagList) {
        where += " AND LOWER(COALESCE(tags::text, '')) NOT LIKE LOWER(?)";
        params.push(`%"${tag}"%`);
      }
    }

    // hasWhatsapp boolean filter (takes precedence over whatsappFilter)
    if (filters?.hasWhatsapp === "true") {
      const expr = this.resolveHasWhatsAppExpression(columns);
      if (expr) where += ` AND ${expr}`;
    } else if (filters?.hasWhatsapp === "false") {
      const expr = this.resolveWithoutWhatsAppExpression(columns);
      if (expr) where += ` AND ${expr}`;
    }

    // WhatsApp validation filter (legacy)
    if (!filters?.hasWhatsapp) {
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
          where += " AND (source_details::jsonb->'whatsapp_validation'->>'has_whatsapp' IS NULL)";
          if (phoneCol) where += ` AND ${phoneCol} IS NOT NULL AND ${phoneCol} != ''`;
        }
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

  /**
   * Delete many customers at once. Server enforces owner+brand scoping in the
   * WHERE clause, so a malformed/cross-tenant ID list silently no-ops on the
   * rows that don't belong. Returns the actual affected count.
   */
  async bulkDelete(ids: Array<string | number>, ownerUserId: string, brandId?: string | null): Promise<number> {
    if (!ownerUserId) throw new Error("Missing owner user context for bulk delete");
    if (!ids?.length) return 0;
    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);

    const placeholders = ids.map(() => "?").join(",");
    const params: any[] = [...ids, ownerUserId];
    let sql = `DELETE FROM customers WHERE id IN (${placeholders}) AND ${ownerColumn} = ?`;
    if (brandColumn && brandId) {
      sql += ` AND ${brandColumn} = ?`;
      params.push(String(brandId));
    }
    return await update(sql, params);
  }

  /**
   * Update many customers at once with a whitelisted patch. Same scoping
   * pattern as bulkDelete. The patch goes through `legacyOrModernMap`-style
   * column resolution so it works across both legacy and modern schemas.
   */
  async bulkUpdate(
    ids: Array<string | number>,
    patch: Record<string, any>,
    ownerUserId: string,
    brandId?: string | null
  ): Promise<number> {
    if (!ownerUserId) throw new Error("Missing owner user context for bulk update");
    if (!ids?.length) return 0;
    if (!patch || !Object.keys(patch).length) return 0;

    const columns = await this.getColumns();
    const ownerColumn = this.requireOwnerColumn(columns);
    const brandColumn = this.resolveBrandColumn(columns);

    const columnMap: Record<string, string[]> = {
      status: ["status"],
      category: ["category"],
      subcategory: ["subcategory"],
      tags: ["tags"],
      notes: ["notes"],
      assigned_to: ["assigned_to"],
    };

    const setClauses: string[] = [];
    const setValues: any[] = [];
    for (const [field, candidates] of Object.entries(columnMap)) {
      if (!(field in patch)) continue;
      const target = candidates.find((c) => this.hasColumn(columns, c));
      if (!target) continue;
      setClauses.push(`${target} = ?`);
      setValues.push(this.normalizeColumnValue(columns.get(target), patch[field]));
    }
    if (!setClauses.length) return 0;

    const placeholders = ids.map(() => "?").join(",");
    const params: any[] = [...setValues, ...ids, ownerUserId];
    let sql = `UPDATE customers SET ${setClauses.join(", ")} WHERE id IN (${placeholders}) AND ${ownerColumn} = ?`;
    if (brandColumn && brandId) {
      sql += ` AND ${brandColumn} = ?`;
      params.push(String(brandId));
    }
    return await update(sql, params);
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
    const todayExpr = createdColumn ? `DATE(${createdColumn}) = CURRENT_DATE` : "FALSE";
    const weekExpr = createdColumn ? `${createdColumn} >= CURRENT_TIMESTAMP - INTERVAL '7 day'` : "FALSE";
    const monthExpr = createdColumn ? `${createdColumn} >= CURRENT_TIMESTAMP - INTERVAL '30 day'` : "FALSE";

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
    if (this.hasColumn(columns, "tags")) selectFields.push("tags");

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

    // Tag "validado" — UI e "Validar todos" usam pra pular recheck
    if (this.hasColumn(columns, "tags")) {
      let tags: string[] = [];
      try {
        const rawTags = (existing as any).tags;
        if (Array.isArray(rawTags)) tags = rawTags.map(String);
        else if (typeof rawTags === "string" && rawTags.trim()) tags = JSON.parse(rawTags);
      } catch {
        tags = [];
      }
      if (!tags.some((t) => String(t).toLowerCase() === "validado")) {
        tags.push("validado");
        fields.push("tags = ?");
        values.push(this.normalizeColumnValue(columns.get("tags"), tags));
      }
    }

    if (this.hasColumn(columns, "has_whatsapp")) {
      fields.push("has_whatsapp = ?");
      values.push(this.normalizeColumnValue(columns.get("has_whatsapp"), payload.hasWhatsApp));
    }

    if (this.hasColumn(columns, "whatsapp_valid")) {
      fields.push("whatsapp_valid = ?");
      values.push(this.normalizeColumnValue(columns.get("whatsapp_valid"), payload.hasWhatsApp));
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

  async getFilterOptions(scope: { userId?: string; brandId?: string }): Promise<any> {
    const columns = await this.getColumns();
    const conditions: string[] = [];
    const params: any[] = [];

    const ownerColumn = this.resolveOwnerColumn(columns);
    if (ownerColumn && scope.userId) {
      conditions.push(`${ownerColumn} = ?`);
      params.push(scope.userId);
    }

    const brandColumn = this.resolveBrandColumn(columns);
    if (brandColumn) {
      if (scope.brandId) {
        conditions.push(`${brandColumn} = ?`);
        params.push(scope.brandId);
      } else {
        conditions.push(`${brandColumn} IS NULL`);
      }
    }

    const baseWhere = conditions.length > 0 ? conditions.join(" AND ") : "1=1";

    const [categories, cities, statuses, sources, states, tags, total] = await Promise.all([
      query<any[]>(`SELECT category AS value, COUNT(*)::int AS count FROM customers WHERE ${baseWhere} AND category IS NOT NULL AND TRIM(category) != '' GROUP BY category ORDER BY count DESC LIMIT 30`, params),
      query<any[]>(`SELECT city AS value, COUNT(*)::int AS count FROM customers WHERE ${baseWhere} AND city IS NOT NULL AND TRIM(city) != '' GROUP BY city ORDER BY count DESC LIMIT 30`, params),
      query<any[]>(`SELECT status AS value, COUNT(*)::int AS count FROM customers WHERE ${baseWhere} GROUP BY status ORDER BY count DESC`, params),
      query<any[]>(`SELECT source AS value, COUNT(*)::int AS count FROM customers WHERE ${baseWhere} AND source IS NOT NULL GROUP BY source ORDER BY count DESC LIMIT 20`, params),
      this.hasColumn(columns, "state")
        ? query<any[]>(`SELECT state AS value, COUNT(*)::int AS count FROM customers WHERE ${baseWhere} AND state IS NOT NULL AND TRIM(state) != '' GROUP BY state ORDER BY count DESC LIMIT 20`, params)
        : Promise.resolve([]),
      this.hasColumn(columns, "tags")
        ? query<any[]>(`SELECT tags FROM customers WHERE ${baseWhere} AND tags IS NOT NULL AND tags::text != '[]' AND tags::text != 'null' LIMIT 200`, params)
        : Promise.resolve([]),
      query<any[]>(`SELECT COUNT(*)::int AS total FROM customers WHERE ${baseWhere}`, params),
    ]);

    const allTags = new Set<string>();
    for (const row of tags) {
      try {
        const t = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
        if (Array.isArray(t)) t.forEach((tag: string) => allTags.add(tag));
      } catch {}
    }

    return {
      categories,
      cities,
      statuses,
      sources,
      states,
      tags: [...allTags].sort(),
      total: (total[0] as any)?.total || 0,
    };
  }
}
