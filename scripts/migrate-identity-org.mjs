/**
 * One-shot / re-runnable identity normalization against the live DB.
 * Prefer server boot (identityService.ensureSchema) — this is for ops CLI.
 *
 * Usage (from repo root, with DATABASE_URL or .env):
 *   node scripts/migrate-identity-org.mjs
 */
import "dotenv/config"
import pg from "pg"

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error("DATABASE_URL required")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS account_kind VARCHAR(32)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_account_kind ON users (account_kind)
    `)

    const platform = await client.query(`
      UPDATE users
      SET account_kind = 'platform'
      WHERE COALESCE(is_super_admin, false) = true
        AND (account_kind IS NULL OR account_kind <> 'platform')
    `)
    console.log("platform tagged:", platform.rowCount)

    const org = await client.query(`
      UPDATE users
      SET role = 'org', account_kind = 'org'
      WHERE LOWER(role) = 'admin'
        AND COALESCE(is_super_admin, false) = false
    `)
    console.log("admin → org:", org.rowCount)

    const aff = await client.query(`
      UPDATE users SET account_kind = 'affiliate'
      WHERE account_kind IS NULL AND LOWER(role) = 'affiliate'
    `)
    console.log("affiliate kind:", aff.rowCount)

    const staff = await client.query(`
      UPDATE users SET account_kind = 'staff'
      WHERE account_kind IS NULL AND LOWER(role) IN ('manager','operator')
    `)
    console.log("staff kind:", staff.rowCount)

    const byBrand = await client.query(`
      UPDATE users u
      SET account_kind = 'org',
          role = CASE WHEN LOWER(u.role) = 'admin' THEN 'org' ELSE u.role END
      WHERE u.account_kind IS NULL
        AND COALESCE(u.is_super_admin, false) = false
        AND EXISTS (SELECT 1 FROM brand_units b WHERE b.user_id = u.id)
    `)
    console.log("org by brand ownership:", byBrand.rowCount)

    const counts = await client.query(`
      SELECT COALESCE(account_kind, '(null)') AS kind, role, COUNT(*)::int AS n
      FROM users
      GROUP BY 1, 2
      ORDER BY 1, 2
    `)
    console.table(counts.rows)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
