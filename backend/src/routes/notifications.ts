import { Router, Response } from 'express';
import { prepare, exec, mirrorRun, mirrorAll, mirrorFlush } from '../database/schema';
import { authenticate, authorizeAdminOrDev, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';
import { isPostgres } from '../database/postgres';

const router = Router();

const SCHEDULE_POLL_MS = 15000;

function resolveRecipients(levels: number[]): Promise<any[]> {
  const placeholders = levels.map(() => '?').join(',');
  const q = prepare(`SELECT id FROM profiles WHERE access_level IN (${placeholders}) AND is_active = 1 AND is_archived = 0`);
  return Promise.resolve(q.all(...levels));
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { type, pending } = req.query;
  const conditions: string[] = ['n.user_id = ?'];
  const params: any[] = [req.user!.profile_id];
  if (type) { conditions.push('n.type = ?'); params.push(type as string); }
  if (pending === 'true') { conditions.push('n.is_read = 0'); }
  const unread = await prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.profile_id);
  const list = await prepare(`
    SELECT n.*, p.full_name as from_name
    FROM notifications n
    LEFT JOIN profiles p ON p.id = n.from_user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY n.created_at DESC LIMIT 50
  `).all(...params);
  res.json({ unread: (unread as any)?.count || 0, list });
});

router.post('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  await prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user!.profile_id);
  res.json({ success: true });
});

router.post('/read/:id', authenticate, async (req: AuthRequest, res: Response) => {
  await prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(parseInt(req.params.id), req.user!.profile_id);
  res.json({ success: true });
});

router.post('/test', authenticate, async (req: AuthRequest, res: Response) => {
  const me = req.user!.profile_id;
  const title = 'Test notification';
  const message = 'This is a test notification sent from the Developer tools.';
  await createNotification(me, me, 'test', null, null, title, message);
  emitEvent('notification:new', { user_id: me });
  const unread = await prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(me);
  res.json({ success: true, unread: (unread as any)?.count || 0 });
});

// POST /api/notifications/custom  (admin/dev only - Developer Zone tool)
// Body: { message, access_levels: [1|2|3], time }
// Future time -> scheduled: held in the mirror-only queue, delivered by the
// scheduler at that time. Past/immediate time -> delivered now, stamped with
// the chosen time. Recipients are all active (non-archived) users of the
// selected access levels.
router.post('/custom', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  try {
    const message = String(req.body?.message || '').trim().slice(0, 500);
    const levels = Array.isArray(req.body?.access_levels)
      ? Array.from(new Set((req.body.access_levels as any[]).filter((n: any) => Number.isInteger(n) && n >= 1 && n <= 3).map(Number)))
      : [];
    const time = String(req.body?.time || '');
    if (!message) return res.status(400).json({ error: 'Message is required.' });
    if (!levels.length) return res.status(400).json({ error: 'Pick at least one access level.' });
    const t = new Date(time);
    if (isNaN(t.getTime())) return res.status(400).json({ error: 'Invalid time.' });

    if (t.getTime() > Date.now()) {
      mirrorRun('INSERT INTO scheduled_notifications (message, access_levels, deliver_at) VALUES (?,?,?)',
        [message, JSON.stringify(levels), t.toISOString()]);
      mirrorFlush();
      return res.json({ scheduled: true, deliver_at: t.toISOString(), levels });
    }

    const recipients: any[] = await resolveRecipients(levels);
    const iso = t.toISOString();
    // Match the store's native timestamp format so ordering stays consistent
    // (SQLite: 'YYYY-MM-DD HH:MM:SS' UTC text; PG: proper timestamptz).
    const createdParam = isPostgres() ? iso : iso.slice(0, 19).replace('T', ' ');
    for (const r of recipients) {
      const stmt: any = prepare('INSERT INTO notifications (user_id, from_user_id, type, title, message, created_at) VALUES (?,?,?,?,?,?)');
      const run = stmt.run(r.id, req.user!.profile_id, 'custom', message.slice(0, 80), message, createdParam);
      if (run && typeof run.catch === 'function') run.catch(() => {});
      emitEvent('notification:new', { user_id: r.id });
    }
    res.json({ delivered: recipients.length, created_at: iso, levels });
  } catch (e: any) {
    console.error('[notifications] custom failed:', e);
    res.status(500).json({ error: 'Custom notification failed.' });
  }
});

// Delivery loop for scheduled custom notifications (mirror-local queue).
export function startNotificationScheduler(): void {
  setInterval(async () => {
    try {
      const due = await Promise.resolve(mirrorAll(
        "SELECT * FROM scheduled_notifications WHERE datetime(deliver_at) <= datetime('now')"
      ));
      for (const s of due) {
        let levels: number[] = [];
        try { levels = JSON.parse(s.access_levels || '[]'); } catch {}
        if (!Array.isArray(levels) || !levels.length) continue;
        const recipients: any[] = await resolveRecipients(levels);
        for (const r of recipients) {
          const stmt: any = prepare('INSERT INTO notifications (user_id, from_user_id, type, title, message) VALUES (?,?,?,?,?)');
          const run = stmt.run(r.id, null, 'custom', s.message.slice(0, 80), s.message);
          if (run && typeof run.catch === 'function') run.catch(() => {});
          emitEvent('notification:new', { user_id: r.id });
        }
        mirrorRun('DELETE FROM scheduled_notifications WHERE id = ?', [s.id]);
        mirrorFlush();
      }
    } catch (e) {
      console.error('[notifications] scheduler tick failed:', e);
    }
  }, SCHEDULE_POLL_MS);
}

export async function createNotification(user_id: number, from_user_id: number | null, type: string, entity_type: string | null, entity_id: number | null, title: string, message?: string) {
  const stmt = prepare('INSERT INTO notifications (user_id, from_user_id, type, entity_type, entity_id, title, message) VALUES (?, ?, ?, ?, ?, ?, ?)');
  await stmt.run(user_id, from_user_id, type, entity_type, entity_id, title, message || title);
  emitEvent('notification:new', { user_id });
}

export default router;
