import { Router, Response } from 'express';
import { prepare, nextUid, saveManagedBackup } from '../database/schema';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

function contentBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('content_change', detail, req.user?.full_name || req.user?.username || 'system');
}

const STORY_TYPES = ['special_report', 'ground_report', 'interview', 'cover_story', 'crime_story', 'weather_report', 'viral_story'];
const STATUSES = ['draft', 'data_gathering', 'script_writing', 'plotting', 'add_ons', 'confirmation', 'approved', 'cancelled', 'send_to_tasks'];

const STORY_TRANSITIONS: Record<string, string[]> = {
  draft: ['data_gathering'],
  data_gathering: ['script_writing'],
  script_writing: ['plotting'],
  plotting: ['add_ons'],
  add_ons: ['confirmation'],
  confirmation: ['approved', 'cancelled'],
  approved: ['send_to_tasks'],
  cancelled: ['add_ons'],
  send_to_tasks: [],
};

async function logActivity(storyId: number, userId: number, action: string, details?: string) {
  await prepare('INSERT INTO story_activities (story_id, user_id, action, details) VALUES (?,?,?,?)')
    .run(storyId, userId, action, details || null);
  const story = await prepare('SELECT uid FROM stories WHERE id = ?').get(storyId) as any;
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(userId, action, 'stories', storyId, `${details || ''} (${story?.uid || ''})`);
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { type, status, assigned_to, created_by } = req.query;
  let sql = `SELECT s.*, creator.full_name as created_by_name, assign.full_name as assigned_to_name, approver.full_name as approved_by_name, vo.full_name as vo_artist_name
    FROM stories s
    LEFT JOIN profiles creator ON s.created_by = creator.id
    LEFT JOIN profiles assign ON s.assigned_to = assign.id
    LEFT JOIN profiles approver ON s.approved_by = approver.id
    LEFT JOIN profiles vo ON s.vo_artist = vo.id
    WHERE 1=1`;
  const params: any[] = [];
  if (type && type !== 'all') { sql += ' AND s.story_type = ?'; params.push(type); }
  if (status && status !== 'all') { sql += ' AND s.status = ?'; params.push(status); }
  if (assigned_to) { sql += ' AND s.assigned_to = ?'; params.push(Number(assigned_to)); }
  if (created_by) { sql += ' AND s.created_by = ?'; params.push(Number(created_by)); }
  sql += ' ORDER BY s.created_at DESC';
  res.json(await prepare(sql).all(...params));
});

// Public read-only: approved stories for the teleprompter studio screen (no auth)
router.get('/teleprompter/approved', async (_req: AuthRequest, res: Response) => {
  const stories = await prepare(`
    SELECT s.id, s.title, s.story_type, s.headline, s.short_description, s.script, s.hashtags,
      s.voice_over_script, s.updated_at, creator.full_name as created_by_name, vo.full_name as vo_artist_name
    FROM stories s
    LEFT JOIN profiles creator ON s.created_by = creator.id
    LEFT JOIN profiles vo ON s.vo_artist = vo.id
    WHERE s.status = 'approved' AND s.script IS NOT NULL AND s.script != ''
    ORDER BY s.updated_at DESC
  `).all();
  res.json(stories);
});

// Public read-only: single approved story script for the teleprompter (no auth)
router.get('/teleprompter/:id', async (req: AuthRequest, res: Response) => {
  const story = await prepare(`
    SELECT s.id, s.title, s.script, s.headline, s.voice_over_script, vo.full_name as anchor_name
    FROM stories s
    LEFT JOIN profiles vo ON s.vo_artist = vo.id
    WHERE s.id = ? AND s.status = 'approved' AND s.script IS NOT NULL AND s.script != ''
  `).get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Script not found.' });
  res.json({ task_id: story.id, task_title: story.title, script: story.script, anchor_name: story.anchor_name || '', is_task: false });
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const story = await prepare(`SELECT s.*, creator.full_name as created_by_name, assign.full_name as assigned_to_name, approver.full_name as approved_by_name, vo.full_name as vo_artist_name
    FROM stories s
    LEFT JOIN profiles creator ON s.created_by = creator.id
    LEFT JOIN profiles assign ON s.assigned_to = assign.id
    LEFT JOIN profiles approver ON s.approved_by = approver.id
    LEFT JOIN profiles vo ON s.vo_artist = vo.id
    WHERE s.id = ?`).get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found.' });

  const activities = await prepare(`SELECT a.*, u.full_name as user_name FROM story_activities a LEFT JOIN profiles u ON a.user_id = u.id WHERE a.story_id = ? ORDER BY a.created_at DESC`).all(req.params.id);
  res.json({ story, activities });
});

