import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, authorizeAdminOrDev, AuthRequest } from '../middleware/auth';
import { isPostgres } from '../database/postgres';
import {
  prepare, DB_DIR,
  getBackupConfig, updateBackupConfig,
  saveManagedBackup, listManagedBackups,
  deleteManagedBackup, restoreDatabaseFromFile,
  mirrorAll, reinitDatabase,
} from '../database/schema';
import { getSyncStatus, resetMirrorAndQueue } from '../database/sync';

const router = Router();

const BACKUP_DIR = path.join(DB_DIR, 'backups');

router.get('/', authenticate, authorizeAdminOrDev, (_req: AuthRequest, res: Response) => {
  const backups = listManagedBackups().map((b: any) => ({
    id: b.id, filename: b.filename, label: b.label,
    size_bytes: b.size_bytes, is_archived: b.is_archived,
    created_by: b.created_by, notes: b.notes, created_at: b.created_at,
  }));
  const totalSize = backups.reduce((a, b) => a + b.size_bytes, 0);
  const counts: any = {
    total: backups.length,
    archived: backups.filter(b => b.is_archived).length,
    manual: backups.filter(b => b.label === 'manual').length,
    auto: backups.filter(b => b.label !== 'manual' && b.label !== 'startup').length,
  };
  res.json({ backups, counts, total_size_bytes: totalSize, mode: isPostgres() ? 'postgres' : 'sqlite' });
});

router.post('/', authenticate, authorizeAdminOrDev, (req: AuthRequest, res: Response) => {
  if (isPostgres()) {
    return res.status(400).json({ error: 'Backups are handled automatically by Supabase — the server stores no backup files in database mode.' });
  }
  const notes = (req.body?.notes || '').toString().slice(0, 500);
  const filename = saveManagedBackup('manual', notes, req.user?.full_name || req.user?.username || 'admin', true);
  if (!filename) return res.status(500).json({ error: 'Failed to create backup.' });
  res.status(201).json({ success: true, filename });
});

router.get('/config', authenticate, authorizeAdminOrDev, (_req: AuthRequest, res: Response) => {
  res.json(getBackupConfig());
});

router.put('/config', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const cfg = updateBackupConfig({
    auto_enabled: req.body?.auto_enabled,
    min_interval_min: req.body?.min_interval_min,
    max_backups: req.body?.max_backups,
  });
  await prepare("INSERT INTO system_activity (action, details) VALUES ('backup_config_changed', ?)")
    .run(`Backup config set to ${JSON.stringify(cfg)} by ${req.user?.full_name || req.user?.username}`);
  res.json(cfg);
});

