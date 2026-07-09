#!/usr/bin/env node
/**
 * Ativa domínio verificado no banco (rodar na VPS).
 * node agent-tools/activate-domain-remote.mjs alhopronto.online
 */
import pg from 'pg'

const DOMAIN = (process.argv[2] || 'alhopronto.online').trim().toLowerCase()
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

try {
  const before = await pool.query(
    `SELECT id, store_id, domain, is_primary, verification_status
     FROM storefront_domains WHERE LOWER(domain) = $1`,
    [DOMAIN],
  )
  if (!before.rows.length) {
    console.error(`Domínio não encontrado: ${DOMAIN}`)
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
} finally {
  await pool.end()
}