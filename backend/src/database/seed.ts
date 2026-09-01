import bcrypt from 'bcryptjs';
import { initDatabase, prepare } from './schema';

async function seed() {
  await initDatabase();

  const existing = prepare('SELECT COUNT(*) as c FROM users').get();
  if (existing && existing.c > 0) {
    console.log('Database already seeded.');
  } else {
    // User seeding removed — register users via signup

    console.log('Database seeded successfully!');
  }

  // Always ensure default bulletin templates exist
  const tplCount = prepare('SELECT COUNT(*) as c FROM bulletin_templates').get() as any;
  if (!tplCount || tplCount.c === 0) {
    const defaultBulletins = [
      ['Good Morning', '07:00', 1],
      ['Shaharachi Khabarbat', '08:00', 2],
      ['Top 10 News', '09:00', 3],
      ['Vegvan Adhava', '10:00', 4],
      ['Bulletin', '11:00', 5],
      ['Gossip Kalla', '12:00', 6],
      ['Shaharachi Khabarbat', '13:00', 7],
      ['Superfast', '14:00', 8],
      ['Jilhyachi Khabarbat', '15:00', 9],
      ['Top 24 Headlines', '16:00', 10],
    ];
    for (const [name, time, sort] of defaultBulletins) {
      prepare('INSERT INTO bulletin_templates (name, publish_time, sort_order, created_by) VALUES (?,?,?,?)')
        .run(name, time, sort, 1);
    }
    console.log(`Inserted ${defaultBulletins.length} default bulletin templates.`);
  } else {
    console.log(`${tplCount.c} bulletin templates already exist.`);
  }
}

seed().catch(console.error);