router.post('/', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const { title, story_type, description, deadline, headline, short_description, hashtags, is_open, voice_over_script, vo_artist, footage_details, guest_names } = req.body;
  if (!title || !story_type) return res.status(400).json({ error: 'Title and story type required.' });
  if (!STORY_TYPES.includes(story_type)) return res.status(400).json({ error: 'Invalid story type.' });

  const storyUid = await nextUid('STY', 'stories');
  const result = await prepare('INSERT INTO stories (uid, title, story_type, description, deadline, headline, short_description, hashtags, is_open, voice_over_script, vo_artist, footage_details, guest_names, assigned_to, assigned_by, created_by, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(storyUid, title, story_type, description || '', deadline || null, headline || null, short_description || null, hashtags || null, is_open ? 1 : 0, voice_over_script || null, vo_artist || null, footage_details || null, guest_names || null, req.user!.profile_id, req.user!.profile_id, req.user!.profile_id, 'draft');
  await logActivity(Number(result.lastInsertRowid), req.user!.profile_id, 'created', `Story "${title}" created`);
  contentBackup(req, `Story created: ${title}`);
  emitEvent('story:created', { id: result.lastInsertRowid, title, story_type, actor: req.user!.profile_id });
  res.status(201).json({ id: result.lastInsertRowid, title, story_type });
});

router.put('/:id', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const story = await prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any;
  if (!story) return res.status(404).json({ error: 'Story not found.' });

  if (req.user!.access_level === 3 && story.created_by !== req.user!.profile_id && story.assigned_to !== req.user!.profile_id && !story.is_open) {
    return res.status(403).json({ error: 'You can only edit stories you created or that are assigned to you.' });
  }

  const { title, story_type, description, data_gathered, script, plot_notes, status, assigned_to, deadline, editor_instructions, headline, short_description, hashtags, is_open, voice_over_script, vo_artist, footage_details, guest_names } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (req.user!.access_level === 3 && assigned_to !== undefined && assigned_to !== story.assigned_to) {
    return res.status(403).json({ error: 'Only managers and admins can change story assignment.' });
  }

  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (story_type !== undefined) { updates.push('story_type = ?'); params.push(story_type); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (data_gathered !== undefined) { updates.push('data_gathered = ?'); params.push(data_gathered); }
  if (script !== undefined) { updates.push('script = ?'); params.push(script); }
  if (plot_notes !== undefined) { updates.push('plot_notes = ?'); params.push(plot_notes); }
  if (deadline !== undefined) { updates.push('deadline = ?'); params.push(deadline || null); }
  if (editor_instructions !== undefined) { updates.push('editor_instructions = ?'); params.push(editor_instructions || null); }
  if (headline !== undefined) { updates.push('headline = ?'); params.push(headline || null); }
  if (short_description !== undefined) { updates.push('short_description = ?'); params.push(short_description || null); }
  if (hashtags !== undefined) { updates.push('hashtags = ?'); params.push(hashtags || null); }
  if (is_open !== undefined) { updates.push('is_open = ?'); params.push(is_open ? 1 : 0); }
  if (voice_over_script !== undefined) { updates.push('voice_over_script = ?'); params.push(voice_over_script || null); }
  if (vo_artist !== undefined) { updates.push('vo_artist = ?'); params.push(vo_artist || null); }
  if (footage_details !== undefined) { updates.push('footage_details = ?'); params.push(footage_details || null); }
  if (guest_names !== undefined) { updates.push('guest_names = ?'); params.push(guest_names || null); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to || null); updates.push('assigned_by = ?'); params.push(req.user!.profile_id); }

  if (status !== undefined) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const allowed = STORY_TRANSITIONS[story.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot transition from '${story.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}` });
    }
    if (status === 'plotting') {
      const hasScript = script !== undefined ? script : story.script;
      if (!hasScript || !String(hasScript).trim()) return res.status(400).json({ error: 'Write the script before moving to Plotting.' });
    }
    updates.push('status = ?'); params.push(status);
    if (status === 'confirmation') await logActivity(story.id, req.user!.profile_id, 'sent_for_confirmation', 'Story sent for confirmation');
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    await prepare(`UPDATE stories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    await logActivity(story.id, req.user!.profile_id, 'updated', 'Story details updated');
  }
  contentBackup(req, `Story updated: #${story.id} (${story.uid})`);
  emitEvent('story:updated', { id: story.id, title: story.title, actor: req.user!.profile_id });
  res.json({ success: true });
});

