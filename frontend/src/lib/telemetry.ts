// Client-side glitch capture for research: window errors + unhandled rejections
// are batched and sent to POST /api/telemetry/errors (dual-path insert, so they
// survive offline periods and replay on reconnect). Silent by design — capture
// must never disturb the app, and errors from the telemetry endpoint itself are
// ignored to avoid feedback loops.

const MAX_BATCH = 20;
const FLUSH_MS = 10000;

interface TelemetryItem {
  page: string;
  error_type: string;
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
}

const queue: TelemetryItem[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function push(item: TelemetryItem) {
  if (item.message.includes('/api/telemetry')) return;
  queue.push(item);
  if (queue.length >= MAX_BATCH) flush();
  else if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_MS);
  }
}

function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  const token = localStorage.getItem('token');
  if (!token) return;
  fetch('/api/telemetry/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(batch),
  }).catch(() => {});
}

export function initTelemetry() {
  window.addEventListener('error', (e) => {
    push({
      page: window.location.pathname,
      error_type: 'error',
      message: String(e.message || 'Unknown error'),
      stack: e.error?.stack,
      source: e.filename || undefined,
      line: e.lineno || undefined,
      col: e.colno || undefined,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r: any = e.reason;
    push({
      page: window.location.pathname,
      error_type: 'unhandledrejection',
      message: String(r?.message || r || 'Unhandled promise rejection'),
      stack: r?.stack,
    });
  });
}
