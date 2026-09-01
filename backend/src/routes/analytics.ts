import { Router, Response } from 'express';
import { prepare } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const ACTIVE_PIPELINE = "status IN ('script_writing','footage_collection','waiting_confirmation','correction_required','approved','editor_assigned','teleprompter_ready','prompting','recording_done','editing','uploading')";
const PUBLISHED = "status IN ('published','under_review')";
const NOT_DONE = "status NOT IN ('completed','under_review','cancelled','published')";

router.get('/dashboard', authenticate, async (req: AuthRequest, res: Response) => {
  const { period = 'week' } = req.query;

  let dateFilter: string;
  switch (period) {
    case 'day': dateFilter = "-1 days"; break;
    case 'week': dateFilter = "-7 days"; break;
    case 'month': dateFilter = "-30 days"; break;
    case 'year': dateFilter = "-365 days"; break;
    default: dateFilter = "-7 days";
  }

  const taskStats = await prepare(`
    SELECT COUNT(*) as total_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN ${PUBLISHED} THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN ${ACTIVE_PIPELINE} THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status IN ('waiting_confirmation','correction_required','approved') THEN 1 ELSE 0 END) as pending_approval,
      SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as breaking

    FROM tasks WHERE created_at >= datetime('now', ?)
  `).get(dateFilter);

  const tasksByDay = await prepare(`
    SELECT date(created_at) as day, COUNT(*) as count,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM tasks WHERE created_at >= datetime('now', ?)
    GROUP BY date(created_at) ORDER BY day
  `).all(dateFilter);

  const userActivity = await prepare(`
    SELECT p.full_name, p.access_level, COUNT(a.id) as actions
    FROM profiles p LEFT JOIN activity_logs a ON p.id = a.user_id 
      AND a.created_at >= datetime('now', ?)
    GROUP BY p.id ORDER BY actions DESC
  `).all(dateFilter);

  const bulletinStats = await prepare(`
    SELECT bulletin_type, COUNT(*) as count
    FROM bulletins WHERE created_at >= datetime('now', ?)
    GROUP BY bulletin_type
  `).all(dateFilter);

  const priorityDist = await prepare(`
    SELECT priority, COUNT(*) as count
    FROM tasks WHERE created_at >= datetime('now', ?)
    GROUP BY priority
  `).all(dateFilter);

  const newsAgeDist = await prepare(`
    SELECT news_age, COUNT(*) as count
    FROM video_editor_tasks WHERE created_at >= datetime('now', ?) AND news_age IS NOT NULL
    GROUP BY news_age
  `).all(dateFilter);

  const toneDist = await prepare(`
    SELECT anchoring_tone, COUNT(*) as count
    FROM video_editor_tasks WHERE created_at >= datetime('now', ?) AND anchoring_tone IS NOT NULL
    GROUP BY anchoring_tone
  `).all(dateFilter);

  const activeAds = await prepare('SELECT COUNT(*) as count FROM ads WHERE status = ?').get('active');
  const upcomingPrograms = await prepare(`
    SELECT COUNT(*) as count FROM special_programs 
    WHERE status IN ('planned','ongoing') AND schedule_date >= date('now')
  `).get();

  const usersByLevel = await prepare('SELECT access_level as level, COUNT(*) as count FROM profiles WHERE is_active = 1 AND is_archived = 0 GROUP BY access_level').all();
  const usersByRole = await prepare('SELECT role, COUNT(*) as count FROM profiles WHERE is_active = 1 AND is_archived = 0 GROUP BY role').all();

  // Live / Ongoing / Upcoming data
  const dueToday = await prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE deadline IS NOT NULL AND date(deadline) = date('now')
      AND ${NOT_DONE}
  `).get() as any;

  const expiringSoon = await prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE deadline IS NOT NULL AND deadline <= datetime('now', '+2 hours')
      AND deadline > datetime('now')
      AND ${NOT_DONE}
  `).get() as any;

  const confirmationTasks = await prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE status IN ('waiting_confirmation','correction_required')
  `).get() as any;

  const upcomingBulletins = await prepare(`
    SELECT COUNT(*) as count FROM bulletin_templates bt
    WHERE bt.publish_time >= time('now')
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.bulletin_template_id = bt.id AND t.status NOT IN ('cancelled'))
  `).get() as any;

  const inProgressTasks = await prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE ${ACTIVE_PIPELINE}
  `).get() as any;

  const avgCompletion = await prepare(`
    SELECT AVG(
      (julianday(completed_at) - julianday(created_at)) * 24 * 60
    ) as avg_minutes
    FROM tasks WHERE completed_at IS NOT NULL AND created_at >= datetime('now', ?)
  `).get(dateFilter);

  res.json({
    period,
    taskStats,
    tasksByDay,
    userActivity,
    bulletinStats,
    priorityDist,
    newsAgeDist,
    toneDist,
    activeAds: (activeAds as any)?.count || 0,
    upcomingPrograms: (upcomingPrograms as any)?.count || 0,
    usersByLevel,
    usersByRole,
    avgCompletion: (avgCompletion as any)?.avg_minutes || 0,
    dueToday: dueToday?.count || 0,
    expiringSoon: expiringSoon?.count || 0,
    confirmationTasks: confirmationTasks?.count || 0,
    upcomingBulletins: upcomingBulletins?.count || 0,
    inProgressTasks: inProgressTasks?.count || 0,
  });
});

