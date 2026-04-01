const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const u = await p.query('SELECT password_hash FROM users WHERE id = $1', ['9ebbc422-758f-4556-9b6b-ddf4985615e2']);
  const h = u.rows[0].password_hash;
  console.log('hash prefix:', h.substring(0, 7));
  console.log('hash valid bcrypt:', h.startsWith('$2a$') || h.startsWith('$2b$'));
  console.log('hash length:', h.length);
  await p.end();
})();
