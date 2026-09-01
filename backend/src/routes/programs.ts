import { Router, Response } from 'express';
import { prepare, nextUid, saveManagedBackup } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

const PROGRAM_TYPES = ['live_coverage', 'special_program', 'interview', 'event'];

// Program workflow: Create -> Implements (Start / Pause / Resume / Reset) -> Stop (Done).
// Cancel anytime. Reset undoes an accidental start (back to Planned). Delete -> recycle bin.
const PROGRAM_TRANSITIONS: Record<string, string[]> = {
  planned: ['ongoing', 'cancelled'],
  ongoing: ['paused', 'completed', 'cancelled', 'planned'],
  paused: ['ongoing', 'completed', 'cancelled', 'planned'],
  completed: [],
  // cancelled may be undone back to the exact pre-cancel status (the undo
  // handler replays the previous status), so allow all pre-cancel states.
  cancelled: ['planned', 'ongoing', 'paused'],
};

// Staff roles that run programs (multi-talent crew: operator, video editor, anchor, ...)
const CREW_ROLES = ['video_editor', 'anchor', 'general', 'editorial', 'output_desk', 'input_desk', 'reporter'];

function isCrew(req: AuthRequest) {
  return req.user!.access_level <= 2 || CREW_ROLES.includes(req.user!.role);
}

function isOwner(prog: any, req: AuthRequest) {
  return prog.assigned_to === req.user!.profile_id || prog.created_by === req.user!.profile_id;
}

function contentBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('content_change', detail, req.user?.full_name || req.user?.username || 'system');
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  let sql = `
    SELECT p.*, a.full_name as assigned_to_name, a.role as assigned_to_role, c.full_name as created_by_name,
      r.name as reporter_name
    FROM special_programs p
    LEFT JOIN profiles a ON p.assigned_to = a.id
    LEFT JOIN profiles c ON p.created_by = c.id
    LEFT JOIN reporters r ON p.reporter_id = r.id
    WHERE p.deleted_at IS NULL
  `;
  const params: any[] = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  sql += ' ORDER BY p.created_at DESC';
  res.json(await prepare(sql).all(...params));
});