// Revert a story to a previous status (used by Undo after advancing status)
router.post('/:id/revert', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const story = await prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any;
  if (!story) return res.status(404).json({ error: 'Story not found.' });
  if (req.user!.access_level === 3 && story.created_by !== req.user!.profile_id && story.assigned_to !== req.user!.profile_id) {
    return res.status(403).json({ error: 'You can only edit stories you created or that are assigned to you.' });
  }
  const { status } = req.body;
  if (!status || !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (story.status === 'send_to_tasks') {
    return res.status(400).json({ error: 'This story cannot be reverted after being sent to tasks.' });
  }
  await prepare("UPDATE stories SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  await logActivity(story.id, req.user!.profile_id, 'reverted', `Story reverted from '${story.status}' to '${status}'`);
  contentBackup(req, `Story reverted: #${story.id} (${story.uid})`);
  emitEvent('story:updated', { id: story.id, title: story.title, actor: req.user!.profile_id });
  res.json({ success: true, status });
});

router.post('/:id/confirm', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {  const story = await prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any;
  if (!story) return res.status(404).json({ error: 'Story not found.' });
  if (story.status !== 'confirmation') return res.status(400).json({ error: 'Story must be in confirmation first.' });

  const { approved, rejection_reason, assigned_to } = req.body;
  if (approved) {
    await prepare("UPDATE stories SET status = 'approved', approved_by = ?, approved_at = datetime('now'), rejection_reason = NULL, updated_at = datetime('now') WHERE id = ?").run(req.user!.profile_id, req.params.id);
    if (assigned_to) {
      await prepare('UPDATE stories SET assigned_to = ?, assigned_by = ?, updated_at = datetime(\'now\') WHERE id = ?').run(Number(assigned_to), req.user!.profile_id, req.params.id);
    }
    await logActivity(story.id, req.user!.profile_id, 'approved', 'Story approved');
    contentBackup(req, `Story approved: #${story.id} (${story.uid})`);
    res.json({ success: true, status: 'approved' });
  } else {
    if (!rejection_reason) return res.status(400).json({ error: 'Rejection reason required.' });
    await prepare('UPDATE stories SET status = ?, rejection_reason = ?, updated_at = datetime(\'now\') WHERE id = ?').run('cancelled', rejection_reason, req.params.id);
    await logActivity(story.id, req.user!.profile_id, 'rejected', `Story rejected: ${rejection_reason}`);
    contentBackup(req, `Story rejected: #${story.id} (${story.uid})`);
    res.json({ success: true, status: 'cancelled' });
  }
});

router.post('/:id/send-to-tasks', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const story = await prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any;
  if (!story) return res.status(404).json({ error: 'Story not found.' });
  if (story.status !== 'approved') return res.status(400).json({ error: 'Story must be approved first.' });

  const { assigned_to } = req.body;
  await prepare("UPDATE stories SET status = 'send_to_tasks', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  await logActivity(story.id, req.user!.profile_id, 'sent_to_tasks', 'Story sent to tasks');
  contentBackup(req, `Story sent to tasks: #${story.id} (${story.uid})`);

  const assignee = assigned_to || story.assigned_to || null;
  const taskUid = await nextUid('TSK', 'tasks');
  const taskResult = await prepare('INSERT INTO tasks (uid, title, description, assigned_by, assigned_to, status, task_type, story_id, priority) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(taskUid, `[Story] ${story.title}`, 'Approved story ready for production', req.user!.profile_id, assignee, 'draft', 'general', story.id, 'medium');
  const assignMsg = assignee ? `assigned to user #${assignee}` : 'unassigned — available to pick';
  await logActivity(story.id, req.user!.profile_id, 'task_created', `Production task #${taskResult.lastInsertRowid} created (${assignMsg})`);

  res.json({ success: true, status: 'send_to_tasks', task_id: taskResult.lastInsertRowid, assigned_to: assignee });
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const story = await prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any;
  if (!story) return res.status(404).json({ error: 'Story not found.' });
  // Admins may delete any story; level 2/3 may only delete their own
  // (the UI offers "undo story create" to the creator).
  if (req.user!.access_level > 1 && story.created_by !== req.user!.profile_id) {
    return res.status(403).json({ error: 'You can only delete stories you created.' });
  }
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'delete_story', 'stories', req.params.id, `Deleted story: ${story.title} (${story.uid})`);
  await prepare('DELETE FROM story_activities WHERE story_id = ?').run(req.params.id);
  await prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
  contentBackup(req, `Story deleted: ${story.title} (${story.uid})`);
  emitEvent('story:deleted', { id: Number(req.params.id), title: story.title, actor: req.user!.profile_id });
  res.json({ success: true });
});

router.post('/:id/reassign', authenticate, authorize(1, 2), async (req: AuthRequest, res: Response) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'User ID required.' });
  const story = await prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any;
  if (!story) return res.status(404).json({ error: 'Story not found.' });

  // Match by story_id, not title LIKE — SQLite treats '[Story]' as a character
  // class so 'LIKE '[Story]%'' never matches the actual '[Story] <title>' rows.
  const task = await prepare("SELECT id, assigned_to FROM tasks WHERE story_id = ?").get(req.params.id) as any;
  if (task) {
    const previousAssignee = task.assigned_to;
    await prepare('UPDATE tasks SET assigned_to = ?, updated_at = datetime(\'now\') WHERE id = ?').run(Number(user_id), task.id);
    await logActivity(story.id, req.user!.profile_id, 'reassigned', `Production task #${task.id} reassigned to user #${user_id}`);
    res.json({ success: true, found: true, previous_assignee: previousAssignee });
  } else {
    res.json({ success: true, found: false });
  }
});

