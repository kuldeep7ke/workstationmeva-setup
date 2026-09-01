import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prepare, DB_DIR } from '../database/schema';

const SECRET_FILE = path.join(DB_DIR, '.jwt-secret');

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    if (fs.existsSync(SECRET_FILE)) {
      return fs.readFileSync(SECRET_FILE, 'utf8').trim();
    }
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    console.log('[auth] Generated new JWT secret key.');
    return secret;
  } catch (e) {
    console.error('[auth] Could not load JWT secret:', e);
    // Fallback to in-memory secret (not persisted) if file operations fail
    return crypto.randomBytes(48).toString('hex');
  }
}

const JWT_SECRET = getJwtSecret();

export interface AuthRequest extends Request {
  user?: { id: number; username: string; profile_id: number; full_name: string; access_level: number; role: string; is_dev?: boolean };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Developer tokens are self-contained: they must work even when the
    // database is missing, corrupt or locked, so never query the DB for them.
    if (decoded.is_dev) {
      req.user = {
        id: decoded.id ?? -1,
        username: decoded.username || 'dev',
        profile_id: decoded.profile_id ?? -1,
        full_name: decoded.full_name || 'Developer',
        access_level: decoded.access_level ?? 3,
        role: decoded.role || 'developer',
        is_dev: true,
      };
      return next();
    }
    const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1 AND status = \'active\'').get(decoded.profile_id) as any;
    if (!profile) {
      return res.status(401).json({ error: 'Profile not found or inactive.' });
    }
    req.user = {
      id: decoded.id,
      username: decoded.username,
      profile_id: profile.id,
      full_name: profile.full_name,
      access_level: profile.access_level,
      role: profile.role,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function authorize(...levels: number[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !levels.includes(req.user.access_level)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

export function authorizeDev(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.is_dev) {
    return res.status(403).json({ error: 'Access denied. Developer login required.' });
  }
  next();
}

export function authorizeAdminOrDev(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || (!req.user.is_dev && req.user.access_level > 1)) {
    return res.status(403).json({ error: 'Access denied. Admin or developer login required.' });
  }
  next();
}

export function generateToken(user: { id: number; username: string; profile_id: number; full_name: string; access_level: number; role: string }): string {
  return jwt.sign({
    id: user.id,
    username: user.username,
    profile_id: user.profile_id,
    full_name: user.full_name,
    access_level: user.access_level,
    role: user.role,
  }, JWT_SECRET, { expiresIn: '24h' });
}

export function generateDevToken(profileId: number = -1): string {
  return jwt.sign({
    id: -1,
    username: 'dev',
    profile_id: profileId,
    full_name: 'Developer',
    access_level: 3,
    role: 'developer',
    is_dev: true,
  }, JWT_SECRET, { expiresIn: '24h' });
}
