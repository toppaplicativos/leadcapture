const fs = require('fs')
const { Pool } = require('pg')

async function main() {
  const env = fs.readFileSync('/root/leadcapture/.env', 'utf8')
  const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '')
  const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  const logo = '/uploads/images/84d3c03b-1473-41c3-8412-f94559e5372d.png'
  await p.query(
    `UPDATE brand_units SET logo_url = $1, updated_at = NOW()
     WHERE id = '204355c2-dccf-488e-83e5-615153056a95'`,
    [logo],
  )
  const r = await p.query(
    `SELECT name, logo_url FROM brand_units WHERE id = '204355c2-dccf-488e-83e5-615153056a95'`,
  )
  console.log(r.rows)
  await p.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