router.post('/:id/assign', authenticate, authorize(1, 2, 3), async (req: AuthRequest, res: Response) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'User ID required.' });
  const story = await prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any;
  if (!story) return res.status(404).json({ error: 'Story not found.' });

  const userLevel = (req.user as any).access_level;
  const targetUser = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1').get(user_id) as any;
  if (!targetUser) return res.status(404).json({ error: 'Target user not found.' });

  if (userLevel === 3 && !story.is_open) {
    return res.status(403).json({ error: 'You can only assign users on open stories.' });
  }

  if (targetUser.access_level < userLevel) {
    return res.status(403).json({ error: 'Cannot assign to a user with higher access level.' });
  }

  if ((req.user as any).role === targetUser.role && userLevel !== 1) {
    return res.status(403).json({ error: 'Cannot assign to a user with the same role as you.' });
  }

  await prepare('UPDATE stories SET assigned_to = ?, assigned_by = ?, updated_at = datetime(\'now\') WHERE id = ?').run(Number(user_id), req.user!.profile_id, req.params.id);
  await logActivity(story.id, req.user!.profile_id, 'assigned', `Story assigned to user #${user_id}`);
  contentBackup(req, `Story assigned: #${story.id} (${story.uid}) -> user #${user_id}`);
  res.json({ success: true, assigned_to: Number(user_id) });
});

export default router;
