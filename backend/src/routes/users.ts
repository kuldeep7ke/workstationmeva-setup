import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prepare, exec, backupDatabase, nextUid, saveManagedBackup, mirrorAll, mirrorGet, mirrorRun } from '../database/schema';
import { authenticate, authorize, authorizeAdminOrDev, AuthRequest } from '../middleware/auth';
import { ROLES, SEAT_LIMITS } from '../config/roles';
import { generateUsername } from '../utils/username';
import { getOnlineProfiles, forceLogout, emitEvent } from '../socket';
import { realignSequencesForTables } from '../database/sync';

const router = Router();

function userBackup(req: AuthRequest, detail: string) {
  saveManagedBackup('user_change', detail, req.user?.full_name || req.user?.username || 'system');
}

// --- User seats (login accounts) ---

router.get('/', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const users = await prepare(`
    SELECT u.id, u.username, u.is_active as user_active, u.created_at,
           p.id as profile_id, p.full_name, p.role, p.access_level, p.status,
           p.is_active as profile_active, p.email,
           CASE WHEN p.pin IS NOT NULL AND p.pin != '' THEN 1 ELSE 0 END as has_pin
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id AND (p.is_active = 1 OR (p.status = 'suspended' AND p.is_archived = 0))
    ORDER BY u.created_at ASC
  `).all();
  res.json(users);
});

router.post('/', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { password, password_hint, role, full_name } = req.body;
  if (!password || !full_name) {
    return res.status(400).json({ error: 'Full name and password required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const targetRole = role || 'editorial';
  const roleDef = ROLES.find(r => r.id === targetRole);
  if (!roleDef) return res.status(400).json({ error: 'Invalid role.' });

  const maxSeats = SEAT_LIMITS[targetRole];
  if (maxSeats !== undefined) {
    const count = await prepare("SELECT COUNT(*) as cnt FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.role = ? AND p.is_active = 1 AND p.status != 'suspended' AND u.is_active = 1").get(targetRole) as any;
    if (count && count.cnt >= maxSeats) {
      return res.status(400).json({ error: `Seat limit reached for ${roleDef.label} (${maxSeats} max).` });
    }
  }

  const allUsernames = new Set((await prepare('SELECT username FROM users').all() as any[]).map((u: any) => u.username));
  const username = generateUsername(full_name, allUsernames);

  const password_hash = bcrypt.hashSync(password, 10);
  const result = await prepare('INSERT INTO users (username, password_hash) VALUES (?,?)').run(username, password_hash);
  const userId = result.lastInsertRowid as number;

  const finalLevel = roleDef.defaultLevel;
  const prfUid = await nextUid('PRF', 'profiles');
  await prepare('INSERT INTO profiles (uid, user_id, full_name, role, access_level, password_hint) VALUES (?,?,?,?,?,?)').run(prfUid, userId, full_name, targetRole, finalLevel, password_hint || null);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'create_user', 'profiles', userId, `Created user: ${full_name} (${targetRole})`);
  userBackup(req, `User seat created: ${full_name} (${targetRole})`);
  emitEvent('user:changed', { profile_id: null, full_name, action: 'created', actor: req.user!.profile_id });
  res.status(201).json({ id: userId, username, role: targetRole });
});

router.get('/seat-limits', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const counts: Record<string, number> = {};
  for (const roleId of Object.keys(SEAT_LIMITS)) {
    const row = await prepare("SELECT COUNT(*) as cnt FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.role = ? AND p.is_active = 1 AND p.status != 'suspended' AND u.is_active = 1").get(roleId) as any;
    counts[roleId] = row ? row.cnt : 0;
  }
  res.json({ limits: SEAT_LIMITS, counts });
});

router.post('/regenerate-usernames', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const users = await prepare('SELECT u.id, p.full_name, u.username FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.is_active = 1').all() as any[];
  const existingSet = new Set<string>();
  const updated: { id: number; old: string; new: string }[] = [];

  for (const u of users) {
    const name = u.full_name || u.username;
    const newUsername = generateUsername(name, existingSet);
    if (newUsername !== u.username) {
      await prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, u.id);
      updated.push({ id: u.id, old: u.username, new: newUsername });
    }
    existingSet.add(newUsername);
  }

  res.json({ updated: updated.length, details: updated });
});

