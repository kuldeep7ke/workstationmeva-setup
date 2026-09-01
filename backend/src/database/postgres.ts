import { Pool, PoolConfig, QueryResult, types } from 'pg';

export type DbMode = 'sqlite' | 'postgres';

// SQLite stores timestamps as 'YYYY-MM-DD HH:MM:SS' text. pg returns timestamptz
// as a JS Date by default, which breaks code expecting strings (e.g. `date.replace(' ', 'T')`).
// Return timestamps as UTC ISO-8601 ('...Z') so the frontend's Date parsing is
// unambiguous on every device regardless of its timezone (a TZ-less string is
// interpreted as LOCAL time, which shifts every timestamp by the UTC offset).
function toSqliteTimestamp(v: string | null): string | null {
  if (!v) return v;
  const ms = new Date(v).getTime();
  if (!isNaN(ms)) return new Date(ms).toISOString();
  return v;
}

// TIMESTAMP without time zone (naive): keep the stored wall-clock value as text.
function toNaiveTimestamp(v: string | null): string | null {
  if (!v) return v;
  return v.length > 19 ? v.slice(0, 19) : v;
}

types.setTypeParser(1184, toSqliteTimestamp); // timestamptz
types.setTypeParser(1114, toNaiveTimestamp);  // timestamp
// COUNT(*) / COUNT(x) are int8 on PostgreSQL, which pg returns as strings by
// default. Coerce to JS numbers so `cnt === 0` style checks work identically
// to SQLite (e.g. first-user signup detection).
types.setTypeParser(20, (v) => (v == null ? null : parseInt(v, 10))); // int8
// AVG()/ROUND() return numeric (e.g. average completion minutes), which pg
// leaves as a string; coerce to a float so frontend arithmetic works.
types.setTypeParser(1700, (v) => (v == null ? null : parseFloat(v)));  // numeric

export function getDbMode(): DbMode {
  if (process.env.ANDROID === 'true' || process.env.DB_TYPE === 'sqlite') {
    return 'sqlite';
  }
  return process.env.DATABASE_URL ? 'postgres' : 'sqlite';
}

export function isPostgres(): boolean {
  return getDbMode() === 'postgres';
}

export function isSqlite(): boolean {
  return getDbMode() === 'sqlite';
}

