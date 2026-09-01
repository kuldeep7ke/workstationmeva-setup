import { Router, Response } from 'express';
import { prepare, nextUid, saveManagedBackup } from '../database/schema';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { createNotification } from './notifications';
import { emitEvent } from '../socket';
import { isPostgres } from '../database/postgres';

const router = Router();

function taskBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('task_change', detail, req.user?.full_name || req.user?.username || 'system');
}

const VALID_TASK_STATUSES = ['draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'published', 'under_review', 'completed', 'cancelled'];

const VALID_PRIORITIES = ['urgent', 'high', 'medium', 'low'];

const TASK_TRANSITIONS: Record<string, string[]> = {
  draft: ['script_writing', 'cancelled'],
  script_writing: ['footage_collection'],
  footage_collection: ['waiting_confirmation'],
  waiting_confirmation: ['approved', 'correction_required'],
  correction_required: ['waiting_confirmation'],
  approved: ['editor_assigned'],
  editor_assigned: ['teleprompter_ready'],
  teleprompter_ready: ['prompting', 'recording_done'],
  prompting: ['recording_done'],
  recording_done: ['editing'],
  editing: ['uploading', 'published'],
  uploading: ['published'],
  published: ['under_review'],
  under_review: ['completed', 'correction_required'],
  completed: ['correction_required'],
  cancelled: ['draft'],
};

const WORKFLOW_SEQUENCE: string[] = ['draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'published', 'under_review', 'completed', 'cancelled'];

const URGENT_PRIORITIES = ['urgent', 'high'];

// Local calendar day (YYYY-MM-DD) matching the frontend's todayStr — used for
// bulletin slots so a UTC date('now') doesn't drift vs the IST local date.
function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// tasks.script_imported_at is TEXT (legacy) while t.updated_at is TIMESTAMPTZ on PostgreSQL,
// so COALESCE needs an explicit cast there. Computed per-request because the DB mode can
// change at runtime (Settings -> Database Connection).
const scriptImportedTs = () => (isPostgres() ? 't.script_imported_at::timestamptz' : 't.script_imported_at');

// Track a profile as a collaborator on a task (excluding admin level-1)
async function trackCollaborator(taskId: number, profileId: number) {
  const profile = await prepare('SELECT access_level FROM profiles WHERE id = ?').get(profileId) as any;
  if (profile && profile.access_level !== 1) {
    await prepare('INSERT OR IGNORE INTO task_collaborators (task_id, profile_id) VALUES (?,?)').run(taskId, profileId);
  }
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function logAudit(taskId: number, profileId: number, profileName: string, action: string, fromStatus: string, toStatus: string, details?: string) {
  try {
    await prepare('INSERT INTO task_audit_log (task_id, profile_id, profile_name, action, from_status, to_status, details) VALUES (?,?,?,?,?,?,?)')
      .run(taskId, profileId, profileName, action, fromStatus, toStatus, details || null);
  } catch {}
}

async function nextWorkingDay(date: Date, profileId: number): Promise<Date> {
  const d = new Date(date);
  const profile = await prepare('SELECT weekly_off FROM profiles WHERE id = ?').get(profileId) as any;
  let offDays: string[] = [];
  try { offDays = profile?.weekly_off ? JSON.parse(profile.weekly_off) : []; } catch { offDays = []; }
  const dateStr = d.toISOString().slice(0, 10);
  const leaves = await prepare("SELECT start_date, end_date FROM leaves WHERE profile_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?")
    .all(profileId, dateStr, dateStr) as any[];
  const isOff = offDays.includes(DAY_NAMES[d.getDay()]) || leaves.length > 0;
  if (isOff) {
    d.setDate(d.getDate() + 1);
    if (d.getTime() - date.getTime() > 14 * 24 * 3600 * 1000) return d;
    return nextWorkingDay(d, profileId);
  }
  return d;
}

// Find the best available video editor based on shift schedule and workload
async function findBestVideoEditor(): Promise<number | null> {
  const now = new Date();
  const currentDay = DAY_NAMES[now.getDay()].toLowerCase();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const editors = await prepare(`
    SELECT id, full_name, shift_type, shift_start, shift_end, weekly_off
    FROM profiles
    WHERE role = 'video_editor' AND is_active = 1
  `).all() as any[];

  let bestEditor: { id: number; workload: number } | null = null;

  for (const ed of editors) {
    let offDays: string[] = [];
    try { offDays = ed.weekly_off ? JSON.parse(ed.weekly_off) : []; } catch { offDays = []; }
    if (offDays.map(d => d.toLowerCase()).includes(currentDay)) continue;

    const dateStr = now.toISOString().slice(0, 10);
    const onLeave = await prepare("SELECT 1 FROM leaves WHERE profile_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?")
      .get(ed.id, dateStr, dateStr) as any;
    if (onLeave) continue;

    let shiftStart = 0, shiftEnd = 24 * 60;
    if (ed.shift_start) {
      const [h, m] = ed.shift_start.split(':').map(Number);
      shiftStart = h * 60 + m;
    }
    if (ed.shift_end) {
      const [h, m] = ed.shift_end.split(':').map(Number);
      shiftEnd = h * 60 + m;
    }
    const inShift = shiftStart <= shiftEnd
      ? currentTime >= shiftStart && currentTime < shiftEnd
      : currentTime >= shiftStart || currentTime < shiftEnd;
    if (!inShift) continue;

    const workload = await prepare(`
      SELECT COUNT(*) as c
      FROM tasks
      WHERE video_editor_id = ? AND status IN ('editor_assigned','teleprompter_ready','recording_done','editing','uploading')
    `).get(ed.id) as any;
    const count = workload?.c || 0;

    if (!bestEditor || count < bestEditor.workload) {
      bestEditor = { id: ed.id, workload: count };
    }
  }

  return bestEditor?.id || null;
}

// Anchor subtask vocabulary (anchor_tasks.status)
const ANCHOR_TRANSITIONS: Record<string, string[]> = {
  pending: ['script_writing', 'cancelled'],
  script_writing: ['footage_gathering', 'cancelled'],
  footage_gathering: ['confirmation', 'cancelled'],
  confirmation: ['approved', 'cancelled'],
  approved: ['video_editor_assigned', 'cancelled'],
  video_editor_assigned: ['teleprompter', 'cancelled'],
  teleprompter: ['recording', 'cancelled'],
  recording: ['published', 'cancelled'],
  published: [],
  cancelled: [],
};

const anchorToTaskStatus: Record<string, string> = {
  script_writing: 'script_writing',
  footage_gathering: 'footage_collection',
  confirmation: 'waiting_confirmation',
  approved: 'approved',
  video_editor_assigned: 'editor_assigned',
  teleprompter: 'teleprompter_ready',
  recording: 'recording_done',
  published: 'under_review',
  cancelled: 'cancelled',
};

const EDITOR_TRANSITIONS: Record<string, string[]> = {
  pending: ['editing'],
  editing: ['production'],
  production: ['uploaded'],
  uploaded: ['verified'],
  verified: ['reviewed'],
  reviewed: [],
};

const editorToTaskStatus: Record<string, string> = {
  editing: 'editing',
  production: 'editing',
  uploaded: 'uploading',
  verified: 'uploading',
  reviewed: 'under_review',
};

function canReadTask(task: any, user: any): boolean {
  if (!task) return false;
  if (user.access_level <= 2) return true;
  return task.assigned_to === user.profile_id || task.assigned_by === user.profile_id || task.video_editor_id === user.profile_id;
}

function canUpdateTask(task: any, user: any): boolean {
  if (!task) return false;
  if (user.access_level <= 2) return true;
  return task.assigned_to === user.profile_id || task.assigned_by === user.profile_id;
}

// Apply a task status change only when it is a legal transition
async function applyTaskStatus(taskId: number, currentStatus: string, target: string) {
  const allowed = TASK_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(target)) return false;
  await prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(target, taskId);
  return true;
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { status: qStatus, assigned_to, priority, limit, time, bulletin_date, all_tasks } = req.query;

  let sql = `
    SELECT t.*, a.full_name as assigned_to_name, a.role as assigned_to_role, a.access_level as assigned_to_level,
      b.full_name as assigned_by_name, ve.full_name as video_editor_name,
      r.name as reporter_name, r.location as reporter_location,
      ar.name as archive_name, ar.details as archive_details, ar.location as archive_location,
      lc.name as location_name, lc.region as location_region,
      bl.title as bulletin_title, bt.name as bulletin_template_name, bt.publish_time as bulletin_template_time,
      (SELECT COUNT(*) FROM task_collaborators tc JOIN profiles cp ON cp.id = tc.profile_id WHERE tc.task_id = t.id AND (cp.access_level IS NULL OR cp.access_level > 1)) as collaborator_count
    FROM tasks t
    LEFT JOIN profiles a ON t.assigned_to = a.id
    LEFT JOIN profiles b ON t.assigned_by = b.id
    LEFT JOIN profiles ve ON t.video_editor_id = ve.id
    LEFT JOIN reporters r ON t.reporter_id = r.id
    LEFT JOIN archives ar ON t.archive_id = ar.id
    LEFT JOIN locations lc ON t.location_id = lc.id
    LEFT JOIN bulletins bl ON t.bulletin_id = bl.id
    LEFT JOIN bulletin_templates bt ON t.bulletin_template_id = bt.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (qStatus) { sql += ' AND t.status = ?'; params.push(qStatus); }
  if (assigned_to) { sql += ' AND t.assigned_to = ?'; params.push(assigned_to); }
  if (priority) { sql += ' AND t.priority = ?'; params.push(priority); }
  if (bulletin_date === 'today') { sql += ' AND t.bulletin_date = ?'; params.push(todayLocalStr()); }
  else if (time === 'today') { sql += " AND date(t.created_at) = date('now')"; }
  else if (time === 'yesterday') { sql += " AND date(t.created_at) = date('now', '-1 day')"; }
  else if (time === 'week') { sql += " AND t.created_at >= datetime('now', '-7 days')"; }
  else if (time === 'month') { sql += " AND t.created_at >= datetime('now', '-30 days')"; }

  if (req.user!.access_level === 3 && all_tasks !== 'true') {
    sql += ' AND (t.assigned_to = ? OR t.assigned_by = ? OR t.video_editor_id = ?)';
    params.push(req.user!.profile_id, req.user!.profile_id, req.user!.profile_id);
  }

  sql += ' ORDER BY t.created_at DESC';
  const limitNum = parseInt(limit as string, 10);
  if (!isNaN(limitNum) && limitNum > 0) sql += ` LIMIT ${limitNum}`;
  const tasks = await prepare(sql).all(...params);

  // Exclude trashed tasks unless explicitly filtering for them
  const filteredTasks = qStatus === 'trashed' ? tasks : (tasks as any[]).filter((t: any) => t.status !== 'trashed');

  const now = new Date();
  const nowMs = now.getTime();
  const terminalStatuses = ['completed', 'cancelled', 'published', 'under_review'];
  for (const task of filteredTasks as any[]) {
    if (!task.bulletin_template_id || !task.bulletin_template_time) {
      if (task.deadline && !terminalStatuses.includes(task.status)) {
        const dl = String(task.deadline);
        const deadlineMs = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(dl) ? dl : dl.replace(' ', 'T') + 'Z').getTime();
        if (deadlineMs < nowMs) {
          await prepare("UPDATE tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(task.id);
          task.status = 'cancelled';
        }
      }
      continue;
    }
    const [h, m] = task.bulletin_template_time.split(':').map(Number);
    const pubTimeToday = new Date();
    pubTimeToday.setHours(h, m, 0, 0);
    const pubMs = pubTimeToday.getTime();
    const graceMs = 60 * 60 * 1000;
    if (!terminalStatuses.includes(task.status) && !task.deadline_extended) {
      const expectedDeadline = pubMs > nowMs ? pubTimeToday : new Date(nowMs + 60 * 60 * 1000);
      const expectedStr = expectedDeadline.toISOString().slice(0, 19).replace('T', ' ');
      if (task.deadline !== expectedStr) {
        await prepare("UPDATE tasks SET deadline = ?, updated_at = datetime('now') WHERE id = ?").run(expectedStr, task.id);
        task.deadline = expectedStr;
      }
      if (pubMs + graceMs < nowMs) {
        await prepare("UPDATE tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(task.id);
        task.status = 'cancelled';
      }
    }
  }

  res.json(filteredTasks);
});

router.get('/trashed', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Access denied. Only managers and admins can view the recycle bin.' });
  const tasks = await prepare(`
    SELECT t.*, a.full_name as assigned_to_name, a.role as assigned_to_role,
      b.full_name as assigned_by_name, ve.full_name as video_editor_name,
      bl.title as bulletin_title
    FROM tasks t
    LEFT JOIN profiles a ON t.assigned_to = a.id
    LEFT JOIN profiles b ON t.assigned_by = b.id
    LEFT JOIN profiles ve ON t.video_editor_id = ve.id
    LEFT JOIN bulletins bl ON t.bulletin_id = bl.id
    WHERE t.status = 'trashed'
    ORDER BY t.updated_at DESC
  `).all();
  res.json(tasks);
});

// Published/finished tasks (registered before /:id so it is not shadowed)
router.get('/published', authenticate, async (req: AuthRequest, res: Response) => {
  const { time } = req.query;
  let sql = `
    SELECT t.*, a.full_name as assigned_to_name, a.role as assigned_to_role,
      b.full_name as assigned_by_name, ve.full_name as video_editor_name,
      bl.title as bulletin_title
    FROM tasks t
    LEFT JOIN profiles a ON t.assigned_to = a.id
    LEFT JOIN profiles b ON t.assigned_by = b.id
    LEFT JOIN profiles ve ON t.video_editor_id = ve.id
    LEFT JOIN bulletins bl ON t.bulletin_id = bl.id
    WHERE t.status IN ('published','under_review','completed')
  `;
  const params: any[] = [];
  if (time === 'today') { sql += " AND date(t.created_at) = date('now')"; }
  else if (time === 'week') { sql += " AND t.created_at >= datetime('now', '-7 days')"; }
  else if (time === 'month') { sql += " AND t.created_at >= datetime('now', '-30 days')"; }
  if (req.user!.access_level === 3) {
    sql += ' AND (t.assigned_to = ? OR t.assigned_by = ? OR t.video_editor_id = ?)';
    params.push(req.user!.profile_id, req.user!.profile_id, req.user!.profile_id);
  }
  sql += ' ORDER BY t.updated_at DESC';
  const tasks = await prepare(sql).all(...params);
  res.json(tasks);
});

// Recent distinct news-item locations (for autocomplete)
router.get('/locations/recent', authenticate, async (req: AuthRequest, res: Response) => {
  const rows = await prepare(`
    SELECT location FROM task_news_items
    WHERE location IS NOT NULL AND location != ''
      AND created_at >= datetime('now', '-30 days')
    GROUP BY location
    ORDER BY MAX(created_at) DESC LIMIT 20
  `).all() as any[];
  res.json(rows.map(r => r.location));
});

// Get pending tasks needing approval (registered before /:id so it is not shadowed)
router.get('/pending-approval', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only managers and admins can view pending approvals.' });
  const tasks = await prepare(`
    SELECT t.id, t.title, t.priority, t.task_type, t.created_at, p.full_name as assigned_by_name
    FROM tasks t
    LEFT JOIN profiles p ON t.assigned_by = p.id
    WHERE t.status = 'waiting_confirmation' ORDER BY
      CASE WHEN t.priority IN ('urgent','high') THEN 0 ELSE 1 END,
      t.created_at DESC
    LIMIT 20
  `).all();
  res.json(tasks);
});

// Public read-only: teleprompter script for the studio screen (no auth)
router.get('/teleprompter/script/:id', async (req: AuthRequest, res: Response) => {
  const row = await prepare(`
    SELECT t.id as task_id, t.title as task_title, at.script, p.full_name as anchor_name
    FROM tasks t
    LEFT JOIN anchor_tasks at ON at.task_id = t.id
    LEFT JOIN profiles p ON p.id = t.assigned_to
    WHERE t.id = ? AND t.status IN ('teleprompter_ready','prompting','recording_done','editing','uploading','under_review','completed')
      AND at.script IS NOT NULL AND at.script != ''
  `).get(req.params.id);
  if (row) {
    return res.json({ task_id: row.task_id, task_title: row.task_title, script: row.script, anchor_name: row.anchor_name || '', is_task: true });
  }
  const task = await prepare("SELECT id, title FROM tasks WHERE id = ? AND status IN ('teleprompter_ready','prompting','recording_done','editing','uploading','under_review','completed')").get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Script not found.' });
  const items = await prepare('SELECT slug, news_script FROM task_news_items WHERE task_id = ? ORDER BY sort_order ASC').all(req.params.id) as any[];
  if (items.length === 0) return res.status(404).json({ error: 'Script not found.' });
  const anchor = await prepare('SELECT full_name FROM profiles WHERE id = (SELECT assigned_to FROM tasks WHERE id = ?)').get(req.params.id) as any;
  const script = items.map((i) => `# ${i.slug || 'News'}\n\n${i.news_script || ''}`).join('\n\n---\n\n');
  res.json({ task_id: task.id, task_title: task.title, script, anchor_name: anchor?.full_name || '', is_task: true });
});

// Public read-only: tasks currently ready to record on the teleprompter (no auth)
router.get('/teleprompter/ready', async (_req: AuthRequest, res: Response) => {
  const rows = await prepare(`
    SELECT t.id as task_id, t.title as task_title, t.status, t.script_imported_at,
      p.full_name as anchor_name
    FROM tasks t
    LEFT JOIN anchor_tasks at ON at.task_id = t.id
    LEFT JOIN profiles p ON p.id = t.assigned_to
    WHERE t.status IN ('teleprompter_ready','prompting')
      AND ((at.script IS NOT NULL AND at.script != '')
        OR EXISTS (SELECT 1 FROM task_news_items ni WHERE ni.task_id = t.id AND ni.news_script IS NOT NULL AND ni.news_script != ''))
    ORDER BY COALESCE(${scriptImportedTs()}, t.updated_at) DESC
  `).all();
  res.json(rows);
});

// Public read-only: previously loaded task scripts for the teleprompter studio screen (no auth).
// Defaults to today's loaded scripts (server-local date); pass ?archive=1 for scripts loaded on previous days.
router.get('/teleprompter/history', async (req: AuthRequest, res: Response) => {
  const archive = req.query.archive === '1';
  const tzOffset = -new Date().getTimezoneOffset();
  const tzModifier = `${tzOffset >= 0 ? '+' : '-'}${Math.abs(tzOffset)} minutes`;
  const loadedDate = isPostgres()
    ? `(COALESCE(${scriptImportedTs()}, t.updated_at) + INTERVAL '${tzModifier}')::date`
    : `date(COALESCE(t.script_imported_at, t.updated_at), '${tzModifier}')`;
  const nowDate = isPostgres()
    ? `(NOW() + INTERVAL '${tzModifier}')::date`
    : `date('now', '${tzModifier}')`;
  const dateCond = archive
    ? `${loadedDate} < ${nowDate}`
    : `${loadedDate} = ${nowDate}`;
  const rows = await prepare(`
    SELECT t.id as task_id, t.title as task_title, t.status, t.script_imported_at,
      p.full_name as anchor_name
    FROM tasks t
    LEFT JOIN anchor_tasks at ON at.task_id = t.id
    LEFT JOIN profiles p ON p.id = t.assigned_to
    WHERE t.status IN ('teleprompter_ready','prompting','recording_done','editing','uploading','under_review','completed')
      AND (t.script_imported_at IS NOT NULL OR (at.script IS NOT NULL AND at.script != ''))
      AND ${dateCond}
    ORDER BY COALESCE(${scriptImportedTs()}, t.updated_at) DESC
    LIMIT 30
  `).all();
  res.json(rows);
});

// Public: mark prompting as started when the anchor presses Start on the teleprompter.
router.post('/teleprompter/start/:id', async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.status !== 'teleprompter_ready') {
    return res.json({ success: true, skipped: true, task_id: task.id, status: task.status });
  }
  await applyTaskStatus(task.id, task.status, 'prompting');
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(null, 'prompting_started', 'tasks', task.id, `Prompting started: ${task.title}`);  emitEvent('task:updated', { id: task.id, status: 'prompting' });
  res.json({ success: true, task_id: task.id, status: 'prompting' });
});

