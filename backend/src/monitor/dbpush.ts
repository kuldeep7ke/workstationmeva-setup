import { Pool } from 'pg';
import { MonitorConfig } from './config';
import { MONITOR_TABLES } from './push';

const ALLOWED = new Set(MONITOR_TABLES);

let pool: Pool | null = null;

function getPool(url: string): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}

export function closePool(): void {
  try { pool?.end().catch(() => {}); } catch { /* noop */ }
  pool = null;
}

function ident(name: string): string {
  if (!/^[A-Za-z0-9_]{1,63}$/.test(name)) throw new Error(`invalid identifier: ${name}`);
  return name;
}

function schemaOf(instanceId: string): string {
  const clean = String(instanceId || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(clean)) throw new Error('invalid instance id');
  return 'inst_' + clean;
}

const ensuredCols = new Map<string, Set<string>>();

async function query(url: string, text: string, params?: any[]) {
  return getPool(url).query(text, params);
}

async function ensureDb(url: string): Promise<void> {
  await query(url, 'CREATE SCHEMA IF NOT EXISTS mon');
  await query(url, `CREATE TABLE IF NOT EXISTS mon.instances (
    instance_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    version TEXT,
    platform TEXT,
    hostname TEXT,
    started_at TIMESTAMPTZ,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_push TIMESTAMPTZ,
    online BOOLEAN NOT NULL DEFAULT false,
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT DEFAULT '',
    flag TEXT DEFAULT ''
  )`);
  await query(url, `CREATE TABLE IF NOT EXISTS mon.notes (
    id BIGSERIAL PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES mon.instances(instance_id) ON DELETE CASCADE,
    user_key TEXT NOT NULL,
    user_name TEXT DEFAULT '',
    note TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    flag TEXT DEFAULT '',
    updated_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (instance_id, user_key)
  )`);
}

interface RowBatch { cols: string[]; rows: any[][] }

async function ensureTables(url: string, instanceId: string, tables: Record<string, RowBatch>): Promise<void> {
  const schema = schemaOf(instanceId);
  await query(url, `CREATE SCHEMA IF NOT EXISTS ${ident(schema)}`);
  for (const [table, spec] of Object.entries(tables)) {
    if (!ALLOWED.has(table)) continue;
    const tname = ident(table);
    const cols = Array.from(new Set(spec.cols.filter((c) => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(String(c)))));
    if (!cols.includes('id')) cols.unshift('id');
    const full = Array.from(new Set([...cols, '_recv_at']));
    await query(url,
      `CREATE TABLE IF NOT EXISTS ${schema}.${tname} (
         id BIGINT PRIMARY KEY,
         ${full.filter((c) => c !== 'id').map((c) => `"${c}" TEXT`).join(', ')}
       )`
    );
    await query(url, `ALTER TABLE ${schema}.${tname} ADD COLUMN IF NOT EXISTS _recv_at TIMESTAMPTZ DEFAULT now()`);
    let known = ensuredCols.get(`${instanceId}.${table}`);
    if (!known) {
      known = new Set<string>();
      ensuredCols.set(`${instanceId}.${table}`, known);
    }
    const missing = full.filter((c) => !known!.has(c));
    if (missing.length) {
      await query(url,
        `ALTER TABLE ${schema}.${tname} ADD COLUMN IF NOT EXISTS ${missing.map((c) => `"${c}" TEXT`).join(', ADD COLUMN IF NOT EXISTS ')}`
      );
      for (const c of missing) known!.add(c);
    }
  }
  await query(url, `CREATE TABLE IF NOT EXISTS ${schema}.hour_stats (
    hour TEXT PRIMARY KEY,
    count BIGINT DEFAULT 0,
    c2xx BIGINT DEFAULT 0,
    c4xx BIGINT DEFAULT 0,
    c5xx BIGINT DEFAULT 0,
    sum_dur_ms BIGINT DEFAULT 0,
    recv_at TIMESTAMPTZ DEFAULT now()
  )`);
}

