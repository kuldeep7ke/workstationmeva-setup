import { useState, useEffect } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import {
  Database, Plus, RotateCcw, Archive, ArchiveRestore, Pencil, Trash2,
  Loader2, HardDrive, ShieldCheck, Shield, Clock, CheckCircle2, AlertTriangle, RefreshCw, DatabaseBackup, BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SyncStatusPanel, DatabaseConnection, DatabaseStatePanel } from '../components/DatabasePanels';

const labelStyles: Record<string, string> = {
  manual: 'bg-accent-50 text-accent-700 border-accent-200',
  startup: 'bg-surface-100 text-surface-600 border-surface-200',
  task_change: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  user_change: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  content_change: 'bg-amber-50 text-amber-700 border-amber-200',
  leave_change: 'bg-rose-50 text-rose-700 border-rose-200',
};

const labelNames: Record<string, string> = {
  manual: 'Manual',
  startup: 'Startup',
  task_change: 'Task change',
  user_change: 'User / profile',
  content_change: 'Content change',
  leave_change: 'Leave change',
};

function fmtBytes(n: number) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(ts: string) {
  if (!ts) return '—';
  // Stored timestamps are UTC: SQLite saves "YYYY-MM-DD HH:MM:SS" (datetime('now'))
  // and PostgreSQL returns "YYYY-MM-DDTHH:MM:SS.fffZ". Convert to the viewer's
  // LOCAL time so backup times are not shown off by the UTC offset.
  const normalized = ts.includes('Z') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return ts.replace('T', ' ').slice(0, 16);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Backups() {
  const { toast } = useToast();
  const dialog = useDialog();
  const { user } = useAuth();
  const isAdmin = user?.is_dev || (user?.access_level || 3) <= 1;
  const [backups, setBackups] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [totalSize, setTotalSize] = useState(0);
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<any>(null);
  const [restoring, setRestoring] = useState(false);
  const [editingNotes, setEditingNotes] = useState<any>(null);
  const [notesText, setNotesText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [mode, setMode] = useState<string>('sqlite');
  const [activeTab, setActiveTab] = useState<'backup' | 'database'>('backup');
  const [summary, setSummary] = useState<{ title: string; icon: 'success' | 'info'; rows: { label: string; value: string; warn?: boolean }[] } | null>(null);

  const fetchAll = () => {
    api.get('/backups').then((r) => {
      setBackups(r.data.backups || []);
      setCounts(r.data.counts || {});
      setTotalSize(r.data.total_size_bytes || 0);
      setMode(r.data.mode || 'sqlite');
    }).catch(() => toast('Failed to load backups', 'error')).finally(() => setLoading(false));
  };

  const fetchConfig = () => {
    api.get('/backups/config').then((r) => setConfig(r.data)).catch(() => {});
  };

  useEffect(() => { fetchAll(); fetchConfig(); }, []);

  const exportData = async (format: 'json' | 'csv', table?: string) => {
    try {
      const url = `/telemetry/export?format=${format}${table ? `&table=${table}` : ''}`;
      const res: any = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      const cd = res.headers?.['content-disposition'] || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      const fileName = m ? m[1] : `research-export.${format}`;
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      const text = await res.data.text();
      const rows: { label: string; value: string }[] = [];
      if (format === 'json') {
        let counts: any = {};
        try { counts = JSON.parse(text).counts || {}; } catch { /* not JSON */ }
        rows.push({ label: 'Activity log', value: `${counts.activity ?? 0} rows` });
        rows.push({ label: 'Task workflow', value: `${counts.audit ?? 0} rows` });
        rows.push({ label: 'Sync log', value: `${counts.sync ?? 0} rows` });
        rows.push({ label: 'App errors', value: `${counts.errors ?? 0} rows` });
      } else {
        const dataRows = text.split('\n').filter((l: string) => l.trim().length > 0).length - 1;
        rows.push({ label: 'Table', value: table || '—' });
        rows.push({ label: 'Rows exported', value: `${Math.max(0, dataRows)}` });
      }
      rows.push({ label: 'File', value: fileName });
      rows.push({ label: 'Size', value: fmtBytes(res.data.size) });
      setSummary({ title: 'Research data exported', icon: 'success', rows });
      toast('Research data downloaded', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Export failed', 'error');
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.post('/backups', { notes: manualNotes });
      toast('Backup created', 'success');
      setManualNotes('');
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to create backup', 'error');
    } finally { setCreating(false); }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const r = await api.post(`/backups/${restoreTarget.id}/restore`);
      toast('Database restored', 'success');
      setRestoreTarget(null);
      fetchAll();

      const s = r.data.summary || {};
      const rows: { label: string; value: string; warn?: boolean }[] = [
        { label: 'Restored file', value: r.data.restored || s.restoredFrom || '—' },
        { label: 'Restored at', value: fmtDate(s.restoredAt) },
        { label: 'Tables with data', value: `${(s.tables || []).length}` },
      ];
      (s.tables || []).slice(0, 8).forEach((t: any) => rows.push({ label: t.table, value: `${t.rows} rows` }));
      if ((s.tables || []).length > 8) rows.push({ label: '…and more', value: `${(s.tables || []).length - 8} more tables` });
      (s.preserved || []).forEach((p: any) => rows.push({ label: `Preserved: ${p.table}`, value: `${p.rows} rows kept` }));
      rows.push({ label: 'Sync queue', value: s.syncQueueCleared ? 'Cleared' : 'Left as-is' });
      (s.warnings || []).forEach((w: string) => rows.push({ label: 'Warning', value: w, warn: true }));
      setSummary({ title: 'Database restored', icon: 'success', rows });
    } catch (err: any) {
      toast(err.response?.data?.error || 'Restore failed', 'error');
    } finally { setRestoring(false); }
  };

  const handleArchive = async (b: any) => {
    setActionId(b.id);
    try {
      await api.put(`/backups/${b.id}`, { archived: !b.is_archived });
      toast(b.is_archived ? 'Backup unarchived' : 'Backup archived', 'success');
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update backup', 'error');
    } finally { setActionId(null); }
  };

  const handleDelete = async (b: any) => {
    if (!(await dialog.confirm({ title: 'Delete backup', message: `Delete backup from ${fmtDate(b.created_at)}? This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    setActionId(b.id);
    try {
      await api.delete(`/backups/${b.id}`);
      toast('Backup deleted', 'success');
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to delete backup', 'error');
    } finally { setActionId(null); }
  };

  const handleDeleteAll = async () => {
    if (!(await dialog.confirm({ title: 'Clear old backups', message: 'Delete all non-archived backups? Archived backups are kept.', danger: true, confirmLabel: 'Delete all' }))) return;
    setBusy(true);
    try {
      await api.delete('/backups', { data: { includeArchived: false } });
      toast('Old backups cleared', 'success');
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to clear backups', 'error');
    } finally { setBusy(false); }
  };

  const handleSaveNotes = async () => {
    if (!editingNotes) return;
    setBusy(true);
    try {
      await api.put(`/backups/${editingNotes.id}`, { archived: editingNotes.is_archived ? 1 : 0, notes: notesText });
      toast('Notes saved', 'success');
      setEditingNotes(null);
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save notes', 'error');
    } finally { setBusy(false); }
  };

  const handleSaveConfig = async () => {
    setBusy(true);
    try {
      const next = {
        auto_enabled: config.auto_enabled ? 1 : 0,
        min_interval_min: Math.max(0, Number(config.min_interval_min) || 0),
        max_backups: Math.max(1, Number(config.max_backups) || 1),
      };
      await api.put('/backups/config', next);
      setConfig(next);
      toast('Backup settings saved', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save settings', 'error');
    } finally { setBusy(false); }
  };

  const visible = backups.filter((b) => showArchived || !b.is_archived);

  const stats = [
    { label: 'Total backups', value: counts.total ?? 0, icon: Database, cls: 'text-accent-600 bg-accent-50' },
    { label: 'Automatic', value: counts.auto ?? 0, icon: Clock, cls: 'text-indigo-600 bg-indigo-50' },
    { label: 'Manual', value: counts.manual ?? 0, icon: ShieldCheck, cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Archived', value: counts.archived ?? 0, icon: Archive, cls: 'text-surface-600 bg-surface-100' },
    { label: 'Storage used', value: fmtBytes(totalSize), icon: HardDrive, cls: 'text-amber-600 bg-amber-50' },
  ];

  // Compute counts by backup label type
  const labelCounts = backups.reduce((acc: Record<string, number>, b) => {
    acc[b.label] = (acc[b.label] || 0) + 1;
    return acc;
  }, {});

  const labelList = Object.keys(labelNames).map((key) => ({
    key,
    name: labelNames[key],
    count: labelCounts[key] || 0,
    style: labelStyles[key] || 'bg-surface-100 text-surface-600 border-surface-200',
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Backups & Database</h1>
          <p className="text-sm text-surface-400 mt-0.5">Automatic snapshots of the database, sync health, and connection management.</p>
        </div>
        {mode !== 'postgres' && (
          <button onClick={handleCreate} disabled={creating} className="flat-btn-accent text-sm shrink-0">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Creating...' : 'Backup Now'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-200 overflow-x-auto">
        <button onClick={() => setActiveTab('backup')} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'backup' ? 'border-accent-600 text-accent-700' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
          <DatabaseBackup className="w-4 h-4" /> Backups
        </button>
        {isAdmin && (
          <button onClick={() => setActiveTab('database')} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'database' ? 'border-accent-600 text-accent-700' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
            <Database className="w-4 h-4" /> Database
          </button>
        )}
      </div>

      {/* Research Data */}
      <div className="flat-card">
        <h3 className="text-sm font-semibold text-surface-700 mb-1 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent-500" /> Research Data
        </h3>
        <p className="text-xs text-surface-500 mb-4">Download the app's usage and behavior data for analysis and improvements — what people do, how tasks flow, where things glitch. This helps make the app simpler and faster for the team.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportData('json')} className="flat-btn-accent text-xs">Full report (JSON)</button>
          <button onClick={() => exportData('csv', 'activity')} className="flat-btn-surface text-xs">Activity log (CSV)</button>
          <button onClick={() => exportData('csv', 'audit')} className="flat-btn-surface text-xs">Task workflow (CSV)</button>
          <button onClick={() => exportData('csv', 'errors')} className="flat-btn-surface text-xs">App errors (CSV)</button>
        </div>
        <p className="text-xs text-surface-400 mt-3 leading-relaxed">Covers the last 90 days. Client errors are stored 90 days, request logs 30 days — both auto-pruned on the server. Offline captures sync back automatically.</p>
      </div>

      {activeTab === 'database' && isAdmin ? (
        <>
          {/* Sync Status */}
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-accent-500" /> Sync Status
            </h3>
            <SyncStatusPanel />
          </div>

          {/* Database Connection */}
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
              <Database className="w-4 h-4 text-accent-500" /> Database Connection
            </h3>
            <DatabaseConnection />
          </div>

          {/* Database Data */}
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent-500" /> Database Data
            </h3>
            <p className="text-xs text-surface-500 mb-4">Check what is currently stored on the connected database, preserve it, or clean it for a fresh start.</p>
            <DatabaseStatePanel />
          </div>
        </>
      ) : mode === 'postgres' ? (
        <>
          <div className="flat-card p-5 sm:p-6 border-success-200 bg-success-50/40">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-success-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-success-700" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-surface-800">Backups are handled automatically by Supabase</h2>
                <p className="text-xs text-surface-500 mt-1 leading-relaxed">
                  This server is connected to your Supabase PostgreSQL database, which takes continuous and
                  daily backups of all data on its own. Nothing is stored in local files, so there is
                  nothing to manage on this page.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white border border-surface-200 p-4">
                <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Continuous backups</p>
                <p className="text-xs text-surface-500">Every change is saved in real time by Supabase — no manual snapshots needed.</p>
              </div>
              <div className="rounded-xl bg-white border border-surface-200 p-4">
                <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Daily backups</p>
                <p className="text-xs text-surface-500">Supabase keeps daily backups for 7 days plus weekly backups for a month.</p>
              </div>
              <div className="rounded-xl bg-white border border-surface-200 p-4">
                <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Restore</p>
                <p className="text-xs text-surface-500">Open the Supabase dashboard: <span className="font-mono">Database → Backups → Restore</span>.</p>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-white border border-surface-200 p-3 text-xs text-surface-500">
              <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
              <p>If you want to move your data to a different Supabase project, use the <strong>Database</strong> tab — it saves every successful connection link so you can switch back anytime.</p>
            </div>
          </div>
        </>
      ) : (<>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="flat-card-static p-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${s.cls}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <p className="text-xl font-bold text-surface-800 leading-tight">{s.value}</p>
            <p className="text-[11px] text-surface-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Backup type breakdown */}
      <div className="flat-card-static p-4">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">Backup types</h3>
        <div className="flex flex-wrap gap-2">
          {labelList.map((item) => (
            <div key={item.key} className={`flat-badge text-xs border ${item.style} flex items-center gap-1.5 px-2.5 py-1`}>
              <span>{item.name}</span>
              <span className="text-[10px] opacity-70 font-mono">{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="flat-card-static p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-surface-800">Saved backups</h2>
              <p className="text-xs text-surface-400 mt-0.5">
                {counts.total ?? 0} total · {visible.length} shown. Automatic backups older than the limit are removed first; manual and startup backups are always kept.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowArchived(!showArchived)}
                className={`flat-btn-surface text-xs ${showArchived ? '!bg-accent-50 !text-accent-700 !border-accent-200' : ''}`}>
                <Archive className="w-3.5 h-3.5" /> Include archived
              </button>
              {counts.auto > 0 && (
                <button onClick={handleDeleteAll} disabled={busy} className="flat-btn-surface text-xs !text-danger-600">
                  <Trash2 className="w-3.5 h-3.5" /> Clear old
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <SkeletonTable rows={6} cols={5} />
          ) : visible.length === 0 ? (
            <div className="text-center py-10">
              <Database className="w-10 h-10 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-400 text-sm">No backups yet. The first backup is created automatically when the server starts.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="text-left px-3 py-2.5 font-medium text-surface-500">Created</th>
                    <th className="text-left px-3 py-2.5 font-medium text-surface-500">Type</th>
                    <th className="text-left px-3 py-2.5 font-medium text-surface-500">By</th>
                    <th className="text-left px-3 py-2.5 font-medium text-surface-500">Size</th>
                    <th className="text-left px-3 py-2.5 font-medium text-surface-500">Notes</th>
                    <th className="text-right px-3 py-2.5 font-medium text-surface-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => (
                    <tr key={b.id} className={`border-b border-surface-100 hover:bg-surface-50 transition-colors ${b.is_archived ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <p className="text-xs font-medium text-surface-700">{fmtDate(b.created_at)}</p>
                        <p className="text-[10px] text-surface-400 font-mono">{b.filename}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`flat-badge text-[10px] border ${labelStyles[b.label] || 'bg-surface-100 text-surface-600 border-surface-200'}`}>
                          {labelNames[b.label] || b.label}
                        </span>
                        {!!b.is_archived && (
                          <span className="flat-badge text-[10px] border ml-1 bg-surface-100 text-surface-500 border-surface-200">archived</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{b.created_by || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-surface-500 whitespace-nowrap">{fmtBytes(b.size_bytes)}</td>
                      <td className="px-3 py-2.5 text-xs text-surface-500 max-w-[180px] truncate">{b.notes || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setRestoreTarget(b)} disabled={busy || actionId === b.id}
                            className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors" title="Restore this backup">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleArchive(b)} disabled={busy || actionId === b.id}
                            className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
                            title={b.is_archived ? 'Unarchive' : 'Archive (keep forever)'}>
                            {b.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                          <button onClick={() => { setEditingNotes(b); setNotesText(b.notes || ''); }} disabled={busy}
                            className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors" title="Edit notes">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(b)} disabled={busy || actionId === b.id}
                            className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors" title="Delete backup">
                            {actionId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flat-card-static p-5 overflow-hidden">
            <h2 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Automatic backup settings
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-surface-700">Enable automatic backups</p>
                  <p className="text-[11px] text-surface-400">Snapshot on every task, user, and content change</p>
                </div>
                <button onClick={() => setConfig({ ...config, auto_enabled: !config.auto_enabled })}
                  role="switch" aria-checked={!!config.auto_enabled} aria-label="Toggle automatic backups"
                  className="toggle-track shrink-0" data-on={!!config.auto_enabled}>
                  <span className="toggle-knob" />
                </button>
              </div>
              <div>
                <label className="flat-label">Minimum interval (minutes)</label>
                <input type="number" min={0} className="flat-input" value={config.min_interval_min ?? 15}
                  onChange={(e) => setConfig({ ...config, min_interval_min: e.target.value })} />
                <p className="text-[11px] text-surface-400 mt-1">How often a change can trigger a new snapshot (0 = every change)</p>
              </div>
              <div>
                <label className="flat-label">Keep automatic backups (max)</label>
                <input type="number" min={1} className="flat-input" value={config.max_backups ?? 50}
                  onChange={(e) => setConfig({ ...config, max_backups: e.target.value })} />
                <p className="text-[11px] text-surface-400 mt-1">Oldest automatic backups beyond this limit are removed. Manual and startup backups are always kept.</p>
              </div>
              <button onClick={handleSaveConfig} disabled={busy} className="flat-btn-accent text-xs w-full">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save settings
              </button>
            </div>
          </div>

          <div className="flat-card-static p-5">
            <h2 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" /> Restoring a backup
            </h2>
            <p className="text-xs text-surface-500 leading-relaxed">
              Restoring replaces the <b>entire current database</b> with the selected snapshot, including users, tasks, stories, bulletins and settings.
              The restore runs immediately; everyone connected will see the restored data. Use the restore arrow on any row below.
            </p>
          </div>
        </div>
      </div>

      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-danger-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Restore database from backup?</h3>
                <p className="text-xs text-surface-400">{fmtDate(restoreTarget.created_at)} · {labelNames[restoreTarget.label] || restoreTarget.label} · {fmtBytes(restoreTarget.size_bytes)}</p>
              </div>
            </div>
            <p className="text-xs text-surface-600 bg-danger-50 text-danger-700 rounded-xl p-3 leading-relaxed">
              This replaces <b>all current data</b> with the snapshot. Changes made after this backup will be lost. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRestoreTarget(null)} disabled={restoring} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleRestore} disabled={restoring} className="flat-btn-accent text-xs">
                {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {restoring ? 'Restoring...' : 'Restore Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <Pencil className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Edit notes</h3>
                <p className="text-xs text-surface-400">{fmtDate(editingNotes.created_at)}</p>
              </div>
            </div>
            <textarea className="flat-input" rows={3} maxLength={500} placeholder="Add a note to remember what this backup contains..."
              value={notesText} onChange={(e) => setNotesText(e.target.value)} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingNotes(null)} disabled={busy} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleSaveNotes} disabled={busy} className="flat-btn-accent text-xs">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}
      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${summary.icon === 'success' ? 'bg-success-50' : 'bg-accent-50'}`}>
                <CheckCircle2 className={`w-5 h-5 ${summary.icon === 'success' ? 'text-success-600' : 'text-accent-600'}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">{summary.title}</h3>
                <p className="text-xs text-surface-400">Operation completed successfully</p>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-surface-200 divide-y divide-surface-100 bg-surface-50">
              {summary.rows.map((row, i) => (
                <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className={`text-xs font-medium shrink-0 ${row.warn ? 'text-amber-600' : 'text-surface-500'}`}>{row.label}</span>
                  <span className="text-xs font-semibold text-surface-700 text-right break-all">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setSummary(null)} className="flat-btn-accent text-xs">Done</button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
