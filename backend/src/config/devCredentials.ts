import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { DB_DIR } from '../database/schema';

// Developer credentials live in a plain JSON file next to the JWT secret
// (NOT in the database), so they survive missing/corrupt/locked databases.

const DEV_FILE = path.join(DB_DIR, '.dev-credentials');

export const DEFAULT_DEV_USERNAME = 'dev-admin';
export const DEFAULT_DEV_PASSWORD = 'Dev@Meva2026';

interface DevCredential {
  username: string;
  password_hash: string;
  default_password: boolean;
  updated_at?: string;
}

let cached: DevCredential | null = null;

function readFile(): DevCredential | null {
  try {
    if (fs.existsSync(DEV_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DEV_FILE, 'utf8'));
      if (parsed && typeof parsed.username === 'string' && typeof parsed.password_hash === 'string') {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function writeFile(cred: DevCredential): void {
  try {
    fs.mkdirSync(path.dirname(DEV_FILE), { recursive: true });
    fs.writeFileSync(DEV_FILE, JSON.stringify(cred, null, 2), { mode: 0o600 });
  } catch (e) {
    console.error('[dev-credentials] Could not write credentials file:', e);
  }
}

export function resetDevCredentialCache(): void {
  cached = null;
}

export function getDevCredential(): DevCredential {
  if (cached) return cached;
  const existing = readFile();
  let cred: DevCredential;
  if (existing) {
    cred = existing;
  } else {
    cred = {
      username: DEFAULT_DEV_USERNAME,
      password_hash: bcrypt.hashSync(DEFAULT_DEV_PASSWORD, 10),
      default_password: true,
      updated_at: new Date().toISOString(),
    };
    writeFile(cred);
    console.log('[dev-credentials] Created default developer login.');
    console.log(`[dev-credentials] Username: ${cred.username}`);
    console.log(`[dev-credentials] Default password: ${DEFAULT_DEV_PASSWORD}`);
    console.log('[dev-credentials] Change this password as soon as possible from the Developer page (Dev Tools tab).');
  }
  cached = cred;
  return cred;
}

export function checkDevLogin(username: string, password: string): boolean {
  const cred = getDevCredential();
  return cred.username === username && bcrypt.compareSync(password, cred.password_hash);
}

export function changeDevPassword(username: string, newPassword: string): { username: string; default_password: boolean } {
  const cred = getDevCredential();
  const updated: DevCredential = {
    username: cred.username,
    password_hash: bcrypt.hashSync(newPassword, 10),
    default_password: false,
    updated_at: new Date().toISOString(),
  };
  writeFile(updated);
  cached = updated;
  return { username: updated.username, default_password: updated.default_password };
}