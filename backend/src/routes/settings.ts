import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';
import { authenticate, authorize, authorizeAdminOrDev, AuthRequest } from '../middleware/auth';
import { prepare, saveManagedBackup, reinitDatabase, seedPostgresDefaults, DB_DIR } from '../database/schema';
import { getSyncStatus, getHealth, getActiveEngine, resetMirrorAndQueue, clearSyncQueue, pullPostgresToMirror, pushMirrorToPostgres } from '../database/sync';
import { getDbMode, getAdapter } from '../database/postgres';
import { countRows, listPublicTables, truncateTables } from '../utils/dbAdmin';
import {
  getSavedConnections, getConnectionById, saveConnection,
  touchConnection, deleteConnection, parseDbInfo, maskPassword,
} from '../utils/savedConnections';

const router = Router();

const KEEP_TABLES = new Set(['users', 'profiles', 'channel_metadata', 'bulletin_templates', 'sqlite_sequence']);

const DATA_TABLES: [string, string][] = [
  ['users', 'Users'],
  ['profiles', 'Profiles'],
  ['tasks', 'Tasks'],
  ['stories', 'Stories'],
  ['special_programs', 'Programs'],
  ['bulletins', 'Bulletins'],
  ['ads', 'Ads'],
  ['archives', 'Archives'],
  ['locations', 'Locations'],
  ['reporters', 'Reporters'],
  ['bulletin_templates', 'Bulletin Slots'],
  ['user_bulletin_defaults', 'User Slot Defaults'],
  ['system_bulletin_defaults', 'System Slot Defaults'],
  ['channel_metadata', 'Channel Metadata'],
];

interface DataSummary {
  hasData: boolean;
  total: number;
  counts: Record<string, number>;
}

// ===== Database connection management (Settings → Database Connection) =====

function validateConnectionString(cs: string): string | null {
  const trimmed = (cs || '').trim();
  if (!trimmed) return 'Paste your Supabase connection string first.';
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return 'Connection string must start with postgresql://';
  if (/\[[^\]]*\]/.test(trimmed)) return 'Replace [YOUR-PASSWORD] (including the brackets) with your actual database password.';
  let u: URL;
  try { u = new URL(trimmed); } catch { return 'That does not look like a valid connection string.'; }
  if (!u.hostname) return 'Connection string is missing the database host.';
  if (!u.password) return 'Connection string is missing the database password. Paste it where [YOUR-PASSWORD] is.';
  return null;
}

function parseDbUrl(cs: string): { host: string; projectRef: string; passwordMasked: string; database: string } {
  try {
    const u = new URL(cs);
    const user = decodeURIComponent(u.username);
    const pw = decodeURIComponent(u.password);
    return {
      host: u.host,
      projectRef: user.startsWith('postgres.') ? user.slice(9) : user,
      passwordMasked: pw ? `${pw.slice(0, 2)}****${pw.length > 4 ? pw.slice(-2) : ''}` : '',
      database: u.pathname.replace(/^\//, '') || 'postgres',
    };
  } catch {
    return { host: '', projectRef: '', passwordMasked: '', database: '' };
  }
}

async function testConnectionString(cs: string): Promise<{ ok: boolean; error?: string; data?: DataSummary }> {
  const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await pool.query('SELECT 1');
    const data = await summarizePoolData(pool);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Connection failed.' };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function summarizePoolData(pool: Pool): Promise<DataSummary> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [table] of DATA_TABLES) {
    try {
      const r = await pool.query(`SELECT COUNT(*) AS c FROM "${table}"`);
      const c = Number(r.rows[0]?.c ?? 0);
      counts[table] = c;
      total += c;
    } catch {
      counts[table] = 0;
    }
  }
  return { hasData: total > 0, total, counts };
}

const EXPECTED_TABLES = [
  'activity_logs', 'ads', 'anchor_tasks', 'archives', 'backup_config', 'backups',
  'bulletin_templates', 'bulletins', 'channel_metadata', 'leaves', 'locations',
  'login_attempts', 'notifications', 'profiles', 'reporters', 'special_programs',
  'stories', 'story_activities', 'system_activity', 'system_bulletin_defaults',
  'task_audit_log', 'task_collaborators', 'task_extensions', 'task_news_items',
  'tasks', 'user_activity', 'user_bulletin_defaults', 'users', 'video_editor_tasks',
];

async function listDatabaseTables(): Promise<string[]> {
  const { getAdapter } = await import('../database/postgres');
  const rows = await getAdapter().all(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  return rows.map((r: any) => r.table_name).filter((t: string) => !t.startsWith('_'));
}

function verifyTables(actual: string[]): { created: string[]; missing: string[]; count: number } {
  const set = new Set(actual.map((t) => t.toLowerCase()));
  const missing = EXPECTED_TABLES.filter((t) => !set.has(t));
  const created = EXPECTED_TABLES.filter((t) => set.has(t));
  return { created, missing, count: created.length };
}

function updateEnvFile(key: string, value: string): void {
  const envPath = path.join(DB_DIR, '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = (content.length > 0 && !content.endsWith('\n') ? content + '\n' : content) + line + '\n';
  }
  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`[settings] Updated ${key} in backend/.env`);
}