router.get('/available', authenticate, async (req: AuthRequest, res: Response) => {
  const online = getOnlineProfiles();
  const roleFilter = req.query.role as string || 'anchor';
  const users = await prepare(`
    SELECT u.id, u.username, p.id as profile_id, p.full_name, p.role, p.access_level
    FROM users u
    JOIN profiles p ON p.user_id = u.id AND p.is_active = 1 AND p.status = 'active'
    WHERE u.is_active = 1 AND p.role = ?
    ORDER BY p.full_name ASC
  `).all(roleFilter) as any[];
  const result = users.map((u: any) => ({ ...u, is_online: online.some((o: any) => o.profile_id === u.profile_id) }));
  res.json(result);
});

router.get('/available-editors', authenticate, async (req: AuthRequest, res: Response) => {
  const online = getOnlineProfiles();
  const editors = await prepare(`
    SELECT u.id, u.username, p.id as profile_id, p.full_name, p.role, p.access_level
    FROM users u
    JOIN profiles p ON p.user_id = u.id AND p.is_active = 1 AND p.status = 'active'
    WHERE u.is_active = 1 AND p.role = 'video_editor'
    ORDER BY p.full_name ASC
  `).all() as any[];
  const result = editors.map((u: any) => ({ ...u, is_online: online.some((o: any) => o.profile_id === u.profile_id) }));
  res.json(result);
});

// All assignable active profiles for ANY logged-in user (used by Stories/Programs
// pickers; unlike GET /users this is not admin-only and returns no sensitive fields)
router.get('/assignable', authenticate, async (_req: AuthRequest, res: Response) => {
  const users = await prepare(`
    SELECT p.id as profile_id, p.full_name, p.role, p.access_level
    FROM profiles p
    WHERE p.is_active = 1 AND p.is_archived = 0 AND p.status = 'active'
    ORDER BY p.full_name ASC
  `).all();
  res.json(users);
});

router.get('/profiles', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { user_id } = req.query;
  let sql = `SELECT p.*, u.username FROM profiles p JOIN users u ON u.id = p.user_id WHERE 1=1`;
  const params: any[] = [];
  if (user_id) { sql += ' AND p.user_id = ?'; params.push(user_id); }
  sql += ' ORDER BY p.created_at DESC';
  res.json(await prepare(sql).all(...params));
});

router.get('/profiles/archived', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const profiles = await prepare(`
    SELECT p.*, u.username FROM profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_archived = 1
    ORDER BY p.deactivated_at DESC
  `).all();
  res.json(profiles);
});

router.post('/profiles', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { user_id, full_name, role, access_level, email, password_hint } = req.body;
  if (!user_id || !full_name) return res.status(400).json({ error: 'user_id and full_name required.' });

  const user = await prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(user_id);
  if (!user) return res.status(400).json({ error: 'User not found or inactive.' });

  const targetRole = role || 'editorial';
  const roleDef = ROLES.find(r => r.id === targetRole);
  if (!roleDef) return res.status(400).json({ error: 'Invalid role.' });
  const finalLevel = access_level === undefined ? roleDef.defaultLevel : Number(access_level);
  if (!Number.isInteger(finalLevel) || finalLevel < 1 || finalLevel > 3) {
    return res.status(400).json({ error: 'Access level must be 1, 2 or 3.' });
  }

  await prepare('UPDATE profiles SET is_active = 0, is_archived = 1, deactivated_at = datetime(\'now\') WHERE user_id = ? AND is_active = 1').run(user_id);

  const prfUid = await nextUid('PRF', 'profiles');
  const result = await prepare('INSERT INTO profiles (uid, user_id, full_name, role, access_level, email, password_hint) VALUES (?,?,?,?,?,?,?)').run(prfUid, user_id, full_name, targetRole, finalLevel, email || null, password_hint || null);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'reactivate_user', 'profiles', user_id, `Reactivated profile: ${full_name} (${targetRole})`);
  userBackup(req, `Profile created: ${full_name}`);
  emitEvent('user:changed', { profile_id: result.lastInsertRowid, full_name, action: 'created', actor: req.user!.profile_id });
  res.status(201).json({ id: result.lastInsertRowid, user_id, full_name, role: targetRole, access_level: finalLevel, email, is_active: 1 });
});

