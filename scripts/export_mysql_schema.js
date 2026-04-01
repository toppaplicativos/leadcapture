require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const db = process.env.MYSQL_DATABASE;
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: db,
  });

  const [tablesRows] = await conn.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ?
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `, [db]);

  const tables = [];
  for (const row of tablesRows) {
    const tableName = row.table_name;

    const [columns] = await conn.query(`
      SELECT
        column_name,
        data_type,
        column_type,
        is_nullable,
        column_default,
        extra,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position
    `, [db, tableName]);

    const [pkRows] = await conn.query(`
      SELECT column_name, ordinal_position
      FROM information_schema.key_column_usage
      WHERE table_schema = ?
        AND table_name = ?
        AND constraint_name = 'PRIMARY'
      ORDER BY ordinal_position
    `, [db, tableName]);

    const [indexRows] = await conn.query(`
      SELECT index_name, non_unique, seq_in_index, column_name
      FROM information_schema.statistics
      WHERE table_schema = ?
        AND table_name = ?
        AND index_name <> 'PRIMARY'
      ORDER BY index_name, seq_in_index
    `, [db, tableName]);

    const [fkRows] = await conn.query(`
      SELECT
        kcu.constraint_name,
        kcu.column_name,
        kcu.referenced_table_name,
        kcu.referenced_column_name,
        rc.update_rule,
        rc.delete_rule,
        kcu.ordinal_position
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_schema = kcu.constraint_schema
       AND rc.constraint_name = kcu.constraint_name
      WHERE kcu.table_schema = ?
        AND kcu.table_name = ?
        AND kcu.referenced_table_name IS NOT NULL
      ORDER BY kcu.constraint_name, kcu.ordinal_position
    `, [db, tableName]);

    const [countRows] = await conn.query(`SELECT COUNT(*) as c FROM \`${tableName}\``);

    tables.push({
      tableName,
      rowCount: Number(countRows[0].c || 0),
      columns,
      primaryKey: pkRows,
      indexes: indexRows,
      foreignKeys: fkRows,
    });
  }

  const output = {
    database: db,
    exportedAt: new Date().toISOString(),
    tables,
  };

  const outPath = path.join(process.cwd(), 'data', 'mysql_schema_export.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('EXPORTED', outPath, 'TABLES', tables.length);

  await conn.end();
}

main().catch((err) => {
  console.error('EXPORT_SCHEMA_ERROR', err.message);
  process.exit(1);
});
