import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DB_DIR } from '../database/schema';

export interface SavedConnection {
  id: string;
  label: string;
  connectionString: string;
  host: string;
  projectRef: string;
  database: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const FILE = path.join(DB_DIR, 'saved-connections.json');

function readAll(): SavedConnection[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[saved-connections] failed to read:', e);
    return [];
  }
}

function writeAll(list: SavedConnection[]): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[saved-connections] failed to write:', e);
  }
}

function maskPassword(cs: string): string {
  try {
    const u = new URL(cs);
    const pw = decodeURIComponent(u.password);
    u.password = pw ? `${pw.slice(0, 2)}****${pw.length > 4 ? pw.slice(-2) : ''}` : '';
    return u.toString();
  } catch {
    return '';
  }
}

export function parseDbInfo(cs: string): { host: string; projectRef: string; database: string; passwordMasked: string } {
  try {
    const u = new URL(cs);
    const user = decodeURIComponent(u.username);
    const pw = decodeURIComponent(u.password);
    return {
      host: u.host,
      projectRef: user.startsWith('postgres.') ? user.slice(9) : user,
      database: u.pathname.replace(/^\//, '') || 'postgres',
      passwordMasked: pw ? `${pw.slice(0, 2)}****${pw.length > 4 ? pw.slice(-2) : ''}` : '',
    };
  } catch {
    return { host: '', projectRef: '', database: '', passwordMasked: '' };
  }
}

export function getSavedConnections(): SavedConnection[] {
  return readAll();
}

export function getConnectionById(id: string): SavedConnection | null {
  return readAll().find((c) => c.id === id) || null;
}

export function saveConnection(cs: string, label?: string): SavedConnection {
  const list = readAll();
  const info = parseDbInfo(cs);
  const now = new Date().toISOString();
  let item = list.find((c) => c.connectionString === cs);
  if (item) {
    item.label = label?.trim() || item.label || info.projectRef;
    item.lastUsedAt = now;
  } else {
    item = {
      id: crypto.randomUUID(),
      label: label?.trim() || info.projectRef || 'Supabase database',
      connectionString: cs,
      host: info.host,
      projectRef: info.projectRef,
      database: info.database,
      createdAt: now,
      lastUsedAt: null,
    };
    list.unshift(item);
  }
  writeAll(list);
  return item;
}

export function touchConnection(id: string): void {
  const list = readAll();
  const item = list.find((c) => c.id === id);
  if (!item) return;
  item.lastUsedAt = new Date().toISOString();
  writeAll(list);
}

export function deleteConnection(id: string): boolean {
  const list = readAll();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  writeAll(next);
  return true;
}

export { maskPassword };
