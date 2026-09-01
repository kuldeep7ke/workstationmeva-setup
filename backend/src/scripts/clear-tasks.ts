import { initDatabase, exec, prepare, backupDatabase } from '../database/schema';

async function main() {
  await initDatabase();

  // Backup before destructive change
  backupDatabase('pre-clear-tasks');

  // Clear task-dependent tables first (respect FK order)
  exec('DELETE FROM task_collaborators');
  exec('DELETE FROM task_extensions');
  exec('DELETE FROM anchor_tasks');
  exec('DELETE FROM video_editor_tasks');
  exec('DELETE FROM task_news_items');
  exec('DELETE FROM tasks');

  // Reset bulletin templates
  exec("UPDATE bulletin_templates SET skip_reason = NULL");

  // Reset any stories that were sent to tasks back to approved
  exec("UPDATE stories SET status = 'approved' WHERE status = 'send_to_tasks'");

  console.log('All task data cleared successfully.');

  // Verify
  const taskCount = prepare('SELECT COUNT(*) as cnt FROM tasks').get() as any;
  const collabCount = prepare('SELECT COUNT(*) as cnt FROM task_collaborators').get() as any;
  const extensionCount = prepare('SELECT COUNT(*) as cnt FROM task_extensions').get() as any;
  console.log(`Tasks: ${taskCount.cnt}, Collaborators: ${collabCount.cnt}, Extensions: ${extensionCount.cnt}`);
}

main().catch(console.error);
