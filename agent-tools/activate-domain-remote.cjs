require('dotenv').config({ path: '/root/leadcapture/.env' })
const { Pool } = require('pg')

const DOMAIN = (process.argv[2] || 'alhopronto.online').trim().toLowerCase()
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

;(async () => {
  const before = await pool.query(
    `SELECT id, store_id, domain, is_primary, verification_status
     FROM storefront_domains WHERE LOWER(domain) = $1`,
    [DOMAIN],
  )
  if (!before.rows.length) {
    console.error('Domínio não encontrado:', DOMAIN)
    process.exit(1)
  }
  console.log('Antes:', before.rows[0])
  await pool.query(
    `UPDATE storefront_domains
     SET verification_status = 'verified', is_primary = TRUE, updated_at = NOW()
     WHERE LOWER(domain) = $1`,
    [DOMAIN],
  )
  const after = await pool.query(
    `SELECT id, store_id, domain, is_primary, verification_status
     FROM storefront_domains WHERE LOWER(domain) = $1`,
    [DOMAIN],
  )
  console.log('Depois:', after.rows[0])
  console.log('OK domínio marcado como verified')
  await pool.end()
})().catch((e) => {
  console.error('ERRO', e.message)
  process.exit(1)
})