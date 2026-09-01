import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prepare, exec, nextUid } from '../database/schema';
import { isPostgres } from '../database/postgres';
import { generateToken, generateDevToken, AuthRequest, authenticate, authorizeDev } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { verifyPin, hashPin, pinNeedsUpgrade } from '../utils/pin';
import { ROLES } from '../config/roles';
import { checkDevLogin, getDevCredential, changeDevPassword } from '../config/devCredentials';
import { emitEvent } from '../socket';

async function getUserCountAsync(): Promise<number> {
  if (isPostgres()) {
    const row = await prepare('SELECT COUNT(*) as cnt FROM users').get() as any;
    return row?.cnt ?? 0;
  }
  const row = prepare('SELECT COUNT(*) as cnt FROM users').get() as any;
  return row?.cnt ?? 0;
}

async function logLoginAttempt(profileId: number | null, fullName: string, email: string | null, action: string, details: string, ip: string) {
  try {
    await prepare('INSERT INTO login_attempts (profile_id, full_name, email, action, details, ip_address) VALUES (?,?,?,?,?,?)')
      .run(profileId, fullName, email || '', action, details, ip);
  } catch {}
}

function sanitizeIp(req: any): string {
  return req.ip || req.connection?.remoteAddress || '';
}

export { authenticate };

const router = Router();