router.put('/profiles/:id', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { full_name, role, access_level, email, password_hint, shift_type, shift_start, shift_end, weekly_off } = req.body;
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });

  const targetRole = role || profile.role;
  if (role && !ROLES.some(r => r.id === targetRole)) return res.status(400).json({ error: 'Invalid role.' });

  const finalLevel = access_level === undefined ? profile.access_level : Number(access_level);
  if (!Number.isInteger(finalLevel) || finalLevel < 1 || finalLevel > 3) {
    return res.status(400).json({ error: 'Access level must be 1, 2 or 3.' });
  }
  if (finalLevel !== profile.access_level || (role && role !== profile.role)) {
    if (await isLastActiveAdmin(profile.id)) {
      return res.status(400).json({ error: 'You cannot change the role/level of the first admin — no other admin would remain to fix it.' });
    }
  }

  await prepare('UPDATE profiles SET full_name = ?, role = ?, access_level = ?, email = ?, password_hint = ?, shift_type = ?, shift_start = ?, shift_end = ?, weekly_off = ? WHERE id = ?')
    .run(full_name || profile.full_name, targetRole, finalLevel, email ?? profile.email, password_hint ?? profile.password_hint, shift_type || profile.shift_type || 'general', shift_start || profile.shift_start || '09:00', shift_end || profile.shift_end || '17:00', weekly_off ?? profile.weekly_off ?? '[]', req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_profile', 'profiles', req.params.id, `Updated profile: ${full_name || profile.full_name} (${profile.uid})`);
  userBackup(req, `Profile updated: ${full_name || profile.full_name}`);
  emitEvent('user:changed', { profile_id: profile.id, full_name: full_name || profile.full_name, action: 'updated', actor: req.user!.profile_id });
  res.json({ success: true, profile_id: profile.id });
});

router.put('/profiles/:id/activate', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });

  const current = await prepare('SELECT id FROM profiles WHERE user_id = ? AND is_active = 1').get(profile.user_id) as any;
  if (current && await isLastActiveAdmin(current.id)) {
    return res.status(400).json({ error: 'You cannot swap out the first admin — no other admin would remain to reactivate them.' });
  }

  await prepare('UPDATE profiles SET is_active = 0, is_archived = 1, deactivated_at = datetime(\'now\') WHERE user_id = ? AND is_active = 1').run(profile.user_id);
  await prepare('UPDATE profiles SET is_active = 1, is_archived = 0, deactivated_at = NULL WHERE id = ?').run(profile.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'activate_profile', 'profiles', req.params.id, `Activated profile: ${profile.full_name} (${profile.uid})`);
  userBackup(req, `Profile activated: ${profile.full_name}`);
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'activated', actor: req.user!.profile_id });
  res.json({ success: true, profile_id: profile.id });
});

router.put('/profiles/:id/restore', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_archived = 1').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Archived profile not found.' });

  const targetUserId = req.body.user_id || profile.user_id;
  const user = await prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(targetUserId);
  if (!user) return res.status(400).json({ error: 'Target user not found or inactive.' });

  await prepare('UPDATE profiles SET is_active = 0, is_archived = 1, deactivated_at = datetime(\'now\') WHERE user_id = ? AND is_active = 1').run(targetUserId);
  await prepare('UPDATE profiles SET user_id = ?, is_active = 1, is_archived = 0, deactivated_at = NULL WHERE id = ?').run(targetUserId, profile.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'restore_profile', 'profiles', req.params.id, `Restored archived profile: ${profile.full_name} (${profile.uid})`);
  userBackup(req, `Archived profile restored: ${profile.full_name}`);
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'restored', actor: req.user!.profile_id });
  res.json({ success: true, profile_id: profile.id, user_id: targetUserId });
});

// --- Profile lifecycle: offline (hold), archive, terminate ---

// The first admin (the only active admin profile) is protected: taking it
// offline, archiving, terminating or deactivating it would leave no admin
// able to bring it back online.
async function isLastActiveAdmin(profileId: number): Promise<boolean> {
  const target = await prepare('SELECT id FROM profiles WHERE id = ? AND access_level = 1 AND is_active = 1 AND is_archived = 0').get(profileId) as any;
  if (!target) return false;
  const others = await prepare('SELECT COUNT(*) as cnt FROM profiles WHERE access_level = 1 AND is_active = 1 AND is_archived = 0 AND id != ?').get(profileId) as any;
  return !(others && others.cnt > 0);
}

router.put('/profiles/:id/offline', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1 AND is_archived = 0').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Active profile not found.' });

  const offline = !!req.body.offline;
  if (offline && await isLastActiveAdmin(profile.id)) {
    return res.status(400).json({ error: 'You cannot take the first admin offline — no other admin would remain to bring them back online.' });
  }
  const nextStatus = offline ? 'hold' : 'active';
  await prepare('UPDATE profiles SET status = ? WHERE id = ?').run(nextStatus, profile.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, offline ? 'profile_offline' : 'profile_online', 'profiles', profile.id, `${offline ? 'Took offline (hold)' : 'Brought back online'}: ${profile.full_name} (${profile.uid})`);
  userBackup(req, `Profile ${offline ? 'taken offline' : 'brought online'}: ${profile.full_name}`);
  if (offline) forceLogout(profile.id, 'Your account has been set offline by an administrator.');
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: offline ? 'offlined' : 'brought_online', actor: req.user!.profile_id });
  res.json({ success: true, profile_id: profile.id, status: nextStatus });
});

