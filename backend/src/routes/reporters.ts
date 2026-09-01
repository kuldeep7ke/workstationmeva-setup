import { Router, Response } from 'express';
import { prepare, saveManagedBackup } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

async function syncLocation(location: string | undefined, createdBy: number | null) {
  const loc = location?.trim();
  if (!loc) return;
  const existing = await prepare('SELECT id FROM locations WHERE name = ? COLLATE NOCASE').get(loc) as any;
  if (!existing) {
    await prepare('INSERT INTO locations (name, created_by) VALUES (?,?)').run(loc, createdBy);
  }
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const reporters = await prepare('SELECT * FROM reporters WHERE deleted_at IS NULL ORDER BY name ASC').all();
  res.json(reporters);
});

// Trashed reporters (recycle bin) - registered before /:id so it is not shadowed
router.get('/trashed', authenticate, async (req: AuthRequest, res: Response) => {
  const reporters = await prepare('SELECT * FROM reporters WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
  res.json(reporters);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const reporter = await prepare('SELECT * FROM reporters WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!reporter) return res.status(404).json({ error: 'Reporter not found.' });
  res.json(reporter);
});

router.get('/:id/stats', authenticate, async (req: AuthRequest, res: Response) => {
  const reporter = await prepare('SELECT id FROM reporters WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!reporter) return res.status(404).json({ error: 'Reporter not found.' });
  const newsCount = await prepare('SELECT COUNT(*) AS cnt FROM task_news_items WHERE reporter_id = ?').get(req.params.id) as any;
  const storiesCount = await prepare('SELECT COUNT(*) AS cnt FROM stories WHERE reporter_id = ?').get(req.params.id) as any;
  const adsCount = await prepare('SELECT COUNT(*) AS cnt FROM ads WHERE reporter_id = ?').get(req.params.id) as any;
  const programsCount = await prepare('SELECT COUNT(*) AS cnt FROM special_programs WHERE reporter_id = ?').get(req.params.id) as any;
  const newsItems = await prepare(`
    SELECT n.id, n.slug, n.news_script, n.created_at, t.title as task_title
    FROM task_news_items n
    JOIN tasks t ON t.id = n.task_id
    WHERE n.reporter_id = ?
    ORDER BY n.created_at DESC LIMIT 20
  `).all(req.params.id);
  const stories = await prepare(`
    SELECT id, title, story_type, status, created_at FROM stories
    WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.params.id);
  const ads = await prepare(`
    SELECT id, title, client_name, status, created_at FROM ads
    WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.params.id);
  const programs = await prepare(`
    SELECT id, title, program_type, status, schedule_date FROM special_programs
    WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.params.id);
  res.json({
    counts: {
      news: newsCount.cnt,
      stories: storiesCount.cnt,
      ads: adsCount.cnt,
      programs: programsCount.cnt,
    },
    newsItems,
    stories,
    ads,
    programs,
  });
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, email, phone, photo_url, location, region, specialization, bio, status } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Reporter name is required.' });
  const result = await prepare(`INSERT INTO reporters (name, email, phone, photo_url, location, region, specialization, bio, status)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(name.trim(), email?.trim() || null, phone?.trim() || null, photo_url || null, location?.trim() || null, region || 'local', specialization?.trim() || null, bio?.trim() || null, status || 'active');
  await syncLocation(location, req.user?.profile_id || null);
  const reporter = await prepare('SELECT * FROM reporters WHERE id = ?').get(result.lastInsertRowid);
  saveManagedBackup('content_change', `Reporter created: ${name.trim()}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('reporter:changed', { id: result.lastInsertRowid, name: name.trim(), action: 'created', actor: req.user!.profile_id });
  res.status(201).json(reporter);
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prepare('SELECT id FROM reporters WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Reporter not found.' });
  const { name, email, phone, photo_url, location, region, specialization, bio, status } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email?.trim() || null); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone?.trim() || null); }
  if (photo_url !== undefined) { updates.push('photo_url = ?'); params.push(photo_url || null); }
  if (location !== undefined) { updates.push('location = ?'); params.push(location?.trim() || null); }
  if (region !== undefined) { updates.push('region = ?'); params.push(region || 'local'); }
  if (specialization !== undefined) { updates.push('specialization = ?'); params.push(specialization?.trim() || null); }
  if (bio !== undefined) { updates.push('bio = ?'); params.push(bio?.trim() || null); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status || 'active'); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  await prepare(`UPDATE reporters SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  if (location !== undefined) {
    await syncLocation(location, req.user?.profile_id || null);
  }
  const reporter = await prepare('SELECT * FROM reporters WHERE id = ?').get(req.params.id);
  saveManagedBackup('content_change', `Reporter updated: #${req.params.id}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('reporter:changed', { id: Number(req.params.id), name: reporter?.name || '', action: 'updated', actor: req.user!.profile_id });
  res.json(reporter);
});

// Soft-delete: move to recycle bin
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const existing = await prepare('SELECT id, name FROM reporters WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Reporter not found.' });
  await prepare("UPDATE reporters SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'trash_reporter', 'reporters', req.params.id, `Moved reporter to recycle bin: ${existing.name}`);
  saveManagedBackup('content_change', `Reporter moved to recycle bin: ${existing.name}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('reporter:changed', { id: Number(req.params.id), name: existing.name, action: 'trashed', actor: req.user!.profile_id });
  res.json({ success: true, trashed: true });
});

// Restore reporter from recycle bin
router.post('/:id/restore', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const reporter = await prepare('SELECT * FROM reporters WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!reporter) return res.status(404).json({ error: 'Trashed reporter not found.' });
  await prepare("UPDATE reporters SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?").run(reporter.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'restore_reporter', 'reporters', reporter.id, `Restored reporter from recycle bin: ${reporter.name}`);
  saveManagedBackup('content_change', `Reporter restored from recycle bin: ${reporter.name}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('reporter:changed', { id: reporter.id, name: reporter.name, action: 'restored', actor: req.user!.profile_id });
  res.json({ success: true, restored: true });
});

// Permanently delete trashed reporter (admin only)
router.delete('/:id/permanent', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete reporters.' });
  const reporter = await prepare('SELECT * FROM reporters WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!reporter) return res.status(404).json({ error: 'Trashed reporter not found.' });
  await prepare('DELETE FROM reporters WHERE id = ?').run(reporter.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_reporter', 'reporters', reporter.id, `Permanently deleted reporter: ${reporter.name}`);
  saveManagedBackup('content_change', `Reporter permanently deleted: ${reporter.name}`, req.user?.full_name || req.user?.username || 'system');
  res.json({ success: true, permanently_deleted: true });
});

// Bulk permanently delete trashed reporters (admin only)
router.post('/permanent-bulk', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete reporters.' });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No reporter ids provided.' });

  const placeholders = ids.map(() => '?').join(',');
  const trashed = await prepare(`SELECT id, name FROM reporters WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`).all(...ids) as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'No trashed reporters found for the provided ids.' });

  for (const reporter of trashed) {
    await prepare('DELETE FROM reporters WHERE id = ?').run(reporter.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_reporter', 'reporters', 0, `Permanently deleted ${trashed.length} reporter(s) from recycle bin`);
  res.json({ success: true, permanently_deleted: trashed.length });
});

// Permanently delete ALL trashed reporters (admin only)
router.post('/empty-trash', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete reporters.' });
  const trashed = await prepare('SELECT id, name FROM reporters WHERE deleted_at IS NOT NULL').all() as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'Recycle bin is already empty.' });

  for (const reporter of trashed) {
    await prepare('DELETE FROM reporters WHERE id = ?').run(reporter.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_reporter', 'reporters', 0, `Emptied recycle bin: permanently deleted ${trashed.length} reporters`);
  res.json({ success: true, permanently_deleted: trashed.length });
});

export default router;
