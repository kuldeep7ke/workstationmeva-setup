import { Router, Response } from 'express';
import { authenticate, authorizeAdminOrDev, AuthRequest } from '../middleware/auth';
import { prepare, mirrorRun, mirrorAll } from '../database/schema';
import { isPostgres } from '../database/postgres';

const router = Router();

const MAX_BATCH = 50;
const STACK_LIMIT = 2000;
const MSG_LIMIT = 1000;
const RETENTION_DAYS = 90;

// POST /api/telemetry/errors  (any authenticated user)
// Body: [{ page, error_type, message, stack, source, line, col }, ...]
// Dual-path insert (mirror first -> outbox -> PG), so client errors survive
// offline periods and replay on reconnect.
router.post('/errors', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const body = req.body;
    const items = Array.isArray(body) ? body.slice(0, MAX_BATCH) : [body];
    if (!items.length) return res.status(400).json({ error: 'Empty payload.' });
    const ua = req.headers['user-agent'] || null;
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const msg = String(it.message || '').slice(0, MSG_LIMIT);
      const stack = String(it.stack || '').slice(0, STACK_LIMIT);
      if (!msg && !stack) continue;
      const r: any = prepare(
        `INSERT INTO telemetry_errors
          (user_id, username, page, error_type, message, stack, source, line, col, user_agent)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(
        req.user?.id ?? null,
        req.user?.username ?? null,
        String(it.page || '').slice(0, 300),
        String(it.error_type || 'error').slice(0, 50),
        msg,
        stack,
        String(it.source || '').slice(0, 500),
        it.line ? Number(it.line) : null,
        it.col ? Number(it.col) : null,
        ua
      );
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }
    res.json({ ok: true, received: items.length });
  } catch (e: any) {
    console.error('[telemetry] capture failed:', e);
    res.status(500).json({ error: 'Telemetry capture failed.' });
  }
});

// GET /api/telemetry/export?format=json|csv&since=<days>&table=<activity|audit|sync|errors>
// Admin/dev only. Downloads the research dataset for offline analysis.
router.get('/export', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const sinceDays = Math.min(Math.max(parseInt(String(req.query.since || '90'), 10) || 90, 1), 365);
    const table = String(req.query.table || '');
    const since = `datetime('now', '-${sinceDays} days')`;

    const csvEscape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const toCSV = (rows: any[], cols: string[]) =>
      cols.join(',') + '\n' + rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n');

    if (format === 'csv') {
      const map: Record<string, { table: string; cols: string[] }> = {
        activity: { table: 'activity_logs', cols: ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'details', 'created_at'] },
        audit: { table: 'task_audit_log', cols: ['id', 'task_id', 'profile_id', 'profile_name', 'action', 'from_status', 'to_status', 'details', 'created_at'] },
        sync: { table: 'sync_log', cols: ['id', 'ts', 'message'] },
        errors: { table: 'telemetry_errors', cols: ['id', 'user_id', 'username', 'page', 'error_type', 'message', 'source', 'line', 'created_at'] },
      };
      const m = map[table];
      if (!m) return res.status(400).json({ error: 'table must be one of: activity, audit, sync, errors' });
      const rows = table === 'sync'
        ? mirrorAll(`SELECT * FROM sync_log WHERE ts >= ${since} ORDER BY id`)
        : await prepare(`SELECT * FROM ${m.table} WHERE created_at >= ${since} ORDER BY id`).all();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${m.table}-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(toCSV(rows, m.cols));
    }

    const [activity, audit, sync, errors] = await Promise.all([
      prepare(`SELECT id, user_id, action, entity_type, entity_id, details, created_at FROM activity_logs WHERE created_at >= ${since} ORDER BY id`).all(),
      prepare(`SELECT id, task_id, profile_id, profile_name, action, from_status, to_status, details, created_at FROM task_audit_log WHERE created_at >= ${since} ORDER BY id`).all(),
      Promise.resolve(mirrorAll(`SELECT id, ts, message FROM sync_log WHERE ts >= ${since} ORDER BY id`)),
      prepare(`SELECT id, user_id, username, page, error_type, message, stack, source, line, col, user_agent, created_at FROM telemetry_errors WHERE created_at >= ${since} ORDER BY id`).all(),
    ]);
    const payload = {
      exported_at: new Date().toISOString(),
      since_days: sinceDays,
      counts: { activity: activity.length, audit: audit.length, sync: sync.length, errors: errors.length },
      activity,
      audit,
      sync,
      errors,
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="research-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (e: any) {
    console.error('[telemetry] export failed:', e);
    res.status(500).json({ error: 'Export failed.' });
  }
});

// Startup pruning: keep the last RETENTION_DAYS in both stores (best-effort on PG).
export function pruneTelemetry(): void {
  try {
    mirrorRun(`DELETE FROM telemetry_errors WHERE created_at < datetime('now', '-${RETENTION_DAYS} days')`);
  } catch (e) { console.error('[telemetry] mirror prune failed:', e); }
  if (isPostgres()) {
    import('../database/postgres').then(({ getAdapter }) => {
      const a = getAdapter();
      if (a) {
        a.raw(`DELETE FROM telemetry_errors WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`)
          .catch(() => {});
      }
    }).catch(() => {});
  }
}

export default router;