router.put('/profiles/:id/archive', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Active profile not found.' });
  if (await isLastActiveAdmin(profile.id)) {
    return res.status(400).json({ error: 'You cannot archive the first admin — no other admin would remain to restore them.' });
  }

  await prepare('UPDATE profiles SET is_active = 0, is_archived = 1, status = \'active\', deactivated_at = datetime(\'now\') WHERE id = ?').run(profile.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'archive_profile', 'profiles', profile.id, `Archived profile: ${profile.full_name} (${profile.uid})`);
  userBackup(req, `Profile archived: ${profile.full_name}`);
  forceLogout(profile.id, 'Your profile has been archived by an administrator.');
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'archived', actor: req.user!.profile_id });
  res.json({ success: true, profile_id: profile.id, archived: true });
});

router.put('/profiles/:id/terminate', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Active profile not found.' });
  if (profile.access_level === 1 && profile.id === req.user!.profile_id) {
    return res.status(400).json({ error: 'You cannot terminate your own account.' });
  }
  if (await isLastActiveAdmin(profile.id)) {
    return res.status(400).json({ error: 'You cannot terminate the first admin — no other admin would remain to reactivate them.' });
  }

  await prepare('UPDATE profiles SET status = \'suspended\', is_active = 0, deactivated_at = datetime(\'now\') WHERE id = ?').run(profile.id);
  await prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(profile.user_id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'terminate_profile', 'profiles', profile.id, `Terminated profile: ${profile.full_name} (${profile.uid})`);
  userBackup(req, `Profile terminated: ${profile.full_name}`);
  forceLogout(profile.id, 'Your account has been terminated by an administrator.');
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'terminated', actor: req.user!.profile_id });
  res.json({ success: true, profile_id: profile.id, status: 'suspended' });
});

router.put('/profiles/:id/reactivate', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });

  await prepare('UPDATE profiles SET status = \'active\', is_active = 1, is_archived = 0, deactivated_at = NULL WHERE id = ?').run(profile.id);
  await prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(profile.user_id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'reactivate_profile', 'profiles', profile.id, `Reactivated profile: ${profile.full_name} (${profile.uid})`);
  userBackup(req, `Profile reactivated: ${profile.full_name}`);
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'reactivated', actor: req.user!.profile_id });
  res.json({ success: true, profile_id: profile.id, status: 'active' });
});

// --- Backup / Restore ---
//
// Bulletin slot templates (name, publish time, news count, news level), the
// saved slot schedules (system + per-user defaults) and the reference data:
// ads, reporters, archives, locations and leaves. News content, bulletins,
// tasks, stories, programs, notifications and other working data are
// intentionally NOT part of the export — the backup covers users, profiles
// and this slot/reference setup.
const BACKUP_DATA_TABLES = ['bulletin_templates', 'locations', 'reporters', 'archives', 'leaves', 'ads', 'user_bulletin_defaults', 'system_bulletin_defaults'];

router.get('/backup/export', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  // Read from the local mirror: it is the complete working copy (mirror-first
  // writes) and exports keep working even while PostgreSQL is unreachable.
  const users = mirrorAll(`
    SELECT u.id, u.username, u.password_hash, u.is_active, u.created_at FROM users u ORDER BY u.id
  `);
  const profiles = mirrorAll(`
    SELECT * FROM profiles ORDER BY id
  `);
  const data: Record<string, any[]> = {};
  for (const t of BACKUP_DATA_TABLES) {
    data[t] = mirrorAll(`SELECT * FROM "${t}" ORDER BY id`);
  }
  res.json({ exportedAt: new Date().toISOString(), users, profiles, ...data });
});

