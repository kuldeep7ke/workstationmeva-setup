// Workstation Meva - lightweight database connectivity probe.
// Used by the Control Panel. Run with:
//   set DATABASE_URL=<connection string>
//   node db-probe.js
// Prints "OK" on success or "ERR: <message>" on failure. ASCII only.
const { Pool } = require('pg');

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.log('ERR: DATABASE_URL is empty');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  connectionTimeoutMillis: 8000,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

pool
  .query('select 1 as ok')
  .then(() => {
    console.log('OK');
    return pool.end();
  })
  .catch((e) => {
    console.log('ERR: ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  });