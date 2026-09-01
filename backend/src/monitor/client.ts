export interface InstanceInfo {
  id: string;
  version: string;
  platform: string;
  hostname: string;
  started_at: string;
  uptime_s: number;
}

export interface HourStat {
  hour: string;
  count: number;
  c2xx: number;
  c4xx: number;
  c5xx: number;
  sum_dur_ms: number;
}

export interface IngestPayload {
  token: string;
  instance: InstanceInfo;
  hello?: boolean;
  heartbeat?: boolean;
  counts?: Record<string, number>;
  hours?: HourStat[];
  tables?: Record<string, { cols: string[]; rows: any[][] }>;
}

// POST the payload to the dashboard ingest endpoint. No shared state, no deps.
export async function postIngest(url: string, payload: IngestPayload, timeoutMs = 60000): Promise<any> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`ingest HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (!text) return {};
    try { return JSON.parse(text); } catch { return {}; }
  } finally {
    clearTimeout(timer);
  }
}