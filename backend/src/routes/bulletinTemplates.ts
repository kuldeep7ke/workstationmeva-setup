import { Router, Response } from 'express';
import { prepare, saveManagedBackup } from '../database/schema';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

function contentBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('content_change', detail, req.user?.full_name || req.user?.username || 'system');
}

const DEFAULT_BULLETINS = [
  { name: 'Good Morning', publish_time: '07:00', sort_order: 1 },
  { name: 'Shaharachi Khabarbat', publish_time: '08:00', sort_order: 2 },
  { name: 'Top 10 News', publish_time: '09:00', sort_order: 3 },
  { name: 'Vegvan Adhava', publish_time: '10:00', sort_order: 4 },
  { name: 'Bulletin', publish_time: '11:00', sort_order: 5 },
  { name: 'Gossip Kalla', publish_time: '12:00', sort_order: 6 },
  { name: 'Shaharachi Khabarbat', publish_time: '13:00', sort_order: 7 },
  { name: 'Superfast', publish_time: '14:00', sort_order: 8 },
  { name: 'Jilhyachi Khabarbat', publish_time: '15:00', sort_order: 9 },
  { name: 'Top 24 Headlines', publish_time: '16:00', sort_order: 10 },
];

router.post('/restore-defaults', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { force_factory } = req.body;
  const systemDefaults = await prepare('SELECT name, publish_time, sort_order FROM system_bulletin_defaults ORDER BY sort_order ASC').all() as any[];
  const defaultsToUse = (!force_factory && systemDefaults.length > 0) ? systemDefaults : DEFAULT_BULLETINS;

  const existing = await prepare('SELECT * FROM bulletin_templates ORDER BY sort_order ASC').all() as any[];

  const existingByOrder: Record<number, any> = {};
  for (const row of existing) {
    existingByOrder[row.sort_order] = row;
  }

  for (const b of defaultsToUse) {
    if (existingByOrder[b.sort_order]) {
      await prepare('UPDATE bulletin_templates SET name = ?, publish_time = ?, skip_reason = NULL, updated_at = datetime(\'now\') WHERE id = ?')
        .run(b.name, b.publish_time, existingByOrder[b.sort_order].id);
    } else {
      await prepare('INSERT INTO bulletin_templates (name, publish_time, sort_order, created_by) VALUES (?,?,?,?)')
        .run(b.name, b.publish_time, b.sort_order, req.user!.profile_id);
    }
  }

  const maxDefaultOrder = Math.max(...defaultsToUse.map(b => b.sort_order));
  const extras = existing.filter((r: any) => r.sort_order > maxDefaultOrder);
  for (const extra of extras) {
    await prepare('UPDATE tasks SET bulletin_template_id = NULL WHERE bulletin_template_id = ?').run(extra.id);
    await prepare('DELETE FROM bulletin_templates WHERE id = ?').run(extra.id);
  }

  const templates = await prepare('SELECT * FROM bulletin_templates ORDER BY sort_order ASC').all();
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'restore_defaults', 'bulletin_templates', 0, `Restored ${systemDefaults.length > 0 ? 'system' : 'factory'} default bulletin slots`);
  contentBackup(req, 'Bulletin slots restored to defaults');
  emitEvent('slot:changed', { action: 'restored', actor: req.user!.profile_id });
  res.json({ success: true, count: templates.length, templates });
});

router.get('/custom-defaults', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const defaults = await prepare('SELECT name, publish_time, sort_order FROM user_bulletin_defaults WHERE user_id = ? ORDER BY sort_order ASC').all(req.user!.profile_id);
  res.json({ saved: defaults.length > 0, count: defaults.length, slots: defaults });
});

