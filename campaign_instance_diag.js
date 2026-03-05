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

  const campaignId = '13302563-f35c-4451-a981-c23dc0420705';
  const [campaignRows] = await conn.query(
    `SELECT id,name,status,instance_id,brand_id,sent_count,failed_count,target_count FROM campaign_history WHERE id = ? LIMIT 1`,
    [campaignId]
  );

  const campaign = campaignRows[0];
  console.log('=== CAMPAIGN ===');
  console.log(JSON.stringify(campaign || null, null, 2));

  if (campaign?.instance_id) {
    const [instanceRows] = await conn.query(
      `SELECT id,name,status,phone,brand_id,created_by,updated_at FROM whatsapp_instances WHERE id = ? LIMIT 1`,
      [campaign.instance_id]
    );
    console.log('=== INSTANCE ===');
    console.log(JSON.stringify(instanceRows[0] || null, null, 2));
  }

  await conn.end();
})().catch((err) => {
  console.error('DIAG_ERROR:', err.message);
  process.exit(1);
});
