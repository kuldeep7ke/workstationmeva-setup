// Timestamp parsing that is timezone-safe for BOTH storage formats used by the
// backend:
//  - 'YYYY-MM-DD HH:MM:SS'  (SQLite datetime('now') / local mirror — UTC, no TZ marker)
//  - ISO-8601 with 'Z'       (PostgreSQL timestamptz, returned via the pg adapter)
// A TZ-less string parsed with `new Date()` is treated as LOCAL time, which
// shifts every timestamp by the UTC offset — always parse through parseDate().

export function parseDate(ts?: string | number | Date | null): Date | null {
  if (ts === null || ts === undefined || ts === '') return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(ts).trim();
  if (!s) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = s.replace(' ', 'T');
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Date(iso + 'Z');
}

export function formatDateTime(ts?: string | number | Date | null): string {
  const d = parseDate(ts);
  return d ? d.toLocaleString() : '';
}

export function formatDate(ts?: string | number | Date | null): string {
  const d = parseDate(ts);
  return d ? d.toLocaleDateString() : '';
}

export function formatTime(ts?: string | number | Date | null): string {
  const d = parseDate(ts);
  return d ? d.toLocaleTimeString() : '';
}

export function timeAgo(ts?: string | number | Date | null): string {
  const d = parseDate(ts);
  if (!d) return '';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
