import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getSavedLogins, getSessionHistory, updateSavedLogin } from '../utils/quickLogin';
import { formatDateTime, formatTime } from '../utils/dates';
import { formatLabel } from '../utils/roles';
import { getAppName } from '../utils/appConfig';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { AlertTriangle, Timer, Activity, Database, Code, Server, Wifi, WifiOff, RefreshCw, Loader2, CheckCircle2, XCircle, Bell, FileText, Eye, EyeOff, KeyRound, Save, Trash2, HelpCircle, Copy, ServerCrash, AlertCircle, Monitor, Smartphone, Send, ChevronDown, Download, Upload, Wrench } from 'lucide-react';

const NOTIFY_LEVELS = [
  { value: 1, label: 'Admin' },
  { value: 2, label: 'Manager' },
  { value: 3, label: 'Staff' },
];

export default function Developer() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const dialog = useDialog();
  const { user, refreshUser } = useAuth();
  const isAdmin = !!user?.is_dev || (user?.access_level ?? 99) <= 1;
  const [cautionAccepted, setCautionAccepted] = useState(false);
  const [tab, setTab] = useState<'connection' | 'api' | 'tools' | 'storage' | 'activity' | 'danger'>(isAdmin ? 'activity' : 'connection');
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLocalStorage, setShowLocalStorage] = useState(false);
  const [notifResult, setNotifResult] = useState('');
  const [savedLoginEdits, setSavedLoginEdits] = useState<Record<string, { password: string; pin: string }>>({});
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [loginTab, setLoginTab] = useState<'account' | 'saved'>('account');
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupResult, setBackupResult] = useState<{ created: number; updated: number; skipped: number; restored?: Record<string, number> } | null>(null);
  const [fixingDb, setFixingDb] = useState(false);
  const [fixDbResult, setFixDbResult] = useState<any>(null);

  // Connection diagnostics
  const [diag, setDiag] = useState<{ api: 'checking' | 'ok' | 'fail'; latency: number | null; apiError: string; dataOk: boolean }>({
    api: 'checking',
    latency: null,
    apiError: '',
    dataOk: false,
  });
  const [diagMap, setDiagMap] = useState<Record<string, string>>({});
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const { socket: appSocket, connected: socketConnected } = useSocket();

  // Real database sync status (from /sync/status + live db:* socket events)
  const [dbStatus, setDbStatus] = useState<{ mode?: string; engine?: string; online: boolean; queuePending?: number } | null>(null);
  const [dbChecking, setDbChecking] = useState(false);

  // Dev credentials
  const [devInfo, setDevInfo] = useState<any>(null);
  const [newDevPassword, setNewDevPassword] = useState('');
  const [devPwSaving, setDevPwSaving] = useState(false);

  // Custom notification
  const [customMsg, setCustomMsg] = useState('');
  const [customLevels, setCustomLevels] = useState<number[]>([1]);
  // datetime-local expects LOCAL wall-clock; toISOString() is UTC and would be
  // reinterpreted as local by the backend, stamping notifications hours in the past.
  const [customTime, setCustomTime] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [customResult, setCustomResult] = useState('');
  const [customSending, setCustomSending] = useState(false);

  const runConnectionCheck = useCallback(async () => {
    setDiagRunning(true);
    setDbChecking(true);
    setDiag((d) => ({ ...d, api: 'checking' }));
    setDiagMap({});
    const results: Record<string, string> = {};

    const t0 = performance.now();
    try {
      const res = await api.get('/health', { timeout: 10000 });
      const latency = Math.round(performance.now() - t0);
      results['API Server (/health)'] = `OK (${latency} ms)`;
      setDiag((d) => ({ ...d, api: 'ok', latency }));
    } catch (e: any) {
      results['API Server (/health)'] = `FAILED - ${e?.message || 'Connection failed'}`;
      setDiag((d) => ({ ...d, api: 'fail', latency: null, apiError: e?.message || 'Connection failed' }));
    }

    await api.get('/analytics/landing', { timeout: 10000 })
      .then(() => { results['Stats (/analytics/landing)'] = 'OK'; setDiag((d) => ({ ...d, dataOk: true })); })
      .catch((e: any) => { results['Stats (/analytics/landing)'] = `FAILED - ${e?.message || 'Error'}`; setDiag((d) => ({ ...d, dataOk: false })); });

    await api.get('/profiles/level3', { timeout: 10000 })
      .then(() => { results['Profiles (/profiles/level3)'] = 'OK'; })
      .catch((e: any) => { results['Profiles (/profiles/level3)'] = `FAILED - ${e?.message || 'Error'}`; });

    try {
      const res = await api.get('/sync/status', { timeout: 10000 });
      const s = res.data;
      setDbStatus(s);
      results['Database (Postgres)'] = s?.online
        ? `OK - connected (${s.engine})`
        : `OFFLINE - running on local mirror (${s.engine})`;
    } catch (e: any) {
      setDbStatus({ online: false, engine: 'mirror', mode: 'sqlite' });
      results['Database (Postgres)'] = `FAILED - ${e?.message || 'Error'}`;
    }

    setDiagMap(results);
    setDiagRunning(false);
    setDbChecking(false);
  }, []);

  const fetchDevInfo = async () => {
    try {
      const res = await api.get('/auth/dev');
      setDevInfo(res.data);
    } catch {}
  };

  useEffect(() => {
    if (!cautionAccepted) return;
    runConnectionCheck();
    fetchDevInfo();
  }, [cautionAccepted, runConnectionCheck]);
  useEffect(() => {
    if (!cautionAccepted || !appSocket) return;
    const onStatus = (s: any) => { if (s && typeof s.online === 'boolean') setDbStatus(s); };
    const onOnline = () => setDbStatus((p) => p ? { ...p, online: true, engine: 'pg' } : { online: true, engine: 'pg' });
    const onOffline = () => setDbStatus((p) => p ? { ...p, online: false, engine: 'mirror' } : { online: false, engine: 'mirror' });
    appSocket.on('db:status', onStatus);
    appSocket.on('db:online', onOnline);
    appSocket.on('db:offline', onOffline);
    return () => {
      appSocket.off('db:status', onStatus);
      appSocket.off('db:online', onOnline);
      appSocket.off('db:offline', onOffline);
    };
  }, [cautionAccepted, appSocket]);
  useEffect(() => {
    if (!cautionAccepted) return;
    if (isAdmin) fetchActivity();
    refreshSavedLoginEdits();
  }, [cautionAccepted]);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const res = await api.get('/analytics/activity?limit=50');
      setActivity(Array.isArray(res.data) ? res.data : []);
    } catch {}
    setLoading(false);
  };

  const refreshSavedLoginEdits = () => {
    const edits: Record<string, { password: string; pin: string }> = {};
    getSavedLogins().forEach(l => { edits[l.email] = { password: l.password || '', pin: l.pin || '' }; });
    setSavedLoginEdits(edits);
  };

  const saveLocalLogin = (email: string) => {
    const edit = savedLoginEdits[email];
    if (!edit) return;
    if (edit.pin && !/^\d{4}$/.test(edit.pin)) {
      toast('PIN must be empty or exactly 4 digits', 'error');
      return;
    }
    updateSavedLogin(email, { password: edit.password, pin: edit.pin });
    refreshSavedLoginEdits();
    toast('Saved local login password/PIN', 'success');
  };

  const handleCleanAllData = async () => {
    setCleaning(true);
    try {
      await api.delete('/developer/clean-all-data');
      toast('All data cleaned successfully. Only admin users preserved.', 'success');
      setShowCleanConfirm(false);
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to clean all data', 'error');
    } finally {
      setCleaning(false);
    }
  };

  const handleBackupExport = async () => {
    setBackupExporting(true);
    try {
      const res = await api.get('/users/backup/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
      const profileName = user?.username || 'unknown';
      a.download = `${getAppName().toLowerCase().replace(/\s+/g, '-')}-${profileName}-backup-${date}-${time}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup exported', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to export backup', 'error');
    } finally { setBackupExporting(false); }
  };

  const handleBackupImport = async (file?: File) => {
    if (!file) return;
    setBackupImporting(true);
    setBackupResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await api.post('/users/backup/import', data);
      setBackupResult(res.data);
      toast('Backup imported', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to import backup', 'error');
    } finally { setBackupImporting(false); }
  };

  const handleFixDb = async () => {
    setFixingDb(true);
    setFixDbResult(null);
    try {
      const res = await api.post('/backups/fix-db');
      setFixDbResult(res.data);
      toast(res.data?.fixed ? 'Database repaired' : 'Database check complete', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to repair database', 'error');
    } finally { setFixingDb(false); }
  };

  const testNotification = async () => {
    setNotifResult('');
    try {
      const res = await api.post('/notifications/test');
      const unread = res.data?.unread;
      const msg = unread !== undefined ? `Test notification sent. Unread count: ${unread}. Check the bell icon.` : 'Test notification sent. Check the bell icon.';
      setNotifResult(msg);
      toast(msg, 'success');
    } catch (err: any) {
      const msg = 'Error: ' + (err.response?.data?.error || err.message);
      setNotifResult(msg);
      toast(msg, 'error');
    }
  };

  const sendCustomNotification = async () => {
    setCustomResult('');
    if (!customMsg.trim()) { toast('Message is required', 'error'); return; }
    if (!customLevels.length) { toast('Pick at least one access level', 'error'); return; }
    setCustomSending(true);
    try {
      const res = await api.post('/notifications/custom', {
        message: customMsg.trim(),
        access_levels: customLevels,
        time: customTime,
      });
      const d = res.data;
      const msg = d.scheduled
        ? `Scheduled for ${new Date(d.deliver_at).toLocaleString()} - will be delivered to level(s) ${d.levels.join(', ')}.`
        : `Delivered to ${d.delivered} user(s) (level ${d.levels.join(', ')}) - stamped ${formatDateTime(d.created_at)}.`;
      setCustomResult(msg);
      toast(msg, 'success');
    } catch (err: any) {
      const msg = 'Error: ' + (err.response?.data?.error || err.message);
      setCustomResult(msg);
      toast(msg, 'error');
    } finally { setCustomSending(false); }
  };

  if (!cautionAccepted) {
    return (
      <div className="fixed inset-0 z-50 bg-surface-900/90 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-danger-200 p-6 sm:p-8 max-w-md w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-danger-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-danger-600 animate-pulse" />
          </div>
          <h2 className="text-lg font-bold text-surface-800 mb-2">Developer Zone</h2>
          <p className="text-sm text-surface-500 mb-4">
            This area contains tools and data meant for development and debugging purposes.
            Modifying data here may affect production workflows.
          </p>
          <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 mb-5 text-xs text-warning-700 text-left">
            <strong>&#9888; Caution:</strong> You will be automatically redirected to the dashboard after 3 minutes.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => navigate('/dashboard')}
              className="flat-btn-surface w-full justify-center text-sm">
              Go to Dashboard
            </button>
            <button onClick={() => setCautionAccepted(true)}
              className="flat-btn-danger w-full justify-center text-sm">
              Enter Developer Zone
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'connection' as const, label: 'Connection', icon: Wifi },
    { id: 'api' as const, label: 'API & Health', icon: Server },
    { id: 'tools' as const, label: 'Dev Tools', icon: Code },
    { id: 'storage' as const, label: 'Local Storage', icon: Database },
    ...(isAdmin ? [
      { id: 'activity' as const, label: 'Activity Logs', icon: Activity },
      { id: 'danger' as const, label: 'Danger Zone', icon: AlertTriangle },
    ] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-white text-accent-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'connection' && (
        <div className="space-y-4">
          {/* Connection diagnostics */}
          <div className="flat-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-accent-500" /> Connection Help
              </h3>
              <button onClick={runConnectionCheck} disabled={diagRunning}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-600 hover:text-accent-700 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${diagRunning ? 'animate-spin' : ''}`} /> {diagRunning ? 'Checking...' : 'Run check'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
              <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${diag.api === 'ok' ? 'bg-success-50 border-success-200' : diag.api === 'fail' ? 'bg-danger-50 border-danger-200' : 'bg-surface-50 border-surface-200'}`}>
                {diag.api === 'ok' ? <Wifi className="w-4 h-4 text-success-600 shrink-0" /> : diag.api === 'fail' ? <WifiOff className="w-4 h-4 text-danger-500 shrink-0" /> : <Loader2 className="w-4 h-4 text-surface-400 animate-spin shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-surface-700">Server Connection</p>
                  <p className={`text-[11px] truncate ${diag.api === 'ok' ? 'text-success-600' : diag.api === 'fail' ? 'text-danger-600' : 'text-surface-400'}`}>
                    {diag.api === 'checking' ? 'Checking...' : diag.api === 'ok' ? `Connected (${diag.latency} ms)` : 'Not reachable'}
                  </p>
                </div>
              </div>
              <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${dbStatus?.online ? 'bg-success-50 border-success-200' : 'bg-warning-50 border-warning-200'}`}>
                {dbStatus?.online ? <Database className="w-4 h-4 text-success-600 shrink-0" /> : dbChecking ? <Loader2 className="w-4 h-4 text-surface-400 animate-spin shrink-0" /> : <AlertCircle className="w-4 h-4 text-warning-500 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-surface-700">Database (Postgres)</p>
                  <p className={`text-[11px] truncate ${dbStatus ? (dbStatus.online ? 'text-success-600' : 'text-warning-700') : 'text-surface-400'}`}>
                    {!dbStatus ? (dbChecking ? 'Checking...' : 'Not checked') : dbStatus.online ? `Connected (${dbStatus.engine})` : `Offline - local mirror (${dbStatus.engine})`}
                  </p>
                </div>
              </div>
              <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${socketConnected ? 'bg-success-50 border-success-200' : 'bg-surface-50 border-surface-200'}`}>
                {socketConnected ? <Wifi className="w-4 h-4 text-success-600 shrink-0" /> : <WifiOff className="w-4 h-4 text-surface-400 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-surface-700">Live Updates (Socket)</p>
                  <p className={`text-[11px] truncate ${socketConnected ? 'text-success-600' : 'text-surface-400'}`}>
                    {socketConnected ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </div>
              <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${diag.dataOk ? 'bg-success-50 border-success-200' : diag.api === 'fail' ? 'bg-surface-50 border-surface-200' : 'bg-danger-50 border-danger-200'}`}>
                {diag.dataOk ? <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0" /> : diag.api === 'fail' ? <ServerCrash className="w-4 h-4 text-surface-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-danger-500 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-surface-700">App Data</p>
                  <p className={`text-[11px] truncate ${diag.dataOk ? 'text-success-600' : 'text-danger-600'}`}>
                    {diag.api === 'checking' ? 'Checking...' : diag.dataOk ? 'Loading OK' : 'Some data failed'}
                  </p>
                </div>
              </div>
            </div>

            {diag.api === 'ok' && socketConnected && diag.dataOk && dbStatus?.online && (
              <div className="flex items-center gap-2 text-xs text-success-700 bg-success-50 border border-success-200 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Everything looks good.
              </div>
            )}

            {diag.api === 'ok' && socketConnected && diag.dataOk && dbStatus && !dbStatus.online && (
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 text-xs text-warning-700">
                <p className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> Server is up but the PostgreSQL database is not connected.</p>
                <p className="mt-1">The app is currently running on the local mirror ({dbStatus.mode || 'sqlite'}). Changes will sync to the database automatically when the connection returns.</p>
              </div>
            )}

            {diag.api === 'fail' && (
              <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 text-xs text-danger-700 space-y-2">
                <p className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> The server is not reachable.</p>
                <p>Common causes and fixes:</p>
                <ul className="list-disc pl-4 space-y-1 text-danger-600">
                  <li>The server is restarting (takes ~10 seconds) — wait and click "Run check" again.</li>
                  <li>The server app is not running on the computer that hosts it. Start it and retry.</li>
                  <li>Your computer's internet/network is down — check WiFi or LAN.</li>
                  <li>Wrong address — this app is normally opened as <span className="font-mono">http://localhost</span> (or <span className="font-mono">http://workstation</span> / your computer's LAN IP on the network).</li>
                </ul>
                <p className="pt-1 text-danger-600">Error detail: <span className="font-mono text-[10px] break-all">{diag.apiError}</span></p>
              </div>
            )}

            {diag.api === 'ok' && !socketConnected && (
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 text-xs text-warning-700">
                <p className="font-semibold">Live updates are disconnected.</p>
                <p className="mt-1">Online status and notifications won't refresh in real time. Refreshing the page usually fixes this.</p>
              </div>
            )}

            {diag.api === 'ok' && socketConnected && !diag.dataOk && (
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 text-xs text-warning-700">
                <p className="font-semibold">Server is up but some data failed to load.</p>
                <p className="mt-1">Click "Run check" to see which parts failed below.</p>
              </div>
            )}

            {/* Quick Fix buttons */}
            <div className="mt-3 bg-surface-50 rounded-xl border border-surface-200 p-3">
              <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-2">One-click fixes</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { appSocket?.connect(); toast('Reconnecting live updates...', 'info'); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-surface-200 hover:border-accent-300 text-surface-700 transition-colors">
                  <Wifi className="w-3.5 h-3.5 text-accent-600" /> Reconnect Live Updates
                </button>
                <button
                  onClick={() => { runConnectionCheck(); toast('Refreshed diagnostics', 'success'); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-surface-200 hover:border-accent-300 text-surface-700 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5 text-accent-600" /> Refresh Data
                </button>
                <button
                  onClick={() => { window.location.reload(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-surface-200 hover:border-accent-300 text-surface-700 transition-colors">
                  <ServerCrash className="w-3.5 h-3.5 text-accent-600" /> Reload Page
                </button>
                {!['', '80'].includes(window.location.port) && (
                  <a href={`http://${window.location.hostname}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600 hover:bg-accent-500 text-white transition-colors">
                    <Monitor className="w-3.5 h-3.5" /> Open Main App
                  </a>
                )}
              </div>
              <p className="text-[10px] text-surface-400 mt-2">
                Port <span className="font-mono">{window.location.port || '80'}</span> in the address bar tells you which version you are on: <span className="font-mono">80</span> (or no port) is the main app, <span className="font-mono">5173</span> is the development app, and <span className="font-mono">3002</span> is the backend directly.
              </p>
            </div>

            {Object.keys(diagMap).length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Check details</p>
                <div className="bg-surface-50 rounded-xl border border-surface-200 p-3 space-y-1">
                  {Object.entries(diagMap).map(([k, v]) => (
                    <p key={k} className="text-[11px] flex items-center justify-between gap-2">
                      <span className="text-surface-600 truncate">{k}</span>
                      <span className={`font-medium shrink-0 ${v.startsWith('OK') ? 'text-success-600' : 'text-danger-600'}`}>{v}</span>
                    </p>
                  ))}
                </div>
                <button onClick={() => {
                  const report = [
                    `Checked: ${new Date().toLocaleString()}`,
                    ...Object.entries(diagMap).map(([k, v]) => `${k}: ${v}`),
                    `Socket: ${socketConnected ? 'Connected' : 'Disconnected'}`,
                    `URL: ${window.location.href}`,
                  ].join('\n');
                  navigator.clipboard?.writeText(report).then(() => {
                    setDiagCopied(true);
                    setTimeout(() => setDiagCopied(false), 2000);
                  });
                }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-600 hover:text-accent-700">
                  <Copy className="w-3.5 h-3.5" /> {diagCopied ? 'Copied!' : 'Copy report for admin'}
                </button>
              </div>
            )}
          </div>

          {/* Developer login + saved passwords & PINs */}
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent-500" /> Developer Login
            </h3>
            <div className="flex gap-1 bg-surface-100 rounded-xl p-1 mb-3 overflow-x-auto">
              <button onClick={() => setLoginTab('account')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${loginTab === 'account' ? 'bg-white text-accent-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
                <KeyRound className="w-3.5 h-3.5" /> Dev Account
              </button>
              <button onClick={() => setLoginTab('saved')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${loginTab === 'saved' ? 'bg-white text-accent-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
                <EyeOff className="w-3.5 h-3.5" /> Saved Passwords & PINs
              </button>
            </div>

            {loginTab === 'account' && (
              <>
                <p className="text-xs text-surface-400 mb-3">
                  This login is built into the app (stored in a file on the server, not in the database), so it keeps working even when the database is missing, corrupt or locked.
                </p>
                {devInfo && (
                  <div className="space-y-2 mb-3 text-xs text-surface-600 bg-surface-50 rounded-xl p-3">
                    <p>Login ID: <span className="font-mono text-surface-800">{devInfo.username}</span></p>
                    <p className={devInfo.default_password ? 'text-warning-700 font-medium' : 'text-success-700 font-medium'}>
                      {devInfo.default_password ? 'Still using the default password - change it below.' : 'Default password has been changed.'}
                    </p>
                    {devInfo.updated_at && <p>Last changed: <span className="font-mono">{formatDateTime(devInfo.updated_at)}</span></p>}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                  <div className="flex-1 w-full">
                    <label className="flat-label">New Developer Password (min 8 chars)</label>
                    <input type="password" className="flat-input text-sm" value={newDevPassword}
                      onChange={(e) => setNewDevPassword(e.target.value)} />
                  </div>
                  <button onClick={async () => {
                    if (newDevPassword.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
                    setDevPwSaving(true);
                    try {
                      await api.put('/auth/dev/password', { new_password: newDevPassword });
                      toast('Developer password changed', 'success');
                      setNewDevPassword('');
                      await fetchDevInfo();
                      await refreshUser();
                    } catch (err: any) {
                      toast(err.response?.data?.error || 'Failed to change password', 'error');
                    } finally { setDevPwSaving(false); }
                  }} disabled={devPwSaving}
                    className="flat-btn-accent text-xs disabled:opacity-50">
                    {devPwSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Change Password
                  </button>
                </div>
                <p className="text-[10px] text-surface-400 mt-2">
                  Tip: sign out, then log in again with ID <span className="font-mono">{devInfo?.username || 'dev-...'}</span> to verify.
                </p>
              </>
            )}

            {loginTab === 'saved' && (
              <>
                <p className="text-xs text-surface-400 mb-4">These are local quick-login values saved only in this browser.</p>
                <div className="space-y-2">
                  {getSavedLogins().map((login) => {
                    const edit = savedLoginEdits[login.email] || { password: login.password || '', pin: login.pin || '' };
                    return (
                      <div key={login.email} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_auto] gap-2 items-end rounded-xl bg-surface-50 border border-surface-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-surface-700">{login.full_name}</p>
                          <p className="text-xs text-surface-400">{login.email}</p>
                        </div>
                        <div>
                          <label className="flat-label">Saved Password</label>
                          <input type="password" className="flat-input text-xs" value={edit.password}
                            onChange={(e) => setSavedLoginEdits(prev => ({ ...prev, [login.email]: { ...edit, password: e.target.value } }))} />
                        </div>
                        <div>
                          <label className="flat-label">PIN</label>
                          <input inputMode="numeric" maxLength={4} className="flat-input text-xs" value={edit.pin}
                            onChange={(e) => setSavedLoginEdits(prev => ({ ...prev, [login.email]: { ...edit, pin: e.target.value.replace(/\D/g, '').slice(0, 4) } }))} />
                        </div>
                        <button onClick={() => saveLocalLogin(login.email)} className="flat-btn-accent text-xs">
                          <Save className="w-3 h-3" /> Save Local
                        </button>
                      </div>
                    );
                  })}
                  {getSavedLogins().length === 0 && (
                    <p className="text-sm text-surface-400 py-4 text-center">No saved quick logins in this browser.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'api' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-success-500" /> API Health
            </h3>
            {(() => {
              const h = diag.api === 'ok';
              return h ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success-500" />
                    <span className="text-surface-600">Status: <strong className="text-surface-800">ok</strong></span>
                  </div>
                  {diag.latency !== null && (
                    <p className="text-xs text-surface-400">Response time: <span className="font-mono">{diag.latency} ms</span></p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-danger-600">
                  <XCircle className="w-4 h-4" />
                  <span>Could not reach API</span>
                </div>
              );
            })()}
          </div>
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <Server className="w-4 h-4 text-accent-500" /> Quick Links
            </h3>
            <div className="space-y-1.5">
              {['/api/health', '/api/auth/me', '/api/analytics/landing', '/api/notifications'].map(path => (
                <button key={path} onClick={async () => {
                  try {
                    const r = await api.get(path.replace('/api/', ''));
                    await dialog.alert({ title: `GET ${path}`, message: <pre className="whitespace-pre-wrap font-mono text-[10px]">{JSON.stringify(r.data, null, 2)}</pre>, okLabel: 'Close' });
                  } catch (e: any) {
                    await dialog.alert({ title: `GET ${path} failed`, message: 'Error: ' + (e.response?.data?.error || e.message), okLabel: 'Close' });
                  }
                }}
                  className="block w-full text-left text-xs text-accent-600 hover:text-accent-700 font-mono bg-surface-50 hover:bg-surface-100 rounded-lg px-3 py-1.5 transition-colors">
                  GET {path}
                </button>
              ))}
            </div>
          </div>
          <div className="flat-card lg:col-span-2">
            <h3 className="text-sm font-semibold text-surface-800 mb-2">User Info (from token)</h3>
            <pre className="text-[11px] text-surface-600 bg-surface-50 rounded-xl p-3 overflow-x-auto max-h-40">
              {(() => {
                const u = localStorage.getItem('user');
                try { return JSON.stringify(JSON.parse(u || '{}'), null, 2); }
                catch { return u || 'Not logged in'; }
              })()}
            </pre>
          </div>
        </div>
      )}

      {tab === 'tools' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Local Data Backup - full width */}
          <div className="flat-card lg:col-span-2">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-accent-500" /> Local Data Backup
            </h3>
            <p className="text-xs text-surface-400 mb-3">Export or restore users, profiles, bulletin slot settings (slot name, publish time, news count, news level), saved slot defaults, ads, reporters, archives, locations and leaves. News, bulletins, tasks, stories, programs and notifications are not included.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <h4 className="text-sm font-semibold text-surface-800 mb-1">Export All Data</h4>
                <p className="text-xs text-surface-500 mb-4">Download everything as a JSON backup file.</p>
                <button type="button" onClick={handleBackupExport} disabled={backupExporting} className="flat-btn-accent text-xs">
                  {backupExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {backupExporting ? 'Exporting...' : 'Export Backup'}
                </button>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <h4 className="text-sm font-semibold text-surface-800 mb-1">Import Backup</h4>
                <p className="text-xs text-surface-500 mb-4">Upload a JSON backup to restore it.</p>
                <label className={`flat-btn-surface text-xs inline-flex cursor-pointer ${backupImporting ? 'opacity-60 pointer-events-none' : ''}`}>
                  {backupImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {backupImporting ? 'Importing...' : 'Import Backup'}
                  <input type="file" accept="application/json,.json" className="hidden"
                    onChange={(e) => handleBackupImport(e.target.files?.[0])} />
                </label>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <h4 className="text-sm font-semibold text-surface-800 mb-1">Repair Database</h4>
                <p className="text-xs text-surface-500 mb-4">Check integrity; rebuilds a corrupt local database.</p>
                <button type="button" onClick={handleFixDb} disabled={fixingDb} className="flat-btn-surface text-xs">
                  {fixingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                  {fixingDb ? 'Checking...' : 'Check & Repair'}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-warning-600 mt-2">Import replaces bulletin slot settings, saved slot defaults, ads, reporters, archives, locations and leaves with backup contents and updates existing users. News, bulletins, tasks, stories, programs and notifications are not touched.</p>
            {backupResult && (
              <div className="mt-3 p-3 rounded-xl bg-accent-50 border border-accent-200">
                <p className="text-xs font-semibold text-accent-700 uppercase tracking-wider mb-2">Import Summary</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-success-600">{backupResult.created}</p>
                    <p className="text-[11px] text-surface-500">Created</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-accent-600">{backupResult.updated}</p>
                    <p className="text-[11px] text-surface-500">Updated</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-surface-500">{backupResult.skipped}</p>
                    <p className="text-[11px] text-surface-500">Skipped</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-surface-500">{backupResult.restored ? Object.values(backupResult.restored).reduce((a, b) => a + (b || 0), 0) : 0}</p>
                    <p className="text-[11px] text-surface-500">Restored</p>
                  </div>
                </div>
              </div>
            )}
            {fixDbResult && (
              <div className="mt-3 p-3 rounded-xl bg-surface-50 border border-surface-200">
                <p className="text-xs font-semibold text-surface-700 uppercase tracking-wider mb-2">
                  Repair Result — {fixDbResult.integrity === 'ok' ? 'No repair needed' : (fixDbResult.fixed ? 'Repaired' : 'Failed')}
                </p>
                <ul className="space-y-1 text-xs text-surface-600 mb-2">
                  {fixDbResult.steps?.map((s: string, i: number) => <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success-500 mt-0.5 shrink-0" />{s}</li>)}
                </ul>
                {fixDbResult.warnings?.length > 0 && (
                  <ul className="space-y-1 text-xs text-warning-600">
                    {fixDbResult.warnings.map((w: string, i: number) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{w}</li>)}
                  </ul>
                )}
                <p className="text-[10px] text-surface-400 mt-2">Sync: {fixDbResult.sync?.online ? 'online' : 'offline'} · engine {fixDbResult.sync?.engine} · queue {fixDbResult.sync?.queuePending} pending</p>
              </div>
            )}
          </div>

          {/* Local Storage - full width */}
          <div className="flat-card lg:col-span-2">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent-500" /> Local Storage
            </h3>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-surface-400">Raw keys in this browser — shown when expanded.</p>
              <button onClick={() => setShowLocalStorage(!showLocalStorage)}
                className="text-xs text-accent-600 hover:text-accent-700 flex items-center gap-1">
                {showLocalStorage ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showLocalStorage ? 'Hide' : 'Show'}
              </button>
            </div>
            {showLocalStorage && (
              <pre className="text-[11px] text-surface-600 bg-surface-50 rounded-xl p-3 overflow-x-auto max-h-80">
                {(() => {
                  const data: Record<string, any> = {};
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i)!;
                    try { data[key] = JSON.parse(localStorage.getItem(key)!); }
                    catch { data[key] = localStorage.getItem(key); }
                  }
                  return JSON.stringify(data, null, 2);
                })()}
              </pre>
            )}
          </div>

          {/* Left column: Notifications + Environment (stacked close together) */}
          <div className="space-y-2">
            {/* Test Notification Card */}
            <div className="flat-card">
              <h3 className="text-sm font-semibold text-surface-800 mb-2 flex items-center gap-2">
                <Bell className="w-4 h-4 text-accent-500" /> Notifications
              </h3>
              <p className="text-xs text-surface-400 mb-2">Quick test notification to yourself.</p>
              <button onClick={testNotification} className="flat-btn-accent text-xs w-full">
                Send Test Notification (to me)
              </button>
              {notifResult && (
                <p className={`text-xs mt-1.5 ${notifResult.startsWith('Error') ? 'text-danger-600' : 'text-success-600'}`}>
                  {notifResult}
                </p>
              )}
            </div>

            {/* Environment Card - directly below Notifications with normal gap */}
            <div className="flat-card">
              <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-accent-500" /> Environment
              </h3>
              <div className="space-y-1 text-xs text-surface-600">
                <p>URL: <span className="font-mono text-surface-800 break-all">{window.location.href}</span></p>
                <p>Platform: <span className="font-mono text-surface-800">{navigator.platform}</span></p>
                <p>Language: <span className="font-mono text-surface-800">{navigator.language}</span></p>
                <p>Online: <span className={`font-mono ${navigator.onLine ? 'text-success-600' : 'text-danger-600'}`}>{String(navigator.onLine)}</span></p>
                <p>Viewport: <span className="font-mono text-surface-800">{window.innerWidth} x {window.innerHeight}</span></p>
                <p>Screen: <span className="font-mono text-surface-800">{window.screen.width} x {window.screen.height}</span></p>
                <p className="pt-1">User Agent: <span className="text-surface-400 break-all block">{navigator.userAgent}</span></p>
              </div>
            </div>
          </div>

          {/* Right column: Custom Notification */}
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <Send className="w-4 h-4 text-accent-500" /> Custom Notification
            </h3>
            <p className="text-xs text-surface-400 mb-3">Broadcast a custom message to users by access level.</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-surface-600 block mb-1">Recipients (access level)</label>
                <div className="flex flex-wrap gap-2">
                  {NOTIFY_LEVELS.map(l => (
                    <button key={l.value} type="button" onClick={() => setCustomLevels(prev => prev.includes(l.value) ? prev.filter(v => v !== l.value) : [...prev, l.value])}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${customLevels.includes(l.value) ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-surface-600 border-surface-200 hover:border-accent-300'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-surface-600 block mb-1">Message</label>
                <textarea value={customMsg} onChange={(e) => setCustomMsg(e.target.value)} rows={3} maxLength={500}
                  placeholder="Type the message to broadcast..." className="w-full text-xs rounded-lg border border-surface-200 p-2 outline-none focus:border-accent-400 bg-white" />
              </div>

              <div>
                <label className="text-xs font-medium text-surface-600 block mb-1">Time</label>
                <input type="datetime-local" value={customTime} onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full text-xs rounded-lg border border-surface-200 p-2 outline-none focus:border-accent-400 bg-white" />
              </div>

              <button onClick={sendCustomNotification} disabled={customSending} className="flat-btn-accent text-xs w-full">
                {customSending ? 'Sending...' : 'Send Custom Notification'}
              </button>

              {customResult && (
                <p className={`text-xs ${customResult.startsWith('Error') ? 'text-danger-600' : 'text-success-600'}`}>{customResult}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'storage' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">Saved Logins</h3>
            <pre className="text-[11px] text-surface-600 bg-surface-50 rounded-xl p-3 overflow-x-auto max-h-60">
              {JSON.stringify(getSavedLogins(), null, 2)}
            </pre>
          </div>
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">Session History</h3>
            <pre className="text-[11px] text-surface-600 bg-surface-50 rounded-xl p-3 overflow-x-auto max-h-60">
              {JSON.stringify(getSessionHistory(), null, 2)}
            </pre>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="flat-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent-500" /> Recent Activity Logs
            </h3>
            <button onClick={fetchActivity} disabled={loading}
              className="text-xs text-accent-600 hover:text-accent-700 flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-surface-400 border-b border-surface-100">
                  <th className="text-left px-5 sm:px-6 py-2 font-medium">User</th>
                  <th className="text-left px-5 sm:px-6 py-2 font-medium">Action</th>
                  <th className="text-left px-5 sm:px-6 py-2 font-medium hidden sm:table-cell">Entity</th>
                  <th className="text-left px-5 sm:px-6 py-2 font-medium hidden md:table-cell">Details</th>
                  <th className="text-left px-5 sm:px-6 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a: any, i: number) => (
                  <tr key={i} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                    <td className="px-5 sm:px-6 py-2 text-surface-700 font-medium">{a.full_name || `User #${a.user_id}`}</td>
                    <td className="px-5 sm:px-6 py-2">
                      <span className="flat-badge bg-surface-100 text-surface-600 border border-surface-200">{formatLabel(a.action)}</span>
                    </td>
                    <td className="px-5 sm:px-6 py-2 text-surface-500 hidden sm:table-cell">{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                    <td className="px-5 sm:px-6 py-2 text-surface-400 max-w-[200px] truncate hidden md:table-cell" title={a.details}>{a.details}</td>
                    <td className="px-5 sm:px-6 py-2 text-surface-400 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                  </tr>
                ))}
                {activity.length === 0 && !loading && (
                  <tr><td colSpan={5} className="px-5 sm:px-6 py-8 text-center text-surface-400">No activity logs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'danger' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-danger-500" /> Danger Zone
          </h3>
          <p className="text-xs text-surface-500 mb-6">
            <strong>Warning:</strong> This action will permanently delete all data except admin users (access_level = 1).
          </p>

          {/* Clean All Data Button */}
          <div className="mb-4">
            <button
              onClick={() => setShowCleanConfirm(true)}
              disabled={cleaning}
              className="w-full flat-btn-danger text-xs flex items-center justify-center gap-2"
            >
              {cleaning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cleaning...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Clean All Data</span>
                </>
              )}
            </button>
          </div>

          {/* Custom Confirmation Modal */}
          {showCleanConfirm && (
            <div className="fixed inset-0 z-50 bg-surface-900/90 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-danger-200 p-6 sm:p-8 max-w-md w-full shadow-2xl">
                <div className="w-16 h-16 bg-danger-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-danger-600" />
                </div>
                <h3 className="text-lg font-bold text-surface-800 mb-3">Confirm Data Cleanup</h3>
                <p className="text-sm text-surface-500 mb-5">
                  This will permanently delete all tasks, bulletins, ads, programs, notifications,
                  and non-admin users. Only users with access level 1 (admin) will be preserved.
                </p>
                <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-5 text-xs text-danger-700">
                  <strong>This action cannot be undone!</strong>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowCleanConfirm(false)}
                    className="flat-btn-surface w-full justify-center text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCleanAllData}
                    disabled={cleaning}
                    className="w-full flat-btn-danger text-xs justify-center"
                  >
                    {cleaning ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Delete All Data</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
