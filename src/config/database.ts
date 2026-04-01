import { Pool, PoolClient, QueryResult } from "pg";
import { config } from "./index";
import { logger } from "../utils/logger";

type CompatResult = {
  affectedRows: number;
  insertId: number;
  rowCount: number;
  command: string;
};

type CompatQueryTuple<T = any> = [T, CompatResult];

type CompatClient = {
  query<T = any>(sql: string, params?: any[]): Promise<CompatQueryTuple<T>>;
  execute<T = any>(sql: string, params?: any[]): Promise<CompatQueryTuple<T>>;
  release(): void;
};

type CompatPool = {
  query<T = any>(sql: string, params?: any[]): Promise<CompatQueryTuple<T>>;
  execute<T = any>(sql: string, params?: any[]): Promise<CompatQueryTuple<T>>;
  getConnection(): Promise<CompatClient>;
  end(): Promise<void>;
};

let pgPool: Pool;
let compatPool: CompatPool;

function isTransientDbError(error: any): boolean {
  const code = String(error?.code || "");
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "08006" ||
    code === "08000" ||
    code === "08003"
  );
}

function normalizeSchemaSql(sql: string): string {
  return sql
    .replace(/`/g, '"')
    .replace(/\bINT\s+NOT\s+NULL\s+AUTO_INCREMENT\b/gi, "SERIAL")
    .replace(/\bBIGINT\s+NOT\s+NULL\s+AUTO_INCREMENT\b/gi, "BIGSERIAL")
    .replace(/\bINT\s+AUTO_INCREMENT\b/gi, "SERIAL")
    .replace(/\bBIGINT\s+AUTO_INCREMENT\b/gi, "BIGSERIAL")
    .replace(/\bAUTO_INCREMENT\b/gi, "")
    .replace(/\bTINYINT\s*\(\s*1\s*\)/gi, "BOOLEAN")
    .replace(/\bDATETIME\b/gi, "TIMESTAMP")
    .replace(/\bLONGTEXT\b/gi, "TEXT")
    .replace(/\bENUM\s*\([^\)]*\)/gi, "VARCHAR(32)")
    .replace(/\bJSON\b/gi, "JSONB")
    .replace(/\bDATABASE\s*\(\s*\)/gi, "'public'")
    .replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/gi, "")
    .replace(/\bDEFAULT\s+CHARSET\s*=\s*\w+/gi, "")
    .replace(/\bCHARSET\s*=\s*\w+/gi, "")
    .replace(/\bCOLLATE\s*=\s*\w+/gi, "")
    .replace(/\)\s*ENGINE\s*=\s*\w+[^\)]*/gi, ")")
    .replace(/,\s*KEY\s+[^\(]+\([^\)]*\)/gi, "")
    .replace(/,\s*INDEX\s+[^\(]+\([^\)]*\)/gi, "")
    .replace(/\bUNIQUE\s+KEY\s+[^\(]+\(([^\)]*)\)/gi, "UNIQUE ($1)")
    .replace(/\bBOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+1\b/gi, "BOOLEAN NOT NULL DEFAULT TRUE")
    .replace(/\bBOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+0\b/gi, "BOOLEAN NOT NULL DEFAULT FALSE")
    .replace(/\bBOOLEAN\s+DEFAULT\s+1\b/gi, "BOOLEAN DEFAULT TRUE")
    .replace(/\bBOOLEAN\s+DEFAULT\s+0\b/gi, "BOOLEAN DEFAULT FALSE")
    .replace(/\bis_read\s*=\s*1\b/gi, "is_read = TRUE")
    .replace(/\bis_read\s*=\s*0\b/gi, "is_read = FALSE")
    .replace(/\bis_active\s*=\s*1\b/gi, "is_active = TRUE")
    .replace(/\bis_active\s*=\s*0\b/gi, "is_active = FALSE")
    .replace(/\s+AFTER\s+[\w"`]+/gi, "")
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bCURDATE\(\)/gi, "CURRENT_DATE")
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "CURRENT_TIMESTAMP - INTERVAL '$1 day'")
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+HOUR\s*\)/gi, "CURRENT_TIMESTAMP - INTERVAL '$1 hour'")
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+MINUTE\s*\)/gi, "CURRENT_TIMESTAMP - INTERVAL '$1 minute'")
    .replace(/,\s*\)/g, ")");
}