router.post('/save-defaults', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const templates = await prepare('SELECT name, publish_time, sort_order FROM bulletin_templates ORDER BY sort_order ASC').all() as any[];
  if (templates.length === 0) {
    return res.status(400).json({ error: 'No slots to save.' });
  }
  await prepare('DELETE FROM user_bulletin_defaults WHERE user_id = ?').run(req.user!.profile_id);
  for (const t of templates) {
    await prepare('INSERT INTO user_bulletin_defaults (user_id, name, publish_time, sort_order) VALUES (?,?,?,?)')
      .run(req.user!.profile_id, t.name, t.publish_time, t.sort_order);
  }
  const saved = await prepare('SELECT name, publish_time, sort_order FROM user_bulletin_defaults WHERE user_id = ? ORDER BY sort_order ASC').all(req.user!.profile_id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'save_defaults', 'user_bulletin_defaults', 0, `Saved ${saved.length} slots as custom defaults`);
  contentBackup(req, `Saved ${saved.length} slots as custom defaults`);
  res.json({ success: true, count: saved.length, slots: saved });
});

router.post('/restore-custom-defaults', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const defaults = await prepare('SELECT name, publish_time, sort_order FROM user_bulletin_defaults WHERE user_id = ? ORDER BY sort_order ASC').all(req.user!.profile_id) as any[];
  if (defaults.length === 0) {
    return res.status(400).json({ error: 'No custom defaults saved. Save your current slots as defaults first.' });
  }

  const existing = await prepare('SELECT * FROM bulletin_templates ORDER BY sort_order ASC').all() as any[];
  const existingByOrder: Record<number, any> = {};
  for (const row of existing) {
    existingByOrder[row.sort_order] = row;
  }

  for (const d of defaults) {
    if (existingByOrder[d.sort_order]) {
      await prepare('UPDATE bulletin_templates SET name = ?, publish_time = ?, skip_reason = NULL, updated_at = datetime(\'now\') WHERE id = ?')
        .run(d.name, d.publish_time, existingByOrder[d.sort_order].id);
    } else {
      await prepare('INSERT INTO bulletin_templates (name, publish_time, sort_order, created_by) VALUES (?,?,?,?)')
        .run(d.name, d.publish_time, d.sort_order, req.user!.profile_id);
    }
  }

  const maxDefaultOrder = Math.max(...defaults.map((d: any) => d.sort_order));
  const extras = existing.filter((r: any) => r.sort_order > maxDefaultOrder);
  for (const extra of extras) {
    await prepare('UPDATE tasks SET bulletin_template_id = NULL WHERE bulletin_template_id = ?').run(extra.id);
    await prepare('DELETE FROM bulletin_templates WHERE id = ?').run(extra.id);
  }

  const templates = await prepare('SELECT * FROM bulletin_templates ORDER BY sort_order ASC').all();
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'restore_custom_defaults', 'bulletin_templates', 0, 'Restored custom default bulletin slots');
  contentBackup(req, 'Custom bulletin slots restored');
  emitEvent('slot:changed', { action: 'restored', actor: req.user!.profile_id });
  res.json({ success: true, count: templates.length, templates });
});

router.post('/save-system-defaults', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const templates = await prepare('SELECT name, publish_time, sort_order FROM bulletin_templates ORDER BY sort_order ASC').all() as any[];
  if (templates.length === 0) {
    return res.status(400).json({ error: 'No slots to save.' });
  }
  await prepare('DELETE FROM system_bulletin_defaults').run();
  for (const t of templates) {
    await prepare('INSERT INTO system_bulletin_defaults (name, publish_time, sort_order) VALUES (?,?,?)')
      .run(t.name, t.publish_time, t.sort_order);
  }
  const saved = await prepare('SELECT name, publish_time, sort_order FROM system_bulletin_defaults ORDER BY sort_order ASC').all() as any[];
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'save_system_defaults', 'system_bulletin_defaults', 0, `Saved ${saved.length} slots as system defaults`);
  contentBackup(req, `Saved ${saved.length} slots as system defaults`);
  res.json({ success: true, count: saved.length, slots: saved });
});

router.get('/system-defaults', authenticate, async (_req: AuthRequest, res: Response) => {
  const defaults = await prepare('SELECT name, publish_time, sort_order FROM system_bulletin_defaults ORDER BY sort_order ASC').all() as any[];
  res.json({ saved: defaults.length > 0, count: defaults.length, slots: defaults });
});

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  const templates = await prepare('SELECT * FROM bulletin_templates ORDER BY sort_order ASC, name ASC').all();
  res.json(templates);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const t = await prepare('SELECT * FROM bulletin_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Bulletin template not found.' });
  res.json(t);
});

