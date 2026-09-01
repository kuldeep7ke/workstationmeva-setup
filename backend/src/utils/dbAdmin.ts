import { prepare, exec } from '../database/schema';
import { isPostgres } from '../database/postgres';

export async function listPublicTables(): Promise<string[]> {
  if (isPostgres()) {
    const rows = await prepare(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    ).all() as any[];
    return rows.map((r: any) => r.table_name).filter((t: string) => !t.startsWith('_'));
  }
  const rows = await prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
  return rows.map((r: any) => r.name).filter((t: string) => t !== 'sqlite_sequence');
}

export async function countRows(table: string): Promise<number> {
  const r = await prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get() as any;
  return Number(r?.cnt ?? 0);
}

export async function truncateTables(tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  if (isPostgres()) {
    await exec(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  } else {
    await exec('PRAGMA foreign_keys = OFF');
    for (const t of tables) await exec(`DELETE FROM "${t}"`);
    await exec('PRAGMA foreign_keys = ON');
  }
}