function convertAlterModifyColumn(sql: string): { sql: string; params: any[] } | null {
  if (!/^\s*ALTER\s+TABLE\s+/i.test(sql)) return null;
  if (!/\bMODIFY\s+COLUMN\b/i.test(sql)) return null;
  return { sql: "SELECT 1", params: [] };
}

/**
 * Convert MySQL ON DUPLICATE KEY UPDATE to PostgreSQL ON CONFLICT.
 * - Simple: `ON DUPLICATE KEY UPDATE id = id` → `ON CONFLICT DO NOTHING`
 * - Complex with VALUES(col): `ON DUPLICATE KEY UPDATE col = VALUES(col)` → `ON CONFLICT (unique_cols) DO UPDATE SET col = EXCLUDED.col`
 */
function convertOnDuplicateKey(sql: string): string {
  const match = sql.match(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b([\s\S]*)$/i);
  if (!match) return sql;

  const updatePart = match[1].trim();
  const prefix = sql.slice(0, match.index!);

  // Simple noop: `id = id`
  if (/^\s*\w+\s*=\s*\w+\s*$/.test(updatePart)) {
    return prefix + " ON CONFLICT DO NOTHING";
  }

  // Detect unique columns from INSERT: look for table's UNIQUE constraint
  // Extract column list from INSERT INTO table (col1, col2, ...) VALUES
  const insertMatch = prefix.match(/INSERT\s+INTO\s+\S+\s*\(([^)]+)\)/i);
  if (!insertMatch) {
    return prefix + " ON CONFLICT DO NOTHING";
  }

  const insertCols = insertMatch[1].split(",").map(c => c.replace(/["`]/g, "").trim());

  // Determine conflict target: for campaign_leads it's (campaign_id, lead_id)
  let conflictCols: string[] = [];
  if (/campaign_leads/i.test(prefix)) {
    conflictCols = ["campaign_id", "lead_id"];
  } else {
    // Fallback: try to use first column as conflict target (usually PK)
    if (insertCols.length > 0) {
      conflictCols = [insertCols[0]];
    }
  }

  if (conflictCols.length === 0) {
    return prefix + " ON CONFLICT DO NOTHING";
  }

  // Convert VALUES(col) → EXCLUDED.col in the update part
  let pgUpdatePart = updatePart.replace(/VALUES\s*\(\s*(\w+)\s*\)/gi, "EXCLUDED.$1");
  // Convert NOW() → CURRENT_TIMESTAMP
  pgUpdatePart = pgUpdatePart.replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP");

  return `${prefix} ON CONFLICT (${conflictCols.join(", ")}) DO UPDATE SET ${pgUpdatePart}`;
}

function replaceQuestionMarks(sql: string): string {
  let idx = 0;
  let inSingle = false;
  let inDouble = false;
  let out = "";

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const prev = i > 0 ? sql[i - 1] : "";

    if (ch === "'" && !inDouble && prev !== "\\") {
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle && prev !== "\\") {
      inDouble = !inDouble;
      out += ch;
      continue;
    }

    if (ch === "?" && !inSingle && !inDouble) {
      idx += 1;
      out += `$${idx}`;
      continue;
    }

    out += ch;
  }

  return out;
}

function convertShowColumns(sql: string, params: any[]): { sql: string; params: any[] } | null {
  const byLike = sql.match(/^\s*SHOW\s+COLUMNS\s+FROM\s+([\w"`]+)\s+LIKE\s+\?\s*;?\s*$/i);
  if (byLike) {
    const tableName = byLike[1].replace(/["`]/g, "").toLowerCase();
    return {
      sql: `
        SELECT column_name AS "Field", data_type AS "Type", is_nullable AS "Null", column_default AS "Default"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        ORDER BY ordinal_position
      `,
      params: [tableName, String(params?.[0] || "")],
    };
  }

  const byLiteral = sql.match(/^\s*SHOW\s+COLUMNS\s+FROM\s+([\w"`]+)\s+LIKE\s+'([^']+)'\s*;?\s*$/i);
  if (byLiteral) {
    const tableName = byLiteral[1].replace(/["`]/g, "").toLowerCase();
    return {
      sql: `
        SELECT column_name AS "Field", data_type AS "Type", is_nullable AS "Null", column_default AS "Default"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        ORDER BY ordinal_position
      `,
      params: [tableName, byLiteral[2]],
    };
  }

  const allCols = sql.match(/^\s*SHOW\s+COLUMNS\s+FROM\s+([\w"`]+)\s*;?\s*$/i);
  if (allCols) {
    const tableName = allCols[1].replace(/["`]/g, "").toLowerCase();
    return {
      sql: `
        SELECT column_name AS "Field", data_type AS "Type", is_nullable AS "Null", column_default AS "Default"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `,
      params: [tableName],
    };
  }

  return null;
}

function convertInformationSchemaStatistics(sql: string, params: any[]): { sql: string; params: any[] } | null {
  const normalized = String(sql || "").trim();

  const withParams = normalized.match(
    /^SELECT\s+COUNT\(\*\)\s+AS\s+total\s+FROM\s+information_schema\.STATISTICS\s+WHERE\s+TABLE_SCHEMA\s*=\s*(DATABASE\(\)|'public')\s+AND\s+TABLE_NAME\s*=\s*\?\s+AND\s+INDEX_NAME\s*=\s*\?\s*;?$/i
  );
  if (withParams) {
    return {
      sql: `
        SELECT COUNT(*) AS total
        FROM pg_indexes
        WHERE schemaname = ANY(current_schemas(false))
          AND tablename = $1
          AND indexname = $2
      `,
      params: [String(params?.[0] || "").toLowerCase(), String(params?.[1] || "").toLowerCase()],
    };
  }

  const withLiteral = normalized.match(
    /^SELECT\s+COUNT\(\*\)\s+AS\s+total\s+FROM\s+information_schema\.STATISTICS\s+WHERE\s+TABLE_SCHEMA\s*=\s*(DATABASE\(\)|'public')\s+AND\s+TABLE_NAME\s*=\s*'([^']+)'\s+AND\s+INDEX_NAME\s*=\s*'([^']+)'\s*;?$/i
  );
  if (withLiteral) {
    return {
      sql: `
        SELECT COUNT(*) AS total
        FROM pg_indexes
        WHERE schemaname = ANY(current_schemas(false))
          AND tablename = $1
          AND indexname = $2
      `,
      params: [String(withLiteral[2] || "").toLowerCase(), String(withLiteral[3] || "").toLowerCase()],
    };
  }

  return null;
}

function convertInsertIgnore(sql: string): { sql: string; params: any[] } | null {
  const normalized = String(sql || "").trim();
  if (!/^INSERT\s+IGNORE\s+INTO\s+/i.test(normalized)) return null;

  const replaced = normalized
    .replace(/^INSERT\s+IGNORE\s+INTO\s+/i, "INSERT INTO ")
    .replace(/;\s*$/, "");

  if (/\bON\s+CONFLICT\b/i.test(replaced)) {
    return { sql: replaced, params: [] };
  }

  return {
    sql: `${replaced} ON CONFLICT DO NOTHING`,
    params: [],
  };
}

function transformSql(sql: string, params: any[] = []): { sql: string; params: any[] } {
  const showColumns = convertShowColumns(sql, params);
  if (showColumns) {
    return showColumns;
  }

  const infoSchemaStats = convertInformationSchemaStatistics(sql, params);
  if (infoSchemaStats) {
    return infoSchemaStats;
  }

  const insertIgnore = convertInsertIgnore(sql);
  if (insertIgnore) {
    return {
      sql: replaceQuestionMarks(insertIgnore.sql),
      params,
    };
  }

  const alterModifyColumn = convertAlterModifyColumn(sql);
  if (alterModifyColumn) {
    return alterModifyColumn;
  }

  const normalized = normalizeSchemaSql(sql);
  const withConflict = convertOnDuplicateKey(normalized);
  return {
    sql: replaceQuestionMarks(withConflict),
    params,
  };
}

function toCompatResult(result: QueryResult<any>): CompatResult {
  return {
    affectedRows: Number(result.rowCount || 0),
    insertId: 0,
    rowCount: Number(result.rowCount || 0),
    command: String(result.command || ""),
  };
}

function buildCompatClient(client: PoolClient): CompatClient {
  const run = async <T = any>(sql: string, params?: any[]): Promise<CompatQueryTuple<T>> => {
    const transformed = transformSql(sql, params || []);
    const result = await client.query(transformed.sql, transformed.params);
    const meta = toCompatResult(result);

    if (result.command === "SELECT") {
      return [result.rows as T, meta];
    }

    return [meta as unknown as T, meta];
  };

  return {
    query: run,
    execute: run,
    release: () => client.release(),
  };
}

function createPgPool(): Pool {
  const connectionString = String(config.postgres.connectionString || "").trim();

  if (connectionString) {
    return new Pool({
      connectionString,
      max: config.postgres.max,
      ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
    });
  }

  if (!config.postgres.host || !config.postgres.user || !config.postgres.password) {
    throw new Error(
      "PostgreSQL/Supabase not configured. Set DATABASE_URL (or SUPABASE_DB_URL) " +
      "or POSTGRES_HOST/POSTGRES_USER/POSTGRES_PASSWORD in environment variables."
    );
  }

  return new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    max: config.postgres.max,
    ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
  });
}

function createCompatPool(): CompatPool {
  const run = async <T = any>(sql: string, params?: any[]): Promise<CompatQueryTuple<T>> => {
    const transformed = transformSql(sql, params || []);
    const result = await pgPool.query(transformed.sql, transformed.params);
    const meta = toCompatResult(result);

    if (result.command === "SELECT") {
      return [result.rows as T, meta];
    }

    return [meta as unknown as T, meta];
  };

  return {
    query: run,
    execute: run,
    getConnection: async () => {
      const client = await pgPool.connect();
      return buildCompatClient(client);
    },
    end: async () => {
      await pgPool.end();
    },
  };
}

export function getPool(): CompatPool {
  if (!pgPool || !compatPool) {
    pgPool = createPgPool();
    compatPool = createCompatPool();
    logger.info("PostgreSQL connection pool created");
  }
  return compatPool;
}

async function recreatePool(): Promise<void> {
  try {
    await compatPool?.end();
  } catch {
    // ignore close errors
  }
  pgPool = createPgPool();
  compatPool = createCompatPool();
  logger.warn("PostgreSQL pool recreated after transient connection error");
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const p = getPool();
  try {
    const [rows] = await p.execute(sql, params || []);
    return rows as T;
  } catch (error: any) {
    if (!isTransientDbError(error)) {
      throw error;
    }

    await recreatePool();
    const retryPool = getPool();
    const [rows] = await retryPool.execute(sql, params || []);
    return rows as T;
  }
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function insert(sql: string, params?: any[]): Promise<number> {
  const p = getPool();
  const [result] = await p.execute(sql, params || []);
  return (result as any).insertId;
}

export async function update(sql: string, params?: any[]): Promise<number> {
  const p = getPool();
  const [result] = await p.execute(sql, params || []);
  return (result as any).affectedRows;
}

export async function testConnection(): Promise<boolean> {
  try {
    const p = getPool();
    await p.query("SELECT 1");
    logger.info("PostgreSQL connection verified");
    return true;
  } catch (error: any) {
    logger.error(`PostgreSQL connection failed: ${error.message}`);
    return false;
  }
}