// Trashed programs (recycle bin) - registered before /:id so it is not shadowed
router.get('/trashed', authenticate, async (req: AuthRequest, res: Response) => {
  const programs = await prepare(`
    SELECT p.*, a.full_name as assigned_to_name, c.full_name as created_by_name
    FROM special_programs p
    LEFT JOIN profiles a ON p.assigned_to = a.id
    LEFT JOIN profiles c ON p.created_by = c.id
    WHERE p.deleted_at IS NOT NULL
    ORDER BY p.deleted_at DESC
  `).all();
  res.json(programs);
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isCrew(req)) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });

  const { title, program_type, description, schedule_date, schedule_time, assigned_to, reporter_id } = req.body;
  if (!title || !program_type) return res.status(400).json({ error: 'Title and type required.' });
  if (!PROGRAM_TYPES.includes(program_type)) return res.status(400).json({ error: 'Invalid program type.' });

  const programUid = await nextUid('PRG', 'special_programs');
  const result = await prepare(`
    INSERT INTO special_programs (uid, title, program_type, description, schedule_date, schedule_time, assigned_to, reporter_id, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(programUid, title, program_type, description || '', schedule_date || null,
    schedule_time || null, assigned_to ? Number(assigned_to) : null, reporter_id ? Number(reporter_id) : null, req.user!.profile_id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'create_program', 'special_programs', result.lastInsertRowid, `Created program: ${title} (${programUid})`);
  contentBackup(req, `Program created: ${title} (${programUid})`);
  emitEvent('program:created', { id: result.lastInsertRowid, title, actor: req.user!.profile_id });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const prog = await prepare('SELECT * FROM special_programs WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!prog) return res.status(404).json({ error: 'Program not found.' });

  const isAdmin = req.user!.access_level <= 2;
  const canUpdate = isAdmin || isOwner(prog, req) || CREW_ROLES.includes(req.user!.role);
  if (!canUpdate) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });

  const { title, status, schedule_date, schedule_time, assigned_to, reporter_id, description } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let transitionNote = '';

  if (title) { updates.push('title = ?'); params.push(title); }
  if (status && status !== prog.status) {
    const allowed = PROGRAM_TRANSITIONS[prog.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot transition from '${prog.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}` });
    }
    updates.push('status = ?'); params.push(status);
    transitionNote = `${prog.status} -> ${status}`;
    if (status === 'completed') {
      updates.push("completed_at = datetime('now')");
    } else {
      updates.push('completed_at = NULL');
    }
  }
  if (schedule_date !== undefined) { updates.push('schedule_date = ?'); params.push(schedule_date); }
  if (schedule_time !== undefined) { updates.push('schedule_time = ?'); params.push(schedule_time); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to ? Number(assigned_to) : null); }
  if (reporter_id !== undefined) { updates.push('reporter_id = ?'); params.push(reporter_id ? Number(reporter_id) : null); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    await prepare(`UPDATE special_programs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_program', 'special_programs', prog.id,
      transitionNote ? `Program ${transitionNote}: ${prog.title} (${prog.uid})` : `Updated program: ${prog.title} (${prog.uid})`);
  contentBackup(req, `Program updated: ${prog.title} (${prog.uid})`);
  emitEvent('program:updated', { id: prog.id, title: prog.title, status, updated_by: req.user!.profile_id, updated_by_name: req.user!.full_name || req.user!.username });
  res.json({ success: true });
});

// Soft-delete: move to recycle bin
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const prog = await prepare('SELECT * FROM special_programs WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!prog) return res.status(404).json({ error: 'Program not found.' });

  if (req.user!.access_level > 2 && !isOwner(prog, req)) {
    return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  }
  if (prog.status === 'completed') {
    return res.status(400).json({ error: 'Completed programs cannot be deleted.' });
  }

  await prepare("UPDATE special_programs SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'trash_program', 'special_programs', prog.id, `Moved program to recycle bin: ${prog.title} (${prog.uid})`);
  contentBackup(req, `Program moved to recycle bin: ${prog.title} (${prog.uid})`);
  emitEvent('program:deleted', { id: prog.id, title: prog.title, actor: req.user!.profile_id });
  res.json({ success: true, trashed: true });
});

// Restore program from recycle bin
router.post('/:id/restore', authenticate, async (req: AuthRequest, res: Response) => {
  const prog = await prepare('SELECT * FROM special_programs WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!prog) return res.status(404).json({ error: 'Trashed program not found.' });

  if (req.user!.access_level > 2 && !isOwner(prog, req)) {
    return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  }

  await prepare("UPDATE special_programs SET deleted_at = NULL, status = 'planned', updated_at = datetime('now') WHERE id = ?").run(prog.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'restore_program', 'special_programs', prog.id, `Restored program from recycle bin: ${prog.title} (${prog.uid})`);
  contentBackup(req, `Program restored from recycle bin: ${prog.title} (${prog.uid})`);
  emitEvent('program:updated', { id: prog.id, title: prog.title, status: 'planned', updated_by: req.user!.profile_id, updated_by_name: req.user!.full_name || req.user!.username });
  res.json({ success: true, restored: true });
});

// Permanently delete trashed program (admin only)
router.delete('/:id/permanent', authenticate, async (req: AuthRequest, res: Response) => {
  const prog = await prepare('SELECT * FROM special_programs WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as any;
  if (!prog) return res.status(404).json({ error: 'Trashed program not found.' });
  if (req.user!.access_level > 2) {
    return res.status(403).json({ error: 'Only admins can permanently delete programs.' });
  }

  await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('special_programs', prog.id);
  await prepare('DELETE FROM special_programs WHERE id = ?').run(prog.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_program', 'special_programs', prog.id, `Permanently deleted program: ${prog.title} (${prog.uid})`);
  contentBackup(req, `Program permanently deleted: ${prog.title} (${prog.uid})`);
  emitEvent('program:deleted', { id: prog.id, title: prog.title, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: true });
});

// Bulk permanently delete trashed programs (admin only)
router.post('/permanent-bulk', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) {
    return res.status(403).json({ error: 'Only admins can permanently delete programs.' });
  }
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No program ids provided.' });

  const placeholders = ids.map(() => '?').join(',');
  const trashed = await prepare(`SELECT id, title FROM special_programs WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`).all(...ids) as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'No trashed programs found for the provided ids.' });

  for (const prog of trashed) {
    await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('special_programs', prog.id);
    await prepare('DELETE FROM special_programs WHERE id = ?').run(prog.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_program', 'special_programs', 0, `Permanently deleted ${trashed.length} program(s) from recycle bin`);
  emitEvent('program:deleted', { bulk: true, count: trashed.length, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: trashed.length });
});

// Permanently delete ALL trashed programs (admin only)
router.post('/empty-trash', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) {
    return res.status(403).json({ error: 'Only admins can permanently delete programs.' });
  }
  const trashed = await prepare('SELECT id, title FROM special_programs WHERE deleted_at IS NOT NULL').all() as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'Recycle bin is already empty.' });

  for (const prog of trashed) {
    await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('special_programs', prog.id);
    await prepare('DELETE FROM special_programs WHERE id = ?').run(prog.id);
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_program', 'special_programs', 0, `Emptied recycle bin: permanently deleted ${trashed.length} programs`);
  emitEvent('program:deleted', { bulk: true, count: trashed.length, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: trashed.length });
});

export default router;
