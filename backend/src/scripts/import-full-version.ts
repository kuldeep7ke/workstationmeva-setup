import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { Pool } from 'pg';

const FULL_DB_PATH = 'C:/Users/Admin/Documents/Money Meva/Meva/Workstation Meva/backend/workstation.db';

interface TableData {
  name: string;
  columns: string[];
  rows: unknown[][];
}

async function readSqliteTable(db: any, table: string): Promise<TableData> {
  const info = db.exec(`PRAGMA table_info("${table}")`);
  if (!info || !info[0]) throw new Error(`Table ${table} not found in source DB`);
  const columns = info[0].values.map((r: any[]) => r[1]);
  const data = db.exec(`SELECT * FROM "${table}" ORDER BY id`);
  return { name: table, columns, rows: data && data[0] ? data[0].values : [] };
}

async function main() {
  if (!fs.existsSync(FULL_DB_PATH)) {
    throw new Error(`Full version DB not found: ${FULL_DB_PATH}`);
  }

  console.log(`Loading full version DB from: ${FULL_DB_PATH}`);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(FULL_DB_PATH));

  const tablesToImport = ['users', 'profiles', 'bulletin_templates', 'backups', 'system_activity'];
  const data: Record<string, TableData> = {};
  for (const t of tablesToImport) {
    data[t] = await readSqliteTable(db, t);
    console.log(`Read ${data[t].rows.length} rows from ${t}`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('\n=== Importing into Supabase PostgreSQL ===');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const t of tablesToImport) {
        const { columns, rows } = data[t];
        if (rows.length === 0) continue;

        await client.query(`DELETE FROM ${t}`);

        const cols = columns.join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const insertSql = `INSERT INTO ${t} (${cols}) VALUES (${placeholders})`;

        for (const row of rows) {
          try {
            await client.query(insertSql, row);
          } catch (e: any) {
            console.error(`Failed inserting into ${t} (row id=${row[0]}): ${e.message}`);
            throw e;
          }
        }
        console.log(`Imported ${rows.length} rows into ${t}`);

        const maxId = Math.max(...rows.map((r: any) => Number(r[0])));
        await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), ${maxId})`);
      }

      await client.query('COMMIT');
      console.log('\n=== Import completed successfully ===');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const verify = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM profiles) as profiles,
        (SELECT COUNT(*) FROM bulletin_templates) as bulletin_templates,
        (SELECT COUNT(*) FROM channel_metadata) as channel_metadata,
        (SELECT COUNT(*) FROM backups) as backups,
        (SELECT COUNT(*) FROM system_activity) as system_activity
    `);
    console.log('Verification:', JSON.stringify(verify.rows[0]));

    const users = await pool.query('SELECT id, username FROM users ORDER BY id');
    console.log('Users:', users.rows.map(r => r.username).join(', '));
    const profiles = await pool.query('SELECT id, full_name, role, uid FROM profiles ORDER BY id');
    profiles.rows.forEach(r => console.log(`  PRF: ${r.id} ${r.full_name} (${r.role}) ${r.uid}`));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Import failed:', e);
  process.exit(1);
});