router.get('/database', authenticate, authorizeAdminOrDev, async (_req: AuthRequest, res: Response) => {
  const url = process.env.DATABASE_URL;
  const envPath = path.join(DB_DIR, '.env');
  const envFileExists = fs.existsSync(envPath);
  const envContent = envFileExists ? fs.readFileSync(envPath, 'utf8') : '';
  const envHasDatabaseUrl = /^DATABASE_URL=.+/m.test(envContent);
  const envHasJwtSecret = /^JWT_SECRET=.+/m.test(envContent);
  const status: any = {
    mode: url ? 'postgres' : getDbMode(),
    configured: !!url,
    connected: !!url,
    envFileExists,
    envHasDatabaseUrl,
    envHasJwtSecret,
  };
  if (url) {
    Object.assign(status, parseDbUrl(url));
    // Real live check: run SELECT 1 against the connected database, plus the
    // sync engine's own health so the UI can show a genuine WORKING state.
    let live = false;
    let liveError: string | null = null;
    try {
      const a = getAdapter();
      if (a) {
        await Promise.race([
          a.raw('SELECT 1'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('connection check timed out')), 5000)),
        ]);
        live = true;
      }
    } catch (e: any) {
      liveError = e?.message || 'connection failed';
    }
    status.connected = live;
    status.working = live && getHealth() === 'online';
    status.liveCheck = { ok: live, error: liveError, at: new Date().toISOString() };
    status.sync = getSyncStatus();
    status.sync.engine = getActiveEngine();
    status.sync.online = getHealth() === 'online';
    try {
      const tables = await listDatabaseTables();
      const check = verifyTables(tables);
      status.tableCount = check.count;
      status.tablesReady = check.missing.length === 0;
      status.tables = check.created;
    } catch (e: any) {
      status.tableCount = 0;
      status.tablesReady = false;
      status.tablesError = e?.message || 'unknown error';
    }
  }
  res.json(status);
});

router.post('/database/env', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const cs = (req.body?.connectionString || '').trim();
  const invalid = validateConnectionString(cs);
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    updateEnvFile('DATABASE_URL', cs);
    const envPath = path.join(DB_DIR, '.env');
    let jwtCreated = false;
    let portUpdated = false;
    const content = fs.readFileSync(envPath, 'utf8');
    if (!/^JWT_SECRET=.+/m.test(content)) {
      updateEnvFile('JWT_SECRET', crypto.randomBytes(48).toString('hex'));
      jwtCreated = true;
    }
    if (!/^PORT=.+/m.test(content)) {
      updateEnvFile('PORT', process.env.PORT || '3002');
      portUpdated = true;
    }
    const info = parseDbUrl(cs);
    console.log(`[settings] .env created/updated by user ${req.user?.username} (jwt=${jwtCreated ? 'generated' : 'kept'})`);
    res.json({
      ok: true,
      ...info,
      envPath,
      jwtCreated,
      portUpdated,
      message: 'backend/.env is ready. Restart the server, or use "Save & Connect" to apply it to the running server now.',
    });
  } catch (e: any) {
    console.error('[settings] .env creation failed:', e);
    res.status(500).json({ error: 'Failed to write backend/.env: ' + (e?.message || 'unknown error') });
  }
});

router.post('/database/test', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const cs = (req.body?.connectionString || '').trim();
  const invalid = validateConnectionString(cs);
  if (invalid) return res.status(400).json({ error: invalid });
  const result = await testConnectionString(cs);
  if (!result.ok) return res.status(502).json({ error: `Could not connect: ${result.error}` });
  const info = parseDbUrl(cs);
  res.json({ ok: true, ...info, data: result.data, message: 'Connection successful.' });
});

router.post('/database/test-saved', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const item = getConnectionById(String(req.body?.id || ''));
  if (!item) return res.status(404).json({ error: 'Saved connection not found.' });
  const result = await testConnectionString(item.connectionString);
  if (!result.ok) return res.status(502).json({ error: `Could not connect: ${result.error}` });
  const info = parseDbUrl(item.connectionString);
  res.json({ ok: true, ...info, data: result.data, message: 'Connection successful.' });
});

