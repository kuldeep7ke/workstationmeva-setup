const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then((SQL) => {
  const dbPath = './workstation.db';
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Delete all data except admin user (id=1)
  const tables = ['notifications', 'activity_logs', 'video_editor_tasks', 'anchor_tasks', 'tasks', 'special_programs', 'ads', 'bulletins', 'bulletin_templates'];
  tables.forEach(t => {
    db.run(`DELETE FROM ${t}`);
  });

  // Delete all users except admin (id=1)
  db.run('DELETE FROM users WHERE id != 1');

  // Reset admin user
  db.run(`UPDATE users SET 
    username = 'admin', 
    email = 'dev@workstation.local',
    full_name = 'Workstation Dev',
    role = 'admin',
    access_level = 1,
    status = 'active',
    is_active = 1,
    onboarded = 0
  WHERE id = 1`);

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('Database cleaned. Only admin user remains (dev@workstation.local).');
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});