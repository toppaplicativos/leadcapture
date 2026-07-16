import axios from "axios";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { config } from "../config";
import { query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";

export const INTEGRATION_PROVIDERS = [
  "openai",
  "gemini",
  "grok",
  "atlas",
  "rapidapi",
  "google_places",
  "runway",
  "veo",
  "kling",
  "__preferences__",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationScope = {
  accountId?: string | null;
  userId?: string | null;
  brandId?: string | null;
};

export type IntegrationRecord = {
  id: string;
  account_id: string;
  provider: IntegrationProvider;
  key: string | null;
  config_json: Record<string, any>;
  is_active: boolean;
  priority: number;
  created_at?: string;
  updated_at?: string;
  source_account_id?: string;
};

export type IntegrationResolvedConfig = {
  provider: IntegrationProvider;
  key: string | null;
  config: Record<string, any>;
  is_active: boolean;
  priority: number;
  source: "database" | "env";
  account_id: string;
  updated_at?: string;
};

export type IntegrationAdminSnapshot = {
  provider: IntegrationProvider;
  source: "database" | "env" | "empty";
  account_id: string;
  has_key: boolean;
  masked_key: string | null;
  is_active: boolean;
  priority: number;
  config: Record<string, any>;
  updated_at?: string;
  env_fallback_available: boolean;
};

export type IntegrationLogEntry = {
  id: string;
  account_id: string;
  provider: IntegrationProvider;
  status: "success" | "error";
  message: string;
  metadata_json?: Record<string, any> | null;
  created_at?: string;
};

export type IntegrationTestResult = {
  ok: boolean;
  provider: IntegrationProvider;
  source: "database" | "env" | "payload";
  message: string;
  latency_ms: number;
  status_code?: number;
};

type IntegrationRow = {
  id: string;
  account_id: string;
  provider: string;
  key_encrypted?: string | null;
  key?: string | null;
  config_json?: string | Record<string, any> | null;
  is_active?: boolean | number;
  priority?: number;
  created_at?: string;
  updated_at?: string;
};

const CACHE_TTL_MS = 60_000;
const GLOBAL_ACCOUNT_ID = "__global__";

function isProvider(value: string): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(String(value || "").trim().toLowerCase());
}

function normalizeProvider(value: string): IntegrationProvider {
  const normalized = String(value || "").trim().toLowerCase();
  if (!isProvider(normalized)) {
    throw new Error(`Unsupported provider: ${value}`);
  }
  return normalized;
}

function parseJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function parseBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMaskedKey(value?: string | null): string | null {
  const key = String(value || "").trim();
  if (!key) return null;
  if (key.length <= 8) return `${key.slice(0, 2)}***${key.slice(-2)}`;
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

function cleanString(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export class IntegrationService {
  private schemaReady = false;
  private schemaReadyPromise: Promise<void> | null = null;
  private cache = new Map<string, { value: IntegrationResolvedConfig; expires: number }>();

  private encryptionKey(): Buffer {
    const source = String(
      process.env.INTEGRATION_ENCRYPTION_KEY ||
        process.env.PAYMENT_ENCRYPTION_KEY ||
        process.env.JWT_SECRET ||
        "leadcapture-integrations-key"
    );
    return createHash("sha256").update(source).digest();
  }

  private encryptSecret(value?: string | null): string | null {
    const plain = String(value || "").trim();
    if (!plain) return null;

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
  }

  private decryptSecret(value?: string | null): string | null {
    const payload = String(value || "").trim();
    if (!payload) return null;

    const [ivB64, tagB64, dataB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return payload;

    try {
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      return payload;
    }
  }

  private toCacheKey(provider: IntegrationProvider, accountId: string): string {
    return `${provider}::${accountId}`;
  }

  private normalizeWriteAccountId(scope?: IntegrationScope): string {
    const explicit = String(scope?.accountId || "").trim();
    if (explicit) return explicit;

    const userId = String(scope?.userId || "").trim();
    const brandId = String(scope?.brandId || "").trim();
    if (userId && brandId) return `${userId}::${brandId}`;
    if (userId) return userId;
    return GLOBAL_ACCOUNT_ID;
  }

  private resolveAccountChain(scope?: IntegrationScope): string[] {
    const explicit = String(scope?.accountId || "").trim();
    if (explicit) return [explicit, GLOBAL_ACCOUNT_ID];

    const userId = String(scope?.userId || "").trim();
    const brandId = String(scope?.brandId || "").trim();
    const result = new Set<string>();

    if (userId && brandId) result.add(`${userId}::${brandId}`);
    if (userId) result.add(userId);
    result.add(GLOBAL_ACCOUNT_ID);

    return [...result];
  }

  private hydrateRow(row: IntegrationRow): IntegrationRecord {
    return {
      id: String(row.id || ""),
      account_id: String(row.account_id || GLOBAL_ACCOUNT_ID),
      provider: normalizeProvider(String(row.provider || "")),
      key: this.decryptSecret(row.key_encrypted || row.key || null),
      config_json: parseJsonObject(row.config_json),
      is_active: parseBoolean(row.is_active, true),
      priority: Math.max(1, Math.floor(parseNumber(row.priority, 1))),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private defaultConfig(provider: IntegrationProvider): Record<string, any> {
    switch (provider) {
      case "gemini":
        return {
          model: process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_CAMPAIGN_MODEL || config.creatives.textModel || "gemini-2.5-flash",
          temperature: parseNumber(process.env.GEMINI_TEMPERATURE, 0.7),
        };
      case "openai":
        return {
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          organization: cleanString(process.env.OPENAI_ORGANIZATION),
          use_as_fallback: false,
        };
      case "grok":
        return {
          model: process.env.GROK_MODEL || process.env.XAI_MODEL || "grok-3-mini",
        };
      case "atlas":
        return {
          model: process.env.ATLAS_MODEL || "google/gemini-2.5-flash",
          base_url: process.env.ATLAS_BASE_URL || "https://api.atlascloud.ai",
        };
      case "rapidapi":
        return {
          host: process.env.RAPIDAPI_HOST || config.rapidApi.host || "google-map-places-new-v2.p.rapidapi.com",
          baseUrl: process.env.RAPIDAPI_BASE_URL || config.rapidApi.baseUrl || "https://google-map-places-new-v2.p.rapidapi.com",
          fallbacks: ["google_places"],
          timeout: Math.max(500, Math.floor(parseNumber(process.env.RAPIDAPI_TIMEOUT, 15000))),
        };
      case "google_places":
        return {
          timeout: Math.max(500, Math.floor(parseNumber(process.env.GOOGLE_PLACES_TIMEOUT, 15000))),
          fallback_active: true,
        };
      case "runway":
        return {
          generation_type: process.env.RUNWAY_GENERATION_TYPE || "video",
          quality: process.env.RUNWAY_QUALITY || "high",
        };
      default:
        return {};
    }
  }

  private normalizeConfig(provider: IntegrationProvider, raw: unknown): Record<string, any> {
    const incoming = parseJsonObject(raw);
    const defaults = this.defaultConfig(provider);

    switch (provider) {
      case "gemini":
        return {
          model: cleanString(incoming.model) || defaults.model,
          temperature: parseNumber(incoming.temperature, parseNumber(defaults.temperature, 0.7)),
        };
      case "openai":
        return {
          model: cleanString(incoming.model) || defaults.model,
          organization: cleanString(incoming.organization) || defaults.organization || null,
          use_as_fallback: parseBoolean(incoming.use_as_fallback, parseBoolean(defaults.use_as_fallback, false)),
        };
      case "grok":
        return {
          model: cleanString(incoming.model) || defaults.model,
        };
      case "atlas":
        return {
          model: cleanString(incoming.model) || defaults.model,
          base_url: cleanString(incoming.base_url) || defaults.base_url,
        };
      case "rapidapi":
        return {
          host: cleanString(incoming.host) || defaults.host,
          baseUrl: cleanString(incoming.baseUrl) || defaults.baseUrl,
          fallbacks: Array.isArray(incoming.fallbacks)
            ? incoming.fallbacks.map((item) => String(item || "").trim()).filter(Boolean)
            : defaults.fallbacks,
          timeout: Math.max(500, Math.floor(parseNumber(incoming.timeout, parseNumber(defaults.timeout, 15000)))),
        };
      case "google_places":
        return {
          timeout: Math.max(500, Math.floor(parseNumber(incoming.timeout, parseNumber(defaults.timeout, 15000)))),
          fallback_active: parseBoolean(incoming.fallback_active, parseBoolean(defaults.fallback_active, true)),
        };
      case "runway":
        return {
          generation_type: cleanString(incoming.generation_type || incoming.type) || defaults.generation_type,
          quality: cleanString(incoming.quality) || defaults.quality,
        };
      default:
        return { ...defaults, ...incoming };
    }
  }

  private buildEnvFallback(provider: IntegrationProvider): IntegrationResolvedConfig {
    const defaults = this.defaultConfig(provider);

    switch (provider) {
      case "gemini":
        return {
          provider,
          key: cleanString(process.env.GEMINI_API_KEY),
          config: this.normalizeConfig(provider, defaults),
          is_active: true,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
      case "openai":
        return {
          provider,
          key: cleanString(process.env.OPENAI_API_KEY),
          config: this.normalizeConfig(provider, defaults),
          is_active: true,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
      case "grok":
        return {
          provider,
          key: cleanString(process.env.GROK_API_KEY || process.env.XAI_API_KEY),
          config: this.normalizeConfig(provider, defaults),
          is_active: true,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
      case "atlas":
        return {
          provider,
          key: cleanString(process.env.ATLAS_API_KEY || process.env.ATLASCLOUD_API_KEY),
          config: this.normalizeConfig(provider, defaults),
          is_active: true,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
      case "rapidapi":
        return {
          provider,
          key: cleanString(process.env.RAPIDAPI_KEY || config.rapidApi.key),
          config: this.normalizeConfig(provider, defaults),
          is_active: true,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
      case "google_places":
        return {
          provider,
          key: cleanString(process.env.GOOGLE_PLACES_API_KEY),
          config: this.normalizeConfig(provider, defaults),
          is_active: true,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
      case "runway":
        return {
          provider,
          key: cleanString(process.env.RUNWAY_API_KEY),
          config: this.normalizeConfig(provider, defaults),
          is_active: true,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
      default:
        return {
          provider,
          key: null,
          config: this.normalizeConfig(provider, defaults),
          is_active: false,
          priority: 999,
          source: "env",
          account_id: GLOBAL_ACCOUNT_ID,
        };
    }
  }

  /**
   * findAnyActiveProvider — usado por endpoints PUBLICOS (sem user logado, ex: landing chat)
   * Busca a PRIMEIRA integration ativa de qualquer um dos providers listados, ignorando
   * account_id. Permite que features publicas reaproveitem chaves ja cadastradas
   * por qualquer admin sem precisar de configuracao global especifica.
   *
   * Ordem de preferencia respeita a ordem do array de entrada (ex: ['openai','grok','gemini']).
   * Dentro de cada provider, retorna a integration mais recente (updated_at DESC).
   */
  async findAnyActiveProvider(providers: string[]): Promise<IntegrationResolvedConfig | null> {
    await this.ensureSchema();
    for (const providerName of providers) {
      const provider = normalizeProvider(providerName);
      const row = await queryOne<IntegrationRow>(
        `SELECT *
         FROM integrations
         WHERE provider = ? AND is_active = TRUE AND key_encrypted IS NOT NULL AND key_encrypted <> ''
         ORDER BY updated_at DESC
         LIMIT 1`,
        [provider]
      );
      if (!row) continue;
      const hydrated = this.hydrateRow(row);
      if (!hydrated.key) continue;
      return {
        provider,
        key: hydrated.key,
        config: this.normalizeConfig(provider, hydrated.config_json),
        is_active: hydrated.is_active,
        priority: hydrated.priority,
        source: "database",
        account_id: hydrated.account_id,
        updated_at: hydrated.updated_at,
      };
    }
    return null;
  }

  private async findStoredProvider(provider: IntegrationProvider, scope?: IntegrationScope): Promise<IntegrationRecord | null> {
    await this.ensureSchema();

    for (const accountId of this.resolveAccountChain(scope)) {
      const row = await queryOne<IntegrationRow>(
        `SELECT *
         FROM integrations
         WHERE account_id = ? AND provider = ? AND is_active = TRUE
         ORDER BY priority ASC, updated_at DESC
         LIMIT 1`,
        [accountId, provider]
      );

      if (row) {
        const hydrated = this.hydrateRow(row);
        hydrated.source_account_id = accountId;
        return hydrated;
      }
    }

    return null;
  }

  private async findEditableProvider(provider: IntegrationProvider, scope?: IntegrationScope): Promise<IntegrationRecord | null> {
    await this.ensureSchema();

    const accountId = this.normalizeWriteAccountId(scope);
    const row = await queryOne<IntegrationRow>(
      `SELECT *
       FROM integrations
       WHERE account_id = ? AND provider = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [accountId, provider]
    );

    return row ? this.hydrateRow(row) : null;
  }

  private payloadConfig(provider: IntegrationProvider, payload?: { key?: string | null; config?: Record<string, any> | null }): IntegrationResolvedConfig {
    const envFallback = this.buildEnvFallback(provider);
    return {
      provider,
      key: cleanString(payload?.key) || envFallback.key,
      config: this.normalizeConfig(provider, payload?.config || envFallback.config),
      is_active: true,
      priority: 1,
      source: "env",
      account_id: GLOBAL_ACCOUNT_ID,
    };
  }

  private async ensureColumn(tableName: string, columnName: string, definition: string): Promise<void> {
    const exists = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );

    if (Number(exists?.total || 0) > 0) return;
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaReadyPromise) {
      await this.schemaReadyPromise;
      return;
    }

    this.schemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS integrations (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL DEFAULT '${GLOBAL_ACCOUNT_ID}',
          provider VARCHAR(60) NOT NULL,
          key_encrypted TEXT NULL,
          config_json JSON NULL,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          priority INT NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_integrations_account_provider (account_id, provider)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS integration_logs (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL DEFAULT '${GLOBAL_ACCOUNT_ID}',
          provider VARCHAR(60) NOT NULL,
          status VARCHAR(16) NOT NULL,
          message TEXT NOT NULL,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.ensureColumn("integrations", "account_id", `VARCHAR(120) NOT NULL DEFAULT '${GLOBAL_ACCOUNT_ID}'`);
      await this.ensureColumn("integrations", "key_encrypted", "TEXT NULL");
      await this.ensureColumn("integrations", "config_json", "JSON NULL");
      await this.ensureColumn("integrations", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
      await this.ensureColumn("integrations", "priority", "INT NOT NULL DEFAULT 1");
      await this.ensureColumn("integration_logs", "account_id", `VARCHAR(120) NOT NULL DEFAULT '${GLOBAL_ACCOUNT_ID}'`);
      await this.ensureColumn("integration_logs", "metadata_json", "JSON NULL");

      this.schemaReady = true;
    })().finally(() => {
      this.schemaReadyPromise = null;
    });

    await this.schemaReadyPromise;
  }

  async getProvider(providerInput: string, scope?: IntegrationScope): Promise<IntegrationResolvedConfig> {
    const provider = normalizeProvider(providerInput);
    const accountId = this.normalizeWriteAccountId(scope);
    const cacheKey = this.toCacheKey(provider, accountId);
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    const stored = await this.findStoredProvider(provider, scope);
    let resolved: IntegrationResolvedConfig = stored
      ? {
          provider,
          key: stored.key,
          config: this.normalizeConfig(provider, stored.config_json),
          is_active: stored.is_active,
          priority: stored.priority,
          source: "database",
          account_id: stored.source_account_id || stored.account_id,
          updated_at: stored.updated_at,
        }
      : this.buildEnvFallback(provider);

    // Last-resort fallback: se o escopo nao tem chave e a env var tambem nao tem,
    // usa qualquer chave ativa do banco (evita GEMINI_API_KEY_NOT_CONFIGURED em dev)
    if (!cleanString(resolved.key)) {
      const anyActive = await this.findAnyActiveProvider([provider]);
      if (anyActive) resolved = anyActive;
    }

    this.cache.set(cacheKey, { value: resolved, expires: Date.now() + CACHE_TTL_MS });
    return resolved;
  }

  async getAdminSnapshot(providerInput: string, scope?: IntegrationScope): Promise<IntegrationAdminSnapshot> {
    const provider = normalizeProvider(providerInput);
    const editable = await this.findEditableProvider(provider, scope);

    if (editable) {
      return {
        provider,
        source: "database",
        account_id: editable.account_id,
        has_key: Boolean(cleanString(editable.key)),
        masked_key: toMaskedKey(editable.key),
        is_active: editable.is_active,
        priority: editable.priority,
        config: this.normalizeConfig(provider, editable.config_json),
        updated_at: editable.updated_at,
        env_fallback_available: Boolean(cleanString(this.buildEnvFallback(provider).key)),
      };
    }

    const envFallback = this.buildEnvFallback(provider);
    const hasEnvKey = Boolean(cleanString(envFallback.key));
    return {
      provider,
      source: hasEnvKey ? "env" : "empty",
      account_id: this.normalizeWriteAccountId(scope),
      has_key: hasEnvKey,
      masked_key: toMaskedKey(envFallback.key),
      is_active: false,
      priority: 1,
      config: this.normalizeConfig(provider, envFallback.config),
      env_fallback_available: hasEnvKey,
    };
  }

  async listProviders(scope?: IntegrationScope): Promise<IntegrationAdminSnapshot[]> {
    return Promise.all(INTEGRATION_PROVIDERS.map((provider) => this.getAdminSnapshot(provider, scope)));
  }

  async saveProvider(
    providerInput: string,
    payload: {
      key?: string | null;
      config?: Record<string, any> | null;
      is_active?: boolean;
      priority?: number;
    },
    scope?: IntegrationScope
  ): Promise<IntegrationAdminSnapshot> {
    const provider = normalizeProvider(providerInput);
    await this.ensureSchema();

    const existing = await this.findEditableProvider(provider, scope);
    const accountId = this.normalizeWriteAccountId(scope);
    const normalizedConfig = this.normalizeConfig(provider, payload.config || existing?.config_json || {});
    const currentKey = existing?.key || null;
    const nextKey = payload.key === undefined ? currentKey : cleanString(payload.key);
    const encrypted = this.encryptSecret(nextKey);
    const isActive = parseBoolean(payload.is_active, existing?.is_active ?? true);
    const priority = Math.max(1, Math.floor(parseNumber(payload.priority, existing?.priority || 1)));

    if (existing) {
      await update(
        `UPDATE integrations
         SET key_encrypted = ?, config_json = ?, is_active = ?, priority = ?, updated_at = NOW()
         WHERE id = ?`,
        [encrypted, JSON.stringify(normalizedConfig), isActive, priority, existing.id]
      );
    } else {
      await query(
        `INSERT INTO integrations (id, account_id, provider, key_encrypted, config_json, is_active, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), accountId, provider, encrypted, JSON.stringify(normalizedConfig), isActive, priority]
      );
    }

    this.invalidateProvider(provider);
    await this.logEvent(provider, isActive ? "success" : "error", isActive ? "Integration saved" : "Integration disabled", scope, {
      action: "save",
      priority,
    });

    return this.getAdminSnapshot(provider, scope);
  }

  async listLogs(scope?: IntegrationScope, options?: { provider?: string; limit?: number }): Promise<IntegrationLogEntry[]> {
    await this.ensureSchema();
    const accountChain = this.resolveAccountChain(scope);
    const limit = Math.max(1, Math.min(200, Math.floor(parseNumber(options?.limit, 50))));
    const provider = options?.provider ? normalizeProvider(options.provider) : null;
    const placeholders = accountChain.map(() => "?").join(",");
    const providerSql = provider ? " AND provider = ?" : "";
    const params = provider ? [...accountChain, provider, limit] : [...accountChain, limit];

    const rows = await query<IntegrationLogEntry[]>(
      `SELECT id, account_id, provider, status, message, metadata_json, created_at
       FROM integration_logs
       WHERE account_id IN (${placeholders})${providerSql}
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    );

    return (rows || []).map((row) => ({
      ...row,
      provider: normalizeProvider(String(row.provider || "")),
      metadata_json: parseJsonObject(row.metadata_json),
    }));
  }

  async logEvent(
    providerInput: string,
    status: "success" | "error",
    message: string,
    scope?: IntegrationScope,
    metadata?: Record<string, any>
  ): Promise<void> {
    const provider = normalizeProvider(providerInput);
    try {
      await this.ensureSchema();
      await query(
        `INSERT INTO integration_logs (id, account_id, provider, status, message, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          this.normalizeWriteAccountId(scope),
          provider,
          status,
          String(message || "").slice(0, 3000),
          JSON.stringify(metadata || {}),
        ]
      );
    } catch (error: any) {
      logger.warn(`Integration log write failed for ${provider}: ${error.message}`);
    }
  }

  invalidateProvider(providerInput?: string): void {
    if (!providerInput) {
      this.cache.clear();
      return;
    }

    const provider = normalizeProvider(providerInput);
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${provider}::`)) {
        this.cache.delete(key);
      }
    }
  }

  async testConnection(
    providerInput: string,
    payload?: { key?: string | null; config?: Record<string, any> | null },
    scope?: IntegrationScope
  ): Promise<IntegrationTestResult> {
    const provider = normalizeProvider(providerInput);
    const usePayload = payload && (payload.key !== undefined || payload.config !== undefined);
    const resolved = usePayload ? this.payloadConfig(provider, payload) : await this.getProvider(provider, scope);
    const source: IntegrationTestResult["source"] = usePayload ? "payload" : resolved.source;
    const startedAt = Date.now();
    const key = cleanString(payload?.key) ?? resolved.key;
    const configJson = this.normalizeConfig(provider, payload?.config || resolved.config);

    if (!key) {
      const missingResult = {
        ok: false,
        provider,
        source,
        message: `${provider.toUpperCase()}_API_KEY_NOT_CONFIGURED`,
        latency_ms: 0,
      } satisfies IntegrationTestResult;
      await this.logEvent(provider, "error", missingResult.message, scope, { source });
      return missingResult;
    }

    try {
      let responseStatus = 200;

      switch (provider) {
        case "gemini": {
          const response = await axios.get("https://generativelanguage.googleapis.com/v1beta/models", {
            timeout: 10_000,
            params: { key },
          });
          responseStatus = response.status;
          break;
        }
        case "openai": {
          const response = await axios.get("https://api.openai.com/v1/models", {
            timeout: 10_000,
            headers: {
              Authorization: `Bearer ${key}`,
              ...(configJson.organization ? { "OpenAI-Organization": String(configJson.organization) } : {}),
            },
          });
          responseStatus = response.status;
          break;
        }
        case "grok": {
          const response = await axios.get("https://api.x.ai/v1/models", {
            timeout: 10_000,
            headers: { Authorization: `Bearer ${key}` },
          });
          responseStatus = response.status;
          break;
        }
        case "atlas": {
          const atlasBase = String(configJson.base_url || process.env.ATLAS_BASE_URL || "https://api.atlascloud.ai").replace(
            /\/+$/,
            "",
          );
          const response = await axios.get(`${atlasBase}/v1/models`, {
            timeout: 10_000,
            headers: { Authorization: `Bearer ${key}` },
          });
          responseStatus = response.status;
          break;
        }
        case "rapidapi": {
          const response = await axios.post(
            `${String(configJson.baseUrl || "https://google-map-places-new-v2.p.rapidapi.com").replace(/\/+$/, "")}/v1/places:searchText`,
            {
              textQuery: "restaurante em sao paulo",
              maxResultCount: 1,
              languageCode: "pt-BR",
            },
            {
              timeout: Math.max(1_000, Math.floor(parseNumber(configJson.timeout, 10_000))),
              headers: {
                "Content-Type": "application/json",
                "x-rapidapi-key": key,
                "x-rapidapi-host": String(configJson.host || config.rapidApi.host),
                "X-Goog-FieldMask": "places.id",
              },
            }
          );
          responseStatus = response.status;
          break;
        }
        case "google_places": {
          const response = await axios.post(
            "https://places.googleapis.com/v1/places:searchText",
            {
              textQuery: "restaurante em sao paulo",
              maxResultCount: 1,
              languageCode: "pt-BR",
            },
            {
              timeout: Math.max(1_000, Math.floor(parseNumber(configJson.timeout, 10_000))),
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": key,
                "X-Goog-FieldMask": "places.id",
              },
            }
          );
          responseStatus = response.status;
          break;
        }
        case "runway": {
          const response = await axios.get("https://api.runwayml.com/v1/tasks?limit=1", {
            timeout: 10_000,
            headers: {
              Authorization: `Bearer ${key}`,
              Accept: "application/json",
            },
          });
          responseStatus = response.status;
          break;
        }
      }

      const result: IntegrationTestResult = {
        ok: true,
        provider,
        source,
        message: "Connection OK",
        latency_ms: Date.now() - startedAt,
        status_code: responseStatus,
      };

      await this.logEvent(provider, "success", result.message, scope, {
        source,
        latency_ms: result.latency_ms,
        status_code: result.status_code,
      });

      return result;
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.response?.statusText ||
        error?.message ||
        "Connection failed";

      const result: IntegrationTestResult = {
        ok: false,
        provider,
        source,
        message: String(message),
        latency_ms: Date.now() - startedAt,
        status_code: Number(error?.response?.status || 0) || undefined,
      };

      await this.logEvent(provider, "error", result.message, scope, {
        source,
        latency_ms: result.latency_ms,
        status_code: result.status_code,
      });

      return result;
    }
  }
}

export const integrationService = new IntegrationService();