router.post('/', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { name, publish_time, sort_order, news_count, news_level } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const maxSort = await prepare('SELECT MAX(sort_order) as m FROM bulletin_templates').get() as any;
  const sort = sort_order !== undefined ? sort_order : (maxSort?.m || 0) + 1;

  const result = await prepare('INSERT INTO bulletin_templates (name, publish_time, sort_order, news_count, news_level, created_by) VALUES (?,?,?,?,?,?)')
    .run(name, publish_time || null, sort, news_count || 5, news_level || 'local', req.user!.profile_id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'create_template', 'bulletin_templates', result.lastInsertRowid, `Created bulletin template: ${name}`);
  contentBackup(req, `Bulletin template created: ${name}`);
  emitEvent('slot:changed', { action: 'assigned', id: result.lastInsertRowid, name, actor: req.user!.profile_id });
  res.status(201).json({ id: result.lastInsertRowid, name, publish_time, sort_order: sort, news_count: news_count || 5, news_level: news_level || 'local' });
});

router.put('/:id', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const t = await prepare('SELECT * FROM bulletin_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Bulletin template not found.' });

  const { name, publish_time, sort_order, is_active, skip_reason, news_count, news_level } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (publish_time !== undefined) { updates.push('publish_time = ?'); params.push(publish_time); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (skip_reason !== undefined) { updates.push('skip_reason = ?'); params.push(skip_reason || null); }
  if (news_count !== undefined) { updates.push('news_count = ?'); params.push(news_count); }
  if (news_level !== undefined) { updates.push('news_level = ?'); params.push(news_level); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    await prepare(`UPDATE bulletin_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (publish_time !== undefined) {
    const linkedTasks = await prepare(
      "SELECT id, deadline FROM tasks WHERE bulletin_template_id = ? AND status IN ('draft','script_writing','footage_collection','waiting_confirmation','correction_required','approved')"
    ).all(req.params.id) as any[];
    const now = new Date();
    const [nh, nm] = publish_time ? publish_time.split(':').map(Number) : [0, 0];
    for (const lt of linkedTasks) {
      let newDeadline: Date;
      if (publish_time) {
        newDeadline = new Date();
        newDeadline.setHours(nh, nm, 0, 0);
        if (newDeadline.getTime() <= now.getTime()) {
          newDeadline = new Date(now.getTime() + 60 * 60 * 1000);
        }
      } else {
        newDeadline = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      }
      const dlStr = newDeadline.toISOString().slice(0, 19).replace('T', ' ');
      await prepare("UPDATE tasks SET deadline = ?, updated_at = datetime('now') WHERE id = ?").run(dlStr, lt.id);
    }
  }

  const slotAction = skip_reason !== undefined
    ? (skip_reason ? 'skipped' : 'assigned')
    : 'updated';
  emitEvent('slot:changed', { action: slotAction, id: Number(req.params.id), name: (t as any).name, actor: req.user!.profile_id });

  res.json({ success: true });
  contentBackup(req, `Bulletin template updated: #${req.params.id}`);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_template', 'bulletin_templates', req.params.id, `Updated bulletin template #${req.params.id}`);
});

router.delete('/:id', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const t = await prepare('SELECT * FROM bulletin_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Bulletin template not found.' });

  await prepare('UPDATE tasks SET bulletin_template_id = NULL WHERE bulletin_template_id = ?').run(req.params.id);
  await prepare('DELETE FROM bulletin_templates WHERE id = ?').run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'delete_template', 'bulletin_templates', req.params.id, `Deleted bulletin template: ${(t as any).name}`);
  contentBackup(req, `Bulletin template deleted: ${(t as any).name}`);
  emitEvent('slot:changed', { action: 'deleted', id: Number(req.params.id), name: (t as any).name, actor: req.user!.profile_id });
  res.json({ success: true });
});

export default router;
