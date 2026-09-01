import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import {
  AlertTriangle, CheckCircle2, Database, FilePlus2, Loader2, Plug,
  RefreshCw, Save, Shield, Trash2, XCircle,
} from 'lucide-react';

const EXAMPLE_URL = 'postgresql://postgres.YOUR-PROJECT-REF:[YOUR-PASSWORD]@aws-0-YOUR-REGION.pooler.supabase.com:6543/postgres';

export function SyncStatusPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = () => {
    setLoading(true);
    api.get('/sync/status')
      .then((r) => setStatus(r.data))
      .catch(() => toast('Could not read sync status', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const r = await api.post('/sync/replay');
      toast(`Sync complete — ${r.data.synced} synced, ${r.data.failed} failed`, r.data.failed > 0 ? 'error' : 'success');
      refresh();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Sync failed', 'error');
    } finally { setSyncing(false); }
  };

  const online = !!status?.online;
  const lastSyncShort = status?.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'never';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${online ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700'}`}>
          {online
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Online — Supabase connected</>
            : <><AlertTriangle className="w-3.5 h-3.5" /> Offline — using local database</>}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-100 text-surface-600">
          Engine: {status?.engine || '—'}
        </span>
        <button onClick={refresh} disabled={loading} className="flat-btn-surface text-xs">
          <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Checking...' : 'Check Now'}
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-surface-800">{status.queuePending ?? 0}</p>
            <p className="text-[11px] text-surface-500">Queued changes</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-surface-800">{status.syncedWrites ?? 0}</p>
            <p className="text-[11px] text-surface-500">Synced writes</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-surface-800">{status.failedWrites ?? 0}</p>
            <p className="text-[11px] text-surface-500">Failed writes</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-surface-800">{lastSyncShort}</p>
            <p className="text-[11px] text-surface-500">Last sync</p>
          </div>
        </div>
      )}

      {status?.lastError && (
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
          {status.lastError}
        </p>
      )}

      <p className="text-xs text-surface-500">
        When the internet is unavailable the app keeps working on a local copy and queues changes.
        As soon as the connection returns, everything syncs to Supabase automatically — no action needed.
      </p>

      <div>
        <button onClick={handleSyncNow} disabled={syncing || !online} className={`flat-btn-accent text-sm ${!online ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>
  );
}

const STATE_TABLE_LABELS: [string, string][] = [
  ['users', 'Users'],
  ['profiles', 'Profiles'],
  ['tasks', 'Tasks'],
  ['stories', 'Stories'],
  ['special_programs', 'Programs'],
  ['bulletins', 'Bulletins'],
  ['ads', 'Ads'],
  ['archives', 'Archives'],
  ['locations', 'Locations'],
  ['reporters', 'Reporters'],
  ['bulletin_templates', 'Slots'],
  ['user_bulletin_defaults', 'User Defaults'],
  ['system_bulletin_defaults', 'System Defaults'],
  ['channel_metadata', 'Channel Info'],
];

export function DatabaseStatePanel() {
  const { toast } = useToast();
  const dialog = useDialog();
  const [state, setState] = useState<{ hasData: boolean; total: number; counts: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const refresh = () => {
    setLoading(true);
    api.get('/settings/database/state')
      .then((r) => setState(r.data))
      .catch(() => toast('Could not read database state', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleKeepData = () => {
    toast('Existing data preserved — nothing was changed', 'success');
  };

  const handleFreshStart = async () => {
    const total = state?.total ?? 0;
    const confirmed = await dialog.confirm({
      title: 'Wipe all data for a fresh start?',
      message: `This permanently deletes all ${total} existing records (users, tasks, stories, programs and everything else) from BOTH the online database and the local copy on this machine. Default bulletin slots and channel settings are restored, and the next account that signs up becomes the admin. This cannot be undone.`,
      danger: true,
      confirmLabel: 'Wipe All Data',
    });
    if (!confirmed) return;
    setResetting(true);
    try {
      const r = await api.post('/settings/database/reset');
      setState({ hasData: false, total: 0, counts: r.data.counts || {} });
      toast(r.data.message || 'Database wiped for a fresh start', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to reset the database', 'error');
    } finally { setResetting(false); }
  };

  const hasData = !!state?.hasData;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${hasData ? 'bg-warning-100 text-warning-700' : 'bg-success-100 text-success-700'}`}>
          {hasData
            ? <><AlertTriangle className="w-3.5 h-3.5" /> Contains {state.total} records</>
            : <><CheckCircle2 className="w-3.5 h-3.5" /> Fresh — no data yet</>}
        </span>
      </div>

      {state && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STATE_TABLE_LABELS.map(([key, label]) => (
            <div key={key} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-center">
              <p className="text-lg font-bold text-surface-800">{state.counts[key] ?? 0}</p>
              <p className="text-[11px] text-surface-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-surface-500">
        {hasData
          ? 'The database contains data. Wiping is manual and deletes everything in BOTH the online database and the local copy. To instead replace the online data with this machine\'s local copy (without wiping locally), use the connect screen\'s "Fresh Start" option.'
          : 'The database is empty. It is ready for the first signup, which automatically becomes the admin.'}
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={refresh} disabled={loading} className="flat-btn-surface text-xs self-center sm:self-auto">
          <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Checking...' : 'Check Now'}
        </button>
        <button onClick={handleKeepData} disabled={!hasData}
          className={`flat-btn-surface text-sm ${!hasData ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <Shield className="w-4 h-4" /> Preserve Existing Data
        </button>
        <button onClick={handleFreshStart} disabled={resetting || !hasData}
          className={`flat-btn-danger text-sm ${!hasData ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {resetting ? 'Wiping...' : 'Wipe All Data'}
        </button>
      </div>
    </div>
  );
}

interface DbStatus {
  mode?: string;
  configured?: boolean;
  connected?: boolean;
  working?: boolean;
  liveCheck?: { ok?: boolean; error?: string | null; at?: string };
  sync?: any;
  envFileExists?: boolean;
  envHasDatabaseUrl?: boolean;
  envHasJwtSecret?: boolean;
  host?: string;
  projectRef?: string;
  passwordMasked?: string;
  database?: string;
  tableCount?: number;
  expectedTableCount?: number;
  tablesReady?: boolean;
  tables?: string[];
  missingTables?: string[];
}

export function DatabaseConnection() {
  const { toast } = useToast();
  const dialog = useDialog();
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [creatingEnv, setCreatingEnv] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; host?: string; error?: string; message?: string; tables?: string[]; tableCount?: number; expectedTableCount?: number; data?: { hasData: boolean; total: number; counts: Record<string, number> } } | null>(null);
  const [showTables, setShowTables] = useState(false);
  const [saved, setSaved] = useState<any[]>([]);
  const [connLabel, setConnLabel] = useState('');
  const [usingId, setUsingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshStatus = () => {
    api.get('/settings/database')
      .then((r) => setStatus(r.data))
      .catch(() => {});
  };

  const refreshSaved = () => {
    api.get('/settings/database/saved')
      .then((r) => setSaved(r.data.saved || []))
      .catch(() => {});
  };

  useEffect(() => { refreshStatus(); refreshSaved(); }, []);

  const handleCheckLink = async () => {
    setChecking(true);
    setTestResult(null);
    try {
      const r = await api.post('/settings/database/test', { connectionString: url });
      const data = r.data.data;
      setTestResult({
        ok: true,
        host: r.data.host,
        message: r.data.message,
        data,
      });
      toast(
        data?.hasData
          ? `Link is valid — database contains ${data.total} records`
          : 'Link is valid — empty database',
        'success'
      );
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Connection failed';
      setTestResult({ ok: false, error: msg });
      toast(msg, 'error');
    } finally { setChecking(false); }
  };

  const handleCreateEnv = async () => {
    setCreatingEnv(true);
    setTestResult(null);
    try {
      const r = await api.post('/settings/database/env', { connectionString: url });
      setTestResult({
        ok: true,
        host: r.data.host,
        message: `${r.data.message}${r.data.jwtCreated ? ' A new JWT_SECRET was generated.' : ''}`,
      });
      toast('backend/.env created', 'success');
      refreshStatus();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create .env';
      setTestResult({ ok: false, error: msg });
      toast(msg, 'error');
    } finally { setCreatingEnv(false); }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setTestResult(null);
    let freshStart = false;
    try {
      const t = await api.post('/settings/database/test', { connectionString: url });
      const data = t.data.data;
      if (data?.hasData) {
        const choice = await dialog.choose({
          title: 'Database already contains data',
          message: `This database already has ${data.total} records (${STATE_TABLE_LABELS.filter(([k]) => (data.counts[k] ?? 0) > 0).map(([k, l]) => `${l}: ${data.counts[k]}`).join(', ')}). What should the app do?`,
          options: [
            { key: 'restore', label: 'Restore — pull its data into the app' },
            { key: 'fresh', label: 'Fresh Start — replace its data with my local data', danger: true },
          ],
        });
        if (!choice) return;
        freshStart = choice === 'fresh';
      } else {
        const confirmed = await dialog.confirm({
          title: 'Switch database?',
          message: 'The server will switch to the new Supabase database and upload your local data to it. Nothing is deleted from the current database — it stays where it is.',
          danger: true,
          confirmLabel: 'Switch Database',
        });
        if (!confirmed) return;
      }
      const r = await api.post('/settings/database', { connectionString: url, label: connLabel, action: freshStart ? 'fresh' : 'restore' });
      setStatus({
        mode: 'postgres', configured: true, connected: true,
        host: r.data.host, projectRef: r.data.projectRef, database: r.data.database, passwordMasked: r.data.passwordMasked,
        tableCount: r.data.tableCount, expectedTableCount: r.data.expectedTableCount, tablesReady: r.data.tablesReady,
        tables: r.data.tables, missingTables: r.data.missingTables,
      });
      setTestResult({
        ok: r.data.tablesReady !== false,
        host: r.data.host,
        message: r.data.message,
        tables: r.data.tables,
        tableCount: r.data.tableCount,
        expectedTableCount: r.data.expectedTableCount,
        data: r.data.data,
      });
      toast(r.data.message || (freshStart ? 'Connected — fresh start complete' : 'Connected'), r.data.tablesReady !== false ? 'success' : 'error');
      refreshSaved();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to connect', 'error');
    } finally { setConnecting(false); }
  };

  const handleUseSaved = async (id: string) => {
    const item = saved.find((c) => c.id === id);
    setUsingId(id);
    let freshStart = false;
    try {
      const t = await api.post('/settings/database/test-saved', { id });
      const data = t.data.data;
      if (data?.hasData) {
        const choice = await dialog.choose({
          title: 'Database already contains data',
          message: `"${item?.label || item?.projectRef || 'This database'}" already has ${data.total} records (${STATE_TABLE_LABELS.filter(([k]) => (data.counts[k] ?? 0) > 0).map(([k, l]) => `${l}: ${data.counts[k]}`).join(', ')}). What should the app do?`,
          options: [
            { key: 'restore', label: 'Restore — pull its data into the app' },
            { key: 'fresh', label: 'Fresh Start — replace its data with my local data', danger: true },
          ],
        });
        if (!choice) return;
        freshStart = choice === 'fresh';
      } else {
        const confirmed = await dialog.confirm({
          title: 'Switch to saved database?',
          message: `The server will switch to "${item?.label || item?.projectRef || 'this database'}" and upload your local data to it. Nothing is deleted from the current database — it stays where it is.`,
          danger: true,
          confirmLabel: 'Switch Database',
        });
        if (!confirmed) return;
      }
      const r = await api.post('/settings/database/use', { id, action: freshStart ? 'fresh' : 'restore' });
      setStatus({
        mode: 'postgres', configured: true, connected: true,
        host: r.data.host, projectRef: r.data.projectRef, database: r.data.database, passwordMasked: r.data.passwordMasked,
        tableCount: r.data.tableCount, expectedTableCount: r.data.expectedTableCount, tablesReady: r.data.tablesReady,
        tables: r.data.tables, missingTables: r.data.missingTables,
      });
      setTestResult({
        ok: r.data.tablesReady !== false,
        host: r.data.host,
        message: r.data.message,
        tables: r.data.tables,
        tableCount: r.data.tableCount,
        expectedTableCount: r.data.expectedTableCount,
        data: r.data.data,
      });
      toast(r.data.message || (freshStart ? 'Switched — fresh start complete' : 'Switched'), r.data.tablesReady !== false ? 'success' : 'error');
      refreshSaved();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to switch', 'error');
    } finally { setUsingId(null); }
  };

  const handleDeleteSaved = async (id: string) => {
    const item = saved.find((c) => c.id === id);
    const confirmed = await dialog.confirm({
      title: 'Remove saved connection?',
      message: `"${item?.label || item?.projectRef || 'This connection'}" will be removed from the saved list. The database itself is not affected.`,
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      await api.delete(`/settings/database/saved/${id}`);
      toast('Saved connection removed', 'success');
      refreshSaved();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to remove', 'error');
    } finally { setDeletingId(null); }
  };

  const envRows = status ? [
    { label: 'Database mode', value: status.mode || '—', ok: status.mode === 'postgres' },
    { label: 'Host', value: status.host || '—' },
    { label: 'Project ref', value: status.projectRef || '—' },
    { label: 'Database', value: status.database || '—' },
    { label: 'Password', value: status.passwordMasked ? `${status.passwordMasked} (masked)` : '—' },
    { label: 'Live check', value: status.working ? 'Working (SELECT 1 OK)' : status.connected ? 'Reachable but not syncing' : 'Not reachable', ok: !!status.working },
    { label: 'Sync engine', value: status.sync?.online ? 'Online' : 'Offline', ok: !!status.sync?.online },
    { label: 'Queued changes', value: String(status.sync?.queuePending ?? 0) },
    { label: 'Tables ready', value: status.tableCount !== undefined ? `${status.tableCount}/${status.expectedTableCount ?? '—'}` : '—', ok: !!status.tablesReady },
    { label: 'backend/.env file', value: status.envFileExists ? 'Exists' : 'Missing', ok: !!status.envFileExists },
    { label: 'DATABASE_URL in .env', value: status.envHasDatabaseUrl ? 'Set' : 'Not set', ok: !!status.envHasDatabaseUrl },
    { label: 'JWT_SECRET in .env', value: status.envHasJwtSecret ? 'Set' : 'Not set', ok: !!status.envHasJwtSecret },
  ] : [];

  return (
    <div>
      <p className="text-xs text-surface-500 mb-4">
        Connect this server to your own Supabase PostgreSQL database. In Supabase, open{' '}
        <strong>Project Settings → Database → Connection string</strong> (Session pooler, port 6543),
        copy the URL, paste it below, and replace <code className="flat-badge bg-surface-100 text-danger-600 px-1">[YOUR-PASSWORD]</code>{' '}
        with your database password (keep everything else exactly as is). Then click{' '}
        <strong>Save & Connect</strong> — the app first checks what is already in that database and asks
        you to <strong>restore</strong> it into the app or <strong>replace</strong> it with your local data.
        Your local copy is never wiped automatically — wiping everything is always a manual action. The server
        writes <code className="flat-badge bg-surface-100 text-surface-600 px-1">backend/.env</code>, reconnects,
        creates <strong>all tables automatically</strong>, seeds default data, and verifies everything in one click.
      </p>

      {/* Link Status */}
      <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 mb-4">
        <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Database className="w-3.5 h-3.5" /> Link Status
        </h4>
        {status ? (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${status.working ? 'bg-success-100 text-success-700 border border-success-200' : 'bg-danger-100 text-danger-700 border border-danger-200'}`}>
                {status.working
                  ? <><CheckCircle2 className="w-4 h-4" /> CONNECTED & WORKING</>
                  : <><XCircle className="w-4 h-4" /> NOT REACHABLE</>}
              </span>
              <span className="text-[11px] text-surface-500 font-mono truncate max-w-full">
                {status.projectRef || '—'} · {status.host || '—'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {envRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-surface-500">{row.label}</span>
                  <span className={`font-semibold flex items-center gap-1 ${row.ok === undefined ? 'text-surface-700' : row.ok ? 'text-success-600' : 'text-warning-600'}`}>
                    {row.value}
                    {row.ok !== undefined && (row.ok
                      ? <CheckCircle2 className="w-3 h-3" />
                      : <AlertTriangle className="w-3 h-3" />)}
                  </span>
                </div>
              ))}
            </div>
            {status.liveCheck && !status.liveCheck.ok && (
              <p className="mt-2 text-[11px] text-danger-600 font-mono break-all">
                Live check failed: {status.liveCheck.error || 'unknown error'} ({status.liveCheck.at ? new Date(status.liveCheck.at).toLocaleTimeString() : ''})
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-surface-400">Loading status...</p>
        )}
      </div>

      <label className="flat-label">Supabase Connection String</label>
      <textarea
        className="flat-input w-full font-mono text-xs h-24 resize-none"
        placeholder={EXAMPLE_URL}
        value={url}
        onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-3 mt-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={handleCheckLink} disabled={checking || !url.trim()}
            className={`flat-btn-surface text-sm ${!url.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            {checking ? 'Checking...' : 'Check Link'}
          </button>
          <button type="button" onClick={handleCreateEnv} disabled={creatingEnv || !url.trim()}
            className={`flat-btn-surface text-sm ${!url.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {creatingEnv ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
            {creatingEnv ? 'Creating...' : 'Create .env'}
          </button>
          <button type="button" onClick={handleConnect} disabled={connecting || !url.trim()}
            className={`flat-btn-accent text-sm ${!url.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {connecting ? 'Connecting...' : 'Save & Connect'}
          </button>
        </div>
        <div>
          <input type="text" className="flat-input text-sm" placeholder="Label (optional)"
            value={connLabel} onChange={(e) => setConnLabel(e.target.value)} />
        </div>
      </div>

      {testResult && (
        <div className={`mt-4 p-3 rounded-xl border flex items-start gap-2 ${testResult.ok ? 'bg-success-50 border-success-200' : 'bg-danger-50 border-danger-200'}`}>
          {testResult.ok
            ? <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0 mt-0.5" />
            : <XCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <p className={`text-xs ${testResult.ok ? 'text-success-700' : 'text-danger-700'}`}>
              {testResult.ok ? `Link ${testResult.host} is valid. ${testResult.message || ''}` : testResult.error}
            </p>
            {testResult.ok && testResult.data && (
              <p className={`text-[11px] mt-1 ${testResult.data.hasData ? 'text-warning-700' : 'text-success-600'}`}>
                {testResult.data.hasData
                  ? `Contains ${testResult.data.total} existing records — you will be asked to restore or replace with your local data when connecting.`
                  : 'Empty database — connecting will upload your local data to it.'}
              </p>
            )}
            {testResult.ok && testResult.tableCount !== undefined && testResult.tables && testResult.tables.length > 0 && (
              <div className="mt-2">
                <button type="button" onClick={() => setShowTables((s) => !s)}
                  className="text-[11px] font-semibold text-accent-600 hover:text-accent-700 flex items-center gap-1">
                  {showTables ? 'Hide' : 'Show'} table list ({testResult.tableCount}/{testResult.expectedTableCount})
                </button>
                {showTables && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {testResult.tables.map((t) => (
                      <span key={t} className="flat-badge bg-white border border-success-200 text-success-700 text-[10px]">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Saved Connections */}
      <div className="mt-5 rounded-xl border border-surface-200 bg-surface-50 p-4">
        <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1 flex items-center gap-2">
          <Database className="w-3.5 h-3.5" /> Saved Connections
        </h4>
        <p className="text-[11px] text-surface-400 mb-3">
          Every successfully connected database is saved automatically (including the current one), so you can switch back anytime without re-pasting the link.
        </p>
        {saved.length === 0 ? (
          <p className="text-[11px] text-surface-400 py-2 text-center">No saved connections yet — connect once and it appears here.</p>
        ) : (
          <div className="space-y-2">
            {saved.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-surface-200 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-surface-700 truncate">
                    {c.label || c.projectRef}
                    {status?.host === c.host && (
                      status?.working
                        ? <span className="ml-2 flat-badge bg-success-50 text-success-700 border border-success-200 text-[10px]">CURRENT · WORKING</span>
                        : <span className="ml-2 flat-badge bg-danger-50 text-danger-700 border border-danger-200 text-[10px]">CURRENT · NOT REACHABLE</span>
                    )}
                  </p>
                  <p className="text-[11px] text-surface-400 truncate font-mono">{c.host} · {c.database} · {c.passwordMasked}</p>
                  <p className="text-[10px] text-surface-400">
                    {c.lastUsedAt ? `Last used ${new Date(c.lastUsedAt).toLocaleString()}` : `Saved ${new Date(c.createdAt).toLocaleString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => handleUseSaved(c.id)} disabled={usingId === c.id}
                    className="flat-btn-accent text-xs disabled:opacity-50">
                    {usingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
                    {usingId === c.id ? 'Switching...' : 'Use'}
                  </button>
                  <button type="button" onClick={() => handleDeleteSaved(c.id)} disabled={deletingId === c.id}
                    className="flat-btn-danger text-xs disabled:opacity-50" title="Remove from saved list">
                    {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
