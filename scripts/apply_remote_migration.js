require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter((statement) => {
      if (!statement) return false;
      const withoutLineComments = statement
        .split('\n')
        .map((line) => line.replace(/^\s*--.*$/g, '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      return withoutLineComments.length > 0;
    });
}

function isIgnorableMigrationError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  if (code === 'ER_DUP_FIELDNAME') return true;
  if (code === 'ER_DUP_KEYNAME') return true;
  if (code === 'ER_TABLE_EXISTS_ERROR') return true;
  if (message.includes('duplicate column')) return true;
  if (message.includes('duplicate key name')) return true;
  return false;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NULL,
      role ENUM('admin','manager','operator') NOT NULL DEFAULT 'operator',
      avatar_url TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email),
      INDEX idx_users_role (role),
      INDEX idx_users_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_instances (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NULL,
      status ENUM('disconnected','connecting','connected','error') NOT NULL DEFAULT 'disconnected',
      created_by VARCHAR(36) NULL,
      brand_id VARCHAR(36) NULL,
      messages_sent INT NOT NULL DEFAULT 0,
      messages_received INT NOT NULL DEFAULT 0,
      last_connected_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_whatsapp_instances_created_by (created_by),
      INDEX idx_whatsapp_instances_status (status),
      INDEX idx_whatsapp_instances_brand (brand_id),
      INDEX idx_whatsapp_instances_last_connected (last_connected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const migrationPath = path.join(process.cwd(), 'migration.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const statements = splitSqlStatements(migrationSql);

  let executed = 0;
  const errors = [];
  for (const statement of statements) {
    try {
      await connection.query(statement);
      executed += 1;
    } catch (error) {
      if (isIgnorableMigrationError(error)) {
        continue;
      }
      errors.push({
        code: error?.code || 'UNKNOWN',
        message: error?.message || String(error),
        statement: statement.slice(0, 220),
      });
    }
  }

  const [tables] = await connection.query('SHOW TABLES');
  console.log('MIGRATION_EXECUTED', executed);
  console.log('MIGRATION_ERRORS', errors.length);
  if (errors.length > 0) {
    for (const issue of errors.slice(0, 10)) {
      console.log(` - [${issue.code}] ${issue.message}`);
      console.log(`   SQL: ${issue.statement}`);
    }
  }
  console.log('MIGRATION_TABLES', tables.length);

  await connection.end();

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('MIGRATION_ERROR', error.message);
  process.exit(1);
});