router.post('/login', rateLimit({ windowMs: 5 * 60 * 1000, max: 10, keyPrefix: 'login' }), async (req: AuthRequest, res: Response) => {
  try {
    const { loginId, username, password } = req.body;
    const id = loginId || username;
    if (!id || !password) {
      return res.status(400).json({ error: 'Username/email and password required.' });
    }

    if (String(id).toLowerCase().startsWith('dev-')) {
      if (checkDevLogin(String(id), String(password))) {
        const dev = getDevCredential();
        // Attribute dev writes to a real admin profile so PostgreSQL foreign
        // keys (created_by / profile_id) accept them. Falls back to -1 if no
        // active admin exists.
        let devProfileId = -1;
        try {
          const admin = await prepare('SELECT id FROM profiles WHERE access_level = 1 AND is_active = 1 ORDER BY id LIMIT 1').get() as any;
          if (admin?.id) devProfileId = Number(admin.id);
        } catch { /* keep -1 */ }
        await logLoginAttempt(-1, 'Developer', null, 'success', 'Developer login', sanitizeIp(req));
        emitEvent('user:login', { profile_id: devProfileId, full_name: 'Developer', role: 'developer', method: 'dev' });
        return res.json({
          token: generateDevToken(devProfileId),
          user: {
            id: -1,
            username: 'dev',
            profile_id: devProfileId,
            full_name: 'Developer',
            access_level: 3,
            role: 'developer',
            email: null,
            is_dev: true,
            dev_default_password: dev.default_password,
            dev_username: dev.username,
          },
          isNewUser: false,
        });
      }
      await logLoginAttempt(-1, String(id), null, 'failed_password', 'Wrong developer password', sanitizeIp(req));
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = await prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(id) as any;
    let profile: any = null;
    if (user) {
      profile = await prepare('SELECT * FROM profiles WHERE user_id = ? AND is_active = 1').get(user.id) as any;
      if (!profile) {
        const pending = await prepare('SELECT * FROM profiles WHERE user_id = ? AND is_active = 0 AND is_archived = 0').get(user.id) as any;
        if (pending) {
          if (pending.status === 'suspended') {
            return res.status(403).json({ error: 'Your account has been terminated. Contact your administrator.' });
          }
          return res.status(403).json({ error: 'Your account is pending admin approval. Please try again later.' });
        }
      }
    } else {
      const profileByEmail = await prepare('SELECT p.*, u.username, u.password_hash FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.email = ? AND p.is_active = 1 AND u.is_active = 1').get(id) as any;
      if (!profileByEmail) {
        const pendingByEmail = await prepare('SELECT p.*, u.username, u.password_hash FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.email = ? AND p.is_active = 0 AND p.is_archived = 0 AND u.is_active = 1').get(id) as any;
        if (pendingByEmail) {
          if (pendingByEmail.status === 'suspended') {
            return res.status(403).json({ error: 'Your account has been terminated. Contact your administrator.' });
          }
          return res.status(403).json({ error: 'Your account is pending admin approval. Please try again later.' });
        }
      }
      if (profileByEmail) {
        profile = profileByEmail;
        if (profile.status && profile.status !== 'active') {
          return res.status(403).json({ error: profile.status === 'suspended' ? 'Your account has been terminated. Contact your administrator.' : 'Your account is currently offline. Contact your administrator.' });
        }
        const userByProfile = await prepare("SELECT * FROM users WHERE id = ? AND is_active = 1").get(profileByEmail.user_id) as any;
        if (userByProfile) {
          const valid = bcrypt.compareSync(password, userByProfile.password_hash);
          if (!valid) {
            await logLoginAttempt(profile.id, profile.full_name, profile.email, 'failed_password', 'Wrong password', sanitizeIp(req));
            return res.status(401).json({ error: 'Invalid credentials.' });
          }
          const token = generateToken({
            id: userByProfile.id,
            username: userByProfile.username,
            profile_id: profile.id,
            full_name: profile.full_name,
            access_level: profile.access_level,
            role: profile.role,
          });
          await logLoginAttempt(profile.id, profile.full_name, profile.email, 'success', 'Login via email', sanitizeIp(req));
          emitEvent('user:login', { profile_id: profile.id, full_name: profile.full_name, role: profile.role, method: 'email' });
          return res.json({
            token,
            user: {
              id: userByProfile.id,
              username: userByProfile.username,
              profile_id: profile.id,
              full_name: profile.full_name,
              access_level: profile.access_level,
              role: profile.role,
              email: profile.email,
            },
            isNewUser: false,
          });
        }
      }
    }

    if (!user || !profile) {
      await logLoginAttempt(null, id, id, 'failed_password', 'User/Profile not found', sanitizeIp(req));
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (profile.status && profile.status !== 'active') {
      await logLoginAttempt(profile.id, profile.full_name, profile.email, 'failed_status', `Login blocked (${profile.status})`, sanitizeIp(req));
      return res.status(403).json({ error: profile.status === 'suspended' ? 'Your account has been terminated. Contact your administrator.' : 'Your account is currently offline. Contact your administrator.' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      await logLoginAttempt(profile.id, profile.full_name, profile.email, 'failed_password', 'Wrong password', sanitizeIp(req));
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      profile_id: profile.id,
      full_name: profile.full_name,
      access_level: profile.access_level,
      role: profile.role,
    });

    await logLoginAttempt(profile.id, profile.full_name, profile.email, 'success', 'Login successful', sanitizeIp(req));
    emitEvent('user:login', { profile_id: profile.id, full_name: profile.full_name, role: profile.role, method: 'password' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        profile_id: profile.id,
        full_name: profile.full_name,
        access_level: profile.access_level,
        role: profile.role,
        email: profile.email,
      },
      isNewUser: false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/signup', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'signup' }), async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, full_name, role, email } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Username, password and full name required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const cleanUsername = String(username).trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 30 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters using only letters, numbers, dots, dashes or underscores.' });
    }
    if (email && (String(email).length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)))) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const existing = await prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken.' });
    }

    const userCount = await getUserCountAsync();
    const isFirstUser = userCount === 0;
    const accessLevel = isFirstUser ? 1 : 3;
    let userRole = isFirstUser ? 'admin' : (role || 'editorial');
    if (role && !ROLES.some(r => r.id === role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const result = await prepare('INSERT INTO users (username, password_hash, is_active) VALUES (?,?,?)').run(cleanUsername, password_hash, 1);
    const userId = result.lastInsertRowid as number;

    const isActive = isFirstUser ? 1 : 0;
    const prfUid = await nextUid('PRF', 'profiles');
    const profileResult = await prepare('INSERT INTO profiles (uid, user_id, full_name, role, access_level, email, is_active, status) VALUES (?,?,?,?,?,?,?,?)').run(prfUid, userId, full_name, userRole, accessLevel, email || null, isActive, isActive ? 'active' : 'hold');
    const profileId = profileResult.lastInsertRowid as number;

    await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
      .run(profileId, 'signup', 'profiles', profileId, `User signed up: ${full_name} (${userRole})`);

    if (isFirstUser) {
      const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(profileId) as any;

      const token = generateToken({
        id: userId,
        username: cleanUsername,
        profile_id: profile.id,
        full_name: profile.full_name,
        access_level: profile.access_level,
        role: profile.role,
      });

      res.status(201).json({
        token,
        user: {
          id: userId,
          username: cleanUsername,
          profile_id: profile.id,
          full_name: profile.full_name,
          access_level: profile.access_level,
          role: profile.role,
          email: profile.email,
        },
        isNewUser: true,
      });
    } else {
      emitEvent('user:signup-pending', { full_name, username, role: userRole });
      res.json({ pending: true, message: 'Your signup request has been submitted and is pending admin approval. Please try logging in later.' });
    }
    } catch (err: any) {
    console.error('[signup] error:', err);
    res.status(500).json({ error: err.message || 'Signup failed.' });
  }
});

