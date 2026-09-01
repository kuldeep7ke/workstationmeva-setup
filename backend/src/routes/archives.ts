import { Router, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { prepare, saveManagedBackup } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

const CATEGORIES = ['footage', 'stock', 'photo', 'audio', 'graphics'];

const CATEGORY_EXT: Record<string, string[]> = {
  footage: ['mp4', 'mov', 'mkv', 'avi', 'm4v', 'webm', 'wmv', 'flv', 'ts', 'm2ts'],
  photo: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'tif', 'tiff'],
  audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma'],
  graphics: ['ai', 'eps', 'psd', 'svg', 'cdr', 'xd'],
};

const EXT_TO_CATEGORY: Record<string, string> = {};
for (const [cat, exts] of Object.entries(CATEGORY_EXT)) {
  for (const ext of exts) EXT_TO_CATEGORY[ext] = cat;
}

async function walkFiles(root: string, dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(root, full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { q } = req.query;
  const search = String(q || '').trim();
  let sql = "SELECT a.*, p.full_name AS created_by_name FROM archives a LEFT JOIN profiles p ON p.id = a.created_by";
  const params: any[] = [];
  if (search) {
    sql += ' WHERE a.name LIKE ? OR a.details LIKE ? OR a.location LIKE ?';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY a.name COLLATE NOCASE ASC';
  res.json(await prepare(sql).all(...params));
});

router.get('/recent', authenticate, async (_req: AuthRequest, res: Response) => {
  const recent = await prepare(`
    SELECT a.*, p.full_name AS created_by_name
    FROM archives a LEFT JOIN profiles p ON p.id = a.created_by
    WHERE a.last_used_at IS NOT NULL
    ORDER BY a.last_used_at DESC LIMIT 3
  `).all();
  res.json(recent);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const archive = await prepare(`
    SELECT a.*, p.full_name AS created_by_name
    FROM archives a LEFT JOIN profiles p ON p.id = a.created_by
    WHERE a.id = ?
  `).get(req.params.id);
  if (!archive) return res.status(404).json({ error: 'Archive entry not found.' });
  res.json(archive);
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, details, location, category, status, availability } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Archive footage name is required.' });
  if (status !== undefined && !['online', 'offline'].includes(status)) return res.status(400).json({ error: 'Status must be online or offline.' });
  if (availability !== undefined && !['available', 'not_available'].includes(availability)) return res.status(400).json({ error: 'Availability must be available or not_available.' });
  const existing = await prepare('SELECT id FROM archives WHERE name = ? COLLATE NOCASE').get(name.trim());
  if (existing) return res.status(409).json({ error: 'An archive entry with this name already exists.', archiveId: existing.id });
  const result = await prepare(`INSERT INTO archives (name, details, location, category, status, availability, stock_updated_at, created_by)
    VALUES (?,?,?,?,?,?,datetime('now'),?)`)
    .run(name.trim(), details?.trim() || null, location?.trim() || null, category || 'footage', status || 'online', availability || 'available', req.user?.profile_id || null);
  const archive = await prepare('SELECT * FROM archives WHERE id = ?').get(result.lastInsertRowid);
  saveManagedBackup('content_change', `Archive entry created: ${name.trim()}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('archive:changed', { id: result.lastInsertRowid, name: name.trim(), action: 'created', actor: req.user!.profile_id });
  res.status(201).json(archive);
});

router.post('/:id/use', authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prepare('SELECT id FROM archives WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Archive entry not found.' });
  await prepare("UPDATE archives SET usage_count = usage_count + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  const archive = await prepare('SELECT * FROM archives WHERE id = ?').get(req.params.id);
  res.json(archive);
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Only admins can edit archive stock.' });
  const existing = await prepare('SELECT id FROM archives WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Archive entry not found.' });
  const { name, details, location, category, status, availability } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Archive footage name is required.' });
  if (status !== undefined && !['online', 'offline'].includes(status)) return res.status(400).json({ error: 'Status must be online or offline.' });
  if (availability !== undefined && !['available', 'not_available'].includes(availability)) return res.status(400).json({ error: 'Availability must be available or not_available.' });
  const updates: string[] = [];
  const params: any[] = [];
  if (name !== undefined) {
    const dup = await prepare('SELECT id FROM archives WHERE name = ? COLLATE NOCASE AND id != ?').get(name.trim(), req.params.id);
    if (dup) return res.status(409).json({ error: 'An archive entry with this name already exists.' });
    updates.push('name = ?'); params.push(name.trim());
  }
  if (details !== undefined) { updates.push('details = ?'); params.push(details?.trim() || null); }
  if (location !== undefined) { updates.push('location = ?'); params.push(location?.trim() || null); }
  if (category !== undefined) { updates.push('category = ?'); params.push(category || 'footage'); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (availability !== undefined) { updates.push('availability = ?'); params.push(availability); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  await prepare(`UPDATE archives SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const archive = await prepare('SELECT * FROM archives WHERE id = ?').get(req.params.id);
  saveManagedBackup('content_change', `Archive entry updated: #${req.params.id}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('archive:changed', { id: Number(req.params.id), name: archive?.name || '', action: 'updated', actor: req.user!.profile_id });
  res.json(archive);
});

// Monthly stock update (admin/level <= 2): confirms the stock is current and refreshes its age
router.put('/:id/stock', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Only admins can update stock.' });
  const existing = await prepare('SELECT id, name FROM archives WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Archive entry not found.' });
  const { status, availability } = req.body;
  if (status !== undefined && !['online', 'offline'].includes(status)) return res.status(400).json({ error: 'Status must be online or offline.' });
  if (availability !== undefined && !['available', 'not_available'].includes(availability)) return res.status(400).json({ error: 'Availability must be available or not_available.' });
  await prepare("UPDATE archives SET status = ?, availability = ?, stock_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(status || 'online', availability || 'available', req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_stock', 'archives', req.params.id, `Stock updated (${status || 'online'}, ${availability || 'available'}): ${existing.name}`);
  saveManagedBackup('content_change', `Stock updated: ${existing.name}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('archive:changed', { id: Number(req.params.id), name: existing.name, action: 'stock_updated', actor: req.user!.profile_id });
  res.json({ success: true, stock_updated_at: new Date().toISOString() });
});

// Scan a folder on the server machine and index the media files in it
router.post('/scan-folder', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Only admins can scan folders.' });
  const folder = String(req.body?.path || '').trim();
  if (!folder) return res.status(400).json({ error: 'Folder path is required.' });
  let stat;
  try { stat = await fs.stat(folder); } catch {
    return res.status(404).json({ error: 'Folder not found. Check the path and try again.' });
  }
  if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a folder.' });

  let files: string[];
  try { files = await walkFiles(folder, folder); } catch (e: any) {
    return res.status(500).json({ error: `Failed to scan folder: ${e.message}` });
  }

  const existingRows = await prepare('SELECT name FROM archives').all() as any[];
  const existingSet = new Set(existingRows.map((r: any) => String(r.name).toLowerCase()));

  const results: any[] = [];
  for (const f of files) {
    const ext = path.extname(f).slice(1).toLowerCase();
    const category = EXT_TO_CATEGORY[ext];
    if (!category) continue;
    let statInfo;
    try { statInfo = await fs.stat(f); } catch { continue; }
    results.push({
      name: path.basename(f),
      category,
      location: path.basename(path.dirname(f)),
      rel_path: path.relative(folder, f).split(path.sep).join('/'),
      size: statInfo.size,
      modified_at: statInfo.mtime.toISOString(),
      exists: existingSet.has(path.basename(f).toLowerCase()),
    });
  }
  results.sort((a, b) => a.rel_path.localeCompare(b.rel_path));
  res.json({ folder, total: files.length, recognized: results.length, files: results });
});

// Add user-selected scan results into the archives table (dedupes by name)
router.post('/import-selected', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Only admins can import stock.' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'No files selected.' });

  let created = 0;
  const skipped: string[] = [];
  for (const it of items) {
    const name = String(it?.name || '').trim();
    if (!name) continue;
    const dup = await prepare('SELECT id FROM archives WHERE name = ? COLLATE NOCASE').get(name);
    if (dup) { skipped.push(name); continue; }
    const category = CATEGORIES.includes(it?.category) ? it.category : 'footage';
    await prepare(`INSERT INTO archives (name, details, location, category, status, availability, stock_updated_at, created_by)
      VALUES (?,?,?,?,?,?,datetime('now'),?)`)
      .run(name, it?.details?.trim() || null, it?.location?.trim() || null, category, 'online', 'available', req.user?.profile_id || null);
    created++;
  }
  if (created > 0) {
    await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
      .run(req.user!.profile_id, 'import_stock', 'archives', 0, `Imported ${created} archive entr${created === 1 ? 'y' : 'ies'} from folder scan`);
    saveManagedBackup('content_change', `Imported ${created} archive entr${created === 1 ? 'y' : 'ies'} from folder scan`, req.user?.full_name || req.user?.username || 'system');
  }
  res.json({ success: true, created, skipped: skipped.length, skipped_names: skipped });
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Only admins can delete archive entries.' });
  const existing = await prepare('SELECT id, name FROM archives WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Archive entry not found.' });
  await prepare('UPDATE tasks SET archive_id = NULL WHERE archive_id = ?').run(req.params.id);
  await prepare('DELETE FROM archives WHERE id = ?').run(req.params.id);
  saveManagedBackup('content_change', `Archive entry deleted: #${req.params.id}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('archive:changed', { id: Number(req.params.id), name: existing.name || '', action: 'deleted', actor: req.user!.profile_id });
  res.json({ success: true });
});

export default router;
