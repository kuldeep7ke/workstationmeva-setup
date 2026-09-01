import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prepare, saveManagedBackup } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { hashPin, verifyPin, pinNeedsUpgrade } from '../utils/pin';
import { logUserActivity } from './activity';
import { emitEvent } from '../socket';

function comparePassword(password: string, hash: string): boolean {
  try { return bcrypt.compareSync(password, hash); } catch { return false; }
}

function logLoginAttempt(profileId: number | null, fullName: string, email: string | null, action: string, details: string) {
  try {
    const result: any = prepare('INSERT INTO login_attempts (profile_id, full_name, email, action, details) VALUES (?,?,?,?,?)')
      .run(profileId, fullName, email || '', action, details);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {}
}

function sanitizeIp(req: any): string {
  return req.ip || req.connection?.remoteAddress || '';
}

const router = Router();

// List all active level-3 profiles (for landing page) — public read-only, no email exposure
router.get('/level3', async (_req: AuthRequest, res: Response) => {
  const profiles = await prepare(
    "SELECT id, full_name, email, role, (CASE WHEN pin IS NOT NULL AND pin != '' THEN 1 ELSE 0 END) as has_pin FROM profiles WHERE access_level = 3 AND is_active = 1 AND is_archived = 0 ORDER BY full_name ASC"
  ).all();
  res.json(profiles);
});

// Admin sets/changes a PIN for a profile (stored bcrypt-hashed)
router.put('/:id/pin', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Admin only' });
  const { pin } = req.body;
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  await prepare('UPDATE profiles SET pin = ? WHERE id = ?').run(hashPin(pin), req.params.id);
  logUserActivity(req.user!.profile_id, req.user!.full_name, 'set_pin', 'profiles', profile.id, `Set PIN for ${profile.full_name}`);
  saveManagedBackup('user_change', `PIN set for ${profile.full_name}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'pin_set', actor: req.user!.profile_id });
  res.json({ success: true, message: 'PIN updated' });
});

// Admin removes a PIN for a profile
router.delete('/:id/pin', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.access_level > 2) return res.status(403).json({ error: 'Admin only' });
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  await prepare("UPDATE profiles SET pin = '' WHERE id = ?").run(req.params.id);
  logUserActivity(req.user!.profile_id, req.user!.full_name, 'remove_pin', 'profiles', profile.id, `Removed PIN for ${profile.full_name}`);
  saveManagedBackup('user_change', `PIN removed for ${profile.full_name}`, req.user?.full_name || req.user?.username || 'system');
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'pin_removed', actor: req.user!.profile_id });
  res.json({ success: true, message: 'PIN removed' });
});

// Verify PIN for login (called from frontend before approval request) — rate-limited against brute force
router.post('/:id/verify-pin', rateLimit({ windowMs: 5 * 60 * 1000, max: 10, keyPrefix: 'pinverify' }), async (req: AuthRequest, res: Response) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required.' });
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  if (!verifyPin(profile.pin, pin)) {
    logLoginAttempt(profile.id, profile.full_name, profile.email, 'failed_pin', 'Wrong PIN entered from ' + sanitizeIp(req));
    return res.status(401).json({ error: 'Wrong PIN.' });
  }
  if (pinNeedsUpgrade(profile.pin)) {
    await prepare('UPDATE profiles SET pin = ? WHERE id = ?').run(hashPin(pin), profile.id);
  }
  logLoginAttempt(profile.id, profile.full_name, profile.email, 'success', 'PIN login from ' + sanitizeIp(req));
  res.json({ success: true });
});

// Get PIN status for a profile (whether it has a pin set)
router.get('/:id/pin-status', async (req: AuthRequest, res: Response) => {
  const profile = await prepare("SELECT id, (CASE WHEN pin IS NOT NULL AND pin != '' THEN 1 ELSE 0 END) as has_pin FROM profiles WHERE id = ?").get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  res.json({ has_pin: !!profile.has_pin });
});

// User requests admin to set/change PIN (creates notification for admins)
router.post('/:id/request-pin', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'pinreq' }), async (req: AuthRequest, res: Response) => {
  const { message } = req.body;
  const profile = await prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  // Create notifications for all online admin profiles (level 1)
  const admins = await prepare("SELECT id FROM profiles WHERE access_level = 1 AND is_active = 1").all() as any[];
  for (const admin of admins) {
    await prepare('INSERT INTO notifications (user_id, from_user_id, type, entity_type, entity_id, title, message) VALUES (?,?,?,?,?,?,?)')
      .run(admin.id, profile.id, 'pin_request', 'profiles', profile.id, `PIN: ${profile.full_name}`, message || 'Set/change PIN');
  }
  emitEvent('user:pin-requested', { profile_id: profile.id, full_name: profile.full_name });
  res.json({ success: true, message: 'Request sent to admin' });
});

// Self-service PIN reset for level-3 staff on the kiosk (Landing) page — verifies the
// account password server-side so a stale local PIN can always be fixed without admin help.
router.post('/:id/set-pin', rateLimit({ windowMs: 5 * 60 * 1000, max: 10, keyPrefix: 'pinset' }), async (req: AuthRequest, res: Response) => {
  const { password, pin } = req.body;
  if (!password || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Password and a 4-digit PIN are required.' });
  }
  const profile = await prepare('SELECT p.*, u.password_hash FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  if (!profile.password_hash || !comparePassword(password, profile.password_hash)) {
    logLoginAttempt(profile.id, profile.full_name, profile.email, 'failed_pin_reset', 'Wrong password for PIN reset from ' + sanitizeIp(req));
    return res.status(401).json({ error: 'Invalid password.' });
  }
  await prepare('UPDATE profiles SET pin = ? WHERE id = ?').run(hashPin(pin), profile.id);
  logLoginAttempt(profile.id, profile.full_name, profile.email, 'pin_reset', 'PIN reset from ' + sanitizeIp(req));
  logUserActivity(profile.id, profile.full_name, 'set_pin', 'profiles', profile.id, `Set own PIN for ${profile.full_name}`);
  saveManagedBackup('user_change', `PIN set for ${profile.full_name} (self-service)`, profile.full_name);
  emitEvent('user:changed', { profile_id: profile.id, full_name: profile.full_name, action: 'pin_set', actor: profile.id });
  res.json({ success: true, message: 'PIN updated' });
});

export default router;