// Public: mark recording finished when the teleprompter script reaches the end.
// Auto-completes the recording_done stage and pushes the task to the editor (editing).
// Marks the current task AND related tasks (same bulletin template slot).
router.post('/teleprompter/finish/:id', async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.status !== 'teleprompter_ready' && task.status !== 'prompting') {
    return res.json({ success: true, skipped: true, task_id: task.id, status: task.status });
  }

  const updated: number[] = [task.id];
  await applyTaskStatus(task.id, task.status, 'recording_done');
  await applyTaskStatus(task.id, 'recording_done', 'editing');
  await prepare("UPDATE anchor_tasks SET status = 'recording', updated_at = datetime('now') WHERE task_id = ?").run(task.id);

  const autoAssignEditor = async (tid: number, title: string) => {
    const editorId = await findBestVideoEditor();
    if (!editorId) return;
    await prepare('UPDATE tasks SET video_editor_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(editorId, tid);
    const existing = await prepare('SELECT id FROM video_editor_tasks WHERE task_id = ?').get(tid);
    if (!existing) {
      await prepare('INSERT INTO video_editor_tasks (task_id, status) VALUES (?,?)').run(tid, 'pending');
    }
    await createNotification(editorId, null, 'task_assigned', 'tasks', tid, `Assigned: ${title}`);
  };
  await autoAssignEditor(task.id, task.title);

  if (task.bulletin_template_id) {
    const related = await prepare(`
      SELECT id, status, title FROM tasks
      WHERE bulletin_template_id = ? AND status IN ('teleprompter_ready','prompting') AND id != ?
    `).all(task.bulletin_template_id, task.id) as any[];
    for (const r of related) {
      await applyTaskStatus(r.id, r.status, 'recording_done');
      await applyTaskStatus(r.id, 'recording_done', 'editing');
      await prepare("UPDATE anchor_tasks SET status = 'recording', updated_at = datetime('now') WHERE task_id = ?").run(r.id);
      await autoAssignEditor(r.id, r.title);
      updated.push(r.id);
    }
  }

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(null, 'recording_finished', 'tasks', task.id, `Teleprompter recording finished and sent to editing: ${task.title}`);
  createNotification(task.assigned_by, null, 'recording_finished', 'tasks', task.id, `Recording finished — sent to editor: ${task.title}`);

  updated.forEach((tid) => emitEvent('task:updated', { id: tid, status: 'editing' }));
  res.json({ success: true, task_id: task.id, status: 'editing', related: updated });
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare(`
    SELECT t.*, a.full_name as assigned_to_name, a.role as assigned_to_role, a.access_level as assigned_to_level,
      b.full_name as assigned_by_name, b.role as assigned_by_role, ve.full_name as video_editor_name,
      rv.full_name as reviewer_name, r.name as reporter_name, r.location as reporter_location,
      ar.name as archive_name, ar.details as archive_details, ar.location as archive_location,
      lc.name as location_name, lc.region as location_region,
      bl.title as bulletin_title, bt.name as bulletin_template_name, bt.publish_time as bulletin_template_time,
      (SELECT COUNT(*) FROM task_collaborators tc JOIN profiles cp ON cp.id = tc.profile_id WHERE tc.task_id = t.id AND (cp.access_level IS NULL OR cp.access_level > 1)) as collaborator_count
    FROM tasks t
    LEFT JOIN profiles a ON t.assigned_to = a.id
    LEFT JOIN profiles b ON t.assigned_by = b.id
    LEFT JOIN profiles ve ON t.video_editor_id = ve.id
    LEFT JOIN profiles rv ON t.reviewer_id = rv.id
    LEFT JOIN reporters r ON t.reporter_id = r.id
    LEFT JOIN archives ar ON t.archive_id = ar.id
    LEFT JOIN locations lc ON t.location_id = lc.id
    LEFT JOIN bulletins bl ON t.bulletin_id = bl.id
    LEFT JOIN bulletin_templates bt ON t.bulletin_template_id = bt.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canReadTask(task, req.user)) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });

  const anchorTask = await prepare('SELECT * FROM anchor_tasks WHERE task_id = ?').get(req.params.id);
  const editorTask = await prepare('SELECT * FROM video_editor_tasks WHERE task_id = ?').get(req.params.id);

  let roleData = task.role_data;
  try { roleData = roleData ? JSON.parse(roleData) : null; } catch { roleData = null; }

  res.json({ ...task, anchor_task: anchorTask, video_editor_task: editorTask, role_data: roleData });
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const allowedRoles = ['admin', 'executive_editor', 'video_editor', 'anchor', 'reporter', 'input_desk', 'output_desk'];
  if (user.access_level > 2 && !allowedRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Not authorized to create tasks.' });
  }
  const { title, description, bulletin_id, assigned_to, priority, task_type, deadline, role_data, bulletin_template_id, footage_source, reporter_id, archive_id, location_id, bulletin_date } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority value.' });
  }

  // The frontend sends its local calendar day so bulletin slots line up with the
  // local date (date('now') is UTC and drifts by up to 5:30h for IST).
  const targetDate = bulletin_date || new Date().toISOString().slice(0, 10);

  if (bulletin_template_id) {
    const existing = await prepare("SELECT id FROM tasks WHERE bulletin_template_id = ? AND bulletin_date = ? AND status NOT IN ('completed','cancelled','trashed','under_review','published')").get(bulletin_template_id, targetDate);
    if (existing) {
      return res.status(409).json({ error: 'This slot already has an active task assigned for today.' });
    }
  }

  const finalAssignee = assigned_to || (user.role === 'video_editor' ? req.user!.profile_id : null);

  const rd = role_data ? JSON.stringify(role_data) : null;

  const finalDeadline = deadline ? new Date(deadline.replace(' ', 'T')).toISOString().slice(0, 19).replace('T', ' ') : await (async () => {
    if (bulletin_template_id) {
      const template = await prepare('SELECT publish_time FROM bulletin_templates WHERE id = ?').get(bulletin_template_id) as any;
      if (template?.publish_time) {
        const [h, m] = template.publish_time.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        const now = new Date();
        if (d.getTime() <= now.getTime()) {
          d.setTime(now.getTime() + 60 * 60 * 1000);
        }
        return d.toISOString().slice(0, 19).replace('T', ' ');
      }
    }
    if (finalAssignee) {
      const assigneeProfile = await prepare('SELECT shift_end, shift_type FROM profiles WHERE id = ?').get(finalAssignee) as any;
      if (assigneeProfile?.shift_end) {
        const now = new Date();
        const [sh, sm] = assigneeProfile.shift_end.split(':').map(Number);
        const deadlineDate = new Date();
        deadlineDate.setHours(sh, sm, 0, 0);
        if (deadlineDate.getTime() <= now.getTime()) {
          deadlineDate.setDate(deadlineDate.getDate() + 1);
        }
        const workingDay = await nextWorkingDay(deadlineDate, finalAssignee);
        return workingDay.toISOString().slice(0, 19).replace('T', ' ');
      }
    }
    const d = new Date();
    d.setHours(d.getHours() + 8);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  })();

  const uid = await nextUid('TSK', 'tasks');
  const finalArchiveId = archive_id ? Number(archive_id) : null;
  if (finalArchiveId) {
    const arch = await prepare('SELECT id FROM archives WHERE id = ?').get(finalArchiveId);
    if (!arch) return res.status(400).json({ error: 'Selected archive entry not found.' });
  }
  const finalLocationId = location_id ? Number(location_id) : null;
  if (finalLocationId) {
    const loc = await prepare('SELECT id FROM locations WHERE id = ?').get(finalLocationId);
    if (!loc) return res.status(400).json({ error: 'Selected location not found.' });
  }
  const result = await prepare(`
    INSERT INTO tasks (uid, title, description, bulletin_id, assigned_by, assigned_to, priority, task_type, role_data, bulletin_template_id, footage_source, reporter_id, archive_id, location_id, deadline, status, bulletin_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(uid, title, description || '', bulletin_id || null, req.user!.profile_id, finalAssignee, priority || 'medium', task_type || 'general', rd, bulletin_template_id || null, footage_source || null, reporter_id || null, finalArchiveId, finalLocationId, finalDeadline, 'draft', targetDate);

  if (finalArchiveId) {
    await prepare("UPDATE archives SET usage_count = usage_count + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(finalArchiveId);
  }
  if (finalLocationId) {
    await prepare("UPDATE locations SET usage_count = usage_count + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(finalLocationId);
  }

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'create_task', 'tasks', result.lastInsertRowid, `Created task: ${title}`);

  if (finalAssignee && finalAssignee !== req.user!.profile_id) {
    createNotification(finalAssignee, req.user!.profile_id, 'task_assigned', 'tasks', result.lastInsertRowid, `Assigned: ${title}`);
  }

  // Track collaborators
  await trackCollaborator(result.lastInsertRowid as number, req.user!.profile_id);
  if (finalAssignee && finalAssignee !== req.user!.profile_id) {
    await trackCollaborator(result.lastInsertRowid as number, finalAssignee);
  }

  emitEvent('task:created', { id: result.lastInsertRowid, title: req.body.title || '', assigned_to: req.body.assigned_to, created_by: req.user!.profile_id });

  // Auto-create video_editor_tasks for video_edit tasks or video editor assignees
  if (task_type === 'video_edit' || finalAssignee) {
    let editorId: number | null = null;
    if (finalAssignee) {
      const ap = await prepare('SELECT role FROM profiles WHERE id = ?').get(finalAssignee) as any;
      if (ap?.role === 'video_editor') editorId = finalAssignee;
    } else if (task_type === 'video_edit') {
      // Auto-assign best available video editor based on shift and workload
      editorId = await findBestVideoEditor();
    }
    if (editorId || task_type === 'video_edit') {
      if (editorId) await prepare('UPDATE tasks SET video_editor_id = ? WHERE id = ?').run(editorId, result.lastInsertRowid);
      await prepare('INSERT INTO video_editor_tasks (task_id, status) VALUES (?,?)').run(result.lastInsertRowid, 'pending');
    }
  }

  taskBackup(req, `Task created: ${req.body.title || `#${result.lastInsertRowid}`}`);
  res.status(201).json({ id: result.lastInsertRowid, ...req.body });
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const { status, remarks, priority, assigned_to, role_data, bulletin_template_id, youtube_url, youtube_title, youtube_description, youtube_keywords, footage_source, reporter_id, archive_id, location_id, correction_response, script_imported_at,
    headline, slug, main_story, closing, visual_cues, pronunciation_notes, source_reference, duration,
    camera_footage, reporter_footage, mobile_videos, photos, drone_shots, logos, graphics, archive_footage,
    facebook_link, instagram_link, website_link } = req.body;

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority value.' });
  }

  const canUpdate = req.user!.access_level <= 2 ||
    req.user!.profile_id === task.assigned_to || req.user!.profile_id === task.assigned_by ||
    // Self-pickup: any staff member may claim an unassigned task by assigning it to themselves
    (!task.assigned_to && assigned_to === req.user!.profile_id);

  if (!canUpdate) {
    return res.status(403).json({ error: 'Not authorized to update this task.' });
  }

  const fromStatus = task.status;

  if (status) {
    if (!VALID_TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }
    const allowed = TASK_TRANSITIONS[task.status] || [];
    const bulletinJump = task.bulletin_template_id && status === 'waiting_confirmation' && ['draft', 'correction_required', 'script_writing', 'footage_collection'].includes(task.status);
    const isAdminOverride = req.user!.access_level <= 2;
    if (!isAdminOverride && !allowed.includes(status) && !bulletinJump) {
      return res.status(400).json({ error: `Cannot transition from '${task.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}` });
    }
    if (status === 'published') {
      const yt = req.body.youtube_url || task.youtube_url;
      if (!yt || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(yt)) {
        return res.status(400).json({ error: 'A valid YouTube URL is required before publishing.' });
      }
    }
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
    if (status === 'completed') {
      updates.push("completed_at = datetime('now')");
      updates.push("version_number = COALESCE(version_number, 0) + 1");
    }
  }
  if (remarks !== undefined) { updates.push('remarks = ?'); params.push(remarks); }
  if (priority) { updates.push('priority = ?'); params.push(priority); }
  if (assigned_to !== undefined) {
    updates.push('assigned_to = ?'); params.push(assigned_to);
    if (assigned_to === null || assigned_to === '') {
      updates.push('video_editor_id = NULL');
      await prepare('DELETE FROM video_editor_tasks WHERE task_id = ?').run(req.params.id);
    }
  }
  if (role_data !== undefined) { updates.push('role_data = ?'); params.push(JSON.stringify(role_data)); }
  if (bulletin_template_id !== undefined) { updates.push('bulletin_template_id = ?'); params.push(bulletin_template_id); }
  if (youtube_url !== undefined) { updates.push('youtube_url = ?'); params.push(youtube_url); }
  if (youtube_title !== undefined) { updates.push('youtube_title = ?'); params.push(youtube_title); }
  if (youtube_description !== undefined) { updates.push('youtube_description = ?'); params.push(youtube_description); }
  if (youtube_keywords !== undefined) { updates.push('youtube_keywords = ?'); params.push(youtube_keywords); }
  if (footage_source !== undefined) { updates.push('footage_source = ?'); params.push(footage_source); }
  if (reporter_id !== undefined) { updates.push('reporter_id = ?'); params.push(reporter_id || null); }
  if (archive_id !== undefined) { updates.push('archive_id = ?'); params.push(archive_id || null); }
  if (location_id !== undefined) { updates.push('location_id = ?'); params.push(location_id || null); }
  if (correction_response !== undefined) { updates.push('correction_response = ?'); params.push(correction_response); }
  if (script_imported_at !== undefined) { updates.push('script_imported_at = ?'); params.push(script_imported_at); }
  if (headline !== undefined) { updates.push('headline = ?'); params.push(headline); }
  if (slug !== undefined) { updates.push('slug = ?'); params.push(slug); }
  if (main_story !== undefined) { updates.push('main_story = ?'); params.push(main_story); }
  if (closing !== undefined) { updates.push('closing = ?'); params.push(closing); }
  if (visual_cues !== undefined) { updates.push('visual_cues = ?'); params.push(visual_cues); }
  if (pronunciation_notes !== undefined) { updates.push('pronunciation_notes = ?'); params.push(pronunciation_notes); }
  if (source_reference !== undefined) { updates.push('source_reference = ?'); params.push(source_reference); }
  if (duration !== undefined) { updates.push('duration = ?'); params.push(duration); }
  if (camera_footage !== undefined) { updates.push('camera_footage = ?'); params.push(camera_footage); }
  if (reporter_footage !== undefined) { updates.push('reporter_footage = ?'); params.push(reporter_footage); }
  if (mobile_videos !== undefined) { updates.push('mobile_videos = ?'); params.push(mobile_videos); }
  if (photos !== undefined) { updates.push('photos = ?'); params.push(photos); }
  if (drone_shots !== undefined) { updates.push('drone_shots = ?'); params.push(drone_shots); }
  if (logos !== undefined) { updates.push('logos = ?'); params.push(logos); }
  if (graphics !== undefined) { updates.push('graphics = ?'); params.push(graphics); }
  if (archive_footage !== undefined) { updates.push('archive_footage = ?'); params.push(archive_footage); }
  if (facebook_link !== undefined) { updates.push('facebook_link = ?'); params.push(facebook_link); }
  if (instagram_link !== undefined) { updates.push('instagram_link = ?'); params.push(instagram_link); }
  if (website_link !== undefined) { updates.push('website_link = ?'); params.push(website_link); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    await prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (status === 'editor_assigned' && fromStatus !== 'editor_assigned') {
    let editorId = task.video_editor_id || (await findBestVideoEditor());
    if (editorId) {
      await prepare('UPDATE tasks SET video_editor_id = ? WHERE id = ?').run(editorId, task.id);
      const existing = await prepare('SELECT id FROM video_editor_tasks WHERE task_id = ?').get(task.id);
      if (!existing) await prepare('INSERT INTO video_editor_tasks (task_id, status) VALUES (?,?)').run(task.id, 'pending');
      createNotification(editorId, req.user!.profile_id, 'task_assigned', 'tasks', task.id, `Assigned: ${task.title}`);
    }
  }

  logAudit(task.id, req.user!.profile_id, req.user!.full_name || '', 'update_task', fromStatus, status || task.status, req.body.remarks || '');
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_task', 'tasks', task.id, `Updated task: ${task.title}`);

  if (status && req.user!.profile_id !== task.assigned_by) {
    createNotification(task.assigned_by, req.user!.profile_id, 'task_updated', 'tasks', task.id, `Updated: ${task.title}`);
  }
  if (status === 'completed') {
    createNotification(task.assigned_by, req.user!.profile_id, 'task_completed', 'tasks', task.id, `Completed: ${task.title}`);
  }
  if (assigned_to && assigned_to !== task.assigned_to) {
    createNotification(assigned_to, req.user!.profile_id, 'task_assigned', 'tasks', task.id, `Assigned: ${task.title}`);
    if (task.task_type === 'video_edit') {
      const ap = await prepare('SELECT role FROM profiles WHERE id = ?').get(assigned_to) as any;
      if (ap?.role === 'video_editor') {
        await prepare('UPDATE tasks SET video_editor_id = ? WHERE id = ?').run(assigned_to, task.id);
      } else {
        const editorId = task.video_editor_id || (await findBestVideoEditor());
        if (editorId) await prepare('UPDATE tasks SET video_editor_id = ? WHERE id = ?').run(editorId, task.id);
      }
      const existing = await prepare('SELECT id FROM video_editor_tasks WHERE task_id = ?').get(task.id);
      if (!existing) await prepare('INSERT INTO video_editor_tasks (task_id, status) VALUES (?,?)').run(task.id, 'editing');
    }
  }

  await trackCollaborator(task.id, req.user!.profile_id);
  if (assigned_to && assigned_to !== task.assigned_to) {
    await trackCollaborator(task.id, assigned_to);
  }

  const emitAssignedTo = assigned_to || task.assigned_to;
  emitEvent('task:updated', { id: task.id, title: task.title, status: req.body.status, assigned_to: emitAssignedTo, updated_by: req.user!.profile_id, updated_by_name: req.user!.full_name || req.user!.username });
  taskBackup(req, `Task updated: #${task.id} ${req.body.status ? `-> ${req.body.status}` : ''}`);
  res.json({ success: true });
});

router.post('/:id/reassign', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { user_id, deadline } = req.body;
  if (!user_id) return res.status(400).json({ error: 'User ID required.' });
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const newUser = await prepare('SELECT id, role FROM profiles WHERE id = ?').get(Number(user_id)) as any;
  if (!newUser) return res.status(404).json({ error: 'User not found.' });
  
  if (task.task_type === 'bulletin' && newUser.role !== 'anchor') {
    return res.status(400).json({ error: 'Bulletin tasks can only be assigned to anchor users.' });
  }

  let newDeadline = task.deadline;
  if (deadline) {
    newDeadline = new Date(deadline.replace(' ', 'T')).toISOString().slice(0, 19).replace('T', ' ');
  } else {
    const newAssignee = await prepare('SELECT shift_end FROM profiles WHERE id = ?').get(Number(user_id)) as any;
    if (newAssignee?.shift_end) {
      const now = new Date();
      const [sh, sm] = newAssignee.shift_end.split(':').map(Number);
      const deadlineDate = new Date();
      deadlineDate.setHours(sh, sm, 0, 0);
      if (deadlineDate.getTime() <= now.getTime()) {
        deadlineDate.setDate(deadlineDate.getDate() + 1);
      }
      newDeadline = (await nextWorkingDay(deadlineDate, Number(user_id))).toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  const statusReset = task.status === 'cancelled' ? ", status = 'draft', deadline_extended = 0" : '';
  await prepare(`UPDATE tasks SET assigned_to = ?, deadline = ?, updated_at = datetime('now')${statusReset} WHERE id = ?`).run(Number(user_id), newDeadline, task.id);
  await trackCollaborator(task.id, Number(user_id));
  if (task.assigned_to && task.assigned_to !== Number(user_id)) {
    createNotification(task.assigned_to, req.user!.profile_id, 'task_unassigned', 'tasks', task.id, `Unassigned: ${task.title}`);
  }
  createNotification(Number(user_id), req.user!.profile_id, 'task_assigned', 'tasks', task.id, `Assigned: ${task.title}`);
  // Auto-create video_editor_tasks if reassigning to a video editor
  const ap = await prepare('SELECT role FROM profiles WHERE id = ?').get(Number(user_id)) as any;
  if (ap?.role === 'video_editor' || task.task_type === 'video_edit') {
    await prepare('UPDATE tasks SET video_editor_id = ? WHERE id = ?').run(Number(user_id), task.id);
    const existing = await prepare('SELECT id FROM video_editor_tasks WHERE task_id = ?').get(task.id);
    if (!existing) await prepare('INSERT INTO video_editor_tasks (task_id, status) VALUES (?,?)').run(task.id, 'pending');
  } else {
    // Reassigned away from editing — drop the stale editor linkage
    await prepare('DELETE FROM video_editor_tasks WHERE task_id = ?').run(task.id);
    await prepare('UPDATE tasks SET video_editor_id = NULL WHERE id = ?').run(task.id);
  }
  const oldAssignee = task.assigned_to ? await prepare('SELECT full_name FROM profiles WHERE id = ?').get(task.assigned_to) as any : null;
  const newAssigneeName = await prepare('SELECT full_name FROM profiles WHERE id = ?').get(Number(user_id)) as any;
  const oldName = oldAssignee?.full_name || (task.assigned_to ? `User #${task.assigned_to}` : 'unassigned');
  const newName = newAssigneeName?.full_name || `User #${user_id}`;
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'reassign_task', 'tasks', task.id, `Reassigned from ${oldName} to ${newName} | Deadline: ${newDeadline} | Task: ${task.title}`);
  taskBackup(req, `Task reassigned: #${task.id} to ${newName}`);
  res.json({ success: true, task_id: task.id, assigned_to: Number(user_id), new_deadline: newDeadline });
});

router.put('/:id/assign-editor', authenticate, async (req: AuthRequest, res: Response) => {
  const { video_editor_id } = req.body;
  if (!video_editor_id) return res.status(400).json({ error: 'video_editor_id required.' });
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canUpdateTask(task, req.user)) return res.status(403).json({ error: 'Not authorized to assign an editor to this task.' });

  const editor = await prepare('SELECT id FROM profiles WHERE id = ? AND is_active = 1').get(Number(video_editor_id)) as any;
  if (!editor) return res.status(404).json({ error: 'Video editor not found.' });

  await prepare('UPDATE tasks SET video_editor_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(Number(video_editor_id), task.id);
  await applyTaskStatus(task.id, task.status, 'editor_assigned');

  const existing = await prepare('SELECT id FROM video_editor_tasks WHERE task_id = ?').get(task.id);
  if (!existing) {
    await prepare('INSERT INTO video_editor_tasks (task_id, status) VALUES (?,?)').run(task.id, 'pending');
  }

  createNotification(Number(video_editor_id), req.user!.profile_id, 'task_assigned', 'tasks', task.id, `Assigned: ${task.title}`);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'assign_editor', 'tasks', task.id, `Video editor assigned: user #${video_editor_id}`);
  emitEvent('task:updated', { id: task.id, title: task.title, status: task.status, assigned_to: task.assigned_to, updated_by: req.user!.profile_id, updated_by_name: req.user!.full_name || req.user!.username });
  res.json({ success: true });
});

// Auto-approve urgent tasks when higher-level users are offline
router.put('/:id/auto-approve', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canUpdateTask(task, req.user)) return res.status(403).json({ error: 'Not authorized.' });
  if (task.status !== 'waiting_confirmation') return res.status(400).json({ error: 'Task is not waiting for approval.' });
  if (!URGENT_PRIORITIES.includes(task.priority)) return res.status(400).json({ error: 'Task is not urgent priority.' });
  // Check higher-level users offline via socket
  const { isHigherLevelOnline } = require('../socket');
  if (isHigherLevelOnline()) return res.status(400).json({ error: 'Higher-level users are online. Manual approval required.' });
  // Auto-approve: change task status
  await prepare("UPDATE tasks SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'auto_approved', 'tasks', task.id, `Auto-approved (urgent, no higher-ups online): ${task.title}`);
  emitEvent('task:auto-approved', { id: task.id, title: task.title, actor: req.user!.profile_id });
  res.json({ success: true, status: 'approved' });
});

// Auto-approve a batch of urgent tasks (when higher-up comes online)
router.post('/approve-urgent', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Only managers and admins can approve tasks.' });
  const { task_ids } = req.body;
  if (!Array.isArray(task_ids) || task_ids.length === 0) return res.status(400).json({ error: 'Task IDs required.' });
  const approved: number[] = [];
  for (const tid of task_ids) {
    const task = await prepare("SELECT * FROM tasks WHERE id = ? AND status = 'waiting_confirmation'").get(tid) as any;
    if (!task) continue;
    await prepare("UPDATE tasks SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(tid);
    await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
      .run(req.user!.profile_id, 'approved', 'tasks', tid, `Approved task: ${task.title}`);
    approved.push(tid);
  }
  emitEvent('tasks:approved-batch', { task_ids: approved, approved_by: req.user!.profile_id });
  res.json({ success: true, approved });
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const isOwner = task.assigned_to === req.user!.profile_id || task.assigned_by === req.user!.profile_id;
  if (req.user!.access_level > 2 && !isOwner) {
    return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  }

  const deletableStatuses = ['draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'published', 'under_review', 'cancelled'];
  if (!deletableStatuses.includes(task.status)) {
    return res.status(400).json({ error: 'Task cannot be deleted in its current status.' });
  }

  // Soft-delete: move to recycle bin
  await prepare("UPDATE tasks SET status = 'trashed', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'trash_task', 'tasks', task.id, `Moved task to recycle bin: ${task.title}`);

  emitEvent('task:deleted', { id: task.id, title: task.title, actor: req.user!.profile_id });
  taskBackup(req, `Task moved to recycle bin: #${task.id} ${task.title}`);
  res.json({ success: true, trashed: true });
});

  // Restore task from recycle bin
  router.post('/:id/restore', authenticate, async (req: AuthRequest, res: Response) => {
    const task = await prepare("SELECT * FROM tasks WHERE id = ? AND status = 'trashed'").get(req.params.id) as any;
    if (!task) return res.status(404).json({ error: 'Trashed task not found.' });

    const isOwner = task.assigned_to === req.user!.profile_id || task.assigned_by === req.user!.profile_id;
    if (req.user!.access_level > 2 && !isOwner) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    await prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run('draft', task.id);

    await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
      .run(req.user!.profile_id, 'restore_task', 'tasks', task.id, `Restored task from recycle bin: ${task.title}`);

    emitEvent('task:updated', { id: task.id, title: task.title, status: 'draft', assigned_to: task.assigned_to, updated_by: req.user!.profile_id, updated_by_name: req.user!.full_name || req.user!.username });
    res.json({ success: true, restored: true });
  });

// Permanently delete trashed task
router.delete('/:id/permanent', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare("SELECT * FROM tasks WHERE id = ? AND status = 'trashed'").get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Trashed task not found.' });

  if (req.user!.access_level > 2) {
    return res.status(403).json({ error: 'Only admins can permanently delete tasks.' });
  }

  await prepare('DELETE FROM anchor_tasks WHERE task_id = ?').run(req.params.id);
  await prepare('DELETE FROM video_editor_tasks WHERE task_id = ?').run(req.params.id);
  await prepare('DELETE FROM task_news_items WHERE task_id = ?').run(req.params.id);
  await prepare('DELETE FROM task_extensions WHERE task_id = ?').run(req.params.id);
  await prepare('DELETE FROM task_collaborators WHERE task_id = ?').run(req.params.id);
  await prepare('DELETE FROM task_audit_log WHERE task_id = ?').run(req.params.id);
  await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('tasks', req.params.id);
  await prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_task', 'tasks', task.id, `Permanently deleted task: ${task.title}`);

  emitEvent('task:deleted', { id: task.id, title: task.title, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: true });
});

// Bulk permanently delete trashed tasks (admin only)
router.post('/permanent-bulk', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) {
    return res.status(403).json({ error: 'Only admins can permanently delete tasks.' });
  }
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No task ids provided.' });

  const placeholders = ids.map(() => '?').join(',');
  const trashed = await prepare(`SELECT id, title FROM tasks WHERE id IN (${placeholders}) AND status = 'trashed'`).all(...ids) as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'No trashed tasks found for the provided ids.' });

  for (const task of trashed) {
    await prepare('DELETE FROM anchor_tasks WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM video_editor_tasks WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_news_items WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_extensions WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_collaborators WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_audit_log WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('tasks', task.id);
    await prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  }

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_task', 'tasks', 0, `Permanently deleted ${trashed.length} task(s) from recycle bin`);

  emitEvent('task:deleted', { bulk: true, count: trashed.length, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: trashed.length });
});

