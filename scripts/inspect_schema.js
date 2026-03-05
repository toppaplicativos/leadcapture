require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [kb] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'knowledge_base'
     ORDER BY ORDINAL_POSITION`
  );

  const [pipeline] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_conversations' AND COLUMN_NAME = 'pipeline_stage'`
  );

  const [usersCols] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
     ORDER BY ORDINAL_POSITION`
  );

  console.log('KB_COLUMNS=' + JSON.stringify(kb));
  console.log('PIPELINE_COL=' + JSON.stringify(pipeline));
  console.log('USERS_COLS=' + JSON.stringify(usersCols));

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
