require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT ? process.env.DB_PORT : '3306', 10),
  });

  const [rows] = await conn.query(
    `SELECT id,name,status,campaign_mode,speed_json,settings,updated_at
     FROM campaign_history
     WHERE id = ? LIMIT 1`,
    ['13302563-f35c-4451-a981-c23dc0420705']
  );

  const row = rows[0] || null;
  let parsedSettings = null;
  let parsedSpeed = null;
  try { parsedSettings = row?.settings ? JSON.parse(row.settings) : null; } catch {}
  try { parsedSpeed = row?.speed_json ? JSON.parse(row.speed_json) : null; } catch {}

  console.log('=== CAMPAIGN SETTINGS ===');
  console.log(JSON.stringify({
    id: row?.id,
    name: row?.name,
    status: row?.status,
    campaign_mode: row?.campaign_mode,
    speed: parsedSpeed,
    actionWindow: parsedSettings?.actionWindow || null,
    destination: parsedSettings?.destination || null,
    finalActions: parsedSettings?.finalActions || null,
    requestedInitialStatus: parsedSettings?.requestedInitialStatus || null,
    updated_at: row?.updated_at,
  }, null, 2));

  await conn.end();
})().catch((err) => {
  console.error('DIAG_ERROR:', err.message);
  process.exit(1);
});
