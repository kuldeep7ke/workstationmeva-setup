import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { monitorDbUrl } from './secrets';

const DB_DIR = path.join(__dirname, '..', '..');
const ENV_PATH = path.join(DB_DIR, '.env');
const STATE_PATH = path.join(DB_DIR, '.monitor-state.json');
const LOG_PATH = path.join(DB_DIR, 'monitor.log');

export interface MonitorConfig {
  instanceId: string;
  dbUrl: string;
  token: string;
  tokenHash: string;
  enabled: boolean;
  appVersion: string;
  platform: string;
  hostname: string;
  startedAt: string;
}

export interface MonitorState {
  tables: Record<string, number>;
  lastPush: number | null;
  startedAt: string | null;
}

export function monitorLog(msg: string): void {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* never throw */ }
}

function eMsg(e: any): string {
  return e instanceof Error ? e.message : String(e);
}

function readEnvFile(): string[] {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
}

function appendEnvKeys(keys: Record<string, string>): void {
  try {
    const lines = readEnvFile();
    for (const [k, v] of Object.entries(keys)) {
      if (!v) continue;
      const re = new RegExp(`^${k}=`);
      if (lines.some((l) => re.test(l))) continue;
      lines.push(`${k}=${v}`);
    }
    fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', { mode: 0o600 });
  } catch (e) {
    monitorLog(`env write failed: ${eMsg(e)}`);
  }
}

export function readEnvValue(key: string): string {
  for (const l of readEnvFile()) {
    const t = l.trim();
    if (t.startsWith(key + '=')) return t.slice(key.length + 1).replace(/^"|"$/g, '');
  }
  return '';
}

function readPackageVersion(): string {
  try {
    const p: any = JSON.parse(fs.readFileSync(path.join(DB_DIR, 'package.json'), 'utf8'));
    return typeof p?.version === 'string' ? p.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function ensureMonitorConfig(): MonitorConfig {
  let instanceId = readEnvValue('MONITOR_INSTANCE_ID');
  if (!instanceId) {
    instanceId = crypto.randomBytes(12).toString('hex');
    appendEnvKeys({ MONITOR_INSTANCE_ID: instanceId });
  }
  const token = readEnvValue('MONITOR_TOKEN') || crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const dbUrl = readEnvValue('MONITOR_DATABASE_URL') || monitorDbUrl();
  const disabled = readEnvValue('MONITOR_DISABLED') === '1';
  return {
    instanceId,
    dbUrl,
    token,
    tokenHash,
    enabled: !disabled && !!dbUrl && !!instanceId,
    appVersion: readPackageVersion(),
    platform: `${os.platform()} ${os.release()}`,
    hostname: os.hostname(),
    startedAt: new Date().toISOString(),
  };
}

export function loadState(): MonitorState {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      tables: typeof raw?.tables === 'object' && raw.tables ? raw.tables : {},
      lastPush: raw?.lastPush ?? null,
      startedAt: raw?.startedAt ?? null,
    };
  } catch {
    return { tables: {}, lastPush: null, startedAt: null };
  }
}

export function saveState(s: MonitorState): void {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
  } catch (e) {
    monitorLog(`state save failed: ${eMsg(e)}`);
  }
}

export { eMsg };