router.get('/reminders', authenticate, async (req: AuthRequest, res: Response) => {
  const dueToday = await prepare(`
    SELECT id, title, task_type, deadline FROM tasks
    WHERE deadline IS NOT NULL AND date(deadline) = date('now')
      AND ${NOT_DONE}
    ORDER BY deadline ASC LIMIT 10
  `).all();

  const expiringSoon = await prepare(`
    SELECT id, title, task_type, deadline FROM tasks
    WHERE deadline IS NOT NULL AND deadline <= datetime('now', '+2 hours')
      AND deadline > datetime('now')
      AND ${NOT_DONE}
    ORDER BY deadline ASC LIMIT 10
  `).all();

  res.json({ dueToday, expiringSoon });
});

router.get('/activity', authenticate, async (req: AuthRequest, res: Response) => {
  const raw = Number.parseInt(String(req.query.limit ?? '50'), 10);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 500) : 50;
  const logs = await prepare(`
    SELECT a.*, p.full_name, p.access_level
    FROM activity_logs a
    LEFT JOIN profiles p ON a.user_id = p.id
    ORDER BY a.created_at DESC LIMIT ?
  `).all(limit);
  res.json(logs);
});

router.get('/workload', authenticate, async (req: AuthRequest, res: Response) => {
  const userStats = await prepare(`
    SELECT p.id, p.full_name, p.role, p.access_level,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN ${PUBLISHED.replace('status', 't.status')} THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN t.status IN ('script_writing','footage_collection','waiting_confirmation','correction_required','approved','editor_assigned','teleprompter_ready','prompting','recording_done','editing','uploading') THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN t.status = 'draft' THEN 1 ELSE 0 END) as pending,
      ROUND(AVG(CASE WHEN t.completed_at IS NOT NULL THEN (julianday(t.completed_at) - julianday(t.created_at)) * 24 * 60 END), 1) as avg_completion_min
    FROM profiles p
    LEFT JOIN tasks t ON t.assigned_to = p.id AND t.created_at >= datetime('now', '-30 days')
    WHERE p.is_active = 1 AND p.is_archived = 0 AND p.status = 'active'
    GROUP BY p.id
    ORDER BY total_tasks DESC
  `).all();

  const teleprompterStats = await prepare(`
    SELECT COUNT(*) as sent_count
    FROM anchor_tasks WHERE teleprompter_sent_at IS NOT NULL
      AND teleprompter_sent_at >= datetime('now', '-30 days')
  `).get();

  const avgTimes = await prepare(`
    SELECT
      ROUND(AVG(CASE WHEN at.teleprompter_sent_at IS NOT NULL AND at.status = 'published'
        THEN (julianday(at.teleprompter_sent_at) - julianday(at.created_at)) * 24 * 60 END), 1) as avg_script_to_teleprompter_min,
      ROUND(AVG(CASE WHEN at.status = 'published'
        THEN (julianday(at.updated_at) - julianday(at.created_at)) * 24 * 60 END), 1) as avg_anchor_completion_min
    FROM anchor_tasks at
    WHERE at.created_at >= datetime('now', '-30 days')
  `).get();

  const teleprompterLogs = await prepare(`
    SELECT al.*, p.full_name, t.title as task_title
    FROM activity_logs al
    LEFT JOIN profiles p ON p.id = al.user_id
    LEFT JOIN tasks t ON t.id = al.entity_id
    WHERE al.action = 'send_to_teleprompter'
    ORDER BY al.created_at DESC LIMIT 10
  `).all();

  res.json({ userStats, teleprompterStats, avgTimes, teleprompterLogs });
});

router.get('/landing', async (_req: AuthRequest, res: Response) => {
  const totalTasks = await prepare('SELECT COUNT(*) as count FROM tasks').get();
  const completed = await prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'").get();
  const inProgress = await prepare(`SELECT COUNT(*) as count FROM tasks WHERE ${ACTIVE_PIPELINE}`).get();
  const pending = await prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'draft'").get();
  const totalUsers = await prepare('SELECT COUNT(*) as count FROM profiles WHERE is_active = 1 AND is_archived = 0').get();

  const recentCompleted = await prepare("SELECT id, title, task_type, updated_at FROM tasks WHERE status = 'completed' ORDER BY updated_at DESC LIMIT 3").all();
  const recentInProgress = await prepare(`SELECT id, title, task_type FROM tasks WHERE ${ACTIVE_PIPELINE} ORDER BY created_at DESC LIMIT 3`).all();
  const recentPending = await prepare("SELECT id, title, task_type FROM tasks WHERE status = 'draft' ORDER BY created_at DESC LIMIT 3").all();

  res.json({
    totalTasks: (totalTasks as any)?.count || 0,
    completed: (completed as any)?.count || 0,
    inProgress: (inProgress as any)?.count || 0,
    pending: (pending as any)?.count || 0,
    totalUsers: (totalUsers as any)?.count || 0,
    recentCompleted,
    recentInProgress,
    recentPending,
  });
});

export default router;
