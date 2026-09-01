import { isPostgres, getDbMode, getAdapter } from './postgres';

export type SyncHealth = 'online' | 'offline';
export type SyncEvent = 'status' | 'online' | 'offline' | 'synced';

export interface MirrorHooks {
  run: (sql: string, params?: any[]) => { lastInsertRowid: number; changes: number };
  get: (sql: string, params?: any[]) => any;
  all: (sql: string, params?: any[]) => any[];
  exec: (sql: string) => void;
  ready: () => boolean;
  setPersist: (enabled: boolean) => void;
  flush: () => void;
}

let hooks: MirrorHooks | null = null;
let health: SyncHealth = 'offline';
let interval: ReturnType<typeof setInterval> | null = null;
let lastSyncAt: string | null = null;
let lastError: string | null = null;
let startedAt = Date.now();
let syncedCount = 0;
let failedCount = 0;
let offlineWrites = 0;
let bootstrapped = false;
let lastBroadcastJson = '';
let lastWriteAt = 0;
let lastReconcileAt = 0;
let dataLock = false;
const lastAttemptAt = new Map<number, number>();
const inFlight = new Set<number>();
const pendingTableCache = new Map<string, { count: number; at: number }>();
const RETRY_BACKOFF_MS = 60_000;
const PENDING_CACHE_TTL_MS = 2000;

const listeners: Array<(event: SyncEvent, payload: any) => void> = [];
const EXCLUDED_TABLES = new Set(['sync_outbox', 'sync_log', 'sqlite_sequence', 'sqlite_master']);
const MUTATION_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;
const TABLE_RE = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?([A-Za-z_][A-Za-z0-9_]*)/i;