// Permanently delete ALL trashed tasks (any admin)
router.post('/empty-trash', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) {
    return res.status(403).json({ error: 'Only admins can permanently delete tasks.' });
  }
  const trashed = await prepare("SELECT id, title FROM tasks WHERE status = 'trashed'").all() as any[];
  if (trashed.length === 0) return res.status(404).json({ error: 'Recycle bin is already empty.' });

  for (const task of trashed) {
    await prepare('DELETE FROM anchor_tasks WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM video_editor_tasks WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_news_items WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_extensions WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_collaborators WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM task_audit_log WHERE task_id = ?').run(task.id);
    await prepare('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?').run('tasks', task.id);
    await prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  }

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'permanent_delete_task', 'tasks', 0, `Emptied recycle bin: permanently deleted ${trashed.length} tasks`);

  emitEvent('task:deleted', { bulk: true, count: trashed.length, actor: req.user!.profile_id });
  res.json({ success: true, permanently_deleted: trashed.length });
});

router.put('/:id/anchor', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (req.user!.access_level > 1 && req.user!.profile_id !== task.assigned_to && req.user!.profile_id !== task.assigned_by) {
    return res.status(403).json({ error: 'Not authorized.' });
  }

  const { script, footage_url, recording_url, publish_link, status, remarks, audio_url, send_to_teleprompter } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (script !== undefined) { updates.push('script = ?'); params.push(script); }
  if (footage_url !== undefined) { updates.push('footage_url = ?'); params.push(footage_url); }
  if (recording_url !== undefined) { updates.push('recording_url = ?'); params.push(recording_url); }
  if (publish_link !== undefined) { updates.push('publish_link = ?'); params.push(publish_link); }
  if (remarks !== undefined) { updates.push('remarks = ?'); params.push(remarks); }
  if (audio_url !== undefined) { updates.push('audio_url = ?'); params.push(audio_url); }
  if (send_to_teleprompter) { updates.push("teleprompter_sent_at = datetime('now')"); }
  updates.push("updated_at = datetime('now')");

  const currentAnchor = await prepare('SELECT * FROM anchor_tasks WHERE task_id = ?').get(req.params.id) as any;

  if (status !== undefined && status !== '') {
    const currentStatus = currentAnchor?.status || 'pending';
    const allowed = ANCHOR_TRANSITIONS[currentStatus] || [];
    if (status !== currentStatus && !allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot transition anchor from '${currentStatus}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}` });
    }
    if (status !== currentStatus && status === 'published') {
      if (!task.youtube_url || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(task.youtube_url)) {
        return res.status(400).json({ error: 'A valid YouTube URL is required before publishing.' });
      }
    }
    if (status !== currentStatus) {
      updates.push('status = ?');
      params.push(status);
    }
  }

  if (currentAnchor) {
    params.push(req.params.id);
    await prepare(`UPDATE anchor_tasks SET ${updates.join(', ')} WHERE task_id = ?`).run(...params);
  } else if (updates.length > 1) {
    const cols: string[] = [];
    const ph: string[] = [];
    const vals: any[] = [];
    for (const u of updates) {
      const [col, ...rest] = u.split(' = ');
      cols.push(col.trim());
      if (u.includes('?')) {
        ph.push('?');
        vals.push(params.shift());
      } else {
        ph.push(rest.join(' = '));
      }
    }
    vals.push(req.params.id);
    await prepare(`INSERT INTO anchor_tasks (task_id, ${cols.join(', ')}) VALUES (?, ${ph.join(', ')})`).run(...vals);
  }

  // Keep the parent task status in sync (only when the move is a legal transition)
  const anchorTarget = anchorToTaskStatus[status || ''];
  if (status === 'published' && (task.status === 'uploading' || task.status === 'published')) {
    await prepare("UPDATE tasks SET status = 'under_review', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(task.id);
  } else if (anchorTarget && anchorTarget !== task.status) {
    const ok = await applyTaskStatus(task.id, task.status, anchorTarget);
    if (!ok) await prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(anchorTarget, task.id);
  }
  if (send_to_teleprompter) {
    await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
      .run(req.user!.profile_id, 'send_to_teleprompter', 'tasks', task.id, 'Script sent to teleprompter');
    createNotification(task.assigned_by, req.user!.profile_id, 'teleprompter_sent', 'tasks', task.id, `Teleprompter: ${task.title}`);
  }

  if (status && req.user!.profile_id !== task.assigned_by) {
    createNotification(task.assigned_by, req.user!.profile_id, 'task_updated', 'tasks', task.id, `Anchor: ${task.title}`);
  }

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_anchor', 'tasks', task.id, `Anchor updated task: ${task.title}`);

  taskBackup(req, `Anchor workflow updated: #${task.id} ${task.title}`);
  res.json({ success: true });
});

