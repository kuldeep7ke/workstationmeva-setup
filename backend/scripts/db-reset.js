require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const t = await p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
  console.log('TABLES:', t.rows.map(r => r.table_name).join(','));
  const order = [
    "task_news_items", "task_extensions", "task_collaborators", "task_audit_log",
    "story_activities", "login_attempts", "notifications", "activity_logs",
    "backups", "backup_config", "user_activity", "system_activity",
    "user_bulletin_defaults", "system_bulletin_defaults", "channel_metadata",
    "leaves", "locations", "reporters", "archives", "ads", "bulletins",
    "bulletin_templates", "stories", "special_programs", "news_items", "tasks", "video_editor_tasks", "anchor_tasks",
    "profiles", "users",
  ];
  for (const c of order) {
    try { await p.query('DELETE FROM ' + c); } catch (e) { console.log('SKIP ' + c + ': ' + e.message); }
  }
  const u = await p.query('SELECT COUNT(*)::int as c FROM users');
  console.log('users:', u.rows[0].c);
  await p.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
