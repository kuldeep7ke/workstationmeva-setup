import { Router, Response } from 'express';
import { prepare, nextUid, saveManagedBackup } from '../database/schema';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

function contentBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('content_change', detail, req.user?.full_name || req.user?.username || 'system');
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const ads = await prepare(`
    SELECT a.*, p.full_name as created_by_name, r.name as reporter_name
    FROM ads a
    LEFT JOIN profiles p ON a.created_by = p.id
    LEFT JOIN reporters r ON a.reporter_id = r.id
    WHERE a.deleted_at IS NULL
    ORDER BY a.created_at DESC
  `).all();
  res.json(ads);
});

// Trashed ads (recycle bin)
router.get('/trashed', authenticate, async (req: AuthRequest, res: Response) => {
  const ads = await prepare(`
    SELECT a.*, p.full_name as created_by_name, r.name as reporter_name
    FROM ads a
    LEFT JOIN profiles p ON a.created_by = p.id
    LEFT JOIN reporters r ON a.reporter_id = r.id
    WHERE a.deleted_at IS NOT NULL
    ORDER BY a.deleted_at DESC
  `).all();
  res.json(ads);
});

router.get('/:id', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const ad = await prepare(`
    SELECT a.*, p.full_name as created_by_name, r.name as reporter_name
    FROM ads a
    LEFT JOIN profiles p ON a.created_by = p.id
    LEFT JOIN reporters r ON a.reporter_id = r.id
    WHERE a.id = ? AND a.deleted_at IS NULL
  `).get(req.params.id);
  if (!ad) return res.status(404).json({ error: 'Ad not found.' });
  res.json(ad);
});

router.post('/', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const { title, client_name, description, duration_seconds, rate, start_date, end_date, ad_type, party_type, booked_by, reporter_id, agency_name, slots_count, ad_place, brand_type, renewal_type, renewal_period } = req.body;
  if (!title || !client_name) return res.status(400).json({ error: 'Title and client name required.' });
  if (booked_by === 'reporter' && !reporter_id) return res.status(400).json({ error: 'Select a reporter for this booking.' });
  if (booked_by === 'agency' && !agency_name) return res.status(400).json({ error: 'Enter the agency name for this booking.' });
  if ((renewal_type === 'auto_renew' || renewal_type === 'loop') && !renewal_period) return res.status(400).json({ error: 'Select a renewal period for this cycle.' });

  const adUid = await nextUid('ADS', 'ads');
  const result = await prepare(`
    INSERT INTO ads (uid, title, client_name, description, duration_seconds, rate, ad_type, party_type, booked_by, reporter_id, agency_name, slots_count, ad_place, brand_type, renewal_type, renewal_period, start_date, end_date, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(adUid, title, client_name, description || '', duration_seconds || 0, rate ?? 0, ad_type || null, party_type || null, booked_by || 'client', booked_by === 'reporter' ? Number(reporter_id) : null, booked_by === 'agency' ? agency_name : null, slots_count || 0, ad_place || null, ad_place === 'brand' ? (brand_type || null) : null, renewal_type || 'one_time', (renewal_type === 'auto_renew' || renewal_type === 'loop') ? renewal_period : null, start_date || null, end_date || null, req.user!.profile_id);

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'create_ad', 'ads', result.lastInsertRowid, `Created ad: ${title} (${adUid})`);
  contentBackup(req, `Ad created: ${title} (${adUid})`);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const { title, client_name, status, description, duration_seconds, rate, ad_type, party_type, booked_by, reporter_id, agency_name, slots_count, ad_place, brand_type, renewal_type, renewal_period, start_date, end_date } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (client_name !== undefined) { updates.push('client_name = ?'); params.push(client_name); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (duration_seconds !== undefined) { updates.push('duration_seconds = ?'); params.push(duration_seconds); }
  if (rate !== undefined) { updates.push('rate = ?'); params.push(rate); }
  if (ad_type !== undefined) { updates.push('ad_type = ?'); params.push(ad_type || null); }
  if (party_type !== undefined) { updates.push('party_type = ?'); params.push(party_type || null); }
  if (booked_by !== undefined) { updates.push('booked_by = ?'); params.push(booked_by); }
  if (reporter_id !== undefined) { updates.push('reporter_id = ?'); params.push(reporter_id || null); }
  if (agency_name !== undefined) { updates.push('agency_name = ?'); params.push(agency_name || null); }
  if (slots_count !== undefined) { updates.push('slots_count = ?'); params.push(slots_count); }
  if (ad_place !== undefined) { updates.push('ad_place = ?'); params.push(ad_place || null); }
  if (brand_type !== undefined) { updates.push('brand_type = ?'); params.push(ad_place === 'brand' ? (brand_type || null) : null); }
  if (renewal_type !== undefined) { updates.push('renewal_type = ?'); params.push(renewal_type); }
  if (renewal_period !== undefined) { updates.push('renewal_period = ?'); params.push(renewal_period || null); }
  if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date || null); }
  if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date || null); }
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    await prepare(`UPDATE ads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const ad = await prepare('SELECT title, uid FROM ads WHERE id = ?').get(req.params.id) as any;
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_ad', 'ads', req.params.id, `Updated ad: ${ad?.title || ''} (${ad?.uid || '#' + req.params.id})`);
  contentBackup(req, `Ad updated: ${ad?.title || '#' + req.params.id}`);
  res.json({ success: true });
});

