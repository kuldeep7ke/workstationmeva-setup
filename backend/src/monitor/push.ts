import fs from 'fs';
import path from 'path';
import { mirrorReady, mirrorAll } from '../database/schema';
import { monitorLog, eMsg, MonitorState } from './config';
import { HourStat } from './client';

// Tables pushed to the dashboard (exists on the SQLite mirror). Sensitive
// credential/secret columns are stripped before anything leaves the machine.
export const MONITOR_TABLES = [
  'users',
  'profiles',
  'activity_logs',
  'user_activity',
  'system_activity',
  'story_activities',
  'task_audit_log',
  'login_attempts',
  'telemetry_errors',
  'tasks',
  'bulletins',
  'stories',
  'ads',
  'special_programs',
  'reporters',
  'archives',
  'leaves',
  'toast_logs',
  'bulletin_templates',
  'locations',
  'anchor_tasks',
  'video_editor_tasks',
  'notifications',
  'user_bulletin_defaults',
  'system_bulletin_defaults',
  'task_news_items',
  'channel_metadata',
  'task_extensions',
  'task_collaborators',
  'backups',
  'backup_config',
  'scheduled_notifications',
];

const SENSITIVE = new Set(['password_hash', 'pin', 'password_hint']);

function columnNames(table: string): string[] {
  try {
    const rows: any[] = mirrorAll(`SELECT name FROM pragma_table_info("${table}") ORDER BY cid`);
    return rows.map((r: any) => String(r.name)).filter((c: string) => !SENSITIVE.has(c));
  } catch (e) {
    monitorLog(`columnNames ${table} failed: ${eMsg(e)}`);
    return [];
  }
}

export function tableRowCount(table: string): number {
  try {
    const r: any = mirrorAll(`SELECT COUNT(*) AS c FROM "${table}"`)[0];
    return r ? Number(r.c) || 0 : 0;
  } catch {
    return 0;
  }
}

export interface TableDelta {
  cols: string[];
  rows: any[][];
  watermarks: Record<string, number>;
}

// Incremental rows since the stored watermark, purged of sensitive columns.
export function buildTableDeltas(state: MonitorState): Record<string, TableDelta> {
  const out: Record<string, TableDelta> = {};
  if (!mirrorReady()) return out;
  for (const t of MONITOR_TABLES) {
    try {
      const cols = columnNames(t);
      if (!cols.length) continue;
      const list = cols.map((c) => `"${c}"`).join(',');
      const maxId = Number((state.tables || {})[t]) || 0;
      const rows: any[] = mirrorAll(
        `SELECT ${list} FROM "${t}" WHERE id > ${maxId} ORDER BY id ASC LIMIT 5000`
      );
      if (!rows.length) continue;
      const lastId = rows[rows.length - 1]?.id;
      out[t] = {
        cols,
        rows: rows.map((r: any) => cols.map((c) => r[c])),
        watermarks: Number.isFinite(Number(lastId)) ? { [t]: Number(lastId) } : {},
      };
    } catch (e) {
      monitorLog(`table ${t} skipped: ${eMsg(e)}`);
    }
  }
  return out;
}

// Per-table row totals for the dashboard summary + "user count" style cards.
export function buildCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  if (!mirrorReady()) return out;
  for (const t of MONITOR_TABLES) out[t] = tableRowCount(t);
  return out;
}

const TEL_DIR = path.join(process.cwd(), 'telemetry');

// Per-hour request volume derived from the daily NDJSON request logs (last 24h).
export function buildHourStats(): HourStat[] {
  const byHour = new Map<string, { count: number; c2xx: number; c4xx: number; c5xx: number; sum_dur_ms: number }>();
  const since = Date.now() - 24 * 3600 * 1000;
  try {
    for (const f of fs.readdirSync(TEL_DIR)) {
      if (!/^requests-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)) continue;
      const fpath = path.join(TEL_DIR, f);
      if (fs.statSync(fpath).mtimeMs < since) continue;
      for (const line of fs.readFileSync(fpath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          const ts = Date.parse(j?.ts);
          if (Number.isNaN(ts) || ts < since) continue;
          const hour = new Date(ts).toISOString().slice(0, 13);
          const s = byHour.get(hour) || { count: 0, c2xx: 0, c4xx: 0, c5xx: 0, sum_dur_ms: 0 };
          s.count += 1;
          s.sum_dur_ms += Number(j?.durMs) || 0;
          const st = Number(j?.status);
          if (st >= 500) s.c5xx += 1;
          else if (st >= 400) s.c4xx += 1;
          else s.c2xx += 1;
          byHour.set(hour, s);
        } catch { /* skip malformed line */ }
      }
    }
  } catch (e) {
    monitorLog(`hour stats failed: ${eMsg(e)}`);
  }
  return Array.from(byHour.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([hour, s]) => ({ hour, ...s }));
}