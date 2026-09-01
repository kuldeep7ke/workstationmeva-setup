import { Router, Response } from 'express';
import { prepare, saveManagedBackup } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createNotification } from './notifications';
import { emitEvent } from '../socket';

const router = Router();

function canUpdateTask(task: any, user: any): boolean {
  if (!task) return false;
  if (Number(user.access_level) <= 2) return true;
  return user.profile_id === task.assigned_to || user.profile_id === task.assigned_by;
}

// Update correction_notes on a news item (per-item correction flow)
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const item = await prepare('SELECT * FROM task_news_items WHERE id = ?').get(req.params.id) as any;
  if (!item) return res.status(404).json({ error: 'News item not found.' });
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(item.task_id) as any;
  if (!canUpdateTask(task, req.user)) return res.status(403).json({ error: 'Not authorized.' });

  const { correction_notes } = req.body;
  if (correction_notes === undefined) return res.status(400).json({ error: 'correction_notes is required.' });

  await prepare('UPDATE task_news_items SET correction_notes = ? WHERE id = ?').run(correction_notes, item.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'correction_flagged', 'task_news_items', item.id, `Correction flagged on news item #${item.id} of task #${task.id}${correction_notes ? `: ${correction_notes}` : ''}`);
  if (correction_notes && task.assigned_to && task.assigned_to !== req.user!.profile_id) {
    await createNotification(task.assigned_to, req.user!.profile_id, 'task_correction', 'tasks', task.id, `Correction needed on "${task.title}"`);
  }
  saveManagedBackup('task_change', `Correction on news item #${item.id} of task #${task.id}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('news:updated', {
    item_id: Number(item.id),
    task_id: Number(task.id),
    task_title: task.title,
    has_correction: !!correction_notes,
    actor: req.user!.profile_id,
  });

  const updated = await prepare(`
    SELECT n.*, r.name as reporter_name, r.location as reporter_location, r.region as reporter_region
    FROM task_news_items n
    LEFT JOIN reporters r ON n.reporter_id = r.id
    WHERE n.id = ?
  `).get(item.id);
  res.json(updated);
});

export default router;
