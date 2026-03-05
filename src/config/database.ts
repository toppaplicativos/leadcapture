import mysql from "mysql2/promise";
import { config } from "./index";
import { logger } from "../utils/logger";

let pool: mysql.Pool;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      connectionLimit: config.mysql.connectionLimit,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
    logger.info("MySQL connection pool created");
  }
  return pool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const p = getPool();
  const [rows] = await p.execute(sql, params || []);
  return rows as T;
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
    logger.info("MySQL connection verified");
    return true;
  } catch (error: any) {
    logger.error(`MySQL connection failed: ${error.message}`);
    return false;
  }
}