// pg returns some column types as non-scalars unless a type parser overrides
// them: `date` (OID 1082) and `timestamp without time zone` variants come back
// as JS Date objects, `bytea` as a Buffer and `json/jsonb`/`inet`/`point` as
// plain objects. sql.js only accepts scalars, so a bootstrap/reconcile copy
// would either throw or silently store a mangled value (e.g. a Date's
// toString()) — the mirror would then differ from PostgreSQL forever. Keep the
// mirror faithful by normalizing every bound value to a scalar first.
function normalizeForMirror(v: any): any {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  if (Buffer.isBuffer(v)) return v.toString('base64');
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

export function onSyncStatusChange(fn: (event: SyncEvent, payload: any) => void): void {
  listeners.push(fn);
}

function broadcast(event: SyncEvent, payload: any = null) {
  for (const fn of listeners) {
    try { fn(event, payload); } catch (e) { console.error('[sync] listener error:', e); }
  }
}

function mir(): MirrorHooks {
  if (!hooks || !hooks.ready()) throw new Error('Sync engine not initialized.');
  return hooks;
}

export function getHealth(): SyncHealth {
  return health;
}

export function getActiveEngine(): 'pg' | 'mirror' {
  if (isPostgres() && health === 'online') return 'pg';
  return 'mirror';
}

function isMutation(sql: string): boolean {
  return MUTATION_RE.test(sql);
}

function tableOf(sql: string): string | null {
  const m = sql.match(TABLE_RE);
  return m ? m[1].toLowerCase() : null;
}

function getAdapterSafe(): any {
  try { return getAdapter(); } catch { return null; }
}

async function pgAvailable(): Promise<boolean> {
  try {
    const a = getAdapterSafe();
    if (!a) return false;
    await a.raw('SELECT 1');
    return true;
  } catch { return false; }
}

export function recordOutbox(sql: string, params: any[]): number | null {
  if (!isPostgres()) return null;
  const t = tableOf(sql);
  if (!t || EXCLUDED_TABLES.has(t)) return null;
  try {
    const r = mir().run(
      'INSERT INTO sync_outbox (sql_text, params_json, table_name, created_at, applied_mirror, applied_pg) VALUES (?,?,?,?,0,0)',
      [sql, JSON.stringify(params || []), t, new Date().toISOString().slice(0, 19).replace('T', ' ')]
    );
    return r.lastInsertRowid || null;
  } catch (e: any) {
    console.error('[sync] Outbox record failed:', e.message);
    return null;
  }
}

export function markOutbox(id: number, mirrorOk: boolean | null, pgOk: boolean | null, error?: string) {
  try {
    if (mirrorOk === true) mir().run('UPDATE sync_outbox SET applied_mirror = 1 WHERE id = ?', [id]);
    if (pgOk === true) {
      mir().run('UPDATE sync_outbox SET applied_pg = 1, pg_error = NULL, synced_at = ? WHERE id = ?',
        [new Date().toISOString().slice(0, 19).replace('T', ' '), id]);
    }
    if (error) mir().run('UPDATE sync_outbox SET pg_error = ? WHERE id = ?', [String(error).slice(0, 500), id]);
  } catch (e: any) {
    console.error('[sync] Outbox mark failed:', e.message);
  }
}

export class SyncStatement {
  private sql: string;
  constructor(sql: string) { this.sql = sql; }

  run(...params: any[]) {
    const p = params.length > 0 ? params : [];
    lastWriteAt = Date.now();
    pendingTableCache.clear();
    const entryId = isMutation(this.sql) ? recordOutbox(this.sql, p) : null;
    let mres: { lastInsertRowid: number; changes: number };
    try {
      mres = mir().run(this.sql, p);
    } catch (e: any) {
      if (entryId) markOutbox(entryId, false, null, String(e.message));
      throw e;
    }
    if (entryId) markOutbox(entryId, true, null);
    if (entryId && getActiveEngine() === 'pg') {
      // Guard the replay loop against racing the in-flight PG write, which
      // would apply the same insert twice (duplicate rows on PostgreSQL).
      inFlight.add(entryId);
      return getAdapterSafe().run(this.sql, p).then((pres: any) => {
        inFlight.delete(entryId);
        if (entryId) markOutbox(entryId, null, true);
        return pres;
      }).catch((e: any) => {
        inFlight.delete(entryId);
        offlineWrites++;
        lastError = String(e.message).slice(0, 500);
        if (entryId) markOutbox(entryId, null, false, lastError);
        console.error('[sync] PG write failed, queued for retry:', e.message);
        return mres;
      });
    }
    return mres;
  }

  get(...params: any[]) {
    if (getActiveEngine() === 'pg') {
      return getAdapterSafe().get(this.sql, params).then((row: any) => {
        // A write may be queued for this table (PG not yet applied). Serve the
        // mirror copy so freshly-created rows are visible immediately and the
        // app never crashes on undefined results (e.g. leave.id).
        if (row === undefined && pendingForTable(tableOf(this.sql)) > 0) {
          return mir().get(this.sql, params);
        }
        return row;
      }).catch((e: any) => {
        console.error('[sync] PG read failed, falling back to local:', e.message);
        return mir().get(this.sql, params);
      });
    }
    return mir().get(this.sql, params);
  }

  all(...params: any[]) {
    if (getActiveEngine() === 'pg') {
      return getAdapterSafe().all(this.sql, params).then((rows: any[]) => {
        // Merge mirror-only rows (queued inserts not yet applied to PG) so
        // lists show newly-created rows immediately.
        if (pendingForTable(tableOf(this.sql)) > 0) {
          try {
            const pgIds = new Set(rows.map((r: any) => r?.id));
            const extras = mir().all(this.sql, params).filter((r: any) => r && !pgIds.has(r.id));
            if (extras.length) rows = extras.concat(rows);
          } catch (e: any) {
            console.error('[sync] mirror merge failed:', e.message);
          }
        }
        return rows;
      }).catch((e: any) => {
        console.error('[sync] PG read failed, falling back to local:', e.message);
        return mir().all(this.sql, params);
      });
    }
    return mir().all(this.sql, params);
  }
}

export function countPending(): number {
  try {
    return mir().get('SELECT COUNT(*) as c FROM sync_outbox WHERE applied_pg = 0')?.c ?? 0;
  } catch { return 0; }
}

// Number of queued (not-yet-on-PG) writes for a specific table, cached briefly
// so hot read paths don't hammer the mirror on every request.
function pendingForTable(table: string | null): number {
  if (!table) return 0;
  const cached = pendingTableCache.get(table);
  if (cached && Date.now() - cached.at < PENDING_CACHE_TTL_MS) return cached.count;
  let count = 0;
  try {
    count = mir().get('SELECT COUNT(*) as c FROM sync_outbox WHERE applied_pg = 0 AND table_name = ?', [table])?.c ?? 0;
  } catch { count = 0; }
  pendingTableCache.set(table, { count, at: Date.now() });
  return count;
}

function countOutbox(): number {
  try {
    return mir().get('SELECT COUNT(*) as c FROM sync_outbox')?.c ?? 0;
  } catch { return 0; }
}

async function alignSequences() {
  const a = getAdapterSafe();
  if (!a) return;
  const tables = mir().all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sync_outbox','sync_log')");
  for (const { name } of tables) {
    try {
      const mp = mir().get(`SELECT MAX(id) as m FROM "${name}"`)?.m ?? 0;
      const pp = (await a.get(`SELECT COALESCE(MAX(id),0) as m FROM "${name}"`))?.m ?? 0;
      if (pp > mp) {
        const r = mir().run(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`, [pp, name]);
        if (!r.changes) mir().run(`INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES (?, ?)`, [name, pp]);
      }
      if (mp > pp) {
        await a.raw(`SELECT setval(pg_get_serial_sequence($1, 'id'), $2, true)`, [name, mp]);
      }
    } catch (e: any) {
      console.error(`[sync] sequence alignment failed for ${name}:`, e.message);
    }
  }
}

export async function replayPending(force = false): Promise<{ synced: number; failed: number; pending: number }> {
  if (!isPostgres()) return { synced: 0, failed: 0, pending: countPending() };
  const a = getAdapterSafe();
  if (!a) return { synced: 0, failed: 0, pending: countPending() };
  const entries = mir().all('SELECT * FROM sync_outbox WHERE applied_pg = 0 ORDER BY id');
  let synced = 0;
  let failed = 0;
  const now = Date.now();
  for (const e of entries) {
    // Entry currently being applied by the live write path — do not double-apply.
    if (inFlight.has(e.id)) continue;
    // Backoff: skip entries that failed recently so permanently-failing rows
    // are not hammered every 5 seconds (and don't spam 'synced' broadcasts).
    const last = lastAttemptAt.get(e.id);
    if (!force && last && now - last < RETRY_BACKOFF_MS) continue;
    lastAttemptAt.set(e.id, now);
    let params: any[] = [];
    try { params = JSON.parse(e.params_json || '[]'); } catch { params = []; }
    // Entries whose MIRROR write failed (applied_mirror = 0) must be re-applied
    // locally first — otherwise they'd reach PostgreSQL while the mirror never
    // gets them, permanently diverging the two stores (no reverse-sync exists).
    if (!e.applied_mirror) {
      try {
        mir().run(e.sql_text, params);
        markOutbox(e.id, true, null);
      } catch (err: any) {
        failed++;
        const msg = String(err.message).slice(0, 500);
        markOutbox(e.id, false, null, msg);
        mir().run('INSERT INTO sync_log (ts, message) VALUES (?, ?)',
          [new Date().toISOString().slice(0, 19).replace('T', ' '), `entry #${e.id} (${e.table_name}) mirror re-apply failed: ${msg}`]);
        continue;
      }
    }
    try {
      await a.run(e.sql_text, params);
      markOutbox(e.id, null, true);
      synced++;
    } catch (err: any) {
      failed++;
      const msg = String(err.message).slice(0, 500);
      markOutbox(e.id, null, false, msg);
      mir().run('INSERT INTO sync_log (ts, message) VALUES (?, ?)',
        [new Date().toISOString().slice(0, 19).replace('T', ' '), `entry #${e.id} (${e.table_name}): ${msg}`]);
    }
  }
  if (synced + failed > 0) {
    await alignSequences();
    if (failed > 0) lastError = `${failed} queued change(s) could not be synced`;
    else lastError = null;
  }
  syncedCount += synced;
  failedCount += failed;
  return { synced, failed, pending: countPending() };
}

async function bootstrapMirror(): Promise<boolean> {
  if (bootstrapped) return false;
  const a = getAdapterSafe();
  if (!a || !isPostgres()) return false;
  const m = mir();
  const dataTables = ['users', 'profiles', 'tasks', 'stories', 'special_programs', 'bulletins', 'ads'];
  const isEmpty = dataTables.every((t) => {
    try { return (m.get(`SELECT COUNT(*) as c FROM "${t}"`)?.c ?? 0) === 0; } catch { return true; }
  });
  if (!isEmpty) { bootstrapped = true; return false; }
  const pending = countPending();
  if (pending > 0) return false;
  try {
    const tables = await a.all("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'sync_%' ORDER BY tablename");
    m.setPersist(false);
    m.exec('PRAGMA foreign_keys = OFF');
    let copied = 0;
    for (const { tablename } of tables) {
      try {
        const rows = await a.all(`SELECT * FROM "${tablename}"`);
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]);
        const colList = cols.map((c) => `"${c}"`).join(',');
        const ph = cols.map(() => '?').join(',');
        for (const row of rows) {
          m.run(`INSERT OR REPLACE INTO "${tablename}" (${colList}) VALUES (${ph})`, cols.map((c) => normalizeForMirror(row[c])));
          copied++;
        }
        const maxId = m.get(`SELECT MAX(id) as m FROM "${tablename}"`)?.m ?? 0;
        if (maxId > 0) {
          const r = m.run(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`, [maxId, tablename]);
          if (!r.changes) m.run(`INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES (?, ?)`, [tablename, maxId]);
        }
      } catch (e: any) {
        console.error(`[sync] bootstrap copy failed for ${tablename}:`, e.message);
      }
    }
    m.exec('PRAGMA foreign_keys = ON');
    m.setPersist(true);
    m.flush();
    bootstrapped = true;
    console.log(`[sync] Local mirror bootstrapped from Supabase (${copied} rows)`);
    return true;
  } catch (e: any) {
    m.setPersist(true);
    m.flush();
    console.error('[sync] bootstrap failed:', e.message);
    return false;
  }
}

// Keep the local mirror faithful to PostgreSQL when the system is idle:
// any table whose row count diverges from PG (and has no queued writes) is
// rebuilt from PG truth. This self-heals stale mirrors that predate sync.
async function reconcileMirror(): Promise<void> {
  const now = Date.now();
  if (!bootstrapped || now - lastReconcileAt < 60_000 || now - lastWriteAt < 15_000) return;
  lastReconcileAt = now;
  if (getActiveEngine() !== 'pg' || countPending() > 0) return;
  const a = getAdapterSafe();
  if (!a) return;
  const m = mir();
  try {
    const tables = await a.all("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'sync_%' ORDER BY tablename");
    for (const { tablename } of tables) {
      let pgCount = -1;
      let mirCount = -1;
      try {
        pgCount = (await a.get(`SELECT COUNT(*) as c FROM "${tablename}"`))?.c ?? 0;
        mirCount = m.get(`SELECT COUNT(*) as c FROM "${tablename}"`)?.c ?? 0;
      } catch { continue; }
      if (pgCount === mirCount) continue;
      try {
        const rows = await a.all(`SELECT * FROM "${tablename}"`);
        m.setPersist(false);
        m.exec('PRAGMA foreign_keys = OFF');
        m.run(`DELETE FROM "${tablename}"`);
        if (rows.length) {
          const cols = Object.keys(rows[0]);
          const colList = cols.map((c) => `"${c}"`).join(',');
          const ph = cols.map(() => '?').join(',');
          for (const row of rows) {
            m.run(`INSERT INTO "${tablename}" (${colList}) VALUES (${ph})`, cols.map((c) => normalizeForMirror(row[c])));
          }
        }
        const maxId = m.get(`SELECT MAX(id) as m FROM "${tablename}"`)?.m ?? 0;
        const r = m.run(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`, [maxId, tablename]);
        if (!r.changes) m.run(`INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES (?, ?)`, [tablename, maxId]);
        m.exec('PRAGMA foreign_keys = ON');
        m.setPersist(true);
        m.flush();
        console.log(`[sync] Mirror reconciled: ${tablename} ${mirCount} -> ${pgCount} rows`);
      } catch (e: any) {
        m.exec('PRAGMA foreign_keys = ON');
        m.setPersist(true);
        m.flush();
        console.error(`[sync] reconcile failed for ${tablename}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error('[sync] reconcile error:', e.message);
  }
}

async function checkHealth() {
  if (dataLock) return;
  let ok = false;
  try {
    const a = getAdapterSafe();
    if (a) { await a.raw('SELECT 1'); ok = true; }
  } catch { ok = false; }

  if (ok && health === 'offline') {
    health = 'online';
    console.log('[sync] Back online — replaying queued changes');
    const r = await replayPending();
    await bootstrapMirror();
    lastSyncAt = new Date().toISOString();
    broadcast('online', { replayed: r.synced, failed: r.failed });
    if (r.synced > 0) broadcast('synced', r);
  } else   if (ok && health === 'online') {
    const r = await replayPending();
    await bootstrapMirror();
    await reconcileMirror();
    if (r.synced > 0) {
      lastSyncAt = new Date().toISOString();
      broadcast('synced', r);
    }
  } else if (!ok && health === 'online') {
    health = 'offline';
    lastError = 'Supabase unreachable — running on the local database';
    console.error('[sync] OFFLINE — Supabase unreachable, local mirror active. Changes will sync when the connection returns.');
    broadcast('offline', null);
  }

  const json = JSON.stringify(getSyncStatus());
  if (json !== lastBroadcastJson) {
    lastBroadcastJson = json;
    broadcast('status', getSyncStatus());
  }
}

export async function resetMirrorAndQueue(): Promise<void> {
  const m = mir();
  const tables = m.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sync_outbox','sync_log')");
  m.setPersist(false);
  m.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of tables) {
    try { m.run(`DELETE FROM "${name}"`); } catch { /* ignore */ }
  }
  m.run('DELETE FROM sync_outbox');
  m.run('DELETE FROM sync_log');
  m.run('DELETE FROM sqlite_sequence');
  m.exec('PRAGMA foreign_keys = ON');
  m.setPersist(true);
  m.flush();
  bootstrapped = false;
  console.log('[sync] Local mirror cleared');
}

// Drop stale queued changes from the previous connection while keeping the
// mirror's data intact (used when switching databases with preserveMirror).
export function clearSyncQueue(): void {
  const m = mir();
  m.run('DELETE FROM sync_outbox');
  m.run('DELETE FROM sync_log');
  m.flush();
  console.log('[sync] Sync queue cleared');
}

function normalizeForPg(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  return String(v);
}

// Topologically order tables so parents are inserted before children
// (users → profiles → tasks → ...), honoring PostgreSQL's FK graph.
async function computeInsertOrder(a: any, tables: string[]): Promise<string[]> {
  const byLower = new Map(tables.map((t) => [String(t).toLowerCase(), t]));
  const parents = new Map<string, Set<string>>();
  try {
    const rows = await a.all(
      `SELECT tc.table_name AS child, ccu.table_name AS parent
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
    );
    for (const { child, parent } of rows) {
      const cl = String(child || '').toLowerCase();
      const pl = String(parent || '').toLowerCase();
      if (cl === pl || !byLower.has(cl) || !byLower.has(pl)) continue;
      if (!parents.has(cl)) parents.set(cl, new Set());
      parents.get(cl)!.add(pl);
    }
  } catch (e: any) {
    console.warn('[sync] FK graph unavailable, using plain table order:', e.message);
    return tables;
  }
  const ordered: string[] = [];
  const visited = new Set<string>();
  let remaining = [...tables];
  while (remaining.length) {
    const ready = remaining.filter((t) => {
      const deps = parents.get(String(t).toLowerCase());
      if (!deps) return true;
      for (const d of deps) if (!visited.has(d)) return false;
      return true;
    });
    if (!ready.length) { ordered.push(...remaining); break; }
    for (const t of ready) { visited.add(String(t).toLowerCase()); ordered.push(t); }
    remaining = remaining.filter((t) => !visited.has(String(t).toLowerCase()));
  }
  return ordered;
}

async function realignSequence(client: any, table: string): Promise<void> {
  try {
    const r = await client.query(`SELECT pg_get_serial_sequence('public.${table}', 'id') AS seq`);
    const seq = r.rows?.[0]?.seq;
    if (!seq) return;
    const m = await client.query(`SELECT MAX(id)::int AS mx FROM "public"."${table}"`);
    const mx = m.rows?.[0]?.mx ?? null;
    await client.query('SELECT setval($1, $2, $3)', [seq, mx == null ? 1 : mx, mx != null]);
  } catch (e: any) {
    console.warn(`[sync] sequence realign skipped for ${table}:`, e.message);
  }
}

// Realign PostgreSQL auto-increment sequences after restoring rows that carry
// explicit ids (e.g. backup import), so future inserts never collide with the
// restored ids. No-op when PostgreSQL is not the active engine.
export async function realignSequencesForTables(tables: string[]): Promise<void> {
  const a = getAdapterSafe();
  if (!a || !isPostgres() || !tables.length) return;
  try {
    const client = await a.getPool().connect();
    try {
      for (const t of tables) await realignSequence(client, t);
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.warn('[sync] PG sequence realign batch skipped:', e.message);
  }
}

// Rebuild the local mirror from PostgreSQL truth (pull online → local).
// Used by "Restore" when switching databases — replaces the mirror's contents
// with what the target database holds, without a destructive local wipe first.
export async function pullPostgresToMirror(): Promise<{ copied: number; tables: string[] }> {
  const a = getAdapterSafe();
  if (!a || !isPostgres()) throw new Error('Not connected to PostgreSQL — cannot pull data.');
  const m = mir();
  dataLock = true;
  try {
    const tables = (await a.all(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'sync_%' ORDER BY table_name`
    )).map((r: any) => r.table_name);
    m.setPersist(false);
    m.exec('PRAGMA foreign_keys = OFF');
    let copied = 0;
    for (const table of tables) {
      try {
        const rows = await a.all(`SELECT * FROM "public"."${table}"`);
        m.run(`DELETE FROM "${table}"`);
        if (rows.length) {
          const cols = Object.keys(rows[0]);
          const colList = cols.map((c) => `"${c}"`).join(',');
          const ph = cols.map(() => '?').join(',');
          for (const row of rows) {
            m.run(`INSERT INTO "${table}" (${colList}) VALUES (${ph})`, cols.map((c) => normalizeForMirror(row[c])));
            copied++;
          }
        }
        const maxId = m.get(`SELECT MAX(id) as m FROM "${table}"`)?.m ?? 0;
        const r = m.run(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`, [maxId, table]);
        if (!r.changes) m.run(`INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES (?, ?)`, [table, maxId]);
      } catch (e: any) {
        console.error(`[sync] pull copy failed for ${table}:`, e.message);
      }
    }
    m.exec('PRAGMA foreign_keys = ON');
    m.setPersist(true);
    m.flush();
    bootstrapped = true;
    lastReconcileAt = Date.now();
    console.log(`[sync] Mirror rebuilt from PostgreSQL (${copied} rows)`);
    return { copied, tables };
  } finally {
    dataLock = false;
  }
}

// Replace the online (PostgreSQL) data with the local mirror's data — wipe the
// cloud database and upload the local copy. Done in one transaction with FK-safe
// insert order and realigned sequences, so the online DB becomes a faithful copy
// of this machine's local data (used by "Fresh Start" and empty-database connects).
export async function pushMirrorToPostgres(): Promise<{ copied: number; tables: string[] }> {
  const a = getAdapterSafe();
  if (!a || !isPostgres()) throw new Error('Not connected to PostgreSQL — cannot push local data.');
  const m = mir();
  dataLock = true;
  try {
    const tables: string[] = (await a.all(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'sync_%' ORDER BY table_name`
    )).map((r: any) => r.table_name);
    const order = await computeInsertOrder(a, tables);
    const client = await a.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
      let copied = 0;
      for (const table of order) {
        let rows: any[];
        try {
          rows = m.all(`SELECT * FROM "${table}"`) as any[];
        } catch (e: any) {
          console.warn(`[sync] mirror read failed for ${table}, skipped:`, e.message);
          continue;
        }
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]);
        const colList = cols.map((c) => `"${c}"`).join(',');
        const ph = cols.map((_, i) => `$${i + 1}`).join(',');
        const sql = `INSERT INTO "${table}" (${colList}) VALUES (${ph})`;
        for (const row of rows) {
          await client.query(sql, cols.map((c) => normalizeForPg(row[c])));
          copied++;
        }
        await realignSequence(client, table);
      }
      await client.query('COMMIT');
      bootstrapped = true;
      lastReconcileAt = Date.now();
      console.log(`[sync] Local data pushed to PostgreSQL (${copied} rows)`);
      return { copied, tables };
    } catch (e: any) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  } finally {
    dataLock = false;
  }
}

export function getSyncStatus() {
  const pending = countPending();
  return {
    mode: getDbMode(),
    engine: getActiveEngine(),
    online: health === 'online',
    queuePending: pending,
    queueTotal: countOutbox(),
    syncedWrites: syncedCount,
    failedWrites: failedCount,
    offlineWrites,
    lastSyncAt,
    lastError,
    mirrorFile: 'workstation.db',
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  };
}

export async function initSyncEngine(h: MirrorHooks): Promise<void> {
  hooks = h;
  h.exec('CREATE TABLE IF NOT EXISTS sync_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, sql_text TEXT NOT NULL, params_json TEXT NOT NULL, table_name TEXT NOT NULL, created_at TEXT NOT NULL, applied_mirror INTEGER NOT NULL DEFAULT 0, applied_pg INTEGER NOT NULL DEFAULT 0, pg_error TEXT, synced_at TEXT)');
  h.exec('CREATE TABLE IF NOT EXISTS sync_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, message TEXT NOT NULL)');

  if (!isPostgres()) {
    health = 'offline';
    broadcast('status', getSyncStatus());
    return;
  }

  const onlineAtBoot = await pgAvailable();
  health = onlineAtBoot ? 'online' : 'offline';
  if (onlineAtBoot) {
    const r = await replayPending();
    await bootstrapMirror();
    lastSyncAt = new Date().toISOString();
    if (r.synced + r.failed > 0) console.log('[sync] Startup replay:', JSON.stringify(r));
  } else {
    console.error('[sync] Supabase unreachable at startup — running OFFLINE on the local database. Changes will sync automatically when the connection returns.');
  }

  if (!interval) {
    interval = setInterval(() => {
      checkHealth().catch((e: any) => console.error('[sync] health check error:', e.message));
    }, 5000);
  }
  broadcast('status', getSyncStatus());
}
