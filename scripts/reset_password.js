const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

const USER_ID = '9ebbc422-758f-4556-9b6b-ddf4985615e2';
const NEW_PASSWORD = '142536He@';

(async () => {
  const hash = await bcrypt.hash(NEW_PASSWORD, 12);
  await p.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, USER_ID]);
  console.log('Password reset OK for', USER_ID);

  // verify
  const u = await p.query('SELECT password_hash FROM users WHERE id = $1', [USER_ID]);
  const valid = await bcrypt.compare(NEW_PASSWORD, u.rows[0].password_hash);
  console.log('Verify bcrypt.compare:', valid);

  await p.end();
})();
