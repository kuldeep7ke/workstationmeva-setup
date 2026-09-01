import 'dotenv/config';
import './utils/asyncErrors';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { initDatabase, DB_DIR, saveManagedBackup, mirrorReady } from './database/schema';
import { initSocket, emitEvent } from './socket';
import { onSyncStatusChange } from './database/sync';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import taskRoutes from './routes/tasks';
import bulletinRoutes from './routes/bulletins';
import adRoutes from './routes/ads';
import programRoutes from './routes/programs';
import analyticsRoutes from './routes/analytics';
import roleRoutes from './routes/roles';
import bulletinTemplateRoutes from './routes/bulletinTemplates';
import notificationRoutes, { startNotificationScheduler } from './routes/notifications';
import developerRoutes from './routes/developer';
import storyRoutes from './routes/stories';
import reporterRoutes from './routes/reporters';
import archiveRoutes from './routes/archives';
import locationRoutes from './routes/locations';
import channelMetadataRoutes from './routes/channelMetadata';
import profileRoutes from './routes/profiles';
import activityRoutes from './routes/activity';
import leaveRoutes from './routes/leaves';
import pendingRequestRoutes from './routes/pendingRequests';
import settingsRoutes from './routes/settings';
import backupRoutes from './routes/backups';
import newsRoutes from './routes/news';
import syncRoutes from './routes/sync';
import telemetryRoutes, { pruneTelemetry } from './routes/telemetry';
import { initMonitor } from './monitor';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

// ---------- process-level crash guards ----------
// Without these, any unhandled throw or rejected promise kills the
// Node.js process silently (no log, no restart).
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  // Give logs a moment to flush, then exit — the auto-restart wrapper
  // (Start Server.command / systemd) will bring the server back up.
  setTimeout(() => process.exit(1), 500);
});
process.on('unhandledRejection', (reason) => {
  // Log-only: a single failed query must not take down the whole app.
  // (In SQLite mode the process is restarted by the launcher on real crashes.)
  console.error('[FATAL] Unhandled promise rejection (server keeps running):', reason);
});
let server: any;
const shutdown = (signal: string) => {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  if (server) server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Request logger: console line + daily NDJSON file (research data, auto-rotated).
// The telemetry/ folder is git-ignored; files older than 30 days are pruned at boot.
const telemetryDir = path.join(process.cwd(), 'telemetry');
function requestLogLine(req: any, res: any, startMs: number) {
  const line = {
    ts: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    durMs: Date.now() - startMs,
    uid: req.user?.id ?? null,
    lvl: req.user?.access_level ?? null,
    ua: req.headers['user-agent'] || null,
  };
  try {
    fs.mkdirSync(telemetryDir, { recursive: true });
    fs.appendFileSync(path.join(telemetryDir, `requests-${new Date().toISOString().slice(0, 10)}.ndjson`), JSON.stringify(line) + '\n');
  } catch { /* telemetry must never break serving */ }
  return line;
}
function pruneRequestLogs(days: number) {
  try {
    if (!fs.existsSync(telemetryDir)) return;
    const cut = Date.now() - days * 86400000;
    for (const f of fs.readdirSync(telemetryDir)) {
      if (!/^requests-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)) continue;
      const full = path.join(telemetryDir, f);
      if (fs.statSync(full).mtimeMs < cut) fs.unlinkSync(full);
    }
  } catch (e) { console.error('[telemetry] request-log prune failed:', e); }
}
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const l = requestLogLine(req, res, start);
    console.log(`[req] ${l.method} ${l.url} -> ${l.status} (${l.durMs}ms)`);
  });
  next();
});

// Basic security headers (no external deps)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

// Routes (DB-agnostic routes first)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/bulletins', bulletinRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/bulletin-templates', bulletinTemplateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/reporters', reporterRoutes);
app.use('/api/archives', archiveRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/channel-metadata', channelMetadataRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/pending-requests', pendingRequestRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/telemetry', telemetryRoutes);

// API 404 + global error handler
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});
app.use((err: any, _req: any, res: any, _next: any) => {
  const pgCode = err?.code as string | undefined;
  if (pgCode) {
    const statusMap: Record<string, number> = {
      '22P02': 400, '22P03': 400, '22P04': 400, '23502': 400, '42P18': 400,
      '23505': 409, '23503': 409, '23514': 409,
      '28P01': 401, '42501': 403,
      '57014': 503,
    };
    const status = statusMap[pgCode] || 500;
    console.error(`[error:${pgCode}]`, err.message, err.where ? `(where: ${err.where})` : '', err.detail ? `(detail: ${err.detail})` : '');
    return res.status(status).json({ error: 'Invalid request.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Serve built frontend (production mode) if dist exists
const distPath = path.resolve(__dirname, '../../frontend/dist');
const distIndex = path.join(distPath, 'index.html');
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    // Vite hashed assets (assets/*-hash.*) are content-addressed -> cache forever
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  // The build can be missing on a fresh clone (or while `vite build` swaps the
  // folder during an auto-restart) — answer with guidance instead of the
  // default "Cannot GET /" so the fix is obvious.
  if (!fs.existsSync(distIndex)) {
    return res.status(503).send(
      '<h1>Frontend build not found</h1><p>Run <code>cd frontend &amp;&amp; npm ci &amp;&amp; npm run build</code> then restart the server.</p>'
    );
  }
  res.sendFile(distIndex);
});
console.log(`Serving frontend from ${distPath}${fs.existsSync(distIndex) ? '' : ' (WARNING: build missing - run frontend npm run build)'}`);

// Start server after DB init
server = createServer(app);
initDatabase()
  .then(() => startServer())
  .catch((err) => {
    console.error('Database init failed:', err);
    if (mirrorReady()) {
      console.error('Continuing in OFFLINE mode on the local database.');
      startServer();
      return;
    }
    process.exit(1);
  });

function startServer() {
  saveManagedBackup('startup', 'Database snapshot on server start', 'system');
  pruneTelemetry();
  pruneRequestLogs(30);
  initSocket(server);
  startNotificationScheduler();
  initMonitor();

  onSyncStatusChange((event, payload) => {
    try {
      emitEvent(`db:${event}`, payload);
    } catch (e) {
      console.error('[sync] socket broadcast failed:', e);
    }
  });

  // Friendly error when the port is already in use (e.g. dev server started
  // while the deployed Workstation server is already running on the same port)
  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error('');
      console.error(`Port ${PORT} is already in use. The Workstation Meva server may already be running.`);
      console.error('  - The running server stays active at http://localhost:' + PORT);
      console.error('  - For development use:  npm run dev  (listens on port 3003)');
      console.error('  - To stop the running server:  windows\\Stop Server.bat  (or kill the node process)');
      console.error('');
      process.exit(2);
    }
    console.error('Server error:', err);
    process.exit(1);
  });

  // Bind '::' (dual-stack): serves IPv4 AND IPv6, so hostname access
  // (http://n24s1:3002 via LLMNR/mDNS/hosts) works no matter which address
  // family the client resolves first.
  server.listen(PORT, '::', () => {
    console.log(`Workstation Meva API running on http://0.0.0.0:${PORT} (dual-stack)`);
  });
}
