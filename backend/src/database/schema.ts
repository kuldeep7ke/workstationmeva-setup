import fs from 'fs';
import path from 'path';
import { isPostgres, isSqlite, getDbMode, getAdapter, initPostgres, reconnectPostgres, PostgresAdapter } from './postgres';
import { SyncStatement } from './sync';

export const DB_DIR = path.join(__dirname, '..', '..');
const DB_PATH = path.join(DB_DIR, 'workstation.db');

let db: any = null;
let adapter: PostgresAdapter | null = null;
let initialized = false;
let persistEnabled = true;
const dbMode = getDbMode();

console.log(`[db] Initializing in ${dbMode} mode`);

// ===== SQLite imports (lazy) =====
let initSqlJs: any = null;

async function ensureSqlJs() {
  if (!initSqlJs) {
    const mod = await import('sql.js');
    initSqlJs = mod.default;
  }
  return initSqlJs();
}

// ===== Statement classes =====

class Statement {
  private stmt: any = null;
  private sql: string;
  constructor(sql: string) { this.sql = sql; }

  private ensure() {
    if (!this.stmt) this.stmt = db.prepare(this.sql);
    return this.stmt;
  }

  run(...params: any[]) {
    const s = this.ensure();
    if (params.length > 0) s.bind(params);
    else s.bind([]);
    s.step();
    s.reset();
    const r = db.exec('SELECT last_insert_rowid() as id, changes() as ch');
    const row = r?.[0]?.values?.[0];
    persist();
    return { lastInsertRowid: row?.[0] ?? 0, changes: row?.[1] ?? 0 };
  }

  get(...params: any[]) {
    const s = this.ensure();
    s.bind(params);
    if (s.step()) {
      const obj = s.getAsObject();
      s.reset();
      if (obj) return obj;
    }
    s.reset();
    return undefined;
  }

  all(...params: any[]) {
    const s = this.ensure();
    s.bind(params);
    const results: any[] = [];
    while (s.step()) results.push(s.getAsObject());
    s.reset();
    return results;
  }
}

class PgStatement {
  private sql: string;
  constructor(sql: string) { this.sql = sql; }

  async run(...params: any[]) {
    if (!adapter) throw new Error('PostgreSQL not initialized');
    return adapter.run(this.sql, params.length > 0 ? params : undefined);
  }

  async get(...params: any[]) {
    if (!adapter) throw new Error('PostgreSQL not initialized');
    return adapter.get(this.sql, params.length > 0 ? params : undefined);
  }

  async all(...params: any[]) {
    if (!adapter) throw new Error('PostgreSQL not initialized');
    return adapter.all(this.sql, params.length > 0 ? params : undefined);
  }
}

// ===== SQLite helpers =====

function persist() {
  if (!db || !persistEnabled) return;
  try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }
  catch (e) { console.error('[db] Persist failed (data loss risk):', e); }
}

export function setMirrorPersist(enabled: boolean): void {
  persistEnabled = enabled;
}

export function mirrorFlush(): void {
  persist();
}

export function mirrorReady(): boolean {
  return !!db;
}

export function mirrorRun(sql: string, params?: any[]): { lastInsertRowid: number; changes: number } {
  if (!db) throw new Error('Database not initialized.');
  return new Statement(sql).run(...(params || []));
}

export function mirrorGet(sql: string, params?: any[]): any {
  if (!db) throw new Error('Database not initialized.');
  return new Statement(sql).get(...(params || []));
}

export function mirrorAll(sql: string, params?: any[]): any[] {
  if (!db) throw new Error('Database not initialized.');
  return new Statement(sql).all(...(params || []));
}

export function mirrorExec(sql: string): void {
  if (!db) throw new Error('Database not initialized.');
  db.run(sql);
  persist();
}

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

export function backupDatabase(label?: string): string | null {
  if (isPostgres()) return null;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tag = label ? `-${label}` : '';
    const backupPath = path.join(BACKUP_DIR, `workstation-${ts}${tag}.db`);
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`[backup] Created: ${path.basename(backupPath)}`);
    return backupPath;
  } catch (e) {
    console.error('[backup] Failed:', e);
    return null;
  }
}

