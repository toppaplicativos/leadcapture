import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

// ─── In-memory cache with 60s TTL ─────────────────────────────────
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

function getCached(key: string): string | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache(key: string, value: string): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateCache(key: string): void {
  cache.delete(key);
}

// ─── Ensure table exists ───────────────────────────────────────────
let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(255) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    tableReady = true;
  } catch (err: any) {
    logger.error(`[Settings] Failed to create system_settings table: ${err.message}`);
    throw err;
  }
}

// ─── Public API ────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  await ensureTable();
  const row = await queryOne<{ setting_value: string }>(
    `SELECT setting_value FROM system_settings WHERE setting_key = ?`,
    [key],
  );
  if (row) {
    setCache(key, row.setting_value);
    return row.setting_value;
  }
  return null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await ensureTable();
  // Upsert: INSERT ... ON DUPLICATE KEY UPDATE (database.ts converts to PG ON CONFLICT)
  await query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
    [key, value],
  );
  setCache(key, value);
}

async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  await ensureTable();
  const result: Record<string, string | null> = {};

  // Check cache first, collect misses
  const missingKeys: string[] = [];
  for (const key of keys) {
    const cached = getCached(key);
    if (cached !== undefined) {
      result[key] = cached;
    } else {
      missingKeys.push(key);
      result[key] = null;
    }
  }

  if (missingKeys.length > 0) {
    // Query all at once
    const placeholders = missingKeys.map(() => "?").join(", ");
    const rows = await query<Array<{ setting_key: string; setting_value: string }>>(
      `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (${placeholders})`,
      missingKeys,
    );
    for (const row of rows) {
      result[row.setting_key] = row.setting_value;
      setCache(row.setting_key, row.setting_value);
    }
  }

  return result;
}

async function getAllSettings(prefix?: string): Promise<Record<string, string>> {
  await ensureTable();
  let rows: Array<{ setting_key: string; setting_value: string }>;
  if (prefix) {
    rows = await query<Array<{ setting_key: string; setting_value: string }>>(
      `SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE ?`,
      [`${prefix}%`],
    );
  } else {
    rows = await query<Array<{ setting_key: string; setting_value: string }>>(
      `SELECT setting_key, setting_value FROM system_settings`,
    );
  }
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.setting_key] = row.setting_value;
    setCache(row.setting_key, row.setting_value);
  }
  return result;
}

export const settingsService = {
  getSetting,
  setSetting,
  getSettings,
  getAllSettings,
  invalidateCache,
};