router.post('/fix-db', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  try {
    const report: any = {
      fixed: false,
      integrity: 'unknown',
      mode: isPostgres() ? 'postgres' : 'sqlite',
      steps: [],
      warnings: [],
    };

    // Never repair over the only copy of the data: snapshot first (best-effort;
    // a corrupt/locked file may fail, in which case we still continue).
    const pre = saveManagedBackup('pre_fix', 'Automatic backup before /fix-db', req.user?.full_name || req.user?.username || 'system', true);
    if (pre) report.steps.push(`Pre-fix backup created: ${pre}`);
    else report.warnings.push('Could not create a pre-fix backup (database may be unreadable).');

    let integrity = 'unknown';
    try {
      const rows = mirrorAll('PRAGMA integrity_check') as any[];
      const first = rows?.[0];
      integrity = String(first && 'integrity_check' in first
        ? first.integrity_check
        : first ? Object.values(first)[0] : 'unknown').toLowerCase();
    } catch (e: any) {
      integrity = 'corrupt';
      report.warnings.push(`integrity_check failed: ${e.message}`);
    }
    report.integrity = integrity;

    if (integrity === 'ok') {
      report.steps.push('Local database integrity OK - no repair needed.');
    } else if (isPostgres()) {
      // The mirror is just a local cache in postgres mode: drop it and rebuild
      // from PostgreSQL so no offline data is ever lost.
      report.steps.push('Rebuilding the local mirror from PostgreSQL...');
      await resetMirrorAndQueue();
      await reinitDatabase(process.env.DATABASE_URL || '');
      report.fixed = true;
      report.integrity = 'rebuilt';
    } else {
      // SQLite mode: restore from the newest usable managed backup.
      const latest = (listManagedBackups() as any[]).find((b: any) => !b.is_archived) || (listManagedBackups() as any[])[0];
      if (latest) {
        const backupPath = path.join(BACKUP_DIR, latest.filename);
        if (fs.existsSync(backupPath)) {
          report.steps.push(`Restoring from newest backup (${latest.filename})...`);
          const summary = await restoreDatabaseFromFile(backupPath);
          report.fixed = true;
          report.integrity = 'restored';
          report.restoredFrom = latest.filename;
          report.restoreSummary = summary;
        }
      }
      if (!report.fixed) {
        report.steps.push('No backup available - clearing the local database (it is re-seeded fresh).');
        await resetMirrorAndQueue();
        report.fixed = true;
        report.integrity = 'cleared';
        report.warnings.push('Data cleared: no backup was available to restore.');
      }
    }

    if (report.fixed) {
      try {
        await prepare("INSERT INTO system_activity (action, details) VALUES ('db_repaired', ?)")
          .run(`DB repair (${integrity}) by ${req.user?.full_name || req.user?.username}`);
      } catch { /* activity log is best-effort */ }
    }

    report.sync = getSyncStatus();
    res.json(report);
  } catch (err: any) {
    console.error('[fix-db] error:', err);
    res.status(500).json({ error: err.message || 'Failed to repair the database.' });
  }
});

router.post('/:id/restore', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  if (isPostgres()) {
    return res.status(400).json({ error: 'Restore is not available in database mode — use the Supabase dashboard (Database → Backups) instead.' });
  }
  const row = await prepare('SELECT filename FROM backups WHERE id = ?').get(Number(req.params.id)) as any;
  if (!row) return res.status(404).json({ error: 'Backup not found.' });
  const backupPath = path.join(BACKUP_DIR, row.filename);
  if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup file missing on disk.' });
  try {
    const summary = await restoreDatabaseFromFile(backupPath);
    await prepare("INSERT INTO system_activity (action, details) VALUES ('backup_restored', ?)")
      .run(`Database restored from ${row.filename} by ${req.user?.full_name || req.user?.username}`);
    res.json({ success: true, restored: row.filename, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Restore failed.' });
  }
});

router.put('/:id', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const row = await prepare('SELECT id FROM backups WHERE id = ?').get(id) as any;
  if (!row) return res.status(404).json({ error: 'Backup not found.' });
  const archived = req.body?.archived ? 1 : 0;
  const notes = req.body?.notes !== undefined ? req.body.notes.toString().slice(0, 500) : undefined;
  if (notes !== undefined) {
    await prepare('UPDATE backups SET is_archived = ?, notes = ? WHERE id = ?').run(archived, notes, id);
  } else {
    await prepare('UPDATE backups SET is_archived = ? WHERE id = ?').run(archived, id);
  }
  res.json({ success: true, archived });
});

router.delete('/:id', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const row = await prepare('SELECT filename FROM backups WHERE id = ?').get(id) as any;
  if (!row) return res.status(404).json({ error: 'Backup not found.' });
  if (!deleteManagedBackup(id)) return res.status(500).json({ error: 'Failed to delete backup.' });
  await prepare("INSERT INTO system_activity (action, details) VALUES ('backup_deleted', ?)")
    .run(`Backup ${row.filename} deleted by ${req.user?.full_name || req.user?.username}`);
  res.json({ success: true });
});

router.delete('/', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  const includeArchived = req.body?.includeArchived ? 1 : 0;
  const rows = await prepare('SELECT id FROM backups WHERE is_archived = 0 OR is_archived = ?').all(includeArchived) as any[];
  for (const r of rows) deleteManagedBackup(r.id);
  res.json({ success: true, deleted: rows.length });
});

export default router;