router.get('/pending-signups', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 1) return res.status(403).json({ error: 'Admin only' });
  const pending = await prepare(`
    SELECT p.id, p.full_name, p.email, p.role, p.access_level, p.created_at, u.username
    FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE p.is_active = 0 AND p.is_archived = 0 AND u.is_active = 1
    ORDER BY p.created_at DESC
  `).all();
  res.json(pending);
});

router.put('/approve-signup/:profileId', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 1) return res.status(403).json({ error: 'Admin only' });
  const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 0').get(req.params.profileId) as any;
  if (!profile) return res.status(404).json({ error: 'Pending signup not found.' });
  // The signup flow stores every non-first user at level 3 regardless of the
  // role they picked; on approval, derive the level from the role's default so
  // e.g. a 'manager' signup is not stuck at staff level 3 forever.
  const roleDef = ROLES.find(r => r.id === profile.role);
  const level = roleDef ? roleDef.defaultLevel : profile.access_level;
  await prepare("UPDATE profiles SET is_active = 1, status = 'active', access_level = ? WHERE id = ?").run(level, req.params.profileId);
  emitEvent('user:signup-approved', { full_name: profile.full_name, approved_by: req.user!.profile_id });
  res.json({ success: true, access_level: level });
});

router.delete('/reject-signup/:profileId', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 1) return res.status(403).json({ error: 'Admin only' });
  const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 0').get(req.params.profileId) as any;
  if (!profile) return res.status(404).json({ error: 'Pending signup not found.' });
  await prepare("UPDATE profiles SET is_archived = 1, deactivated_at = datetime('now') WHERE id = ?").run(req.params.profileId);
  emitEvent('user:signup-rejected', { full_name: profile.full_name, rejected_by: req.user!.profile_id });
  res.json({ success: true });
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.is_dev) {
    const dev = getDevCredential();
    return res.json({
      id: -1,
      username: 'dev',
      profile_id: -1,
      full_name: 'Developer',
      access_level: 3,
      role: 'developer',
      email: null,
      is_dev: true,
      dev_default_password: dev.default_password,
      dev_username: dev.username,
    });
  }
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.user!.profile_id) as any;
  res.json({ ...req.user, email: profile?.email });
});

router.get('/dev', authenticate, authorizeDev, (_req: AuthRequest, res: Response) => {
  const dev = getDevCredential();
  res.json({
    username: dev.username,
    default_password: dev.default_password,
    updated_at: dev.updated_at || null,
    built_in: true,
  });
});