router.get('/:id/teleprompter', authenticate, async (req: AuthRequest, res: Response) => {
  const taskRow = await prepare('SELECT t.id, t.assigned_to, t.assigned_by, t.video_editor_id FROM tasks t WHERE t.id = ?').get(req.params.id) as any;
  if (!taskRow) return res.status(404).json({ error: 'Task not found.' });
  if (!canReadTask(taskRow, req.user)) return res.status(403).json({ error: 'Access denied. This task is not assigned to you.' });
  const anchorTask = await prepare(`
    SELECT at.*, t.title as task_title, t.assigned_to, p.full_name as anchor_name
    FROM anchor_tasks at
    JOIN tasks t ON t.id = at.task_id
    LEFT JOIN profiles p ON p.id = t.assigned_to
    WHERE at.task_id = ?
  `).get(req.params.id);

  if (!anchorTask) return res.status(404).json({ error: 'Teleprompter data not found.' });

  const activityLogs = await prepare(`
    SELECT action, created_at FROM activity_logs
    WHERE entity_type = 'tasks' AND entity_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id);

  res.json({ ...anchorTask, activity_logs: activityLogs });
});

router.put('/:id/editor', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (req.user!.access_level > 1 && req.user!.profile_id !== task.assigned_to && req.user!.profile_id !== task.assigned_by && req.user!.profile_id !== task.video_editor_id) {
    return res.status(403).json({ error: 'Not authorized.' });
  }

  const { edited_video_url, thumbnail_url, upload_url, retakes, corrections, anchoring_tone, news_age, remarks, status } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (edited_video_url !== undefined) { updates.push('edited_video_url = ?'); params.push(edited_video_url); }
  if (thumbnail_url !== undefined) { updates.push('thumbnail_url = ?'); params.push(thumbnail_url); }
  if (upload_url !== undefined) { updates.push('upload_url = ?'); params.push(upload_url); }
  if (retakes !== undefined) { updates.push('retakes = ?'); params.push(retakes); }
  if (corrections !== undefined) { updates.push('corrections = ?'); params.push(corrections); }
  if (anchoring_tone !== undefined) { updates.push('anchoring_tone = ?'); params.push(anchoring_tone); }
  if (news_age !== undefined) { updates.push('news_age = ?'); params.push(news_age); }
  if (remarks !== undefined) { updates.push('remarks = ?'); params.push(remarks); }
  updates.push("updated_at = datetime('now')");

  const currentEditor = await prepare('SELECT * FROM video_editor_tasks WHERE task_id = ?').get(req.params.id) as any;

  if (status !== undefined && status !== '') {
    const currentStatus = currentEditor?.status || 'pending';
    const allowed = EDITOR_TRANSITIONS[currentStatus] || [];
    if (status !== currentStatus && !allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot transition editor from '${currentStatus}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}` });
    }
    if (status !== currentStatus && (status === 'reviewed' || status === 'verified')) {
      if (!task.youtube_url || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(task.youtube_url)) {
        return res.status(400).json({ error: 'A valid YouTube URL is required before completing.' });
      }
    }
    if (status !== currentStatus) {
      updates.push('status = ?');
      params.push(status);
    }
  }

  const editorTarget = editorToTaskStatus[status || ''];
  if (editorTarget && editorTarget !== task.status) {
    const ok = await applyTaskStatus(task.id, task.status, editorTarget);
    if (!ok) await prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(editorTarget, task.id);
  }

  if (currentEditor) {
    params.push(req.params.id);
    await prepare(`UPDATE video_editor_tasks SET ${updates.join(', ')} WHERE task_id = ?`).run(...params);
  } else if (updates.length > 1) {
    const cols: string[] = [];
    const ph: string[] = [];
    const vals: any[] = [];
    for (const u of updates) {
      const [col, ...rest] = u.split(' = ');
      cols.push(col.trim());
      if (u.includes('?')) {
        ph.push('?');
        vals.push(params.shift());
      } else {
        ph.push(rest.join(' = '));
      }
    }
    vals.push(req.params.id);
    await prepare(`INSERT INTO video_editor_tasks (task_id, ${cols.join(', ')}) VALUES (?, ${ph.join(', ')})`).run(...vals);
  }

  if (status && req.user!.profile_id !== task.assigned_by) {
    createNotification(task.assigned_by, req.user!.profile_id, 'task_updated', 'tasks', task.id, `Editor: ${task.title}`);
  }

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_editor', 'tasks', task.id, `Editor updated task: ${task.title}`);

  res.json({ success: true });
});

