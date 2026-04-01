const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const u = await p.query(
    `SELECT id, email, name, role, is_active, password_hash FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    ['wallacebertozzi16@gmail.com']
  );
  if (u.rows.length === 0) {
    console.log('USER NOT FOUND');
  } else {
    const r = u.rows[0];
    console.log('id:', r.id);
    console.log('email:', r.email);
    console.log('is_active:', r.is_active);
    console.log('has_password_hash:', !!r.password_hash, 'len:', (r.password_hash || '').length);
  }

  const b = await p.query(
    `SELECT id, user_id, slug, name FROM brand_units WHERE LOWER(COALESCE(slug,'')) = 'alhopronto' LIMIT 1`
  );
  if (b.rows.length) {
    console.log('brand owner (user_id):', b.rows[0].user_id);
  }

  await p.end();
})();
