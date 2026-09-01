require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const r = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  console.log('Existing tables:', r.rows.map(x => x.tablename).join(', '));
  if (r.rows.length > 0) {
    const drops = r.rows.map(x => 'DROP TABLE IF EXISTS ' + x.tablename + ' CASCADE').join('; ');
    await pool.query(drops);
    console.log('Dropped all tables');
  }
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