// --- Task News Items CRUD ---

router.get('/:id/news-items', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canReadTask(task, req.user)) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const items = await prepare(`
    SELECT n.*, r.name as reporter_name, r.location as reporter_location, r.region as reporter_region
    FROM task_news_items n
    LEFT JOIN reporters r ON n.reporter_id = r.id
    WHERE n.task_id = ? ORDER BY n.sort_order ASC
  `).all(req.params.id);
  res.json(items);
});

router.post('/:id/news-items', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canUpdateTask(task, req.user)) return res.status(403).json({ error: 'Not authorized.' });
  const { slug, news_script, reporter_id, reporter_name, anchor_name, footage_description, footage_type, location, sort_order } = req.body;
  const maxSort = await prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM task_news_items WHERE task_id = ?').get(req.params.id) as any;
  const result = await prepare(`INSERT INTO task_news_items (task_id, sort_order, slug, news_script, reporter_id, reporter_name, anchor_name, footage_description, footage_type, location)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(req.params.id, sort_order ?? maxSort.next, slug || null, news_script || null, reporter_id || null, reporter_name || null, anchor_name || null, footage_description || null, footage_type || null, location || null);
  const item = await prepare(`
    SELECT n.*, r.name as reporter_name, r.location as reporter_location, r.region as reporter_region
    FROM task_news_items n
    LEFT JOIN reporters r ON n.reporter_id = r.id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'create_news_item', 'task_news_items', result.lastInsertRowid, `Added news item to task #${task.id}: ${slug || ''}`);
  taskBackup(req, `News item added to task #${task.id}`);
  res.status(201).json(item);
});