export async function dbHello(cfg: MonitorConfig): Promise<void> {
  const url = cfg.dbUrl;
  await ensureDb(url);
  await query(url,
    `INSERT INTO mon.instances (instance_id, token_hash, name, version, platform, hostname, started_at, first_seen, last_seen, online)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now(), true)
     ON CONFLICT (instance_id) DO UPDATE SET
       token_hash = EXCLUDED.token_hash, version = EXCLUDED.version, platform = EXCLUDED.platform,
       hostname = EXCLUDED.hostname, started_at = EXCLUDED.started_at, online = true, last_seen = now()`,
    [cfg.instanceId, cfg.tokenHash, `Install ${cfg.instanceId.slice(0, 8)}`, cfg.appVersion,
     cfg.platform, cfg.hostname, cfg.startedAt]
  );
}

export async function dbPush(
  cfg: MonitorConfig,
  tables: Record<string, { cols: string[]; rows: any[][]; watermarks: Record<string, number> }>,
  counts: Record<string, number>,
  hours: { hour: string; count: number; c2xx: number; c4xx: number; c5xx: number; sum_dur_ms: number }[]
): Promise<void> {
  const url = cfg.dbUrl;
  await ensureDb(url);
  const schema = schemaOf(cfg.instanceId);
  for (const [table, spec] of Object.entries(tables)) {
    if (!ALLOWED.has(table) || !spec.rows.length) continue;
    await ensureTables(url, cfg.instanceId, { [table]: spec });
    const tname = ident(table);
    const cols = Array.from(new Set(spec.cols.map((c) => String(c))));
    if (!cols.includes('id')) continue;
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const CHUNK = 200;
    for (let i = 0; i < spec.rows.length; i += CHUNK) {
      const chunk = spec.rows.slice(i, i + CHUNK);
      const flat: any[] = [];
      const tuples = chunk.map((row) => {
        const vals = cols.map((c) => {
          const v = row[cols.indexOf(c)];
          if (v === undefined || v === null) return null;
          return typeof v === 'object' ? JSON.stringify(v) : v;
        });
        flat.push(...vals);
        return `(${vals.map((_, j) => `$${flat.length - vals.length + j + 1}`).join(', ')})`;
      }).join(', ');
      await query(url,
        `INSERT INTO ${schema}.${tname} (${colList}) VALUES ${tuples} ON CONFLICT (id) DO NOTHING`,
        flat
      );
    }
  }
  if (hours.length) {
    await ensureTables(url, cfg.instanceId, {});
    for (const h of hours.slice(0, 24 * 7)) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(String(h.hour))) continue;
      await query(url,
        `INSERT INTO ${schema}.hour_stats (hour, count, c2xx, c4xx, c5xx, sum_dur_ms)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (hour) DO UPDATE SET count = hour_stats.count + EXCLUDED.count,
           c2xx = hour_stats.c2xx + EXCLUDED.c2xx,
           c4xx = hour_stats.c4xx + EXCLUDED.c4xx,
           c5xx = hour_stats.c5xx + EXCLUDED.c5xx,
           sum_dur_ms = hour_stats.sum_dur_ms + EXCLUDED.sum_dur_ms,
           recv_at = now()`,
        [h.hour, Number(h.count) || 0, Number(h.c2xx) || 0, Number(h.c4xx) || 0, Number(h.c5xx) || 0, Number(h.sum_dur_ms) || 0]
      );
    }
  }
  await query(url,
    `UPDATE mon.instances SET last_seen = now(), online = true, last_push = now(), counts = $2
     WHERE instance_id = $1`,
    [cfg.instanceId, JSON.stringify(counts || {})]
  );
}

export async function dbHeartbeat(cfg: MonitorConfig): Promise<void> {
  const url = cfg.dbUrl;
  await ensureDb(url);
  await query(url,
    'UPDATE mon.instances SET last_seen = now(), online = true WHERE instance_id = $1',
    [cfg.instanceId]
  );
}