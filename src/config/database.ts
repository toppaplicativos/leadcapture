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

/** Supabase session pooler (5432) esgota com "EMAXCONNSESSION" — NÃO recriar pool nisso. */
function isMaxClientsError(error: any): boolean {
  const msg = String(error?.message || error?.code || "");
  return /EMAXCONNSESSION|max clients reached|too many clients|remaining connection slots/i.test(msg);
}

function isTransientDbError(error: any): boolean {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  /* Esgotamento de slots: retry com backoff, sem recreate (recreate piora o limite). */
  if (isMaxClientsError(error)) return true;
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "08006" ||
    code === "08000" ||
    code === "08003" ||
    /* Supabase Pooler/PgBouncer: ":closed" (XX000) — recrear pool só quando NÃO for max clients. */
    (code === "XX000" && !isMaxClientsError(error)) ||
    /:closed/i.test(msg) ||
    /* Quando o pool foi encerrado por recreatePool e alguma query concorrente ainda
       segura uma referencia velha, o pg-pool lanca essa msg. Retry vai recriar o pool. */
    /Cannot use a pool after calling end/i.test(msg)
  );
}

function shouldRecreatePool(error: any): boolean {
  if (isMaxClientsError(error)) return false;
  return isTransientDbError(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    /* Booleanos MySQL (0/1) → PG TRUE/FALSE — evita "operator does not exist: boolean = integer" */
    .replace(
      /\b(is_read|is_archived|is_active|is_enabled|is_default|is_required|is_public|is_published|is_verified|is_system|resources_unlocked)\s*=\s*1\b/gi,
      "$1 = TRUE",
    )
    .replace(
      /\b(is_read|is_archived|is_active|is_enabled|is_default|is_required|is_public|is_published|is_verified|is_system|resources_unlocked)\s*=\s*0\b/gi,
      "$1 = FALSE",
    )
    .replace(/\s+AFTER\s+[\w"`]+/gi, "")
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bCURDATE\(\)/gi, "CURRENT_DATE")
    // DATE_ADD com literal
    .replace(/\bDATE_ADD\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "CURRENT_TIMESTAMP + INTERVAL '$1 day'")
    .replace(/\bDATE_ADD\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+HOUR\s*\)/gi, "CURRENT_TIMESTAMP + INTERVAL '$1 hour'")
    .replace(/\bDATE_ADD\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+MINUTE\s*\)/gi, "CURRENT_TIMESTAMP + INTERVAL '$1 minute'")
    .replace(/\bDATE_ADD\s*\(\s*NOW\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "CURRENT_TIMESTAMP + INTERVAL '$1 day'")
    .replace(/\bDATE_ADD\s*\(\s*NOW\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+HOUR\s*\)/gi, "CURRENT_TIMESTAMP + INTERVAL '$1 hour'")
    // DATE_SUB com literal
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "CURRENT_TIMESTAMP - INTERVAL '$1 day'")
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+HOUR\s*\)/gi, "CURRENT_TIMESTAMP - INTERVAL '$1 hour'")
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+MINUTE\s*\)/gi, "CURRENT_TIMESTAMP - INTERVAL '$1 minute'")
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "CURRENT_DATE - INTERVAL '$1 day'")
    // DATE_SUB com placeholder (?) — ex.: INTERVAL ? DAY
    .replace(
      /\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+\?\s+DAY\s*\)/gi,
      "(CURRENT_TIMESTAMP - (? * INTERVAL '1 day'))",
    )
    .replace(
      /\bDATE_SUB\s*\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+\?\s+DAY\s*\)/gi,
      "(CURRENT_DATE - (? * INTERVAL '1 day'))",
    )
    .replace(
      /\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+\?\s+HOUR\s*\)/gi,
      "(CURRENT_TIMESTAMP - (? * INTERVAL '1 hour'))",
    )
    .replace(
      /\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+\?\s+MINUTE\s*\)/gi,
      "(CURRENT_TIMESTAMP - (? * INTERVAL '1 minute'))",
    )
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

  const tableMatch = prefix.match(/INSERT\s+INTO\s+(\w+)/i);
  const tableName = tableMatch?.[1] || "";

  // Determine conflict target per table unique constraints
  let conflictCols: string[] = [];
  if (/campaign_leads/i.test(prefix)) {
    conflictCols = ["campaign_id", "lead_id"];
  } else if (/affiliate_distribution_status/i.test(prefix)) {
    conflictCols = ["affiliate_id", "brand_id"];
  } else if (/affiliate_program_memberships/i.test(prefix)) {
    conflictCols = ["program_id", "affiliate_user_id"];
  } else if (/affiliate_program_applications/i.test(prefix)) {
    conflictCols = ["program_id", "affiliate_user_id"];
  } else if (/affiliate_global_profiles/i.test(prefix)) {
    conflictCols = ["user_id"];
  } else if (/affiliate_app_credentials/i.test(prefix)) {
    conflictCols = ["brand_id", "affiliate_user_id"];
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
  if (tableName) {
    pgUpdatePart = pgUpdatePart.replace(
      /COALESCE\s*\(\s*EXCLUDED\.(\w+)\s*,\s*\1\s*\)/gi,
      `COALESCE(EXCLUDED.$1, ${tableName}.$1)`
    );
  }

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

/**
 * Supabase:
 * - :5432 session mode → limite baixo (ex.: 15) e cada cliente Node ocupa 1 slot.
 * - :6543 transaction mode → multiplexa melhor sob carga (recomendado p/ API).
 * Preferimos transaction mode no pooler, a menos que POSTGRES_FORCE_SESSION=true.
 */
function resolveConnectionString(raw: string): { connectionString: string; max: number; mode: string } {
  let connectionString = String(raw || "").trim();
  let max = Math.max(1, Number(config.postgres.max) || 10);
  let mode = "direct";

  const isSupabasePooler = /pooler\.supabase\.com/i.test(connectionString);
  const forceSession = String(process.env.POSTGRES_FORCE_SESSION || "").toLowerCase() === "true";

  if (isSupabasePooler) {
    const isSessionPort = /:(5432)(\/|\?|$)/.test(connectionString);
    const isTxnPort = /:(6543)(\/|\?|$)/.test(connectionString);

    if (isSessionPort && !forceSession) {
      connectionString = connectionString.replace(/:5432(\/|\?|$)/, ":6543$1");
      mode = "supabase-transaction";
    } else if (isTxnPort || (!isSessionPort && !forceSession)) {
      mode = "supabase-transaction";
    } else {
      mode = "supabase-session";
    }

    if (mode === "supabase-transaction") {
      if (!/[?&]pgbouncer=true/i.test(connectionString)) {
        connectionString += (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true";
      }
      /* Cap razoável: transaction mode aguenta mais, mas não dispare dezenas de sockets. */
      const cap = Math.max(2, parseInt(process.env.POSTGRES_POOL_MAX_CAP || "12", 10) || 12);
      max = Math.min(max, cap);
    } else {
      /* Session mode: NUNCA encher o pool remoto de 15 — deixa margem pro health/admin. */
      const cap = Math.max(2, parseInt(process.env.POSTGRES_POOL_MAX_CAP || "6", 10) || 6);
      max = Math.min(max, cap);
    }
  }

  return { connectionString, max, mode };
}

function createPgPool(): Pool {
  const rawConnectionString = String(config.postgres.connectionString || "").trim();
  const ssl = config.postgres.ssl ? { rejectUnauthorized: false } : false;
  const poolOpts = {
    /* Libera idle rápido sob churn; evita segurar slots do Supabase. */
    idleTimeoutMillis: Math.max(1_000, parseInt(process.env.POSTGRES_IDLE_TIMEOUT_MS || "10000", 10) || 10_000),
    /* Falha em ~8s em vez de enfileirar até o Caddy devolver 504 (300s). */
    connectionTimeoutMillis: Math.max(1_000, parseInt(process.env.POSTGRES_CONNECT_TIMEOUT_MS || "8000", 10) || 8_000),
    allowExitOnIdle: false,
  };

  if (rawConnectionString) {
    const resolved = resolveConnectionString(rawConnectionString);
    logger.info(
      { pool_max: resolved.max, pool_mode: resolved.mode },
      "PostgreSQL pool config",
    );
    return new Pool({
      connectionString: resolved.connectionString,
      max: resolved.max,
      ssl,
      ...poolOpts,
    });
  }

  if (!config.postgres.host || !config.postgres.user || !config.postgres.password) {
    throw new Error(
      "PostgreSQL/Supabase not configured. Set DATABASE_URL (or SUPABASE_DB_URL) " +
      "or POSTGRES_HOST/POSTGRES_USER/POSTGRES_PASSWORD in environment variables."
    );
  }

  const host = String(config.postgres.host);
  let port = Number(config.postgres.port) || 5432;
  let max = Math.max(1, Number(config.postgres.max) || 10);
  if (/pooler\.supabase\.com/i.test(host)) {
    if (port === 5432 && String(process.env.POSTGRES_FORCE_SESSION || "").toLowerCase() !== "true") {
      port = 6543;
    }
    max = Math.min(max, port === 6543 ? 12 : 6);
  }

  return new Pool({
    host,
    port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    max,
    ssl,
    ...poolOpts,
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

/* Guard contra recreate concorrente — varias queries falhando em sequencia podem
   disparar recreatePool em paralelo. So o primeiro recria; demais aguardam. */
let recreateInFlight: Promise<void> | null = null;
async function recreatePool(): Promise<void> {
  if (recreateInFlight) return recreateInFlight;
  recreateInFlight = (async () => {
    /* Publica o pool novo primeiro. O anterior precisa ser drenado: apenas
       abandonar a referência mantém suas sessões vivas no PgBouncer e, após
       algumas recuperações, esgota o limite remoto de conexões. `end()` espera
       os clientes em voo voltarem e evita o vazamento sem bloquear o retry. */
    const previousPool = pgPool;
    pgPool = createPgPool();
    compatPool = createCompatPool();
    if (previousPool) {
      void previousPool.end().catch((error: any) => {
        logger.warn({ error: error?.message || String(error) }, "Falha ao drenar pool PostgreSQL anterior");
      });
    }
    logger.warn("PostgreSQL pool recreated after transient connection error");
  })().finally(() => { recreateInFlight = null; });
  return recreateInFlight;
}

async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (!isTransientDbError(error)) throw error;

      if (isMaxClientsError(error)) {
        /* Sem recreate: espera o pool liberar slots e tenta de novo. */
        logger.warn(
          { attempt, maxAttempts, err: String(error?.message || error) },
          "PostgreSQL max clients — retry sem recriar pool",
        );
        await sleep(80 * attempt + Math.floor(Math.random() * 120));
        continue;
      }

      if (shouldRecreatePool(error) && attempt < maxAttempts) {
        await recreatePool();
        await sleep(40 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  return withDbRetry(async () => {
    const p = getPool();
    const [rows] = await p.execute(sql, params || []);
    return rows as T;
  });
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function insert(sql: string, params?: any[]): Promise<number> {
  return withDbRetry(async () => {
    const p = getPool();
    const [result] = await p.execute(sql, params || []);
    return (result as any).insertId;
  });
}

export async function update(sql: string, params?: any[]): Promise<number> {
  return withDbRetry(async () => {
    const p = getPool();
    const [result] = await p.execute(sql, params || []);
    return (result as any).affectedRows;
  });
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

