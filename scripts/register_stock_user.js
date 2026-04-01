const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL });

const EMAIL = "2hcarnesnobres@gmail.com";
const PASSWORD = "142536He@";
const BRAND_SLUG = "alhopronto";

(async () => {
  // 1. Find brand
  const brandRes = await pool.query(
    "SELECT id, name, slug, user_id FROM brand_units WHERE slug = $1 OR LOWER(name) LIKE '%alho pronto%' LIMIT 1",
    [BRAND_SLUG]
  );
  if (!brandRes.rows[0]) { console.error("Brand not found"); process.exit(1); }
  const brand = brandRes.rows[0];
  console.log("Brand:", brand.id, brand.name, "owner:", brand.user_id);

  // 2. Check/create user
  let userRes = await pool.query(
    "SELECT id, email, name, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [EMAIL]
  );
  let userId;
  if (userRes.rows[0]) {
    userId = userRes.rows[0].id;
    console.log("User already exists:", userId, userRes.rows[0].email);
  } else {
    userId = randomUUID();
    const hash = await bcrypt.hash(PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW())`,
      [userId, EMAIL, hash, "2H Carnes Nobres", "manager"]
    );
    console.log("User created:", userId, EMAIL);
  }

  // 3. Create stock credential
  const existing = await pool.query(
    "SELECT id FROM stock_app_credentials WHERE manager_user_id = $1 AND brand_id = $2 AND credential_type = 'estoque' LIMIT 1",
    [userId, String(brand.id)]
  );
  if (existing.rows[0]) {
    await pool.query(
      "UPDATE stock_app_credentials SET is_active = TRUE WHERE id = $1",
      [existing.rows[0].id]
    );
    console.log("Stock credential reactivated:", existing.rows[0].id);
  } else {
    const credId = randomUUID();
    await pool.query(
      `INSERT INTO stock_app_credentials (id, owner_user_id, manager_user_id, brand_id, email, credential_type, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, 'estoque', TRUE, NOW())`,
      [credId, String(brand.user_id), userId, String(brand.id), EMAIL]
    );
    console.log("Stock credential created:", credId);
  }

  console.log("\nDone! Login at /app-estoque/alhopronto with:", EMAIL);
  pool.end();
})().catch(e => { console.error(e); process.exit(1); });