function seedDefaultBulletinTemplates() {
  try {
    const tplCount = db.exec('SELECT COUNT(*) as cnt FROM bulletin_templates');
    if (tplCount?.[0]?.values?.[0]?.[0]) return;
    const defaults = [
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
    for (const [name, time, sort] of defaults) {
      db.run('INSERT INTO bulletin_templates (name, publish_time, sort_order) VALUES (?,?,?)', [name, time, sort]);
    }
  } catch (e) {
    console.error('[db] Template seeding failed:', e);
  }
}

function columnExists(table: string, column: string): boolean {
  const info = db.exec(`PRAGMA table_info(${table})`);
  if (!info || !info[0]) return false;
  return info[0].values.some((row: any[]) => row[1] === column);
}

// ===== PostgreSQL schema (final state, no migrations needed) =====

const PG_TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  role TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'general' NOT NULL,
  access_level INTEGER NOT NULL DEFAULT 3 CHECK(access_level IN (1, 2, 3)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hold','suspended')),
  is_active INTEGER DEFAULT 1,
  is_archived INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  password_hint TEXT,
  pin TEXT DEFAULT '',
  shift_type TEXT DEFAULT 'general',
  shift_start TEXT DEFAULT '09:00',
  shift_end TEXT DEFAULT '17:00',
  weekly_off TEXT DEFAULT '[]',
  uid TEXT
);

CREATE TABLE IF NOT EXISTS bulletin_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  publish_time TIME,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  skip_reason TEXT,
  news_count INTEGER DEFAULT 5,
  news_level TEXT DEFAULT 'local',
  created_by INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bulletins (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  bulletin_type TEXT NOT NULL CHECK(bulletin_type IN ('breaking','special_report','ground_report','general')),
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  created_by INTEGER REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  uid TEXT
);

CREATE TABLE IF NOT EXISTS reporters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  photo_url TEXT,
  location TEXT,
  region TEXT DEFAULT 'local',
  specialization TEXT,
  bio TEXT,
  status TEXT DEFAULT 'active',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  story_type TEXT NOT NULL CHECK(story_type IN ('special_report','ground_report','interview','cover_story','crime_story','weather_report','viral_story')),
  description TEXT,
  data_gathered TEXT,
  script TEXT,
  plot_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','data_gathering','script_writing','plotting','add_ons','confirmation','approved','cancelled','send_to_tasks')),
  assigned_to INTEGER REFERENCES profiles(id),
  assigned_by INTEGER REFERENCES profiles(id),
  created_by INTEGER REFERENCES profiles(id),
  approved_by INTEGER REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  deadline TIMESTAMPTZ,
  editor_instructions TEXT,
  headline TEXT,
  short_description TEXT,
  hashtags TEXT,
  is_open INTEGER DEFAULT 0,
  voice_over_script TEXT,
  vo_artist INTEGER REFERENCES profiles(id),
  footage_details TEXT,
  guest_names TEXT,
  reporter_id INTEGER REFERENCES reporters(id),
  uid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archives (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  details TEXT,
  location TEXT,
  category TEXT DEFAULT 'footage',
  created_by INTEGER REFERENCES profiles(id),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  status TEXT DEFAULT 'online',
  availability TEXT DEFAULT 'available',
  stock_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT DEFAULT 'local',
  details TEXT,
  created_by INTEGER REFERENCES profiles(id),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  bulletin_id INTEGER REFERENCES bulletins(id),
  assigned_by INTEGER REFERENCES profiles(id),
  assigned_to INTEGER REFERENCES profiles(id),
  video_editor_id INTEGER REFERENCES profiles(id),
  reviewer_id INTEGER REFERENCES profiles(id),
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft','script_writing','footage_collection','waiting_confirmation','correction_required','approved','editor_assigned','teleprompter_ready','prompting','recording_done','editing','uploading','published','under_review','completed','cancelled','trashed')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('urgent','high','medium','low')),
  task_type TEXT NOT NULL DEFAULT 'general',
  news_category TEXT,
  headline TEXT,
  slug TEXT,
  anchor_intro TEXT,
  main_story TEXT,
  closing TEXT,
  visual_cues TEXT,
  pronunciation_notes TEXT,
  source_reference TEXT,
  duration TEXT,
  footage_checklist TEXT,
  camera_footage TEXT,
  reporter_footage TEXT,
  mobile_videos TEXT,
  photos TEXT,
  drone_shots TEXT,
  logos TEXT,
  graphics TEXT,
  archive_footage TEXT,
  scroll_speed TEXT,
  font_size TEXT,
  mirror_mode INTEGER DEFAULT 0,
  speaker_notes TEXT,
  script_imported_at TEXT,
  youtube_url TEXT,
  facebook_link TEXT,
  instagram_link TEXT,
  website_link TEXT,
  publish_date TEXT,
  published_by INTEGER REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  thumbnail_url TEXT,
  views_count INTEGER DEFAULT 0,
  script_writing_started_at TIMESTAMPTZ,
  script_writing_completed_at TIMESTAMPTZ,
  footage_collection_started_at TIMESTAMPTZ,
  footage_collection_completed_at TIMESTAMPTZ,
  recording_started_at TIMESTAMPTZ,
  recording_completed_at TIMESTAMPTZ,
  editing_started_at TIMESTAMPTZ,
  editing_completed_at TIMESTAMPTZ,
  revision_count INTEGER DEFAULT 0,
  correction_count INTEGER DEFAULT 0,
  role_data TEXT,
  bulletin_template_id INTEGER REFERENCES bulletin_templates(id),
  story_id INTEGER REFERENCES stories(id),
  completed_at TIMESTAMPTZ,
  remarks TEXT,
  youtube_title TEXT,
  youtube_description TEXT,
  youtube_keywords TEXT,
  correction_notes TEXT,
  correction_response TEXT,
  footage_source TEXT,
  deadline TIMESTAMPTZ,
  deadline_extended INTEGER DEFAULT 0,
  bulletin_date TEXT,
  version_number INTEGER DEFAULT 1,
  uid TEXT,
  archive_id INTEGER REFERENCES archives(id),
  location_id INTEGER REFERENCES locations(id),
  reporter_id INTEGER REFERENCES reporters(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anchor_tasks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER UNIQUE REFERENCES tasks(id),
  script TEXT,
  footage_url TEXT,
  recording_url TEXT,
  audio_url TEXT,
  publish_link TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','script_writing','footage_gathering','confirmation','approved','cancelled','video_editor_assigned','teleprompter','recording','published')),
  remarks TEXT,
  teleprompter_sent_at TIMESTAMPTZ,
  anchor_intro TEXT,
  main_story TEXT,
  closing TEXT,
  visual_cues TEXT,
  pronunciation_notes TEXT,
  source_reference TEXT,
  duration TEXT,
  scroll_speed TEXT,
  font_size TEXT,
  mirror_mode INTEGER DEFAULT 0,
  speaker_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_editor_tasks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER UNIQUE REFERENCES tasks(id),
  edited_video_url TEXT,
  thumbnail_url TEXT,
  upload_url TEXT,
  retakes INTEGER DEFAULT 0,
  corrections TEXT,
  anchoring_tone TEXT CHECK(anchoring_tone IN ('excellent','good','average','needs_improvement')),
  news_age TEXT CHECK(news_age IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials')),
  remarks TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','editing','production','uploaded','verified','reviewed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  description TEXT,
  duration_seconds INTEGER,
  rate DECIMAL(10,2),
  ad_type TEXT,
  party_type TEXT,
  booked_by TEXT DEFAULT 'client',
  reporter_id INTEGER REFERENCES reporters(id),
  agency_name TEXT,
  slots_count INTEGER DEFAULT 0,
  ad_place TEXT,
  brand_type TEXT,
  renewal_type TEXT DEFAULT 'one_time',
  renewal_period TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','completed')),
  created_by INTEGER REFERENCES profiles(id),
  uid TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS special_programs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  program_type TEXT CHECK(program_type IN ('live_coverage','special_program','interview','event')),
  description TEXT,
  schedule_date DATE,
  schedule_time TEXT,
  status TEXT DEFAULT 'planned' CHECK(status IN ('planned','ongoing','paused','completed','cancelled')),
  assigned_to INTEGER REFERENCES profiles(id),
  created_by INTEGER REFERENCES profiles(id),
  uid TEXT,
  reporter_id INTEGER REFERENCES reporters(id),
  deleted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES profiles(id),
  from_user_id INTEGER REFERENCES profiles(id),
  type TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  title TEXT NOT NULL,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_bulletin_defaults (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  publish_time TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_bulletin_defaults (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  publish_time TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_news_items (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  sort_order INTEGER DEFAULT 0,
  slug TEXT,
  news_script TEXT,
  reporter_name TEXT,
  reporter_id INTEGER REFERENCES reporters(id),
  anchor_name TEXT,
  footage_description TEXT,
  footage_type TEXT,
  location TEXT,
  correction_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_activities (
  id SERIAL PRIMARY KEY,
  story_id INTEGER NOT NULL REFERENCES stories(id),
  user_id INTEGER REFERENCES profiles(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_metadata (
  id SERIAL PRIMARY KEY,
  channel_name TEXT NOT NULL DEFAULT '',
  channel_display_name TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  editor_name TEXT NOT NULL DEFAULT '',
  editor_position TEXT NOT NULL DEFAULT '',
  subscribe_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_extensions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  extended_by INTEGER NOT NULL REFERENCES profiles(id),
  old_deadline TIMESTAMPTZ,
  new_deadline TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER,
  full_name TEXT NOT NULL,
  email TEXT,
    action TEXT NOT NULL CHECK(action IN ('success','failed_password','failed_pin','failed_approval','failed_status','failed_pin_reset','pin_reset')),
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_activity (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER,
  full_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_activity (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_collaborators (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, profile_id)
);

CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  arrangement_profile_id INTEGER REFERENCES profiles(id),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS task_audit_log (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  profile_name TEXT,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  label TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'system',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  auto_enabled INTEGER NOT NULL DEFAULT 1,
  min_interval_min INTEGER NOT NULL DEFAULT 15,
  max_backups INTEGER NOT NULL DEFAULT 50
);

CREATE TABLE IF NOT EXISTS telemetry_errors (
  id SERIAL PRIMARY KEY,
  user_id BIGINT,
  username TEXT,
  page TEXT,
  error_type TEXT,
  message TEXT,
  stack TEXT,
  source TEXT,
  line INTEGER,
  col INTEGER,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

// ===== Database initialization =====

// Re-seed the factory default rows on PostgreSQL (used after a fresh-start reset).
export async function seedPostgresDefaults(): Promise<void> {
  const { getAdapter } = await import('./postgres');
  const adapter = getAdapter();
  // Seed default bulletin templates
  try {
    const cnt = await adapter.get('SELECT COUNT(*) as cnt FROM bulletin_templates');
    if (!cnt?.cnt || cnt.cnt === '0' || cnt.cnt === 0) {
      const defaults = [
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
      for (const [name, time, sort] of defaults) {
        await adapter.raw('INSERT INTO bulletin_templates (name, publish_time, sort_order) VALUES ($1,$2,$3)', [name, time, sort]);
      }
    }
  } catch (e) { console.error('[db] PG template seeding failed:', e); }
  // Seed channel_metadata - default is empty so frontend shows "Workstation Meva" via fallback
  // Custom names only show when user explicitly sets them via Settings -> Channel Metadata
  try {
    const cnt = await adapter.get('SELECT COUNT(*) as cnt FROM channel_metadata');
    if (!cnt?.cnt || cnt.cnt === '0' || cnt.cnt === 0) {
      await adapter.raw("INSERT INTO channel_metadata (channel_name, channel_display_name, website_url, editor_name, editor_position, subscribe_url) VALUES ('', '', '', '', '', '')");
    }
  } catch (e) { console.error('[db] PG channel_metadata seeding failed:', e); }
  // Seed backup_config
  try {
    const cnt = await adapter.get('SELECT COUNT(*) as cnt FROM backup_config');
    if (!cnt?.cnt || cnt.cnt === '0' || cnt.cnt === 0) {
      await adapter.raw('INSERT INTO backup_config (id, auto_enabled, min_interval_min, max_backups) VALUES (1, 1, 15, 50)');
    }
  } catch (e) { console.error('[db] PG backup_config seeding failed:', e); }
}

export async function initDatabase() {
  if (initialized) return;

  if (isPostgres()) {
    try {
      adapter = await initPostgres();
      const stmts = PG_TABLES.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const sql of stmts) {
        try { await adapter.raw(sql); } catch (e: any) {
          // Skip duplicate table errors
          if (!e.message?.includes('already exists')) {
            console.error('[db] PG table creation error:', e.message);
          }
        }
      }
      // Soft-delete columns for tables created before recycle-bin support
      for (const sql of [
        'ALTER TABLE ads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
        'ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
        'ALTER TABLE reporters ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
        'ALTER TABLE ads ADD COLUMN IF NOT EXISTS brand_type TEXT',
      ]) {
        try { await adapter.raw(sql); } catch (e: any) { console.error('[db] PG migration error:', e.message); }
      }
      // Stock status columns for archive footage
      for (const sql of [
        "ALTER TABLE archives ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'online'",
        "ALTER TABLE archives ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT 'available'",
        'ALTER TABLE archives ADD COLUMN IF NOT EXISTS stock_updated_at TIMESTAMPTZ',
      ]) {
        try { await adapter.raw(sql); } catch (e: any) { console.error('[db] PG migration error:', e.message); }
      }
      // Self-healing reconciliation: the live Supabase tables (created by older
      // releases) miss columns added since then — CREATE TABLE IF NOT EXISTS is a
      // no-op on existing tables, so pre-existing live tables never gained them
      // (e.g. ads.brand_type, tasks.reviewer_id, profiles.pin, ...). Reconcile every
      // canonical table against PG_TABLES with idempotent ADD COLUMN IF NOT EXISTS
      // so the live DB always matches the code after a restart.
      {
        const blockRe = /CREATE TABLE (?:IF NOT EXISTS )?\s*"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(([\s\S]*?)\)\s*(?:;)/g;
        let bM: RegExpExecArray | null;
        const tEnds: Array<{ table: string; body: string }> = [];
        while ((bM = blockRe.exec(PG_TABLES))) {
          tEnds.push({ table: bM[1].toLowerCase(), body: bM[2] });
        }
        const typeRe = /^\s*"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+(SERIAL|BIGINT|INTEGER|INT|REAL|NUMERIC|DECIMAL\([^)]*\)|BOOLEAN|TIMESTAMPTZ|TIMESTAMP|DATE|TIME|TEXT|VARCHAR\([^)]*\))/i;
        for (const { table, body } of tEnds) {
          if (table === 'backup_config') continue; // fixed single-row table, no sync writes
          for (const line of body.split('\n')) {
            const cM = line.match(typeRe);
            if (!cM) continue;
            const col = cM[1].toLowerCase();
            if (col === 'id') continue;
            const base = cM[2].toUpperCase().startsWith('SERIAL') ? 'INTEGER' : cM[2];
            try {
              await adapter.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "${col}" ${base}`);
            } catch (e: any) {
              console.error(`[db] PG reconcile ${table}.${col}:`, e.message);
            }
          }
        }
      }
      // Repair anchor_tasks CHECK constraint created with the wrong vocabulary
      // (footage_collection/editor_assigned) before the anchor-flow fix — the code
      // and SQLite mirror use footage_gathering/video_editor_assigned.
      try {
        await adapter.raw('ALTER TABLE anchor_tasks DROP CONSTRAINT IF EXISTS anchor_tasks_status_check');
        await adapter.raw("ALTER TABLE anchor_tasks ADD CONSTRAINT anchor_tasks_status_check CHECK(status IN ('pending','script_writing','footage_gathering','confirmation','approved','cancelled','video_editor_assigned','teleprompter','recording','published'))");
      } catch (e: any) { console.error('[db] PG anchor_tasks constraint repair failed:', e.message); }
      // Repair login_attempts CHECK constraint: the login/pin flows also log
      // 'failed_status' (blocked login: offline/suspended), 'failed_pin_reset'
      // and 'pin_reset', but the original CHECK only allowed 4 actions — blocked
      // logins used to fail the write and jam the sync queue with retries.
      try {
        await adapter.raw('ALTER TABLE login_attempts DROP CONSTRAINT IF EXISTS login_attempts_action_check');
        await adapter.raw("ALTER TABLE login_attempts ADD CONSTRAINT login_attempts_action_check CHECK(action IN ('success','failed_password','failed_pin','failed_approval','failed_status','failed_pin_reset','pin_reset'))");
      } catch (e: any) { console.error('[db] PG login_attempts constraint repair failed:', e.message); }
      await seedPostgresDefaults();
      console.log('[db] PostgreSQL schema initialized');
    } catch (e: any) {
      adapter = null;
      console.error(`[db] PostgreSQL unavailable at startup (${e.message}) — starting OFFLINE on the local database; changes will sync when the connection returns.`);
    }
  }

  // Local mirror (sql.js) — always initialized; serves reads/writes when the
  // cloud database is unreachable and keeps the sync queue.
  const SQL = await ensureSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  createTables();
  seedDefaultBulletinTemplates();
  if (!isPostgres()) backupDatabase('pre-migration');
  runMigrations();

  const { initSyncEngine } = await import('./sync');
  await initSyncEngine({
    run: mirrorRun,
    get: mirrorGet,
    all: mirrorAll,
    exec: mirrorExec,
    ready: mirrorReady,
    setPersist: setMirrorPersist,
    flush: mirrorFlush,
  });

  initialized = true;
}

// Reconnect to a different database at runtime (used by Settings → Database Connection).
// Closes the old pool, updates DATABASE_URL, and re-runs schema initialization.
// With preserveMirror the local mirror's data is kept (only the stale sync queue
// is dropped) so the caller can push it up or pull the new database down; without
// it the mirror is fully cleared and rebuilt from the new database.
export async function reinitDatabase(url: string, opts?: { preserveMirror?: boolean }): Promise<void> {
  if (process.env.DB_TYPE === 'sqlite' || process.env.ANDROID === 'true') {
    throw new Error('Database switching is not available in SQLite mode.');
  }
  process.env.DATABASE_URL = url;
  initialized = false;
  if (adapter) {
    try { await adapter.close(); } catch (e) { console.error('[db] Error closing old pool:', e); }
    adapter = null;
  }
  const { clearSyncQueue, resetMirrorAndQueue } = await import('./sync');
  if (opts?.preserveMirror) {
    // Keep the local mirror (the caller pushes/pulls it) but drop stale queued
    // changes from the previous connection so they don't replay into the new DB.
    try { clearSyncQueue(); } catch (e: any) {
      console.error('[db] Sync queue clear before reinit failed:', e.message);
    }
  } else {
    // Clear the local mirror and sync queue BEFORE re-initializing, so the
    // mirror is rebuilt from the new database and no stale outbox entries
    // from the previous connection get replayed into it.
    try {
      await resetMirrorAndQueue();
    } catch (e: any) {
      console.error('[db] Mirror reset before reinit failed:', e.message);
    }
  }
  db = null;
  await initDatabase();
  console.log('[db] Database reinitialized with new connection');
}

// ===== SQLite table creation (unchanged) =====

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'general' NOT NULL,
      access_level INTEGER NOT NULL DEFAULT 3 CHECK(access_level IN (1, 2, 3)),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hold','suspended')),
      is_active INTEGER DEFAULT 1,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deactivated_at TEXT,
      password_hint TEXT,
      pin TEXT DEFAULT '',
      shift_type TEXT DEFAULT 'general',
      shift_start TEXT DEFAULT '09:00',
      shift_end TEXT DEFAULT '17:00',
      weekly_off TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS bulletin_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      publish_time TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      skip_reason TEXT,
      news_count INTEGER DEFAULT 5,
      news_level TEXT DEFAULT 'local',
      created_by INTEGER REFERENCES profiles(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bulletins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      bulletin_type TEXT NOT NULL CHECK(bulletin_type IN ('breaking','special_report','ground_report','general')),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      created_by INTEGER REFERENCES profiles(id),
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
CREATE TABLE IF NOT EXISTS archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  details TEXT,
  location TEXT,
  category TEXT DEFAULT 'footage',
  created_by INTEGER REFERENCES profiles(id),
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  status TEXT DEFAULT 'online',
  availability TEXT DEFAULT 'available',
  stock_updated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  region TEXT DEFAULT 'local',
  details TEXT,
  created_by INTEGER REFERENCES profiles(id),
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      bulletin_id INTEGER REFERENCES bulletins(id),
      assigned_by INTEGER REFERENCES profiles(id),
      assigned_to INTEGER REFERENCES profiles(id),
      video_editor_id INTEGER REFERENCES profiles(id),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmation','approved','in_progress','completed','verified','production','uploading','finalized','correction','trashed','expired','cancelled')),
      priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')),
      task_type TEXT NOT NULL DEFAULT 'general',
      role_data TEXT,
      bulletin_template_id INTEGER REFERENCES bulletin_templates(id),
      story_id INTEGER REFERENCES stories(id),
      completed_at TEXT,
      remarks TEXT,
      youtube_url TEXT,
      youtube_title TEXT,
      youtube_description TEXT,
      youtube_keywords TEXT,
      correction_notes TEXT,
      correction_response TEXT,
      footage_source TEXT,
      deadline TEXT,
      deadline_extended INTEGER DEFAULT 0,
      bulletin_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS anchor_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER UNIQUE REFERENCES tasks(id),
      script TEXT,
      footage_url TEXT,
      recording_url TEXT,
      audio_url TEXT,
      publish_link TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','script_writing','footage_gathering','confirmation','approved','cancelled','video_editor_assigned','teleprompter','recording','published')),
      remarks TEXT,
      teleprompter_sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS video_editor_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER UNIQUE REFERENCES tasks(id),
      edited_video_url TEXT,
      thumbnail_url TEXT,
      upload_url TEXT,
      retakes INTEGER DEFAULT 0,
      corrections TEXT,
      anchoring_tone TEXT CHECK(anchoring_tone IN ('excellent','good','average','needs_improvement')),
      news_age TEXT CHECK(news_age IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials')),
      remarks TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','editing','production','uploaded','verified','reviewed')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client_name TEXT NOT NULL,
      description TEXT,
      duration_seconds INTEGER,
      rate DECIMAL(10,2),
      ad_type TEXT,
      party_type TEXT,
      booked_by TEXT DEFAULT 'client',
      reporter_id INTEGER REFERENCES reporters(id),
      agency_name TEXT,
      slots_count INTEGER DEFAULT 0,
      ad_place TEXT,
      brand_type TEXT,
      renewal_type TEXT DEFAULT 'one_time',
      renewal_period TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','completed')),
      created_by INTEGER REFERENCES profiles(id),
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS special_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      program_type TEXT CHECK(program_type IN ('live_coverage','special_program','interview','event')),
      description TEXT,
      schedule_date TEXT,
      status TEXT DEFAULT 'planned' CHECK(status IN ('planned','ongoing','paused','completed','cancelled')),
      assigned_to INTEGER REFERENCES profiles(id),
      created_by INTEGER REFERENCES profiles(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES profiles(id),
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS telemetry_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      page TEXT,
      error_type TEXT,
      message TEXT,
      stack TEXT,
      source TEXT,
      line INTEGER,
      col INTEGER,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- LAN-wide toast history (local telemetry only - never synced to PG).
    CREATE TABLE IF NOT EXISTS toast_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Dev-tool scheduled notifications (local queue only - never synced to PG).
    CREATE TABLE IF NOT EXISTS scheduled_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      access_levels TEXT NOT NULL,
      deliver_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  persist();
}

// ===== SQLite migrations (unchanged, only runs for SQLite) =====

function runMigrations() {
  // Rebuild login_attempts when it still has the old CHECK constraint (only 4
  // actions) — blocked logins ('failed_status'), PIN resets and 'pin_reset'
  // would otherwise fail the write and jam the sync queue with retries.
  try {
    const def = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='login_attempts'");
    if (def.length > 0 && !/failed_status/.test(String(def[0].values[0][0]))) {
      db.run(`CREATE TABLE login_attempts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        full_name TEXT NOT NULL,
        email TEXT,
        action TEXT NOT NULL CHECK(action IN ('success','failed_password','failed_pin','failed_approval','failed_status','failed_pin_reset','pin_reset')),
        details TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run('INSERT INTO login_attempts_new (id, profile_id, full_name, email, action, details, ip_address, created_at) SELECT id, profile_id, full_name, email, action, details, ip_address, created_at FROM login_attempts');
      db.run('DROP TABLE login_attempts');
      db.run('ALTER TABLE login_attempts_new RENAME TO login_attempts');
      console.log('[migration] login_attempts CHECK constraint upgraded');
    }
  } catch (e) { console.error('[migration] login_attempts constraint rebuild failed:', e); }

  // Clean up orphaned migration table from a previously interrupted upgrade
  try {
    const liveTasks = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
    const orphanNew = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_new'");
    if (liveTasks.length > 0 && orphanNew.length > 0) {
      db.run('DROP TABLE IF EXISTS tasks_new');
      console.log('[migration] Removed orphaned tasks_new table');
    }
  } catch (e) { console.error('[migration] tasks_new cleanup failed:', e); }

  if (!columnExists('users', 'role')) {
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'general'");
  }
  if (!columnExists('bulletin_templates', 'skip_reason')) {
    db.run("ALTER TABLE bulletin_templates ADD COLUMN skip_reason TEXT");
  }
  if (!columnExists('tasks', 'role_data')) {
    db.run("ALTER TABLE tasks ADD COLUMN role_data TEXT");
  }
  if (!columnExists('tasks', 'bulletin_template_id')) {
    db.run("ALTER TABLE tasks ADD COLUMN bulletin_template_id INTEGER REFERENCES bulletin_templates(id)");
  }
  if (!columnExists('tasks', 'youtube_url')) {
    db.run("ALTER TABLE tasks ADD COLUMN youtube_url TEXT");
  }
  if (!columnExists('tasks', 'footage_source')) {
    db.run("ALTER TABLE tasks ADD COLUMN footage_source TEXT");
  }
  if (!columnExists('anchor_tasks', 'teleprompter_sent_at')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN teleprompter_sent_at TEXT");
  }
  if (!columnExists('notifications', 'id')) {
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES profiles(id),
      from_user_id INTEGER REFERENCES profiles(id),
      type TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      title TEXT NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  }
  db.run(`CREATE TABLE IF NOT EXISTS user_bulletin_defaults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES profiles(id),
    name TEXT NOT NULL,
    publish_time TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS system_bulletin_defaults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    publish_time TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    story_type TEXT NOT NULL CHECK(story_type IN ('special_report','ground_report','interview','cover_story','crime_story','weather_report','viral_story')),
    description TEXT,
    data_gathered TEXT,
    script TEXT,
    plot_notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','data_gathering','script_writing','plotting','add_ons','confirmation','approved','cancelled','send_to_tasks')),
    assigned_to INTEGER REFERENCES profiles(id),
    assigned_by INTEGER REFERENCES profiles(id),
    created_by INTEGER REFERENCES profiles(id),
    approved_by INTEGER REFERENCES profiles(id),
    approved_at TEXT,
    rejection_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS story_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL REFERENCES stories(id),
    user_id INTEGER REFERENCES profiles(id),
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  if (!columnExists('tasks', 'story_id')) {
    db.run("ALTER TABLE tasks ADD COLUMN story_id INTEGER REFERENCES stories(id)");
  }
  const taskSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
  const taskCreateSql = taskSql?.[0]?.values?.[0]?.[0] || '';
  const hasOldCheck = taskCreateSql.includes('CHECK') && taskCreateSql.includes('task_type');
  const hasOldPriority = taskCreateSql.includes('bulletin_news');
  const missingNewPriority = !taskCreateSql.includes('new_ads');
  const alreadyUpgraded = taskCreateSql.includes('uploading');
  if ((hasOldCheck || hasOldPriority || missingNewPriority) && !alreadyUpgraded) {
    try { db.run("CREATE TABLE tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, bulletin_id INTEGER REFERENCES bulletins(id), assigned_by INTEGER REFERENCES profiles(id), assigned_to INTEGER REFERENCES profiles(id), status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','verified','cancelled')), priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')), task_type TEXT NOT NULL DEFAULT 'general', role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id), story_id INTEGER REFERENCES stories(id), completed_at TEXT, remarks TEXT, youtube_url TEXT, footage_source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
    db.run('INSERT INTO tasks_new (id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at) SELECT id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at FROM tasks');
    db.run('DROP TABLE tasks');
    db.run('ALTER TABLE tasks_new RENAME TO tasks');
    } catch (e) { console.error('[migration] tasks upgrade (old priority) failed:', e); }
  }
  if (!columnExists('stories', 'deadline')) {
    db.run("ALTER TABLE stories ADD COLUMN deadline TEXT");
  }
  if (!columnExists('stories', 'editor_instructions')) {
    db.run("ALTER TABLE stories ADD COLUMN editor_instructions TEXT");
  }
  if (!columnExists('stories', 'headline')) {
    db.run("ALTER TABLE stories ADD COLUMN headline TEXT");
  }
  if (!columnExists('stories', 'short_description')) {
    db.run("ALTER TABLE stories ADD COLUMN short_description TEXT");
  }
  if (!columnExists('stories', 'hashtags')) {
    db.run("ALTER TABLE stories ADD COLUMN hashtags TEXT");
  }
  if (!columnExists('stories', 'is_open')) {
    db.run("ALTER TABLE stories ADD COLUMN is_open INTEGER DEFAULT 0");
  }
  if (!columnExists('stories', 'voice_over_script')) {
    db.run("ALTER TABLE stories ADD COLUMN voice_over_script TEXT");
  }
  if (!columnExists('stories', 'vo_artist')) {
    db.run("ALTER TABLE stories ADD COLUMN vo_artist INTEGER REFERENCES profiles(id)");
  }
  // Repair vo_artist FK on mirrors created before the fix above: it pointed at
  // users(id) while the code and PG_TABLES join against profiles(id), so any
  // vo_artist write failed the mirror's FK check (PRAGMA foreign_keys=ON).
  try {
    const storiesDdl = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='stories'")?.[0]?.values?.[0]?.[0] || '';
    if (storiesDdl.includes('vo_artist INTEGER REFERENCES users(id)')) {
      const cols = (db.exec('PRAGMA table_info(stories)')?.[0]?.values || []).map((r: any[]) => r[1]).join(', ');
      db.run('DROP TABLE IF EXISTS stories_new');
      db.run(storiesDdl.replace('CREATE TABLE stories', 'CREATE TABLE stories_new').replace('vo_artist INTEGER REFERENCES users(id)', 'vo_artist INTEGER REFERENCES profiles(id)'));
      db.run(`INSERT INTO stories_new (${cols}) SELECT ${cols} FROM stories`);
      db.run('DROP TABLE stories');
      db.run('ALTER TABLE stories_new RENAME TO stories');
      console.log('[migration] stories.vo_artist FK repaired (users -> profiles)');
    }
  } catch (e: any) {
    console.error('[migration] stories.vo_artist FK repair failed:', e.message);
  }
  if (!columnExists('stories', 'footage_details')) {
    db.run("ALTER TABLE stories ADD COLUMN footage_details TEXT");
  }
  if (!columnExists('stories', 'guest_names')) {
    db.run("ALTER TABLE stories ADD COLUMN guest_names TEXT");
  }
  if (!columnExists('tasks', 'story_id')) {
    db.run("ALTER TABLE tasks ADD COLUMN story_id INTEGER REFERENCES stories(id)");
  }
  const hasNewsItems = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='task_news_items'");
  if (hasNewsItems.length === 0) {
    db.run(`CREATE TABLE task_news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      sort_order INTEGER DEFAULT 0,
      slug TEXT,
      news_script TEXT,
      reporter_name TEXT,
      reporter_id INTEGER REFERENCES reporters(id),
      anchor_name TEXT,
      footage_description TEXT,
      footage_type TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  } else {
    const createSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_news_items'");
    const hasConstraint = createSql?.[0]?.values?.[0]?.[0]?.includes('CHECK');
    if (hasConstraint) {
      try {
        db.run("CREATE TABLE task_news_items_new (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES tasks(id), sort_order INTEGER DEFAULT 0, slug TEXT, news_script TEXT, reporter_name TEXT, reporter_id INTEGER REFERENCES reporters(id), anchor_name TEXT, footage_description TEXT, footage_type TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
        db.run("INSERT INTO task_news_items_new (id, task_id, sort_order, slug, news_script, reporter_name, reporter_id, anchor_name, footage_description, footage_type, created_at, updated_at) SELECT id, task_id, sort_order, slug, news_script, reporter_name, NULL, anchor_name, footage_description, footage_type, created_at, updated_at FROM task_news_items");
        db.run("DROP TABLE task_news_items");
        db.run("ALTER TABLE task_news_items_new RENAME TO task_news_items");
      } catch (e) {
        console.error('Failed to migrate task_news_items table:', e);
      }
    }
    if (!columnExists('task_news_items', 'reporter_id')) {
      db.run("ALTER TABLE task_news_items ADD COLUMN reporter_id INTEGER REFERENCES reporters(id)");
    }
  }
  const hasReporters = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='reporters'");
  if (hasReporters.length === 0) {
    db.run(`CREATE TABLE reporters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      photo_url TEXT,
      location TEXT,
      region TEXT DEFAULT 'local',
      specialization TEXT,
      bio TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  }
  if (!columnExists('reporters', 'email')) {
    db.run("ALTER TABLE reporters ADD COLUMN email TEXT");
  }
  if (!columnExists('reporters', 'phone')) {
    db.run("ALTER TABLE reporters ADD COLUMN phone TEXT");
  }
  if (!columnExists('reporters', 'photo_url')) {
    db.run("ALTER TABLE reporters ADD COLUMN photo_url TEXT");
  }
  if (!columnExists('reporters', 'specialization')) {
    db.run("ALTER TABLE reporters ADD COLUMN specialization TEXT");
  }
  if (!columnExists('reporters', 'bio')) {
    db.run("ALTER TABLE reporters ADD COLUMN bio TEXT");
  }
  if (!columnExists('reporters', 'status')) {
    db.run("ALTER TABLE reporters ADD COLUMN status TEXT DEFAULT 'active'");
  }
  if (!columnExists('stories', 'reporter_id')) {
    db.run("ALTER TABLE stories ADD COLUMN reporter_id INTEGER REFERENCES reporters(id)");
  }
  if (!columnExists('ads', 'reporter_id')) {
    db.run("ALTER TABLE ads ADD COLUMN reporter_id INTEGER REFERENCES reporters(id)");
  }
  if (!columnExists('special_programs', 'reporter_id')) {
    db.run("ALTER TABLE special_programs ADD COLUMN reporter_id INTEGER REFERENCES reporters(id)");
  }
  if (!columnExists('tasks', 'reporter_id')) {
    db.run("ALTER TABLE tasks ADD COLUMN reporter_id INTEGER REFERENCES reporters(id)");
  }

  const hasArchives = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='archives'");
  if (hasArchives.length === 0) {
    db.run(`CREATE TABLE archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      details TEXT,
      location TEXT,
      category TEXT DEFAULT 'footage',
      created_by INTEGER REFERENCES profiles(id),
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      status TEXT DEFAULT 'online',
      availability TEXT DEFAULT 'available',
      stock_updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  }
  if (!columnExists('archives', 'details')) {
    db.run("ALTER TABLE archives ADD COLUMN details TEXT");
  }
  if (!columnExists('archives', 'location')) {
    db.run("ALTER TABLE archives ADD COLUMN location TEXT");
  }
  if (!columnExists('archives', 'category')) {
    db.run("ALTER TABLE archives ADD COLUMN category TEXT DEFAULT 'footage'");
  }
  if (!columnExists('archives', 'created_by')) {
    db.run("ALTER TABLE archives ADD COLUMN created_by INTEGER REFERENCES profiles(id)");
  }
  if (!columnExists('archives', 'usage_count')) {
    db.run("ALTER TABLE archives ADD COLUMN usage_count INTEGER DEFAULT 0");
  }
  if (!columnExists('archives', 'last_used_at')) {
    db.run("ALTER TABLE archives ADD COLUMN last_used_at TEXT");
  }
  if (!columnExists('archives', 'status')) {
    db.run("ALTER TABLE archives ADD COLUMN status TEXT DEFAULT 'online'");
  }
  if (!columnExists('archives', 'availability')) {
    db.run("ALTER TABLE archives ADD COLUMN availability TEXT DEFAULT 'available'");
  }
  if (!columnExists('archives', 'stock_updated_at')) {
    db.run("ALTER TABLE archives ADD COLUMN stock_updated_at TEXT");
  }
  if (!columnExists('tasks', 'archive_id')) {
    db.run("ALTER TABLE tasks ADD COLUMN archive_id INTEGER REFERENCES archives(id)");
  }

  const hasLocations = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'");
  if (hasLocations.length === 0) {
    db.run(`CREATE TABLE locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      region TEXT DEFAULT 'local',
      details TEXT,
      created_by INTEGER REFERENCES profiles(id),
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  }
  if (!columnExists('locations', 'region')) {
    db.run("ALTER TABLE locations ADD COLUMN region TEXT DEFAULT 'local'");
  }
  if (!columnExists('locations', 'details')) {
    db.run("ALTER TABLE locations ADD COLUMN details TEXT");
  }
  if (!columnExists('locations', 'created_by')) {
    db.run("ALTER TABLE locations ADD COLUMN created_by INTEGER REFERENCES profiles(id)");
  }
  if (!columnExists('locations', 'usage_count')) {
    db.run("ALTER TABLE locations ADD COLUMN usage_count INTEGER DEFAULT 0");
  }
  if (!columnExists('locations', 'last_used_at')) {
    db.run("ALTER TABLE locations ADD COLUMN last_used_at TEXT");
  }
  if (!columnExists('tasks', 'location_id')) {
    db.run("ALTER TABLE tasks ADD COLUMN location_id INTEGER REFERENCES locations(id)");
  }

  try {
    const taskStatusSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
    const taskHasOldStatus = taskStatusSql?.[0]?.values?.[0]?.[0]?.includes("'in_progress','completed','verified','cancelled'") &&
      !taskStatusSql?.[0]?.values?.[0]?.[0]?.includes("'confirmation'");
    if (taskHasOldStatus) {
      db.run("CREATE TABLE tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, bulletin_id INTEGER REFERENCES bulletins(id), assigned_by INTEGER REFERENCES profiles(id), assigned_to INTEGER REFERENCES profiles(id), status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmation','approved','in_progress','completed','verified','cancelled')), priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')), task_type TEXT NOT NULL DEFAULT 'general', role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id), story_id INTEGER REFERENCES stories(id), completed_at TEXT, remarks TEXT, youtube_url TEXT, footage_source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
      db.run('INSERT INTO tasks_new SELECT * FROM tasks');
      db.run('DROP TABLE tasks');
      db.run('ALTER TABLE tasks_new RENAME TO tasks');
    }

    const anchorStatusSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='anchor_tasks'");
    const anchorHasOldStatus = anchorStatusSql?.[0]?.values?.[0]?.[0]?.includes("'script_done'");
    if (anchorHasOldStatus) {
      db.run("CREATE TABLE anchor_tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER UNIQUE REFERENCES tasks(id), script TEXT, footage_url TEXT, recording_url TEXT, publish_link TEXT, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','script_writing','footage_gathering','confirmation','approved','cancelled','video_editor_assigned','teleprompter','recording','published')), remarks TEXT, teleprompter_sent_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
      db.run('INSERT INTO anchor_tasks_new SELECT * FROM anchor_tasks');
      db.run('DROP TABLE anchor_tasks');
      db.run('ALTER TABLE anchor_tasks_new RENAME TO anchor_tasks');
    }

    const editorStatusSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='video_editor_tasks'");
    const editorHasOldStatus = editorStatusSql?.[0]?.values?.[0]?.[0]?.includes("'thumbnail_done'");
    if (editorHasOldStatus) {
      db.run("CREATE TABLE video_editor_tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER UNIQUE REFERENCES tasks(id), edited_video_url TEXT, thumbnail_url TEXT, upload_url TEXT, retakes INTEGER DEFAULT 0, corrections TEXT, anchoring_tone TEXT CHECK(anchoring_tone IN ('excellent','good','average','needs_improvement')), news_age TEXT CHECK(news_age IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials')), remarks TEXT, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','editing','production','uploaded','verified','reviewed')), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
      db.run('INSERT INTO video_editor_tasks_new SELECT * FROM video_editor_tasks');
      db.run('DROP TABLE video_editor_tasks');
      db.run('ALTER TABLE video_editor_tasks_new RENAME TO video_editor_tasks');
    }

    const storyStatusSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='stories'");
    const storyHasOldStatus = storyStatusSql?.[0]?.values?.[0]?.[0]?.includes("'script_finalized'");
    if (storyHasOldStatus) {
      db.run("CREATE TABLE stories_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, story_type TEXT NOT NULL CHECK(story_type IN ('special_report','ground_report','interview','cover_story','crime_story','weather_report','viral_story')), description TEXT, data_gathered TEXT, script TEXT, plot_notes TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','data_gathering','script_writing','plotting','add_ons','confirmation','approved','cancelled','send_to_tasks')), assigned_to INTEGER REFERENCES profiles(id), assigned_by INTEGER REFERENCES profiles(id), created_by INTEGER REFERENCES profiles(id), approved_by INTEGER REFERENCES profiles(id), approved_at TEXT, rejection_reason TEXT, deadline TEXT, editor_instructions TEXT, headline TEXT, short_description TEXT, hashtags TEXT, is_open INTEGER DEFAULT 0, voice_over_script TEXT,     vo_artist INTEGER REFERENCES profiles(id), footage_details TEXT, guest_names TEXT, reporter_id INTEGER REFERENCES reporters(id), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
      db.run('INSERT INTO stories_new SELECT * FROM stories');
      db.run('DROP TABLE stories');
      db.run('ALTER TABLE stories_new RENAME TO stories');
    }
  } catch (e) { console.error('[migration] Legacy table migrations failed (non-fatal):', e); }

  if (!columnExists('task_news_items', 'location')) {
    db.run("ALTER TABLE task_news_items ADD COLUMN location TEXT");
  }

  try {
    const legacyTaskCreate = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0] || '';
    if (legacyTaskCreate.includes("'script_writing'")) { /* already V2 */ }
    else {
      const taskPrioritySql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
      const taskMissingBulletin = taskPrioritySql?.[0]?.values?.[0]?.[0]?.includes("'single_news'") &&
        !taskPrioritySql?.[0]?.values?.[0]?.[0]?.includes("'bulletin'");
      if (taskMissingBulletin) {
        db.run("CREATE TABLE tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, bulletin_id INTEGER REFERENCES bulletins(id), assigned_by INTEGER REFERENCES profiles(id), assigned_to INTEGER REFERENCES profiles(id), status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmation','approved','in_progress','completed','verified','cancelled')), priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')), task_type TEXT NOT NULL DEFAULT 'general', role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id), story_id INTEGER REFERENCES stories(id), completed_at TEXT, remarks TEXT, youtube_url TEXT, footage_source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
        db.run('INSERT INTO tasks_new (id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at) SELECT id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at FROM tasks');
        db.run('DROP TABLE tasks');
        db.run('ALTER TABLE tasks_new RENAME TO tasks');
      }

      const taskCols2 = db.exec('PRAGMA table_info(tasks)');
      const missingVideoEditorId = taskCols2?.[0]?.values?.every((r: any[]) => r[1] !== 'video_editor_id');
      const taskMissingProduction = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'verified','cancelled'") &&
        !db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'production'");
      if (missingVideoEditorId || taskMissingProduction) {
        db.run("CREATE TABLE tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, bulletin_id INTEGER REFERENCES bulletins(id), assigned_by INTEGER REFERENCES profiles(id), assigned_to INTEGER REFERENCES profiles(id), video_editor_id INTEGER REFERENCES profiles(id), status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmation','approved','in_progress','completed','verified','production','uploading','finalized','cancelled')), priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')), task_type TEXT NOT NULL DEFAULT 'general', role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id), story_id INTEGER REFERENCES stories(id), completed_at TEXT, remarks TEXT, youtube_url TEXT, footage_source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
        db.run('INSERT INTO tasks_new (id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at) SELECT id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at FROM tasks');
        db.run('DROP TABLE tasks');
        db.run('ALTER TABLE tasks_new RENAME TO tasks');
      }

      const taskMissingUploading = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'production'") &&
        !db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'uploading'");
      if (taskMissingUploading) {
        db.run("CREATE TABLE tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, bulletin_id INTEGER REFERENCES bulletins(id), assigned_by INTEGER REFERENCES profiles(id), assigned_to INTEGER REFERENCES profiles(id), video_editor_id INTEGER REFERENCES profiles(id), status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmation','approved','in_progress','completed','verified','production','uploading','finalized','cancelled')), priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')), task_type TEXT NOT NULL DEFAULT 'general', role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id), story_id INTEGER REFERENCES stories(id), completed_at TEXT, remarks TEXT, youtube_url TEXT, footage_source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
        db.run('INSERT INTO tasks_new (id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at) SELECT id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, footage_source, created_at, updated_at FROM tasks');
        db.run('DROP TABLE tasks');
        db.run('ALTER TABLE tasks_new RENAME TO tasks');
      }

      if (!columnExists('tasks', 'youtube_title')) {
        db.run("ALTER TABLE tasks ADD COLUMN youtube_title TEXT");
      }
      if (!columnExists('tasks', 'youtube_description')) {
        db.run("ALTER TABLE tasks ADD COLUMN youtube_description TEXT");
      }
      if (!columnExists('tasks', 'youtube_keywords')) {
        db.run("ALTER TABLE tasks ADD COLUMN youtube_keywords TEXT");
      }
      if (!columnExists('tasks', 'correction_notes')) {
        db.run("ALTER TABLE tasks ADD COLUMN correction_notes TEXT");
      }
      if (!columnExists('tasks', 'correction_response')) {
        db.run("ALTER TABLE tasks ADD COLUMN correction_response TEXT");
      }
      if (!columnExists('task_news_items', 'correction_notes')) {
        db.run("ALTER TABLE task_news_items ADD COLUMN correction_notes TEXT");
      }

      if (!columnExists('tasks', 'deadline')) {
        db.run("ALTER TABLE tasks ADD COLUMN deadline TEXT");
      }

      const taskMissingCorrection = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'uploading'") &&
        !db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'correction'");
      if (taskMissingCorrection) {
        db.run("CREATE TABLE tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, bulletin_id INTEGER REFERENCES bulletins(id), assigned_by INTEGER REFERENCES profiles(id), assigned_to INTEGER REFERENCES profiles(id), video_editor_id INTEGER REFERENCES profiles(id), status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmation','approved','in_progress','completed','verified','production','uploading','finalized','correction','trashed','cancelled')), priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')), task_type TEXT NOT NULL DEFAULT 'general', role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id), story_id INTEGER REFERENCES stories(id), completed_at TEXT, remarks TEXT, youtube_url TEXT, youtube_title TEXT, youtube_description TEXT, youtube_keywords TEXT, correction_notes TEXT, correction_response TEXT, footage_source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
        db.run('INSERT INTO tasks_new (id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, youtube_title, youtube_description, youtube_keywords, correction_notes, correction_response, footage_source, created_at, updated_at) SELECT id, title, description, bulletin_id, assigned_by, assigned_to, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, youtube_title, youtube_description, youtube_keywords, correction_notes, correction_response, footage_source, created_at, updated_at FROM tasks');
        db.run('DROP TABLE tasks');
        db.run('ALTER TABLE tasks_new RENAME TO tasks');
      }

      const taskMissingExpired = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'trashed'") &&
        !db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?.[0]?.values?.[0]?.[0]?.includes("'expired'");
      if (taskMissingExpired) {
        db.run("CREATE TABLE tasks_new (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, bulletin_id INTEGER REFERENCES bulletins(id), assigned_by INTEGER REFERENCES profiles(id), assigned_to INTEGER REFERENCES profiles(id), video_editor_id INTEGER REFERENCES profiles(id), status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmation','approved','in_progress','completed','verified','production','uploading','finalized','correction','trashed','expired','cancelled')), priority TEXT DEFAULT 'single_news' CHECK(priority IN ('breaking_news','single_news','special_report','ground_report','live_coverage','entertainment','trending','digital','specials','new_ads','new_graphics','local_news','bulletin')), task_type TEXT NOT NULL DEFAULT 'general', role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id), story_id INTEGER REFERENCES stories(id), completed_at TEXT, remarks TEXT, youtube_url TEXT, youtube_title TEXT, youtube_description TEXT, youtube_keywords TEXT, correction_notes TEXT, correction_response TEXT, footage_source TEXT, deadline TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
        db.run('INSERT INTO tasks_new (id, title, description, bulletin_id, assigned_by, assigned_to, video_editor_id, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, youtube_title, youtube_description, youtube_keywords, correction_notes, correction_response, footage_source, deadline, created_at, updated_at) SELECT id, title, description, bulletin_id, assigned_by, assigned_to, video_editor_id, status, priority, task_type, role_data, bulletin_template_id, story_id, completed_at, remarks, youtube_url, youtube_title, youtube_description, youtube_keywords, correction_notes, correction_response, footage_source, deadline, created_at, updated_at FROM tasks');
        db.run('DROP TABLE tasks');
        db.run('ALTER TABLE tasks_new RENAME TO tasks');
      }
    }
  } catch (e) { console.error('[migration] Legacy task table migration failed (non-fatal):', e); }

  db.run(`CREATE TABLE IF NOT EXISTS channel_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_name TEXT NOT NULL DEFAULT '',
    channel_display_name TEXT NOT NULL DEFAULT '',
    website_url TEXT NOT NULL DEFAULT '',
    editor_name TEXT NOT NULL DEFAULT '',
    editor_position TEXT NOT NULL DEFAULT '',
    subscribe_url TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  const channelCount = db.exec('SELECT COUNT(*) as cnt FROM channel_metadata');
  if (!channelCount?.[0]?.values?.[0]?.[0]) {
    db.run("INSERT INTO channel_metadata (channel_name, channel_display_name, website_url, editor_name, editor_position, subscribe_url) VALUES ('', '', '', '', '', '')");
  }

  if (!columnExists('profiles', 'pin')) {
    db.run("ALTER TABLE profiles ADD COLUMN pin TEXT DEFAULT ''");
  }

  if (!columnExists('bulletin_templates', 'news_count')) {
    db.run("ALTER TABLE bulletin_templates ADD COLUMN news_count INTEGER DEFAULT 5");
  }
  if (!columnExists('bulletin_templates', 'news_level')) {
    db.run("ALTER TABLE bulletin_templates ADD COLUMN news_level TEXT DEFAULT 'local'");
  }

  if (!columnExists('profiles', 'shift_type')) {
    db.run("ALTER TABLE profiles ADD COLUMN shift_type TEXT DEFAULT 'general'");
  }
  if (!columnExists('profiles', 'shift_start')) {
    db.run("ALTER TABLE profiles ADD COLUMN shift_start TEXT DEFAULT '09:00'");
  }
  if (!columnExists('profiles', 'shift_end')) {
    db.run("ALTER TABLE profiles ADD COLUMN shift_end TEXT DEFAULT '17:00'");
  }

  db.run(`CREATE TABLE IF NOT EXISTS task_extensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    extended_by INTEGER NOT NULL REFERENCES profiles(id),
    old_deadline TEXT,
    new_deadline TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  if (!columnExists('tasks', 'deadline_extended')) {
    db.run("ALTER TABLE tasks ADD COLUMN deadline_extended INTEGER DEFAULT 0");
  }

  if (!columnExists('tasks', 'bulletin_date')) {
    db.run("ALTER TABLE tasks ADD COLUMN bulletin_date TEXT");
    db.run("UPDATE tasks SET bulletin_date = date(created_at) WHERE bulletin_template_id IS NOT NULL AND bulletin_date IS NULL");
  }

  db.run("DELETE FROM task_news_items WHERE slug IS NULL AND news_script IS NULL AND reporter_name IS NULL AND anchor_name IS NULL AND footage_description IS NULL AND location IS NULL AND correction_notes IS NULL");

  db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER,
    full_name TEXT NOT NULL,
    email TEXT,
action TEXT NOT NULL CHECK(action IN ('success','failed_password','failed_pin','failed_approval','failed_status','failed_pin_reset','pin_reset')),
    details TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  if (!columnExists('login_attempts', 'ip_address')) {
    db.run("ALTER TABLE login_attempts ADD COLUMN ip_address TEXT");
  }

  db.run(`CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER,
    full_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS system_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  const hasStartLog = db.exec("SELECT COUNT(*) as cnt FROM system_activity WHERE action = 'server_start'");
  if (!hasStartLog?.[0]?.values?.[0]?.[0]) {
    db.run("INSERT INTO system_activity (action, details) VALUES ('server_start', 'Server started / restarted')");
  }

  if (!columnExists('profiles', 'weekly_off')) {
    db.run("ALTER TABLE profiles ADD COLUMN weekly_off TEXT DEFAULT '[]'");
  }

  db.run(`CREATE TABLE IF NOT EXISTS task_collaborators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE(task_id, profile_id)
  )`);

  const existingTaskRows = db.exec('SELECT id, assigned_by, assigned_to FROM tasks WHERE id IS NOT NULL');
  if (existingTaskRows?.[0]?.values) {
    for (const row of existingTaskRows[0].values) {
      const taskId = row[0];
      const assignedBy = row[1];
      const assignedTo = row[2];
      if (assignedBy) {
        db.exec(`INSERT OR IGNORE INTO task_collaborators (task_id, profile_id) VALUES (${taskId}, ${assignedBy})`);
      }
      if (assignedTo && assignedTo !== assignedBy) {
        db.exec(`INSERT OR IGNORE INTO task_collaborators (task_id, profile_id) VALUES (${taskId}, ${assignedTo})`);
      }
    }
  }

  db.run(`CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    reason TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    arrangement_profile_id INTEGER REFERENCES profiles(id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  )`);

  try {
    const currentTaskSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
    const currentTaskCreate = currentTaskSql?.[0]?.values?.[0]?.[0] || '';
    const isLegacyTaskTable = currentTaskCreate.includes("'uploading'") &&
      !currentTaskCreate.includes("'script_writing'") &&
      !currentTaskCreate.includes("'footage_collection'");
    const isV2MissingTrashed = currentTaskCreate.includes('script_writing') && !currentTaskCreate.includes('trashed');
    if (isLegacyTaskTable || isV2MissingTrashed) {
      // The legacy tasks table (created by createTables below) predates the
      // headline column; without it the SELECT below fails with
      // "no such column: headline" and the table never migrates — leaving
      // every task write hitting the legacy status/priority CHECK.
      // The legacy rebuild chain above also drops reporter_id/archive_id/
      // location_id (added earlier via ALTER), so re-add them here — the
      // INSERT SELECT below references them and must never hit a missing
      // column, or the migration aborts silently (non-fatal catch).
      if (!columnExists('tasks', 'headline')) {
        db.run('ALTER TABLE tasks ADD COLUMN headline TEXT');
      }
      if (!columnExists('tasks', 'reporter_id')) {
        db.run('ALTER TABLE tasks ADD COLUMN reporter_id INTEGER REFERENCES reporters(id)');
      }
      if (!columnExists('tasks', 'archive_id')) {
        db.run('ALTER TABLE tasks ADD COLUMN archive_id INTEGER REFERENCES archives(id)');
      }
      if (!columnExists('tasks', 'location_id')) {
        db.run('ALTER TABLE tasks ADD COLUMN location_id INTEGER REFERENCES locations(id)');
      }
      db.run('DROP TABLE IF EXISTS tasks_new');
      db.run(`CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, description TEXT,
        bulletin_id INTEGER REFERENCES bulletins(id),
        assigned_by INTEGER REFERENCES profiles(id),
        assigned_to INTEGER REFERENCES profiles(id),
        video_editor_id INTEGER REFERENCES profiles(id),
        reviewer_id INTEGER REFERENCES profiles(id),
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','script_writing','footage_collection','waiting_confirmation','correction_required','approved','editor_assigned','teleprompter_ready','prompting','recording_done','editing','uploading','published','under_review','completed','cancelled','trashed')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('urgent','high','medium','low')),
        task_type TEXT NOT NULL DEFAULT 'general',
        news_category TEXT, headline TEXT, slug TEXT,
        anchor_intro TEXT, main_story TEXT, closing TEXT,
        visual_cues TEXT, pronunciation_notes TEXT, source_reference TEXT, duration TEXT,
        footage_checklist TEXT,
        camera_footage TEXT, reporter_footage TEXT, mobile_videos TEXT,
        photos TEXT, drone_shots TEXT, logos TEXT, graphics TEXT, archive_footage TEXT,
        scroll_speed TEXT, font_size TEXT, mirror_mode INTEGER DEFAULT 0,
        speaker_notes TEXT, script_imported_at TEXT,
        youtube_url TEXT, facebook_link TEXT, instagram_link TEXT, website_link TEXT,
        publish_date TEXT, published_by INTEGER REFERENCES profiles(id),
        published_at TEXT, thumbnail_url TEXT, views_count INTEGER DEFAULT 0,
        script_writing_started_at TEXT, script_writing_completed_at TEXT,
        footage_collection_started_at TEXT, footage_collection_completed_at TEXT,
        recording_started_at TEXT, recording_completed_at TEXT,
        editing_started_at TEXT, editing_completed_at TEXT,
        revision_count INTEGER DEFAULT 0, correction_count INTEGER DEFAULT 0,
        role_data TEXT, bulletin_template_id INTEGER REFERENCES bulletin_templates(id),
        story_id INTEGER REFERENCES stories(id), completed_at TEXT,
        remarks TEXT, youtube_title TEXT, youtube_description TEXT, youtube_keywords TEXT,
        correction_notes TEXT, correction_response TEXT,         footage_source TEXT,
        deadline TEXT, deadline_extended INTEGER DEFAULT 0,
        reporter_id INTEGER REFERENCES reporters(id),
        archive_id INTEGER REFERENCES archives(id),
        location_id INTEGER REFERENCES locations(id),
        bulletin_date TEXT,
        version_number INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`INSERT INTO tasks_new (
        id, title, description, bulletin_id, assigned_by, assigned_to, video_editor_id,
        status, priority, task_type, role_data, bulletin_template_id, story_id,
        completed_at, remarks, youtube_url, youtube_title, youtube_description, youtube_keywords,
        correction_notes, correction_response, footage_source, deadline, deadline_extended,
        reporter_id, archive_id, location_id, bulletin_date,
        headline, created_at, updated_at
      ) SELECT
        id, title, description, bulletin_id, assigned_by, assigned_to, video_editor_id,
        CASE
          WHEN status IN ('draft','script_writing','footage_collection','waiting_confirmation','correction_required','editor_assigned','teleprompter_ready','prompting','recording_done','editing','uploading','published','under_review','completed','cancelled','trashed') THEN status
          WHEN status = 'pending' THEN 'draft'
          WHEN status = 'confirmation' THEN 'waiting_confirmation'
          WHEN status = 'approved' THEN 'approved'
          WHEN status = 'in_progress' THEN 'script_writing'
          WHEN status = 'completed' THEN 'under_review'
          WHEN status = 'verified' THEN 'approved'
          WHEN status = 'production' THEN 'editing'
          WHEN status = 'uploading' THEN 'uploading'
          WHEN status = 'finalized' THEN 'completed'
          WHEN status = 'correction' THEN 'correction_required'
          WHEN status = 'cancelled' THEN 'cancelled'
          WHEN status = 'expired' THEN 'cancelled'
          WHEN status = 'trashed' THEN 'trashed'
          ELSE 'draft'
        END,
        CASE
          WHEN priority IN ('breaking_news') THEN 'urgent'
          WHEN priority IN ('special_report','ground_report','live_coverage') THEN 'high'
          WHEN priority IN ('entertainment','new_ads','new_graphics') THEN 'low'
          WHEN priority IN ('single_news','trending','digital','specials','local_news','bulletin') THEN 'medium'
          WHEN priority IN ('urgent','high','medium','low') THEN priority
          ELSE 'medium'
        END,
        task_type, role_data, bulletin_template_id, story_id,
        completed_at, remarks, youtube_url, youtube_title, youtube_description, youtube_keywords,
        correction_notes, correction_response, footage_source, deadline, deadline_extended,
        reporter_id, archive_id, location_id, bulletin_date,
        title, created_at, updated_at
      FROM tasks`);
      db.run('DROP TABLE tasks');
      db.run('ALTER TABLE tasks_new RENAME TO tasks');
    }
  } catch (e) {
    console.error('[migration] Workflow V2 migration failed:', e);
  }

  if (!columnExists('anchor_tasks', 'anchor_intro')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN anchor_intro TEXT");
  }
  if (!columnExists('anchor_tasks', 'main_story')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN main_story TEXT");
  }
  if (!columnExists('anchor_tasks', 'closing')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN closing TEXT");
  }
  if (!columnExists('anchor_tasks', 'visual_cues')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN visual_cues TEXT");
  }
  if (!columnExists('anchor_tasks', 'pronunciation_notes')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN pronunciation_notes TEXT");
  }
  if (!columnExists('anchor_tasks', 'source_reference')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN source_reference TEXT");
  }
  if (!columnExists('anchor_tasks', 'duration')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN duration TEXT");
  }
  if (!columnExists('anchor_tasks', 'scroll_speed')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN scroll_speed TEXT");
  }
  if (!columnExists('anchor_tasks', 'font_size')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN font_size TEXT");
  }
  if (!columnExists('anchor_tasks', 'mirror_mode')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN mirror_mode INTEGER DEFAULT 0");
  }
  if (!columnExists('anchor_tasks', 'speaker_notes')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN speaker_notes TEXT");
  }
  if (!columnExists('anchor_tasks', 'audio_url')) {
    db.run("ALTER TABLE anchor_tasks ADD COLUMN audio_url TEXT");
  }

  db.run(`CREATE TABLE IF NOT EXISTS task_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    profile_name TEXT,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    label TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT 'system',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS backup_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auto_enabled INTEGER NOT NULL DEFAULT 1,
    min_interval_min INTEGER NOT NULL DEFAULT 15,
    max_backups INTEGER NOT NULL DEFAULT 50
  )`);
  db.run('INSERT OR IGNORE INTO backup_config (id, auto_enabled, min_interval_min, max_backups) VALUES (1, 1, 15, 50)');

  if (!columnExists('notifications', 'action_url')) {
    db.run("ALTER TABLE notifications ADD COLUMN action_url TEXT");
  }

  if (!columnExists('tasks', 'uid')) {
    try { db.run("ALTER TABLE tasks ADD COLUMN uid TEXT"); } catch {}
  }
  if (!columnExists('ads', 'uid')) {
    try { db.run("ALTER TABLE ads ADD COLUMN uid TEXT"); } catch {}
  }
  if (!columnExists('ads', 'ad_type')) {
    try { db.run("ALTER TABLE ads ADD COLUMN ad_type TEXT"); } catch {}
  }
  if (!columnExists('ads', 'slots_count')) {
    try { db.run("ALTER TABLE ads ADD COLUMN slots_count INTEGER DEFAULT 0"); } catch {}
  }
  if (!columnExists('ads', 'ad_place')) {
    try { db.run("ALTER TABLE ads ADD COLUMN ad_place TEXT"); } catch {}
  }
  if (!columnExists('ads', 'brand_type')) {
    try { db.run("ALTER TABLE ads ADD COLUMN brand_type TEXT"); } catch {}
  }
  if (!columnExists('ads', 'party_type')) {
    try { db.run("ALTER TABLE ads ADD COLUMN party_type TEXT"); } catch {}
  }
  if (!columnExists('ads', 'booked_by')) {
    try { db.run("ALTER TABLE ads ADD COLUMN booked_by TEXT DEFAULT 'client'"); } catch {}
  }
  if (!columnExists('ads', 'agency_name')) {
    try { db.run("ALTER TABLE ads ADD COLUMN agency_name TEXT"); } catch {}
  }
  if (!columnExists('ads', 'renewal_type')) {
    try { db.run("ALTER TABLE ads ADD COLUMN renewal_type TEXT DEFAULT 'one_time'"); } catch {}
  }
  if (!columnExists('ads', 'renewal_period')) {
    try { db.run("ALTER TABLE ads ADD COLUMN renewal_period TEXT"); } catch {}
  }
  if (!columnExists('special_programs', 'uid')) {
    try { db.run("ALTER TABLE special_programs ADD COLUMN uid TEXT"); } catch {}
  }
  if (!columnExists('special_programs', 'deleted_at')) {
    try { db.run("ALTER TABLE special_programs ADD COLUMN deleted_at TEXT"); } catch {}
  }
  if (!columnExists('ads', 'deleted_at')) {
    try { db.run("ALTER TABLE ads ADD COLUMN deleted_at TEXT"); } catch {}
  }
  if (!columnExists('locations', 'deleted_at')) {
    try { db.run("ALTER TABLE locations ADD COLUMN deleted_at TEXT"); } catch {}
  }
  if (!columnExists('reporters', 'deleted_at')) {
    try { db.run("ALTER TABLE reporters ADD COLUMN deleted_at TEXT"); } catch {}
  }
  if (!columnExists('special_programs', 'completed_at')) {
    try { db.run("ALTER TABLE special_programs ADD COLUMN completed_at TEXT"); } catch {}
  }
  if (!columnExists('special_programs', 'schedule_time')) {
    try { db.run("ALTER TABLE special_programs ADD COLUMN schedule_time TEXT"); } catch {}
  }
  const programSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='special_programs'");
  const programCreate = programSql?.[0]?.values?.[0]?.[0] as string | undefined;
  if (programCreate && !programCreate.includes("'paused'")) {
    try {
      db.run(`CREATE TABLE special_programs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        program_type TEXT CHECK(program_type IN ('live_coverage','special_program','interview','event')),
        description TEXT,
        schedule_date TEXT,
        schedule_time TEXT,
        status TEXT DEFAULT 'planned' CHECK(status IN ('planned','ongoing','paused','completed','cancelled')),
        assigned_to INTEGER REFERENCES profiles(id),
        created_by INTEGER REFERENCES profiles(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        uid TEXT,
        reporter_id INTEGER REFERENCES reporters(id),
        deleted_at TEXT,
        completed_at TEXT
      )`);
      db.run(`INSERT INTO special_programs_new (id, title, program_type, description, schedule_date, schedule_time, status, assigned_to, created_by, created_at, updated_at, uid, reporter_id, deleted_at, completed_at)
        SELECT id, title, program_type, description, schedule_date, schedule_time, status, assigned_to, created_by, created_at, updated_at, uid, reporter_id, deleted_at, completed_at FROM special_programs`);
      db.run('DROP TABLE special_programs');
      db.run('ALTER TABLE special_programs_new RENAME TO special_programs');
      console.log('[migration] special_programs rebuilt: status CHECK now allows paused');
    } catch (e) {
      console.error('[migration] special_programs rebuild failed:', e);
    }
  }
  if (!columnExists('stories', 'uid')) {
    try { db.run("ALTER TABLE stories ADD COLUMN uid TEXT"); } catch {}
  }
  if (!columnExists('bulletins', 'uid')) {
    try { db.run("ALTER TABLE bulletins ADD COLUMN uid TEXT"); } catch {}
  }
  if (!columnExists('profiles', 'uid')) {
    try { db.run("ALTER TABLE profiles ADD COLUMN uid TEXT"); } catch {}
  }
  const tasksMissingUid = new Statement('SELECT COUNT(*) as cnt FROM tasks WHERE uid IS NULL').get() as any;
  if (tasksMissingUid?.cnt > 0) {
    const rows = new Statement('SELECT id FROM tasks WHERE uid IS NULL').all() as any[];
    for (const r of rows) {
      new Statement("UPDATE tasks SET uid = ? WHERE id = ?").run(`TSK-${String(r.id).padStart(4, '0')}`, r.id);
    }
  }
  const adsMissingUid = new Statement('SELECT COUNT(*) as cnt FROM ads WHERE uid IS NULL').get() as any;
  if (adsMissingUid?.cnt > 0) {
    const rows = new Statement('SELECT id FROM ads WHERE uid IS NULL').all() as any[];
    for (const r of rows) {
      new Statement("UPDATE ads SET uid = ? WHERE id = ?").run(`ADS-${String(r.id).padStart(4, '0')}`, r.id);
    }
  }
  const programsMissingUid = new Statement('SELECT COUNT(*) as cnt FROM special_programs WHERE uid IS NULL').get() as any;
  if (programsMissingUid?.cnt > 0) {
    const rows = new Statement('SELECT id FROM special_programs WHERE uid IS NULL').all() as any[];
    for (const r of rows) {
      new Statement("UPDATE special_programs SET uid = ? WHERE id = ?").run(`PRG-${String(r.id).padStart(4, '0')}`, r.id);
    }
  }
  const storiesMissingUid = new Statement('SELECT COUNT(*) as cnt FROM stories WHERE uid IS NULL').get() as any;
  if (storiesMissingUid?.cnt > 0) {
    const rows = new Statement('SELECT id FROM stories WHERE uid IS NULL').all() as any[];
    for (const r of rows) {
      new Statement("UPDATE stories SET uid = ? WHERE id = ?").run(`STY-${String(r.id).padStart(4, '0')}`, r.id);
    }
  }
  const bulletinsMissingUid = new Statement('SELECT COUNT(*) as cnt FROM bulletins WHERE uid IS NULL').get() as any;
  if (bulletinsMissingUid?.cnt > 0) {
    const rows = new Statement('SELECT id FROM bulletins WHERE uid IS NULL').all() as any[];
    for (const r of rows) {
      new Statement("UPDATE bulletins SET uid = ? WHERE id = ?").run(`BLN-${String(r.id).padStart(4, '0')}`, r.id);
    }
  }
  const profilesMissingUid = new Statement('SELECT COUNT(*) as cnt FROM profiles WHERE uid IS NULL').get() as any;
  if (profilesMissingUid?.cnt > 0) {
    const rows = new Statement('SELECT id FROM profiles WHERE uid IS NULL').all() as any[];
    for (const r of rows) {
      new Statement("UPDATE profiles SET uid = ? WHERE id = ?").run(`PRF-${String(r.id).padStart(4, '0')}`, r.id);
    }
  }

  persist();
}

// ===== Exported API (dual-path: PostgreSQL async / SQLite sync) =====

export function prepare(sql: string) {
  if (isPostgres()) return new SyncStatement(sql);
  if (!db) throw new Error('Database not initialized.');
  return new Statement(sql);
}

export async function exec(sql: string) {
  if (isPostgres()) {
    try {
      if (!adapter) throw new Error('PostgreSQL not initialized');
      await adapter.raw(sql);
    } catch (e: any) {
      console.error('[db] PG exec failed (mirror-only):', e.message);
    }
    if (db) {
      try { db.run(sql); persist(); } catch (e: any) {
        console.error('[db] mirror exec failed (PG-only statement):', e.message);
      }
    }
    return;
  }
  if (!db) throw new Error('Database not initialized.');
  db.run(sql);
  persist();
}

export function getUserCount(): number {
  if (isPostgres()) return 0; // Not used in PG path (async callers use prepare)
  if (!db) return 0;
  const r = db.exec('SELECT COUNT(*) as cnt FROM users');
  return r?.[0]?.values?.[0]?.[0] ?? 0;
}

export function getProfileCount(): number {
  if (isPostgres()) return 0;
  if (!db) return 0;
  const r = db.exec("SELECT COUNT(*) as cnt FROM profiles WHERE is_archived = 0");
  return r?.[0]?.values?.[0]?.[0] ?? 0;
}

export async function nextUid(prefix: string, table: string): Promise<string> {
  if (isPostgres()) {
    const row = await prepare(`SELECT MAX(CAST(SUBSTR(uid, ${prefix.length + 2}) AS INTEGER)) as m FROM "${table}" WHERE uid LIKE ? AND uid IS NOT NULL AND uid != ''`).get(`${prefix}-%`) as any;
    const next = (row?.m || 0) + 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }
  const row = prepare(`SELECT MAX(CAST(SUBSTR(uid, ${prefix.length + 2}) AS INTEGER)) as m FROM "${table}" WHERE uid LIKE ? AND uid IS NOT NULL AND uid != ''`).get(`${prefix}-%`) as any;
  const next = (row?.m || 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

// ===== Backup functions (no-op for PostgreSQL — Supabase handles backups) =====

const PRESERVE_ON_RESTORE = ['bulletin_templates', 'user_bulletin_defaults', 'system_bulletin_defaults'];

export function getBackupConfig(): { auto_enabled: number; min_interval_min: number; max_backups: number } {
  if (isPostgres()) {
    return { auto_enabled: 1, min_interval_min: 15, max_backups: 50 };
  }
  const row = prepare('SELECT auto_enabled, min_interval_min, max_backups FROM backup_config WHERE id = 1').get() as any;
  return {
    auto_enabled: row?.auto_enabled ?? 1,
    min_interval_min: row?.min_interval_min ?? 15,
    max_backups: row?.max_backups ?? 50,
  };
}

export function updateBackupConfig(cfg: { auto_enabled?: number; min_interval_min?: number; max_backups?: number }): { auto_enabled: number; min_interval_min: number; max_backups: number } {
  const cur = getBackupConfig();
  const next = {
    auto_enabled: cfg.auto_enabled !== undefined ? (cfg.auto_enabled ? 1 : 0) : cur.auto_enabled,
    min_interval_min: cfg.min_interval_min !== undefined ? Math.max(0, Number(cfg.min_interval_min) || 0) : cur.min_interval_min,
    max_backups: cfg.max_backups !== undefined ? Math.max(1, Number(cfg.max_backups) || 1) : cur.max_backups,
  };
  if (!isPostgres()) {
    prepare('UPDATE backup_config SET auto_enabled = ?, min_interval_min = ?, max_backups = ? WHERE id = 1').run(next.auto_enabled, next.min_interval_min, next.max_backups);
  }
  return next;
}

export function saveManagedBackup(label: string, notes: string = '', createdBy: string = 'system', force: boolean = false): string | null {
  if (isPostgres()) return null; // Supabase handles backups automatically
  try {
    if (!db) return null;
    const cfg = getBackupConfig();
    const isAuto = !force;
    if (isAuto && !cfg.auto_enabled) return null;
    if (isAuto && cfg.min_interval_min > 0) {
      const last = prepare("SELECT created_at FROM backups WHERE label != 'manual' AND label != 'startup' ORDER BY id DESC LIMIT 1").get() as any;
      if (last?.created_at) {
        const elapsed = (Date.now() - new Date((last.created_at as string).replace(' ', 'T') + 'Z').getTime()) / 60000;
        if (elapsed < cfg.min_interval_min) return null;
      }
    }
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${ts}-${label}.db`;
    const bytes = Buffer.from(db.export());
    fs.writeFileSync(path.join(BACKUP_DIR, filename), bytes);
    prepare('INSERT INTO backups (filename, label, size_bytes, is_archived, created_by, notes) VALUES (?,?,?,0,?,?)')
      .run(filename, label, bytes.length, createdBy, notes);
    if (cfg.max_backups > 0) {
      const excess = prepare("SELECT id, filename FROM backups WHERE is_archived = 0 AND label != 'manual' AND label != 'startup' ORDER BY id DESC LIMIT -1 OFFSET ?").all(cfg.max_backups) as any[];
      for (const r of excess) {
        try { fs.unlinkSync(path.join(BACKUP_DIR, r.filename)); } catch {}
        prepare('DELETE FROM backups WHERE id = ?').run(r.id);
      }
    }
    console.log(`[backup] Managed backup created: ${filename} (${label}${isAuto ? ', auto' : ', manual'})`);
    return filename;
  } catch (e) {
    console.error('[backup] Managed backup failed:', e);
    return null;
  }
}

export function listManagedBackups(): any[] {
  if (isPostgres()) return [];
  return prepare('SELECT * FROM backups ORDER BY id DESC').all() as any[];
}

export function deleteManagedBackup(id: number): boolean {
  if (isPostgres()) return false;
  const row = prepare('SELECT filename FROM backups WHERE id = ?').get(id) as any;
  if (!row) return false;
  try { fs.unlinkSync(path.join(BACKUP_DIR, row.filename)); } catch {}
  prepare('DELETE FROM backups WHERE id = ?').run(id);
  return true;
}

export interface RestoreSummary {
  restoredFrom: string;
  restoredAt: string;
  tables: { table: string; rows: number }[];
  preserved: { table: string; rows: number }[];
  syncQueueCleared: boolean;
  warnings: string[];
}

export async function restoreDatabaseFromFile(backupPath: string): Promise<RestoreSummary> {
  if (isPostgres()) throw new Error('Restore not supported on PostgreSQL — use Supabase dashboard');
  if (!fs.existsSync(backupPath)) throw new Error('Backup file not found');

  const warnings: string[] = [];
  const preservedCounts: { table: string; rows: number }[] = [];
  const preserved: Record<string, any[]> = {};
  if (db) {
    for (const table of PRESERVE_ON_RESTORE) {
      try {
        const result = db.exec(`SELECT * FROM ${table}`)[0];
        if (result) {
          preserved[table] = result.values.map((v: any[]) => {
            const obj: Record<string, any> = {};
            result.columns.forEach((c: string, i: number) => { obj[c] = v[i]; });
            return obj;
          });
          preservedCounts.push({ table, rows: preserved[table].length });
        }
      } catch (e) {
        warnings.push(`Could not preserve ${table}: ${String(e)}`);
      }
    }
  }

  const SQL = await ensureSqlJs();
  db = new SQL.Database(fs.readFileSync(backupPath));
  db.run('PRAGMA foreign_keys = ON');
  createTables();
  runMigrations();
  persist();

  for (const table of PRESERVE_ON_RESTORE) {
    const rows = preserved[table];
    if (!rows || rows.length === 0) continue;
    try {
      if (table === 'bulletin_templates') {
        db.run('UPDATE tasks SET bulletin_template_id = NULL');
      }
      db.run(`DELETE FROM ${table}`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        db.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, cols.map(c => row[c]));
      }
      console.log(`[restore] Preserved ${rows.length} rows in ${table}`);
    } catch (e) {
      warnings.push(`Failed to re-apply ${table}: ${String(e)}`);
    }
  }

  // The restored snapshot replaces the entire database — queued sync changes from
  // the previous state must not be replayed against PostgreSQL (they would fail or
  // duplicate data and cause repeated 'synced' broadcasts / reload loops).
  let syncQueueCleared = false;
  try {
    db.run('DELETE FROM sync_outbox');
    db.run('DELETE FROM sync_log');
    db.run('DELETE FROM sqlite_sequence');
    syncQueueCleared = true;
    console.log('[restore] Sync queue cleared (outbox/sync_log)');
  } catch (e) {
    warnings.push(`Could not clear sync queue: ${String(e)}`);
  }

  persist();

  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")?.[0]?.values ?? [];
  const tableCounts: { table: string; rows: number }[] = [];
  for (const [name] of tables) {
    if (name === 'sync_outbox' || name === 'sync_log') continue;
    try {
      const c = db.exec(`SELECT COUNT(*) FROM "${name}"`)?.[0]?.values?.[0]?.[0] ?? 0;
      tableCounts.push({ table: name, rows: c });
    } catch (e) { /* skip unreadable table */ }
  }

  console.log('[backup] Database restored from', path.basename(backupPath));
  return {
    restoredFrom: path.basename(backupPath),
    restoredAt: new Date().toISOString(),
    tables: tableCounts,
    preserved: preservedCounts,
    syncQueueCleared,
    warnings,
  };
}