router.post('/backup/import', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const { users: backupUsers, profiles: backupProfiles } = req.body;
  backupDatabase('pre-import');
  if (!Array.isArray(backupUsers)) return res.status(400).json({ error: 'Invalid backup data.' });

  let created = 0, skipped = 0, updated = 0;

  for (const bu of backupUsers) {
    const existing = await prepare('SELECT id FROM users WHERE username = ?').get(bu.username) as any;
    if (existing) {
      skipped++;
    } else {
      // Preserve the original id when it is free, so the imported profile's
      // user_id stays linked and PostgreSQL foreign keys hold.
      const idFree = Number.isInteger(bu.id) && !(await prepare('SELECT id FROM users WHERE id = ?').get(bu.id));
      if (idFree) {
        await prepare('INSERT INTO users (id, username, password_hash, is_active, created_at) VALUES (?,?,?,?,?)')
          .run(bu.id, bu.username, bu.password_hash, bu.is_active ?? 1, bu.created_at);
      } else {
        await prepare('INSERT INTO users (username, password_hash, is_active, created_at) VALUES (?,?,?,?)')
          .run(bu.username, bu.password_hash, bu.is_active ?? 1, bu.created_at);
      }
      created++;
    }
  }

  if (Array.isArray(backupProfiles)) {
    for (const bp of backupProfiles) {
      const existing = await prepare('SELECT id FROM profiles WHERE user_id = ?').get(bp.user_id) as any;
      if (existing) {
        await prepare(`UPDATE profiles SET full_name=?, role=?, access_level=?, email=?, pin=?,
          shift_type=?, shift_start=?, shift_end=?, weekly_off=?,
          password_hint=?, is_active=?, is_archived=?, deactivated_at=?, status=?
          WHERE id=?`)
          .run(bp.full_name, bp.role, bp.access_level, bp.email || null, bp.pin || '',
            bp.shift_type || 'general', bp.shift_start || '09:00', bp.shift_end || '17:00', bp.weekly_off || '[]',
            bp.password_hint || '', bp.is_active ?? 1, bp.is_archived ?? 0, bp.deactivated_at || null, bp.status || 'active',
            bp.id);
        updated++;
      } else {
        const bpUid = bp.uid || `PRF-${String(bp.id).padStart(4, '0')}`;
        await prepare(`INSERT INTO profiles (uid, id, user_id, full_name, role, access_level, email, pin,
          shift_type, shift_start, shift_end, weekly_off,
          password_hint, is_active, is_archived, deactivated_at, status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(bpUid, bp.id, bp.user_id, bp.full_name, bp.role, bp.access_level, bp.email || null, bp.pin || '',
            bp.shift_type || 'general', bp.shift_start || '09:00', bp.shift_end || '17:00', bp.weekly_off || '[]',
            bp.password_hint || '', bp.is_active ?? 1, bp.is_archived ?? 0, bp.deactivated_at || null, bp.status || 'active');
        created++;
      }
    }
  }

  const restored: Record<string, number> = {};
  const hasDataTables = BACKUP_DATA_TABLES.some((t) => Array.isArray(req.body[t]));
  if (hasDataTables) await exec('PRAGMA foreign_keys = OFF');
  try {
    // Delete children first so PostgreSQL foreign keys hold during the delete
    // pass (PRAGMA foreign_keys only affects the local mirror).
    for (const t of [...BACKUP_DATA_TABLES].reverse()) {
      if (!Array.isArray(req.body[t])) { restored[t] = 0; continue; }
      await prepare(`DELETE FROM "${t}"`).run();
    }
    // Insert parents first so PostgreSQL foreign keys hold during the insert
    // pass.
    for (const t of BACKUP_DATA_TABLES) {
      const rows = Array.isArray(req.body[t]) ? req.body[t] : [];
      if (!rows.length) { restored[t] = 0; continue; }
      const cols = Object.keys(rows[0]).filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c));
      if (!cols.length) { restored[t] = 0; continue; }
      const colList = cols.map((c) => `"${c}"`).join(',');
      const ph = cols.map(() => '?').join(',');
      let n = 0;
      for (const row of rows) {
        const values = cols.map((c) => (row[c] === undefined ? null : row[c]));
        await prepare(`INSERT INTO "${t}" (${colList}) VALUES (${ph})`).run(...values);
        n++;
      }
      restored[t] = n;
    }
  } finally {
    if (hasDataTables) await exec('PRAGMA foreign_keys = ON');
  }

  // Re-align auto-increment counters so future inserts never collide with the
  // restored ids (local sqlite_sequence + PostgreSQL sequences).
  for (const t of BACKUP_DATA_TABLES) {
    const maxId = mirrorGet(`SELECT MAX(id) as m FROM "${t}"`)?.m ?? 0;
    if (maxId > 0) {
      const r = mirrorRun('UPDATE sqlite_sequence SET seq = ? WHERE name = ?', [maxId, t]);
      if (!r.changes) mirrorRun('INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES (?, ?)', [t, maxId]);
    }
  }
  await realignSequencesForTables(BACKUP_DATA_TABLES);

  res.json({ created, updated, skipped, restored });
});

// --- Deactivate user seat ---

// Update a user's linked profile (full_name, role, access_level) by user id
router.put('/:id', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const user = await prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const profile = await prepare('SELECT * FROM profiles WHERE user_id = ? AND is_archived = 0').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });

  const { full_name, role, access_level } = req.body;
  const targetRole = role || profile.role;
  const roleDef = ROLES.find(r => r.id === targetRole);
  if (!roleDef) return res.status(400).json({ error: 'Invalid role.' });

  // When only the role changes, derive the level from the role's default so a
  // role downgrade can't silently leave an inflated access_level behind.
  const finalLevel = access_level === undefined ? (role && role !== profile.role ? roleDef.defaultLevel : profile.access_level) : Number(access_level);
  if (!Number.isInteger(finalLevel) || finalLevel < 1 || finalLevel > 3) {
    return res.status(400).json({ error: 'Access level must be 1, 2 or 3.' });
  }
  if (finalLevel !== profile.access_level || (role && role !== profile.role)) {
    if (await isLastActiveAdmin(profile.id)) {
      return res.status(400).json({ error: 'You cannot change the role/level of the first admin — no other admin would remain to fix it.' });
    }
  }

  await prepare('UPDATE profiles SET full_name = ?, role = ?, access_level = ? WHERE id = ?')
    .run(full_name || profile.full_name, targetRole, finalLevel, profile.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'update_user', 'profiles', profile.id, `Updated user: ${full_name || profile.full_name} (${profile.uid})`);
  userBackup(req, `User updated: ${full_name || profile.full_name}`);
  emitEvent('user:changed', { profile_id: profile.id, full_name: full_name || profile.full_name, action: 'role_updated', actor: req.user!.profile_id });
  res.json({ success: true, user_id: user.id, profile_id: profile.id });
});

router.put('/:id/deactivate', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const user = await prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const profile = await prepare('SELECT id, full_name, uid FROM profiles WHERE user_id = ? AND is_active = 1').get(req.params.id) as any;
  if (profile && await isLastActiveAdmin(profile.id)) {
    return res.status(400).json({ error: 'You cannot deactivate the first admin — no other admin would remain to reactivate them.' });
  }
  await prepare('UPDATE profiles SET is_active = 0, is_archived = 1, deactivated_at = datetime(\'now\') WHERE user_id = ? AND is_active = 1').run(req.params.id);
  await prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'deactivate_user', 'users', req.params.id, `Deactivated user: ${profile?.full_name || '#' + req.params.id} (${profile?.uid || ''})`);
  userBackup(req, `User deactivated: ${profile?.full_name || '#' + req.params.id}`);
  if (profile) {
    forceLogout(profile.id, 'Your account has been deactivated by an administrator.');
    emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'deactivated', actor: req.user!.profile_id });
  }
  res.json({ success: true });
});

// Admin change another user's password
router.put('/:id/password', authenticate, authorize(1), async (req: AuthRequest, res: Response) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const user = await prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const password_hash = bcrypt.hashSync(new_password, 10);
  await prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.params.id);
  const profile = await prepare('SELECT full_name, uid FROM profiles WHERE user_id = ? AND is_active = 1').get(req.params.id) as any;
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'change_password', 'users', req.params.id, `Changed password for: ${profile?.full_name || '#' + req.params.id} (${profile?.uid || ''})`);
  userBackup(req, `Password changed for: ${profile?.full_name || '#' + req.params.id}`);
  res.json({ success: true });
});

// User workload - current tasks with deadlines
router.get('/:id/workload', authenticate, async (req: AuthRequest, res: Response) => {
  let profile = await prepare('SELECT id FROM profiles WHERE id = ? AND is_active = 1').get(req.params.id) as any;
  if (!profile) profile = await prepare('SELECT id FROM profiles WHERE user_id = ? AND is_active = 1').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  if (req.user!.access_level === 3 && req.user!.profile_id !== profile.id) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const tasks = await prepare(`
    SELECT id, title, status, deadline, priority, task_type
    FROM tasks
    WHERE assigned_to = ? AND status NOT IN ('completed', 'under_review', 'cancelled', 'published')
    ORDER BY deadline ASC
  `).all(profile.id);
  res.json(tasks);
});

export default router;
