import { Router, Response } from 'express';
import { prepare, saveManagedBackup } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { q } = req.query;
  const search = String(q || '').trim();
  let sql = "SELECT l.*, p.full_name AS created_by_name FROM locations l LEFT JOIN profiles p ON p.id = l.created_by";
  const params: any[] = [];
  if (search) {
    sql += ' WHERE (l.name LIKE ? OR l.details LIKE ?) AND l.deleted_at IS NULL';
    const like = `%${search}%`;
    params.push(like, like);
  } else {
    sql += ' WHERE l.deleted_at IS NULL';
  }
  sql += ' ORDER BY l.name COLLATE NOCASE ASC';
  res.json(await prepare(sql).all(...params));
});

// Trashed locations (recycle bin) - registered before /:id so it is not shadowed
router.get('/trashed', authenticate, async (req: AuthRequest, res: Response) => {
  const locations = await prepare(`
    SELECT l.*, p.full_name AS created_by_name
    FROM locations l LEFT JOIN profiles p ON p.id = l.created_by
    WHERE l.deleted_at IS NOT NULL
    ORDER BY l.deleted_at DESC
  `).all();
  res.json(locations);
});

router.get('/recent', authenticate, async (_req: AuthRequest, res: Response) => {
  const recent = await prepare(`
    SELECT l.*, p.full_name AS created_by_name
    FROM locations l LEFT JOIN profiles p ON p.id = l.created_by
    WHERE l.last_used_at IS NOT NULL AND l.deleted_at IS NULL
    ORDER BY l.last_used_at DESC LIMIT 3
  `).all();
  res.json(recent);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const location = await prepare(`
    SELECT l.*, p.full_name AS created_by_name
    FROM locations l LEFT JOIN profiles p ON p.id = l.created_by
    WHERE l.id = ? AND l.deleted_at IS NULL
  `).get(req.params.id);
  if (!location) return res.status(404).json({ error: 'Location not found.' });
  res.json(location);
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, region, details } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Location name is required.' });
  const existing = await prepare('SELECT id FROM locations WHERE name = ? COLLATE NOCASE').get(name.trim());
  if (existing) return res.status(409).json({ error: 'A location with this name already exists.', locationId: existing.id });
  const result = await prepare(`INSERT INTO locations (name, region, details, created_by)
    VALUES (?,?,?,?)`)
    .run(name.trim(), region || 'local', details?.trim() || null, req.user?.profile_id || null);
  const location = await prepare('SELECT * FROM locations WHERE id = ?').get(result.lastInsertRowid);
  saveManagedBackup('content_change', `Location created: ${name.trim()}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('location:changed', { id: result.lastInsertRowid, name: name.trim(), action: 'created', actor: req.user!.profile_id });
  res.status(201).json(location);
});

router.post('/:id/use', authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prepare('SELECT id FROM locations WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Location not found.' });
  await prepare("UPDATE locations SET usage_count = usage_count + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  const location = await prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
  res.json(location);
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prepare('SELECT id FROM locations WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Location not found.' });
  const { name, region, details } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Location name is required.' });
  const updates: string[] = [];
  const params: any[] = [];
  if (name !== undefined) {
    const dup = await prepare('SELECT id FROM locations WHERE name = ? COLLATE NOCASE AND id != ?').get(name.trim(), req.params.id);
    if (dup) return res.status(409).json({ error: 'A location with this name already exists.' });
    updates.push('name = ?'); params.push(name.trim());
  }
  if (region !== undefined) { updates.push('region = ?'); params.push(region || 'local'); }
  if (details !== undefined) { updates.push('details = ?'); params.push(details?.trim() || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  await prepare(`UPDATE locations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const location = await prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
  saveManagedBackup('content_change', `Location updated: #${req.params.id}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('location:changed', { id: Number(req.params.id), name: location?.name || '', action: 'updated', actor: req.user!.profile_id });
  res.json(location);
});

// Soft-delete: move to recycle bin
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const existing = await prepare('SELECT id, name FROM locations WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Location not found.' });
  await prepare('UPDATE tasks SET location_id = NULL WHERE location_id = ?').run(req.params.id);
  await prepare("UPDATE locations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'trash_location', 'locations', req.params.id, `Moved location to recycle bin: #${req.params.id}`);
  saveManagedBackup('content_change', `Location moved to recycle bin: #${req.params.id}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('location:changed', { id: Number(req.params.id), name: existing.name || '', action: 'trashed', actor: req.user!.profile_id });
  res.json({ success: true, trashed: true });
});

// Restore location from recycle bin
router.post('/:id/restore', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const location = await prepare('SELECT * FROM locations WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!location) return res.status(404).json({ error: 'Trashed location not found.' });
  await prepare("UPDATE locations SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?").run(location.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'restore_location', 'locations', location.id, `Restored location from recycle bin: ${location.name}`);
  saveManagedBackup('content_change', `Location restored from recycle bin: ${location.name}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('location:changed', { id: location.id, name: location.name, action: 'restored', actor: req.user!.profile_id });
  res.json({ success: true, restored: true });
});

// Permanently delete trashed location (admin only)
router.delete('/:id/permanent', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete locations.' });
  const location = await prepare('SELECT * FROM locations WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!location) return res.status(404).json({ error: 'Trashed location not found.' });
  await prepare('DELETE FROM locations WHERE id = ?').run(location.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_location', 'locations', location.id, `Permanently deleted location: ${location.name}`);
  saveManagedBackup('content_change', `Location permanently deleted: ${location.name}`, req.user?.full_name || req.user?.username || 'system');
  res.json({ success: true, permanently_deleted: true });
});

// Bulk permanently delete trashed locations (admin only)
router.post('/permanent-bulk', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete locations.' });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No location ids provided.' });

  const placeholders = ids.map(() => '?').join(',');
  const trashed = await prepare(`SELECT id, name FROM locations WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`).all(...ids) as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'No trashed locations found for the provided ids.' });

  for (const location of trashed) {
    await prepare('DELETE FROM locations WHERE id = ?').run(location.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_location', 'locations', 0, `Permanently deleted ${trashed.length} location(s) from recycle bin`);
  res.json({ success: true, permanently_deleted: trashed.length });
});

// Permanently delete ALL trashed locations (admin only)
router.post('/empty-trash', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete locations.' });
  const trashed = await prepare('SELECT id, name FROM locations WHERE deleted_at IS NOT NULL').all() as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'Recycle bin is already empty.' });

  for (const location of trashed) {
    await prepare('DELETE FROM locations WHERE id = ?').run(location.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_location', 'locations', 0, `Emptied recycle bin: permanently deleted ${trashed.length} locations`);
  res.json({ success: true, permanently_deleted: trashed.length });
});

export default router;
