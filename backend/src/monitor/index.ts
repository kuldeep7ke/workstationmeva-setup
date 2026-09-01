import {
  ensureMonitorConfig, monitorLog, loadState, saveState,
  MonitorConfig, eMsg,
} from './config';
import { dbHello, dbPush, dbHeartbeat } from './dbpush';
import { buildTableDeltas, buildHourStats, buildCounts } from './push';
import { MonitorState } from './config';

const PUSH_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 90 * 1000;

let cfg: MonitorConfig | null = null;
let pushTimer: NodeJS.Timeout | null = null;
let hbTimer: NodeJS.Timeout | null = null;
let inFlight = false;

async function syncHello(): Promise<void> {
  if (!cfg) return;
  await dbHello(cfg);
  const st = loadState();
  st.startedAt = cfg.startedAt;
  saveState(st);
}

async function pushDelta(): Promise<void> {
  if (!cfg || !cfg.enabled || inFlight) return;
  inFlight = true;
  try {
    const st = loadState();
    const tables = buildTableDeltas(st);
    const hours = buildHourStats();
    const counts = buildCounts();
    const hasData =
      Object.keys(tables).length > 0 || hours.length > 0 || Object.keys(counts).length > 0;
    if (!hasData) return;
    await dbPush(cfg, tables, counts, hours);
    const next: Record<string, number> = { ...st.tables };
    for (const t of Object.keys(tables)) {
      const w = tables[t].watermarks[t];
      if (Number.isFinite(Number(w))) next[t] = Number(w);
    }
    const ns: MonitorState = { tables: next, lastPush: Date.now(), startedAt: st.startedAt };
    saveState(ns);
  } catch (e) {
    monitorLog(`push failed: ${eMsg(e)}`);
  } finally {
    inFlight = false;
  }
}

async function pushHeartbeat(): Promise<void> {
  if (!cfg || !cfg.enabled || inFlight) return;
  inFlight = true;
  try {
    await dbHeartbeat(cfg);
  } catch (e) {
    monitorLog(`heartbeat failed: ${eMsg(e)}`);
  } finally {
    inFlight = false;
  }
}

export function initMonitor(): void {
  try {
    cfg = ensureMonitorConfig();
    if (!cfg.enabled) {
      monitorLog('monitor disabled');
      return;
    }
    monitorLog(`monitor active (instance ${cfg.instanceId}, ${cfg.appVersion}, ${cfg.platform})`);
    const start = async () => {
      await syncHello();
      await pushDelta();
      await pushHeartbeat();
    };
    start().catch(() => {});
    pushTimer = setInterval(() => { pushDelta().catch(() => {}); }, PUSH_INTERVAL_MS);
    hbTimer = setInterval(() => { pushHeartbeat().catch(() => {}); }, HEARTBEAT_INTERVAL_MS);
    if (typeof pushTimer.unref === 'function') pushTimer.unref();
    if (typeof hbTimer.unref === 'function') hbTimer.unref();
  } catch (e) {
    monitorLog(`init failed: ${eMsg(e)}`);
  }
}