router.put('/:id/news-items/:itemId', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canUpdateTask(task, req.user)) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prepare('SELECT * FROM task_news_items WHERE id = ? AND task_id = ?').get(req.params.itemId, req.params.id);
  if (!existing) return res.status(404).json({ error: 'News item not found.' });
  const { slug, news_script, reporter_id, reporter_name, anchor_name, footage_description, footage_type, location, sort_order, correction_notes } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (slug !== undefined) { updates.push('slug = ?'); params.push(slug); }
  if (news_script !== undefined) { updates.push('news_script = ?'); params.push(news_script); }
  if (reporter_id !== undefined) { updates.push('reporter_id = ?'); params.push(reporter_id || null); }
  if (reporter_name !== undefined) { updates.push('reporter_name = ?'); params.push(reporter_name || null); }
  if (anchor_name !== undefined) { updates.push('anchor_name = ?'); params.push(anchor_name); }
  if (footage_description !== undefined) { updates.push('footage_description = ?'); params.push(footage_description); }
  if (footage_type !== undefined) { updates.push('footage_type = ?'); params.push(footage_type); }
  if (location !== undefined) { updates.push('location = ?'); params.push(location); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  if (correction_notes !== undefined) { updates.push('correction_notes = ?'); params.push(correction_notes); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.itemId);
  await prepare(`UPDATE task_news_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const item = await prepare(`
    SELECT n.*, r.name as reporter_name, r.location as reporter_location, r.region as reporter_region
    FROM task_news_items n
    LEFT JOIN reporters r ON n.reporter_id = r.id
    WHERE n.id = ?
  `).get(req.params.itemId);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_news_item', 'task_news_items', req.params.itemId, `Updated news item in task #${task.id}`);
  taskBackup(req, `News item updated in task #${task.id}${correction_notes !== undefined ? ' (correction)' : ''}`);
  res.json(item);
});