router.put('/dev/password', authenticate, authorizeDev, (req: AuthRequest, res: Response) => {
  const { new_password } = req.body;
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  if (String(new_password).toLowerCase() === 'dev@meva2026') {
    return res.status(400).json({ error: 'Choose a different password, not the default one.' });
  }
  const updated = changeDevPassword('dev', String(new_password));
  res.json({ success: true, default_password: updated.default_password });
});

router.put('/me/profile', authenticate, async (req: AuthRequest, res: Response) => {
  const { full_name, email } = req.body;
  if (!full_name) return res.status(400).json({ error: 'Full name required.' });
  await prepare('UPDATE profiles SET full_name = ?, email = ? WHERE id = ? AND user_id = ?').run(full_name, email || null, req.user!.profile_id, req.user!.id);
  res.json({ success: true, full_name, email });
});

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  const { current_password, new_password } = req.body;
  if (!current_password) return res.status(400).json({ error: 'Current password required.' });
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const user = await prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.user!.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const password_hash = bcrypt.hashSync(new_password, 10);
  await prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, user.id);
  await prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.user!.profile_id, 'change_password', 'users', user.id, 'User changed their own password');
  res.json({ success: true });
});

router.post('/onboard', authenticate, async (req: AuthRequest, res: Response) => {
  const { full_name, email } = req.body;
  if (!full_name) return res.status(400).json({ error: 'Full name required.' });
  await prepare('UPDATE profiles SET full_name = ?, email = ? WHERE id = ? AND user_id = ?').run(full_name, email || null, req.user!.profile_id, req.user!.id);
  res.json({ success: true, full_name, email });
});

router.get('/login-attempts', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Admin only' });
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const attempts = await prepare(`
    SELECT * FROM login_attempts ORDER BY created_at DESC LIMIT ?
  `).all(limit);
  res.json(attempts);
});

router.post('/login-with-pin', rateLimit({ windowMs: 5 * 60 * 1000, max: 10, keyPrefix: 'pinlogin' }), async (req: AuthRequest, res: Response) => {
  try {
    const { profile_id, pin } = req.body;
    if (!profile_id || !pin) return res.status(400).json({ error: 'Profile ID and PIN required.' });
    const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1 AND is_archived = 0').get(profile_id) as any;
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    if (profile.status && profile.status !== 'active') {
      return res.status(403).json({ error: profile.status === 'suspended' ? 'Your account has been terminated. Contact your administrator.' : 'Your account is currently offline. Contact your administrator.' });
    }
    if (!verifyPin(profile.pin, pin)) {
      await logLoginAttempt(profile.id, profile.full_name, profile.email, 'failed_pin', 'Wrong PIN on quick login', sanitizeIp(req));
      return res.status(401).json({ error: 'Wrong PIN.' });
    }
    if (pinNeedsUpgrade(profile.pin)) {
      await prepare('UPDATE profiles SET pin = ? WHERE id = ?').run(hashPin(pin), profile.id);
    }
    const user = await prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(profile.user_id) as any;
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const token = generateToken({
      id: user.id,
      username: user.username,
      profile_id: profile.id,
      full_name: profile.full_name,
      access_level: profile.access_level,
      role: profile.role,
    });
    await logLoginAttempt(profile.id, profile.full_name, profile.email, 'success', 'Quick login with PIN', sanitizeIp(req));
    emitEvent('user:login', { profile_id: profile.id, full_name: profile.full_name, role: profile.role, method: 'pin' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        profile_id: profile.id,
        full_name: profile.full_name,
        access_level: profile.access_level,
        role: profile.role,
        email: profile.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Broadcast to the LAN that a user signed out (the client clears its own
// session locally; this just notifies every other connected device).
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    emitEvent('user:logout', {
      profile_id: req.user!.profile_id,
      full_name: req.user!.full_name || req.user!.username || 'User',
    });
  } catch {}
  res.json({ success: true });
});

export default router;
