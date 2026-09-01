import { Router, Response } from 'express';
import { prepare } from '../database/schema';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/summary', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  try {
    const pendingSignups = await prepare("SELECT COUNT(*) as c FROM profiles WHERE is_active = 0 AND is_archived = 0").get() as any;
    const pendingLeaves = await prepare("SELECT COUNT(*) as c FROM leaves WHERE status = 'pending'").get() as any;
    const pendingApprovalTasks = await prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('waiting_confirmation','correction_required')").get() as any;
    const pinRequests = await prepare("SELECT COUNT(*) as c FROM notifications WHERE type = 'pin_request' AND is_read = 0").get() as any;
    const bulletinUpdates = await prepare("SELECT COUNT(*) as c FROM bulletins WHERE status = 'draft'").get() as any;

    res.json({
      pending_signups: pendingSignups?.c || 0,
      pending_leaves: pendingLeaves?.c || 0,
      pending_approval_tasks: pendingApprovalTasks?.c || 0,
      pin_requests: pinRequests?.c || 0,
      bulletin_updates: bulletinUpdates?.c || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch pending requests summary.' });
  }
});

router.get('/signups', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const signups = await prepare(`
    SELECT p.id, p.full_name, p.role, p.access_level, p.email, p.created_at,
      u.username
    FROM profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_active = 0 AND p.is_archived = 0
    ORDER BY p.created_at DESC
  `).all();
  res.json(signups);
});

router.get('/pin-requests', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const requests = await prepare(`
    SELECT n.id, n.title, n.message, n.created_at, n.entity_id as profile_id,
      p.full_name, p.role
    FROM notifications n
    LEFT JOIN profiles p ON p.id = n.entity_id
    WHERE n.type = 'pin_request' AND n.is_read = 0
    ORDER BY n.created_at DESC
  `).all();
  res.json(requests);
});

router.get('/leaves', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const leaves = await prepare(`
    SELECT l.id, l.reason, l.start_date, l.end_date, l.created_at,
      p.full_name as profile_name, p.role as profile_role,
      a.full_name as arrangement_name
    FROM leaves l
    LEFT JOIN profiles p ON l.profile_id = p.id
    LEFT JOIN profiles a ON l.arrangement_profile_id = a.id
    WHERE l.status = 'pending'
    ORDER BY l.created_at DESC
  `).all();
  res.json(leaves);
});

export default router;
