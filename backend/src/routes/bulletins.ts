import { Router, Response } from 'express';
import { prepare, nextUid, saveManagedBackup } from '../database/schema';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

function contentBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('content_change', detail, req.user?.full_name || req.user?.username || 'system');
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { type, status } = req.query;
  let sql = `SELECT b.*, p.full_name as created_by_name FROM bulletins b LEFT JOIN profiles p ON b.created_by = p.id WHERE 1=1`;
  const params: any[] = [];
  if (type) { sql += ' AND b.bulletin_type = ?'; params.push(type); }
  if (status) { sql += ' AND b.status = ?'; params.push(status); }
  sql += ' ORDER BY b.created_at DESC';
  res.json(await prepare(sql).all(...params));
});

router.get('/:id', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const bulletin = await prepare(`
    SELECT b.*, p.full_name as created_by_name
    FROM bulletins b LEFT JOIN profiles p ON b.created_by = p.id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!bulletin) return res.status(404).json({ error: 'Bulletin not found.' });
  res.json(bulletin);
});

router.post('/', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const { title, content, bulletin_type } = req.body;
  if (!title || !bulletin_type) return res.status(400).json({ error: 'Title and type required.' });
  const BULLETIN_TYPES = ['breaking', 'special_report', 'ground_report', 'general'];
  if (!BULLETIN_TYPES.includes(bulletin_type)) {
    return res.status(400).json({ error: 'Invalid bulletin type. Allowed: breaking, special_report, ground_report, general.' });
  }

  const blnUid = await nextUid('BLN', 'bulletins');
  const result = await prepare('INSERT INTO bulletins (uid, title, content, bulletin_type, created_by) VALUES (?,?,?,?,?)')
    .run(blnUid, title, content || '', bulletin_type, req.user!.profile_id);
  emitEvent('bulletin:created', { id: result.lastInsertRowid, title, actor: req.user!.profile_id });
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'create_bulletin', 'bulletins', result.lastInsertRowid, `Created bulletin: ${title} (${blnUid})`);
  contentBackup(req, `Bulletin created: ${title}`);
  res.status(201).json({ id: result.lastInsertRowid, title, content, bulletin_type });
});

router.put('/:id', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const { title, content, bulletin_type, status } = req.body;
  const BULLETIN_TYPES = ['breaking', 'special_report', 'ground_report', 'general'];
  if (bulletin_type && !BULLETIN_TYPES.includes(bulletin_type)) {
    return res.status(400).json({ error: 'Invalid bulletin type. Allowed: breaking, special_report, ground_report, general.' });
  }
  const updates: string[] = [];
  const params: any[] = [];
  if (title) { updates.push('title = ?'); params.push(title); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (bulletin_type) { updates.push('bulletin_type = ?'); params.push(bulletin_type); }
  if (status) {
    updates.push('status = ?'); params.push(status);
    if (status === 'published') updates.push("published_at = datetime('now')");
  }
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    await prepare(`UPDATE bulletins SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  emitEvent('bulletin:updated', { id: Number(req.params.id), actor: req.user!.profile_id });
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_bulletin', 'bulletins', req.params.id, `Updated bulletin #${req.params.id}`);
  contentBackup(req, `Bulletin updated: #${req.params.id}`);
  res.json({ success: true });
});

router.delete('/:id', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const bulletin = await prepare('SELECT * FROM bulletins WHERE id = ?').get(req.params.id);
  if (!bulletin) return res.status(404).json({ error: 'Bulletin not found.' });
  await prepare('DELETE FROM bulletins WHERE id = ?').run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'delete_bulletin', 'bulletins', req.params.id, `Deleted bulletin: ${(bulletin as any).title}`);
  contentBackup(req, `Bulletin deleted: ${(bulletin as any).title || '#' + req.params.id}`);
  emitEvent('bulletin:deleted', { id: Number(req.params.id), title: (bulletin as any).title, actor: req.user!.profile_id });
  res.json({ success: true });
});

export default router;
