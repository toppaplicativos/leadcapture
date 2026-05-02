/**
 * Promote an existing user (by email) to super admin.
 * If --create flag is given and the user doesn't exist, creates one too.
 *
 * Usage:
 *   npx ts-node scripts/create-super-admin.ts --email you@example.com
 *   npx ts-node scripts/create-super-admin.ts --email you@example.com --create --password 'StrongPass!23' --name 'You'
 */

import "dotenv/config"
import { masterService } from "../src/services/master"
import { UsersService } from "../src/services/users"
import { query } from "../src/config/database"

function arg(name: string): string | undefined {
  const flag = `--${name}`
  const idx = process.argv.indexOf(flag)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return undefined
}

const has = (name: string) => process.argv.includes(`--${name}`)

async function main() {
  const email = arg("email")
  if (!email) {
    console.error("Missing --email")
    process.exit(1)
  }

  await masterService.ensureSchema()

  const usersService = new UsersService()

  // Try to find existing user
  const existing = await query<{ id: string; email: string; name: string }[]>(
    `SELECT id, email, name FROM users WHERE LOWER(email) = LOWER(?) AND is_active = true LIMIT 1`,
    [email],
  )

  let user = existing?.[0]

  if (!user) {
    if (!has("create")) {
      console.error(`User ${email} not found. Pass --create --password X --name Y to create.`)
      process.exit(1)
    }
    const password = arg("password")
    const name = arg("name") || email.split("@")[0]
    if (!password) {
      console.error("Missing --password")
      process.exit(1)
    }
    const created = await usersService.create({
      email,
      password,
      name,
      role: "admin",
    })
    user = created as any
    console.log(`✔ Created user: ${user.email} (${user.id})`)
  }

  await masterService.promoteUser(user.email)
  console.log(`✔ Promoted to super admin: ${user.email}`)
  console.log("")
  console.log("Login: https://adm.leadcapture.online or app.leadcapture.online/login")
  console.log("Após o login, será redirecionado automaticamente para /master")

  process.exit(0)
}

main().catch(err => {
  console.error("ERROR:", err?.message || err)
  process.exit(1)
})
