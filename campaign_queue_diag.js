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

  const [campaigns] = await conn.query(
    `SELECT id, name, status, brand_id, instance_id, target_count, sent_count, failed_count, created_at, started_at, completed_at
     FROM campaign_history
     WHERE name LIKE ?
     ORDER BY created_at DESC
     LIMIT 3`,
    ['%Contato captação%']
  );

  console.log('=== CAMPAIGNS ===');
  console.log(JSON.stringify(campaigns, null, 2));

  for (const c of campaigns) {
    const [queue] = await conn.query(
      `SELECT status, COUNT(*) total
       FROM campaign_leads
       WHERE campaign_id = ?
       GROUP BY status
       ORDER BY total DESC`,
      [c.id]
    );

    const [sample] = await conn.query(
      `SELECT id, lead_id, phone, whatsapp_jid, status, error_message, sent_at, updated_at
       FROM campaign_leads
       WHERE campaign_id = ?
       ORDER BY updated_at DESC
       LIMIT 12`,
      [c.id]
    );

    console.log(`=== QUEUE ${c.id} :: ${c.name} ===`);
    console.log(JSON.stringify(queue, null, 2));
    console.log('=== SAMPLE ===');
    console.log(JSON.stringify(sample, null, 2));
  }

  await conn.end();
})().catch((err) => {
  console.error('DIAG_ERROR:', err.message);
  process.exit(1);
});