// Soft-delete: move to recycle bin
router.delete('/:id', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const ad = await prepare('SELECT title, uid FROM ads WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!ad) return res.status(404).json({ error: 'Ad not found.' });
  await prepare("UPDATE ads SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'trash_ad', 'ads', req.params.id, `Moved ad to recycle bin: ${ad?.title || ''} (${ad?.uid || '#' + req.params.id})`);
  contentBackup(req, `Ad moved to recycle bin: ${ad?.title || '#' + req.params.id}`);
  emitEvent('ad:deleted', { id: Number(req.params.id), title: ad?.title || '', actor: req.user!.profile_id });
  res.json({ success: true, trashed: true });
});

// Restore ad from recycle bin
router.post('/:id/restore', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const ad = await prepare('SELECT * FROM ads WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!ad) return res.status(404).json({ error: 'Trashed ad not found.' });
  await prepare("UPDATE ads SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?").run(ad.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'restore_ad', 'ads', ad.id, `Restored ad from recycle bin: ${ad.title} (${ad.uid})`);
  contentBackup(req, `Ad restored from recycle bin: ${ad.title} (${ad.uid})`);
  emitEvent('ad:updated', { id: ad.id, title: ad.title, status: ad.status, updated_by: req.user!.profile_id, updated_by_name: req.user!.full_name || req.user!.username });
  res.json({ success: true, restored: true });
});

// Permanently delete trashed ad (admin only)
router.delete('/:id/permanent', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete ads.' });
  const ad = await prepare('SELECT * FROM ads WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!ad) return res.status(404).json({ error: 'Trashed ad not found.' });
  await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('ads', ad.id);
  await prepare('DELETE FROM ads WHERE id = ?').run(ad.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_ad', 'ads', ad.id, `Permanently deleted ad: ${ad.title} (${ad.uid})`);
  contentBackup(req, `Ad permanently deleted: ${ad.title} (${ad.uid})`);
  emitEvent('ad:deleted', { id: ad.id, title: ad.title, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: true });
});

// Bulk permanently delete trashed ads (admin only)
router.post('/permanent-bulk', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete ads.' });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No ad ids provided.' });

  const placeholders = ids.map(() => '?').join(',');
  const trashed = await prepare(`SELECT id, title FROM ads WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`).all(...ids) as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'No trashed ads found for the provided ids.' });

  for (const ad of trashed) {
    await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('ads', ad.id);
    await prepare('DELETE FROM ads WHERE id = ?').run(ad.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_ad', 'ads', 0, `Permanently deleted ${trashed.length} ad(s) from recycle bin`);
  emitEvent('ad:deleted', { bulk: true, count: trashed.length, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: trashed.length });
});

// Permanently delete ALL trashed ads (admin only)
router.post('/empty-trash', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only admins can permanently delete ads.' });
  const trashed = await prepare('SELECT id, title FROM ads WHERE deleted_at IS NOT NULL').all() as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'Recycle bin is already empty.' });

  for (const ad of trashed) {
    await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('ads', ad.id);
    await prepare('DELETE FROM ads WHERE id = ?').run(ad.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_ad', 'ads', 0, `Emptied recycle bin: permanently deleted ${trashed.length} ads`);
  emitEvent('ad:deleted', { bulk: true, count: trashed.length, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: trashed.length });
});

export default router;
