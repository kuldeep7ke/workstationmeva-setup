import { Router, Response } from 'express';
import { prepare, saveManagedBackup } from '../database/schema';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';
import { createNotification } from './notifications';

const router = Router();

function leaveBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('leave_change', detail, req.user?.full_name || req.user?.username || 'system');
}

router.get('/', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const { profile_id, status, start, end } = req.query;
  let sql = `
    SELECT l.*, p.full_name as profile_name, a.full_name as arrangement_name
    FROM leaves l
    LEFT JOIN profiles p ON l.profile_id = p.id
    LEFT JOIN profiles a ON l.arrangement_profile_id = a.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (profile_id) { sql += ' AND l.profile_id = ?'; params.push(profile_id); }
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (start) { sql += ' AND l.end_date >= ?'; params.push(start); }
  if (end) { sql += ' AND l.start_date <= ?'; params.push(end); }
  sql += ' ORDER BY l.created_at DESC';
  const leaves = await prepare(sql).all(...params);
  res.json(leaves);
});

router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  const leaves = await prepare(`
    SELECT l.*, p.full_name as profile_name, a.full_name as arrangement_name
    FROM leaves l
    LEFT JOIN profiles p ON l.profile_id = p.id
    LEFT JOIN profiles a ON l.arrangement_profile_id = a.id
    WHERE l.profile_id = ?
    ORDER BY l.created_at DESC
  `).all(req.user!.profile_id);
  res.json(leaves);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const leave = await prepare(`
    SELECT l.*, p.full_name as profile_name, a.full_name as arrangement_name
    FROM leaves l
    LEFT JOIN profiles p ON l.profile_id = p.id
    LEFT JOIN profiles a ON l.arrangement_profile_id = a.id
    WHERE l.id = ?
  `).get(req.params.id);
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
  if (req.user!.access_level > 2 && req.user!.profile_id !== leave.profile_id) {
    return res.status(403).json({ error: 'Not authorized to view this leave request.' });
  }
  res.json(leave);
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { reason, start_date, end_date, arrangement_profile_id, profile_id } = req.body;
  if (!reason || !start_date || !end_date) {
    return res.status(400).json({ error: 'Reason, start_date and end_date are required.' });
  }
  if (new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ error: 'End date must be after start date.' });
  }
  // Admins/managers can file leave on behalf of any active profile; everyone else files for themselves.
  let targetProfileId = req.user!.profile_id;
  if (profile_id) {
    if (req.user!.access_level > 2) {
      return res.status(403).json({ error: 'You can only request leave for yourself.' });
    }
    const target = await prepare('SELECT id FROM profiles WHERE id = ? AND is_active = 1 AND is_archived = 0').get(profile_id) as any;
    if (!target) return res.status(404).json({ error: 'Target profile not found.' });
    targetProfileId = Number(profile_id);
  }
  if (arrangement_profile_id && Number(arrangement_profile_id) === targetProfileId) {
    return res.status(400).json({ error: 'Arrangement cannot be the same profile requesting leave.' });
  }
  const result = await prepare(`INSERT INTO leaves (profile_id, reason, start_date, end_date, arrangement_profile_id)
    VALUES (?,?,?,?,?)`)
    .run(targetProfileId, reason, start_date, end_date, arrangement_profile_id || null);
  const leave = await prepare(`
    SELECT l.*, p.full_name as profile_name, a.full_name as arrangement_name
    FROM leaves l
    LEFT JOIN profiles p ON l.profile_id = p.id
    LEFT JOIN profiles a ON l.arrangement_profile_id = a.id
    WHERE l.id = ?
  `).get(result.lastInsertRowid);
  if (!leave) return res.status(500).json({ error: 'Leave created but could not be read back.' });
  emitEvent('leave:created', leave);
  // Notify admins & managers
  const approvers = await prepare("SELECT id FROM profiles WHERE access_level <= 2 AND is_active = 1").all() as any[];
  for (const approver of approvers) {
    createNotification(approver.id, req.user!.profile_id, 'leave_request', 'leaves', leave.id, `Leave: ${leave.profile_name || 'Unknown'}`, reason);
  }
  leaveBackup(req, `Leave requested by ${req.user?.full_name || 'user #' + req.user?.profile_id}`);
  res.status(201).json(leave);
});
router.put('/:id', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const { status, arrangement_profile_id } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be pending, approved, or rejected.' });
  }
  const leave = await prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id) as any;
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is already ' + leave.status });

  const updates: string[] = ["status = ?", "updated_at = datetime('now')"];
  const params: any[] = [status];
  if (arrangement_profile_id !== undefined) {
    updates.push('arrangement_profile_id = ?');
    params.push(arrangement_profile_id || null);
  }
  params.push(req.params.id);
  await prepare(`UPDATE leaves SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = await prepare(`
    SELECT l.*, p.full_name as profile_name, a.full_name as arrangement_name
    FROM leaves l
    LEFT JOIN profiles p ON l.profile_id = p.id
    LEFT JOIN profiles a ON l.arrangement_profile_id = a.id
    WHERE l.id = ?
  `).get(req.params.id);
  emitEvent('leave:updated', updated);
  // Mark related notifications as read
  await prepare("UPDATE notifications SET is_read = 1 WHERE entity_type = 'leaves' AND entity_id = ?").run(req.params.id);
  leaveBackup(req, `Leave ${status} for ${leave.profile_id}`);
  res.json(updated);
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const leave = await prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id) as any;
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
  const canDelete = req.user!.access_level <= 2 || req.user!.profile_id === leave.profile_id;
  if (!canDelete) return res.status(403).json({ error: 'Not authorized to delete this leave request.' });
  if (leave.status === 'approved') return res.status(400).json({ error: 'Cannot delete an approved leave request.' });
  await prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);
  leaveBackup(req, `Leave deleted: #${req.params.id}`);
  res.json({ success: true });
});

export default router;