router.delete('/:id/news-items/:itemId', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canUpdateTask(task, req.user)) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prepare('SELECT id FROM task_news_items WHERE id = ? AND task_id = ?').get(req.params.itemId, req.params.id);
  if (!existing) return res.status(404).json({ error: 'News item not found.' });
  await prepare('DELETE FROM task_news_items WHERE id = ?').run(req.params.itemId);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'delete_news_item', 'task_news_items', req.params.itemId, `Deleted news item from task #${task.id}`);
  taskBackup(req, `News item deleted from task #${task.id}`);
  res.json({ success: true });
});

// Generate metadata for YouTube
router.get('/:id/generate-metadata', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT t.*, bt.name as bulletin_name FROM tasks t LEFT JOIN bulletin_templates bt ON t.bulletin_template_id = bt.id WHERE t.id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canReadTask(task, req.user)) return res.status(403).json({ error: 'Access denied. This task is not assigned to you.' });

  const newsItems = await prepare('SELECT * FROM task_news_items WHERE task_id = ? ORDER BY sort_order ASC').all(req.params.id) as any[];
  const channelMeta = await prepare('SELECT * FROM channel_metadata WHERE id = 1').get() as any;
  
  // --- Keyword generation: weighted single words + phrases + bulletin/channel context ---
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'did', 'she', 'use', 'way', 'many', 'sit', 'set', 'run', 'eat', 'far', 'sea', 'eye', 'ask', 'own', 'say', 'too', 'any', 'try', 'last', 'first', 'after', 'back', 'other', 'than', 'then', 'them', 'these', 'so', 'some', 'time', 'very', 'when', 'come', 'there', 'each', 'which', 'their', 'what', 'said', 'this', 'have', 'from', 'they', 'been', 'were', 'into', 'just', 'like', 'over', 'only', 'know', 'take', 'year', 'good', 'could', 'state', 'work', 'life', 'even', 'more', 'after', 'much', 'here', 'well',
    'news', 'today', 'yesterday', 'reported', 'reports', 'report', 'bulletin', 'said', 'says', 'also', 'still', 'every', 'local', 'along', 'with', 'about', 'been', 'these', 'those', 'people', 'city', 'that', 'will', 'would', 'could', 'should', 'must', 'been',
  ]);

  const tokenize = (text: string): string[] =>
    text.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  // Weighted single-word counts (slugs weighted 2x — they are the headlines)
  const tokenCount: Record<string, number> = {};
  const bumpTokens = (text: string, weight = 1) => {
    tokenize(text).forEach(w => { tokenCount[w] = (tokenCount[w] || 0) + weight; });
  };
  newsItems.forEach((item: any) => {
    bumpTokens(item.slug || '', 2);
    bumpTokens(item.news_script || '', 1);
  });
  bumpTokens(task.title || '', 1);
  const rankedTokens = Object.entries(tokenCount).sort((a, b) => b[1] - a[1]).map(([w]) => w);

  // 2-3 word phrases (slug text weighted 2x)
  const phraseCount: Record<string, number> = {};
  const bumpPhrases = (text: string, weight = 1) => {
    const tokens = tokenize(text);
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const p = tokens.slice(i, i + n).join(' ');
        phraseCount[p] = (phraseCount[p] || 0) + weight;
      }
    }
  };
  newsItems.forEach((item: any) => {
    bumpPhrases(item.slug || '', 2);
    bumpPhrases(item.news_script || '', 1);
  });
  const rankedPhrases = Object.entries(phraseCount).sort((a, b) => b[1] - a[1]).map(([p]) => p);

  // Bulletin & channel context keywords
  const contextKeywords: string[] = [];
  if (task.bulletin_name) {
    const bn = task.bulletin_name.toLowerCase();
    contextKeywords.push(bn, `${bn} news`, `${bn} today`, `${bn} bulletin`);
  }
  ([] as string[]).concat(channelMeta?.channel_name || '', channelMeta?.channel_display_name || '')
    .filter((s: string) => s && s.length >= 3)
    .forEach((cn: string) => {
      const c = cn.toLowerCase();
      contextKeywords.push(c, `${c} news`, `${c} bulletin`);
    });

  const buildKeywordSet = (items: string[], limit = 380): string => {
    const result: string[] = [];
    let charCount = 0;
    for (const item of items) {
      if (result.includes(item)) continue;
      if (charCount + item.length + 2 > limit) break;
      result.push(item);
      charCount += item.length + 2;
    }
    return result.join(', ');
  };

  const keywordOptions = [
    { label: 'Top News Keywords', value: buildKeywordSet([...contextKeywords.slice(0, 2), ...rankedTokens.slice(0, 14), ...rankedPhrases.slice(0, 6)]) },
    { label: 'Key Phrases', value: buildKeywordSet([...rankedPhrases.slice(0, 18), ...rankedTokens.slice(0, 6)]) },
    { label: 'Bulletin & Channel', value: buildKeywordSet([...contextKeywords, ...rankedTokens.slice(0, 12)]) },
  ];
  
  // Title options come from the news slugs — 3 random news items as choices
  const titleOptions: { label: string; value: string }[] = [];
  const shuffledNews = [...newsItems].sort(() => Math.random() - 0.5);
  for (const item of shuffledNews) {
    if (titleOptions.length >= 3) break;
    const slug = (item.slug || '').trim();
    const scriptLine = (item.news_script || '').split(/\n+/).map((l: string) => l.trim()).filter(Boolean)[0] || '';
    const title = slug || scriptLine;
    if (title) {
      titleOptions.push({ label: `News #${titleOptions.length + 1}`, value: title });
    }
  }
  if (titleOptions.length === 0) {
    titleOptions.push({ label: 'Task Title', value: task.title || 'News Report' });
  }
  
  // Generate description options
  const descriptionOptions = [
    { label: 'Standard Description', value: newsItems.map((i: any) => i.news_script).filter(Boolean).join('\n\n').substring(0, 500) || task.description || 'News report' },
  ];
  
  res.json({
    titleOptions,
    descriptionOptions,
    keywordOptions,
  });
});

