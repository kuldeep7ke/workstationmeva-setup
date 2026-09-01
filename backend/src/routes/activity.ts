import { Router, Response } from 'express';
import { prepare, mirrorAll } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

function logUserActivity(profileId: number, fullName: string, action: string, entityType: string | null, entityId: number | null, details: string) {
  try {
    const result: any = prepare('INSERT INTO user_activity (profile_id, full_name, action, entity_type, entity_id, details) VALUES (?,?,?,?,?,?)')
      .run(profileId, fullName, action, entityType, entityId, details);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {}
}

export { logUserActivity };

// Login activity
router.get('/login', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Admin only' });
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const attempts = await prepare('SELECT * FROM login_attempts ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(attempts);
});

// User activity
router.get('/user', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Admin only' });
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const activities = await prepare('SELECT * FROM user_activity ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(activities);
});

// System activity
router.get('/system', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Admin only' });
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const activities = await prepare('SELECT * FROM system_activity ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(activities);
});

// All activity (from activity_logs)
router.get('/all', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Admin only' });
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 300);
  const logs = await prepare(`
    SELECT a.*, p.full_name, p.access_level
    FROM activity_logs a
    LEFT JOIN profiles p ON a.user_id = p.id
    ORDER BY a.created_at DESC LIMIT ?
  `).all(limit);
  res.json(logs);
});

// Toast history (local telemetry only - every LAN-wide toast broadcast).
// Visible to anyone who can reach the Activity page.
router.get('/toasts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const logs = await Promise.resolve(mirrorAll(
      'SELECT * FROM toast_logs ORDER BY id DESC LIMIT ?',
      [limit]
    ));
    res.json(logs);
  } catch (e) {
    console.error('[activity] toast log load failed:', e);
    res.status(500).json({ error: 'Failed to load toast history.' });
  }
});

export default router;
