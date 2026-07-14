import pg from 'pg'
import { readFileSync } from 'fs'

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
for (const line of envText.split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/) || line.match(/^([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const BRAND = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'
const initial =
  'Olá {{prospect_name}}! Tudo bem? Sou {{affiliate_name}}, parceiro(a) da {{brand_name}}. Trabalho com alho selecionado e pastas prontas — posso te enviar o catálogo e te ajudar no pedido?'
const followup =
  'Oi {{prospect_name}}! Passando para saber se ainda posso te ajudar com informações da {{brand_name}} (alho descascado e pastas). É só responder este WhatsApp 🙂'

await pool.query(
  `UPDATE lead_distribution_rules
   SET initial_message_template = $1, followup_message_template = $2, updated_at = NOW()
   WHERE brand_id = $3`,
  [initial, followup, BRAND],
)
console.log('ok')
await pool.end()