// --- Extend Deadline ---
router.post('/:id/extend-deadline', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const { new_deadline, reason } = req.body;
  if (!new_deadline || !reason) return res.status(400).json({ error: 'new_deadline and reason are required.' });

  const canExtend = req.user!.access_level <= 2 || req.user!.profile_id === task.assigned_by;
  if (!canExtend) return res.status(403).json({ error: 'Not authorized to extend deadline.' });

  const oldDeadline = task.deadline;
  const rawDeadline = new_deadline.length <= 16 ? `${new_deadline}:00` : new_deadline;
  const normalizedDeadline = new Date(rawDeadline.replace(' ', 'T')).toISOString().slice(0, 19).replace('T', ' ');
  let statusUpdate = '';
  if (task.status === 'cancelled') statusUpdate = ", status = 'draft'";
  await prepare(`UPDATE tasks SET deadline = ?, deadline_extended = 1, updated_at = datetime('now')${statusUpdate} WHERE id = ?`).run(normalizedDeadline, task.id);

  await prepare("INSERT INTO task_extensions (task_id, extended_by, old_deadline, new_deadline, reason) VALUES (?,?,?,?,?)")
    .run(task.id, req.user!.profile_id, oldDeadline, normalizedDeadline, reason);

  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'extend_deadline', 'tasks', task.id, `Extended deadline: ${task.title} | Reason: ${reason}`);

  if (task.assigned_to && task.assigned_to !== req.user!.profile_id) {
    createNotification(task.assigned_to, req.user!.profile_id, 'deadline_extended', 'tasks', task.id, `Extended: ${task.title}`);
  }

  emitEvent('task:deadline-extended', { id: task.id, title: task.title, new_deadline, assigned_to: task.assigned_to, updated_by: req.user!.profile_id });
  taskBackup(req, `Deadline extended for task #${task.id}`);
  res.json({ success: true, new_deadline });
});

// Get extension history for a task
router.get('/:id/extensions', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canReadTask(task, req.user)) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const extensions = await prepare(`
    SELECT e.*, p.full_name as extended_by_name
    FROM task_extensions e
    LEFT JOIN profiles p ON e.extended_by = p.id
    WHERE e.task_id = ?
    ORDER BY e.created_at DESC
  `).all(req.params.id);
  res.json(extensions);
});

// --- Reuse Detection ---
router.get('/:id/detect-reuse', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT id, title, assigned_to, assigned_by, video_editor_id FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canReadTask(task, req.user)) return res.status(403).json({ error: 'Access denied. This task is not assigned to you.' });

  const myItems = await prepare('SELECT slug, news_script FROM task_news_items WHERE task_id = ? ORDER BY sort_order ASC').all(req.params.id) as any[];
  if (myItems.length === 0) return res.json({ overall_percent: 0, matches: [] });

  const myWords = new Set<string>();
  for (const item of myItems) {
    const text = ((item.slug || '') + ' ' + (item.news_script || '')).toLowerCase().replace(/[^\w\s]/g, ' ');
    for (const w of text.split(/\s+/)) { if (w.length >= 3) myWords.add(w); }
  }
  if (myWords.size === 0) return res.json({ overall_percent: 0, matches: [] });

  // Scan last 7 days of other tasks' news_items
  const rows = await prepare(`
    SELECT ni.task_id, ni.slug, ni.news_script, t.title as task_title, t.created_at, t.status
    FROM task_news_items ni
    JOIN tasks t ON t.id = ni.task_id
    WHERE ni.task_id != ? AND t.created_at >= datetime('now', '-7 days')
    ORDER BY t.created_at DESC
  `).all(req.params.id) as any[];

  // Group rows by task_id
  const taskMap: Record<number, any> = {};
  for (const row of rows) {
    if (!taskMap[row.task_id]) {
      taskMap[row.task_id] = { id: row.task_id, title: row.task_title, created_at: row.created_at, status: row.status, text: '' };
    }
    taskMap[row.task_id].text += ' ' + (row.slug || '') + ' ' + (row.news_script || '');
  }

  const matches: any[] = [];
  for (const tid of Object.keys(taskMap)) {
    const t = taskMap[Number(tid)];
    const theirWords = new Set<string>();
    const clean = t.text.toLowerCase().replace(/[^\w\s]/g, ' ');
    for (const w of clean.split(/\s+/)) { if (w.length >= 3) theirWords.add(w); }
    if (theirWords.size === 0) continue;

    let intersect = 0;
    for (const w of myWords) { if (theirWords.has(w)) intersect++; }
    const union = new Set([...myWords, ...theirWords]).size;
    const percent = Math.round((intersect / union) * 100);
    if (percent >= 20) {
      matches.push({ task_id: t.id, title: t.title, created_at: t.created_at, status: t.status, match_percent: percent });
    }
  }

  matches.sort((a, b) => b.match_percent - a.match_percent);
  const overall = matches.length > 0 ? Math.max(...matches.map(m => m.match_percent)) : 0;
  res.json({ overall_percent: overall, matches: matches.slice(0, 20) });
});

// Task activity logs
router.get('/:id/activity', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canReadTask(task, req.user)) return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  const logs = await prepare(`
    SELECT a.*, p.full_name, p.role
    FROM activity_logs a
    LEFT JOIN profiles p ON a.user_id = p.id
    WHERE a.entity_type = 'tasks' AND a.entity_id = ?
    ORDER BY a.created_at DESC
  `).all(req.params.id);
  res.json(logs);
});

export default router;
