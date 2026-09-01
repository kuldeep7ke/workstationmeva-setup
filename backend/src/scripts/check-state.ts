import { initDatabase, prepare } from '../database/schema';

async function main() {
  await initDatabase();

  console.log('=== Bulletin Templates ===');
  const templates = prepare('SELECT * FROM bulletin_templates ORDER BY sort_order').all();
  console.table(templates);

  console.log('\n=== Profiles ===');
  const profiles = prepare('SELECT id, full_name, role, access_level, shift_type, shift_start, shift_end FROM profiles ORDER BY id').all();
  console.table(profiles);

  console.log('\n=== Stories (non-draft, non-cancelled) ===');
  const stories = prepare("SELECT id, title, story_type, status, assigned_to, assigned_by FROM stories WHERE status NOT IN ('draft','cancelled') ORDER BY id").all();
  console.table(stories);
}

main().catch(console.error);