router.post('/database', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const cs = (req.body?.connectionString || '').trim();
  const invalid = validateConnectionString(cs);
  if (invalid) return res.status(400).json({ error: invalid });
  const result = await testConnectionString(cs);
  if (!result.ok) return res.status(502).json({ error: `Could not connect: ${result.error}` });
  try {
    const action = req.body?.action === 'fresh' ? 'fresh' : 'restore';
    const targetHasData = !!result.data?.hasData;
    updateEnvFile('DATABASE_URL', cs);
    let actionSummary = '';
    if (action === 'fresh' || !targetHasData) {
      // Fresh Start (target has data) or first connect to an empty database:
      // keep the local copy, replace the ONLINE data with it.
      await reinitDatabase(cs, { preserveMirror: true });
      const pushed = await pushMirrorToPostgres();
      await seedPostgresDefaults();
      actionSummary = `Online data replaced with local data — ${pushed.copied} row(s) uploaded`;
    } else {
      // Restore: pull the online data into the local app without a destructive wipe.
      await reinitDatabase(cs, { preserveMirror: true });
      const pulled = await pullPostgresToMirror();
      actionSummary = `Existing data restored — ${pulled.copied} row(s) pulled from the online database`;
    }
    const tables = await listDatabaseTables();
    const check = verifyTables(tables);
    if (check.missing.length > 0) {
      console.warn('[settings] Missing tables after setup:', check.missing.join(', '));
    }
    const info = parseDbUrl(cs);
    const saved = saveConnection(cs, req.body?.label);
    console.log(`[settings] Database switched to ${info.host} by user ${req.user?.username} (${action}) — ${actionSummary}`);
    res.json({
      ok: true,
      ...info,
      data: result.data,
      savedId: saved.id,
      tableCount: check.count,
      expectedTableCount: EXPECTED_TABLES.length,
      tablesReady: check.missing.length === 0,
      tables: check.created,
      missingTables: check.missing,
      action,
      message: check.missing.length === 0
        ? `Connected — ${actionSummary}.`
        : `Connected, but ${check.missing.length} tables could not be created: ${check.missing.join(', ')}.`,
    });
  } catch (e: any) {
    console.error('[settings] Database switch failed:', e);
    res.status(500).json({ error: 'Connection saved, but switching the running server failed: ' + (e?.message || 'unknown error') });
  }
});

// ===== Saved database connections (previously successful links) =====

router.get('/database/saved', authenticate, authorizeAdminOrDev, (_req: AuthRequest, res: Response) => {
  const list = getSavedConnections().map((c) => ({
    id: c.id,
    label: c.label,
    host: c.host,
    projectRef: c.projectRef,
    database: c.database,
    passwordMasked: parseDbInfo(c.connectionString).passwordMasked,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
  }));
  res.json({ saved: list });
});

// Save a connection only after it has been verified to work
router.post('/database/saved', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const cs = (req.body?.connectionString || '').trim();
  const invalid = validateConnectionString(cs);
  if (invalid) return res.status(400).json({ error: invalid });
  const result = await testConnectionString(cs);
  if (!result.ok) return res.status(502).json({ error: `Could not connect: ${result.error}` });
  const item = saveConnection(cs, req.body?.label);
  console.log(`[settings] Connection saved by user ${req.user?.username}: ${item.host}`);
  res.json({
    ok: true,
    id: item.id,
    label: item.label,
    host: item.host,
    projectRef: item.projectRef,
    database: item.database,
    passwordMasked: maskPassword(cs),
    message: 'Connection verified and saved. You can switch to it anytime from the saved list.',
  });
});

// Switch the running server to a previously saved connection
router.post('/database/use', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const item = getConnectionById(String(req.body?.id || ''));
  if (!item) return res.status(404).json({ error: 'Saved connection not found.' });
  const result = await testConnectionString(item.connectionString);
  if (!result.ok) return res.status(502).json({ error: `Could not connect: ${result.error}` });
  try {
    const action = req.body?.action === 'fresh' ? 'fresh' : 'restore';
    const targetHasData = !!result.data?.hasData;
    updateEnvFile('DATABASE_URL', item.connectionString);
    let actionSummary = '';
    if (action === 'fresh' || !targetHasData) {
      await reinitDatabase(item.connectionString, { preserveMirror: true });
      const pushed = await pushMirrorToPostgres();
      await seedPostgresDefaults();
      actionSummary = `Online data replaced with local data — ${pushed.copied} row(s) uploaded`;
    } else {
      await reinitDatabase(item.connectionString, { preserveMirror: true });
      const pulled = await pullPostgresToMirror();
      actionSummary = `Existing data restored — ${pulled.copied} row(s) pulled from the online database`;
    }
    touchConnection(item.id);
    const tables = await listDatabaseTables();
    const check = verifyTables(tables);
    const info = parseDbUrl(item.connectionString);
    console.log(`[settings] Switched to saved connection "${item.label}" (${info.host}) by user ${req.user?.username} (${action}) — ${actionSummary}`);
    res.json({
      ok: true,
      ...info,
      data: result.data,
      savedId: item.id,
      tableCount: check.count,
      expectedTableCount: EXPECTED_TABLES.length,
      tablesReady: check.missing.length === 0,
      tables: check.created,
      missingTables: check.missing,
      action,
      message: check.missing.length === 0
        ? `Connected to "${item.label}" — ${actionSummary}.`
        : `Connected to "${item.label}", but ${check.missing.length} tables are missing: ${check.missing.join(', ')}.`,
    });
  } catch (e: any) {
    console.error('[settings] Switching to saved connection failed:', e);
    res.status(500).json({ error: 'Switching the running server failed: ' + (e?.message || 'unknown error') });
  }
});

