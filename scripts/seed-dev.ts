/**
 * seed-dev.ts — Cria (ou reseta) o usuário de desenvolvimento.
 * Uso: npx ts-node scripts/seed-dev.ts
 */
import dotenv from 'dotenv'
dotenv.config()

import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { Pool } from 'pg'

const DEV_EMAIL    = 'dev@leadcapture.local'
const DEV_PASSWORD = 'dev123456'
const DEV_NAME     = 'Dev User'

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  console.log('Conectando ao PostgreSQL (Supabase)...')

  const client = await pool.connect()
  console.log('Conectado.')

  const hash = await bcrypt.hash(DEV_PASSWORD, 10)

  const { rows } = await client.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [DEV_EMAIL]
  )

  if (rows.length > 0) {
    await client.query(
      'UPDATE users SET password_hash = $1, is_active = TRUE, name = $2 WHERE LOWER(email) = LOWER($3)',
      [hash, DEV_NAME, DEV_EMAIL]
    )
    console.log('Usuário dev atualizado com nova senha.')
  } else {
    const id = uuidv4()
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'admin', TRUE, NOW(), NOW())`,
      [id, DEV_EMAIL, hash, DEV_NAME]
    )
    console.log('Usuário dev criado.')
  }

  client.release()
  await pool.end()

  console.log('\n=== CREDENCIAIS DEV ===')
  console.log('  Email :', DEV_EMAIL)
  console.log('  Senha :', DEV_PASSWORD)
  console.log('  URL   : http://localhost:5173')
  console.log('=======================\n')
}

main().catch(e => {
  console.error('Erro:', e.message)
  process.exit(1)
})