export class PostgresAdapter {
  private pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool({
      ...config,
      ssl: config.ssl || { rejectUnauthorized: false },
    });
  }

  getPool(): Pool {
    return this.pool;
  }

  private convertPlaceholders(sql: string): string {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  private convertSyntax(sql: string): string {
    let q = sql;
    q = q.replace(/datetime\('now', \?\)/gi, "NOW() + ?::interval");
    q = q.replace(/datetime\('now', '\+(\d+) days'\)/gi, "NOW() + INTERVAL '$1 days'");
    q = q.replace(/datetime\('now', '-(\d+) days'\)/gi, "NOW() - INTERVAL '$1 days'");
    q = q.replace(/datetime\('now', '\+(\d+) hours'\)/gi, "NOW() + INTERVAL '$1 hours'");
    q = q.replace(/datetime\('now', '-(\d+) hours'\)/gi, "NOW() - INTERVAL '$1 hours'");
    q = q.replace(/datetime\('now', '\+(\d+) minutes'\)/gi, "NOW() + INTERVAL '$1 minutes'");
    q = q.replace(/datetime\('now', '-(\d+) minutes'\)/gi, "NOW() - INTERVAL '$1 minutes'");
    q = q.replace(/datetime\('now'\)/gi, 'NOW()');
    q = q.replace(/date\('now', \?\)/gi, "(CURRENT_DATE + ?::interval)::date");
    q = q.replace(/date\('now', '\+(\d+) (\w+)'\)/gi, "(CURRENT_DATE + INTERVAL '$1 $2')::date");
    q = q.replace(/date\('now', '-(\d+) (\w+)'\)/gi, "(CURRENT_DATE - INTERVAL '$1 $2')::date");
    q = q.replace(/date\('now'\)/gi, 'CURRENT_DATE');
    q = q.replace(/date\(([^)]+)\)/gi, '($1)::date');
    q = q.replace(/julianday\(([^)]+)\)/gi, 'EXTRACT(EPOCH FROM $1) / 86400.0');
    q = q.replace(/time\('now', \?\)/gi, "CURRENT_TIME + ?::interval");
    q = q.replace(/time\('now'\)/gi, 'CURRENT_TIME');
    let orIgnore = false;
    q = q.replace(/INSERT OR IGNORE/gi, () => { orIgnore = true; return 'INSERT'; });
    q = q.replace(/INSERT OR REPLACE/gi, 'INSERT');
    if (orIgnore) {
      const trimmed = q.trimEnd();
      q = (trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed) + ' ON CONFLICT DO NOTHING';
    }
    q = q.replace(/ORDER BY\s+([\w."]+)\s+COLLATE\s+NOCASE/gi, 'ORDER BY LOWER($1)');
    q = q.replace(/([\w."]+)\s*=\s*\?\s+COLLATE\s+NOCASE/gi, 'LOWER($1) = LOWER(?)');
    q = q.replace(/COLLATE\s+NOCASE/gi, '');
    q = q.replace(/AUTOINCREMENT/gi, '');
    if (q.trim().toUpperCase().startsWith('PRAGMA')) return '';
    return q;
  }

  convertSql(sql: string): string {
    let q = this.convertSyntax(sql);
    if (!q) return '';
    q = this.convertPlaceholders(q);
    return q;
  }

  async raw(sql: string, params?: any[]): Promise<QueryResult> {
    const converted = this.convertSql(sql);
    if (!converted) return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    return this.pool.query(converted, params || []);
  }

  async run(sql: string, params?: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    const converted = this.convertSql(sql);
    if (!converted) return { lastInsertRowid: 0, changes: 0 };
    const isInsert = converted.trim().toUpperCase().startsWith('INSERT');
    const query = isInsert && !converted.toUpperCase().includes('RETURNING')
      ? `${converted} RETURNING id`
      : converted;
    let result: QueryResult;
    try {
      result = await this.pool.query(query, params || []);
    } catch (e: any) {
      console.error('[pg-debug] FAILED QUERY:', query, '| params:', JSON.stringify(params || []));
      throw e;
    }
    return {
      lastInsertRowid: result.rows?.[0]?.id ?? 0,
      changes: result.rowCount ?? 0,
    };
  }

  async get(sql: string, params?: any[]): Promise<any> {
    const converted = this.convertSql(sql);
    if (!converted) return undefined;
    const result = await this.pool.query(converted, params || []);
    return result.rows?.[0];
  }

  async all(sql: string, params?: any[]): Promise<any[]> {
    const converted = this.convertSql(sql);
    if (!converted) return [];
    const result = await this.pool.query(converted, params || []);
    return result.rows || [];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let adapter: PostgresAdapter | null = null;

export function getAdapter(): PostgresAdapter {
  if (!adapter) throw new Error('PostgreSQL adapter not initialized. Call initPostgres() first.');
  return adapter;
}

export async function initPostgres(): Promise<PostgresAdapter> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  adapter = new PostgresAdapter({ connectionString: url });
  await adapter.raw('SELECT 1');
  console.log('[db] Connected to PostgreSQL via Supabase');
  return adapter;
}

export async function closePostgres(): Promise<void> {
  if (adapter) {
    try { await adapter.close(); } catch (e) { console.error('[db] Error closing old pool:', e); }
    adapter = null;
  }
}

export async function reconnectPostgres(url: string): Promise<PostgresAdapter> {
  await closePostgres();
  process.env.DATABASE_URL = url;
  adapter = new PostgresAdapter({ connectionString: url });
  await adapter.raw('SELECT 1');
  console.log('[db] Reconnected to PostgreSQL via Supabase');
  return adapter;
}

export function prepare(sql: string) {
  return new PgStatement(sql);
}

export async function exec(sql: string): Promise<void> {
  if (!adapter) throw new Error('PostgreSQL not initialized');
  await adapter.raw(sql);
}

class PgStatement {
  private sql: string;
  constructor(sql: string) { this.sql = sql; }

  async run(...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    if (!adapter) throw new Error('PostgreSQL not initialized');
    return adapter.run(this.sql, params.length > 0 ? params : undefined);
  }

  async get(...params: any[]): Promise<any> {
    if (!adapter) throw new Error('PostgreSQL not initialized');
    return adapter.get(this.sql, params.length > 0 ? params : undefined);
  }

  async all(...params: any[]): Promise<any[]> {
    if (!adapter) throw new Error('PostgreSQL not initialized');
    return adapter.all(this.sql, params.length > 0 ? params : undefined);
  }
}