router.delete('/database/saved/:id', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const ok = deleteConnection(String(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Saved connection not found.' });
  console.log(`[settings] Saved connection removed by user ${req.user?.username}`);
  res.json({ ok: true });
});

// ===== Database state & fresh-start reset =====

const STATE_TABLES = DATA_TABLES;

router.get('/database/state', authenticate, authorizeAdminOrDev, async (_req: AuthRequest, res: Response) => {
  try {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [table] of STATE_TABLES) {
      const c = await countRows(table);
      counts[table] = c;
      total += c;
    }
    const syncStatus = await getSyncStatus();
    res.json({
      hasData: total > 0,
      total,
      counts,
      sync: {
        online: syncStatus.online,
        engine: syncStatus.engine,
        queuePending: syncStatus.queuePending,
        lastSyncAt: syncStatus.lastSyncAt,
      },
    });
  } catch (err: any) {
    console.error('[settings] database state error:', err);
    res.status(500).json({ error: err.message || 'Failed to read database state.' });
  }
});

router.post('/database/reset', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  try {
    const syncStatus = await getSyncStatus();
    if (!syncStatus.online) {
      return res.status(503).json({ error: 'Cannot reset the database while offline. Wait for the connection to return, then try again.' });
    }
    saveManagedBackup('user_change', 'Pre-reset backup before fresh start', req.user?.full_name || req.user?.username || 'system', true);
    const existing = await listPublicTables();
    await truncateTables(existing);
    await seedPostgresDefaults();
    await resetMirrorAndQueue();
    const counts: Record<string, number> = {};
    for (const [table] of STATE_TABLES) {
      counts[table] = await countRows(table);
    }
    console.log(`[settings] Database reset for fresh start by user ${req.user?.username} (${existing.length} tables truncated)`);
    res.json({
      ok: true,
      hasData: false,
      total: 0,
      counts,
      message: 'Database cleaned for a fresh start. Default bulletin slots and channel settings were restored. The next account that signs up becomes the admin.',
    });
  } catch (err: any) {
    console.error('[settings] database reset error:', err);
    res.status(500).json({ error: err.message || 'Failed to reset the database.' });
  }
});

router.post('/clean-user-data', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  try {
    saveManagedBackup('user_change', 'Pre-clean backup before clean-user-data', req.user?.full_name || req.user?.username || 'system', true);
    const existing = await listPublicTables();
    const results: Record<string, number> = {};
    for (const table of existing) {
      if (KEEP_TABLES.has(table.toLowerCase())) continue;
      results[table] = await countRows(table);
    }
    await truncateTables(Object.keys(results));
    const total = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`[clean-user-data] by user ${req.user?.username}, ${total} rows cleared`);
    await resetMirrorAndQueue();
    res.json({ cleared: results, total });
  } catch (err: any) {
    console.error('[clean-user-data] error:', err);
    res.status(500).json({ error: err.message || 'Failed to clean user data.' });
  }
});

router.post('/clean-all-data', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  try {
    saveManagedBackup('user_change', 'Pre-reset backup before clean-all-data', req.user?.full_name || req.user?.username || 'system', true);
    const existing = await listPublicTables();
    await truncateTables(existing);
    await resetMirrorAndQueue();

    // Seed default admin
    const password_hash = bcrypt.hashSync('P@ssw0rd', 10);
    const userResult = await prepare("INSERT INTO users (username, password_hash, is_active) VALUES (?,?,?)")
      .run('dev@workstation.local', password_hash, 1);
    const userId = userResult.lastInsertRowid as number;
    await prepare("INSERT INTO profiles (uid, user_id, full_name, role, access_level, email, is_active, status) VALUES (?,?,?,?,?,?,?,?)")
      .run('PRF-0001', userId, 'Workstation Dev', 'admin', 1, 'dev@workstation.local', 1, 'active');

    console.log('[clean-all-data] by user', req.user?.username, '- full reset with default admin seeded');
    res.json({ message: 'All data cleared. Default admin account (dev@workstation.local / P@ssw0rd) has been created.' });
  } catch (err: any) {
    console.error('[clean-all-data] error:', err);
    res.status(500).json({ error: err.message || 'Failed to clean all data.' });
  }
});

export default router;
