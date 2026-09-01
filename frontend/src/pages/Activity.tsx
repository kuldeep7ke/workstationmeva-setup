import { useState, useEffect } from 'react';
import { SkeletonList } from '../components/PageSkeletons';
import { Activity as ActivityIcon, LogIn, User as UserIcon, Server, RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2, List, Bell } from 'lucide-react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dates';

type Tab = 'login' | 'user' | 'system' | 'all' | 'toasts';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'login', label: 'Login Activity', icon: LogIn },
  { key: 'user', label: 'User Activity', icon: UserIcon },
  { key: 'system', label: 'System Activity', icon: Server },
  { key: 'all', label: 'All Activity', icon: List },
  { key: 'toasts', label: 'Toasts', icon: Bell },
];

const ACTION_BADGES: Record<string, string> = {
  success: 'bg-success-50 text-success-700',
  failed_password: 'bg-danger-50 text-danger-700',
  failed_pin: 'bg-warning-50 text-warning-700',
  failed_approval: 'bg-danger-50 text-danger-700',
};

const ACTION_LABELS: Record<string, string> = {
  success: 'OK',
  failed_password: 'PWD',
  failed_pin: 'PIN',
  failed_approval: 'DENIED',
};

const PAYLOAD_NAME_FIELDS = ['full_name', 'name', 'title', 'task_title', 'client_name', 'username'];

function toastPayloadInfo(raw?: string): string {
  if (!raw) return '';
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return '';
    for (const f of PAYLOAD_NAME_FIELDS) {
      if (p[f] !== undefined && p[f] !== null && String(p[f]).trim()) return String(p[f]).slice(0, 60);
    }
    if (p.count !== undefined) return `${p.count} item${p.count === 1 ? '' : 's'}`;
    if (p.profile_id !== undefined) return `profile #${p.profile_id}`;
    if (p.task_id !== undefined) return `task #${p.task_id}`;
    return '';
  } catch { return ''; }
}

export default function Activity() {
  const [tab, setTab] = useState<Tab>('login');
  const [loginData, setLoginData] = useState<any[]>([]);
  const [userData, setUserData] = useState<any[]>([]);
  const [systemData, setSystemData] = useState<any[]>([]);
  const [allData, setAllData] = useState<any[]>([]);
  const [toastData, setToastData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fetchData = async (t: Tab) => {
    setLoading(true);
    setErr('');
    try {
      if (t === 'login') {
        const r = await api.get('/activity/login?limit=100');
        setLoginData(Array.isArray(r.data) ? r.data : []);
      } else if (t === 'user') {
        const r = await api.get('/activity/user?limit=100');
        setUserData(Array.isArray(r.data) ? r.data : []);
      } else if (t === 'system') {
        const r = await api.get('/activity/system?limit=100');
        setSystemData(Array.isArray(r.data) ? r.data : []);
      } else if (t === 'toasts') {
        const r = await api.get('/activity/toasts?limit=200');
        setToastData(Array.isArray(r.data) ? r.data : []);
      } else {
        const r = await api.get('/activity/all?limit=100');
        setAllData(Array.isArray(r.data) ? r.data : []);
      }
    } catch (e) { console.error('Failed to fetch activity:', e); setErr('Failed to load activity'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(tab); }, [tab]);

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800 flex items-center gap-2">
            <ActivityIcon className="w-5 h-5 text-accent-500" /> Activity
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">Login, user, system activity logs, and LAN toast history</p>
        </div>
        <button onClick={() => fetchData(tab)} className="flat-btn-surface text-xs self-start">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Login Activity */}
      {tab === 'login' && (
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
          {err ? (
            <div className="text-center py-12 text-surface-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{err}</p><button onClick={() => fetchData(tab)} className="flat-btn-surface text-xs mt-3">Retry</button></div>
          ) : loading ? (
            <SkeletonList rows={6} />
          ) : loginData.length === 0 ? (
            <div className="text-center py-12 text-surface-400"><LogIn className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No login activity yet.</p></div>
          ) : (
            <div className="divide-y divide-surface-100 max-h-[70vh] overflow-y-auto">
              {loginData.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${a.action === 'success' ? 'bg-success-500' : 'bg-danger-400'}`} />
                  <span className="font-medium text-surface-700 min-w-[120px] truncate">{a.full_name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${ACTION_BADGES[a.action] || 'bg-surface-100 text-surface-600'}`}>
                    {ACTION_LABELS[a.action] || a.action}
                  </span>
                  <span className="text-surface-400 flex-1 truncate">{a.details || ''}</span>
                  {a.ip_address && <span className="hidden sm:inline text-[10px] text-surface-300 font-mono">{a.ip_address}</span>}
                  <span className="text-[11px] text-surface-300 shrink-0">{formatDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User Activity */}
      {tab === 'user' && (
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
          {err ? (
            <div className="text-center py-12 text-surface-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{err}</p><button onClick={() => fetchData(tab)} className="flat-btn-surface text-xs mt-3">Retry</button></div>
          ) : loading ? (
            <SkeletonList rows={6} />
          ) : userData.length === 0 ? (
            <div className="text-center py-12 text-surface-400"><UserIcon className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No user activity yet.</p></div>
          ) : (
            <div className="divide-y divide-surface-100 max-h-[70vh] overflow-y-auto">
              {userData.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-accent-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-accent-700">{a.full_name?.charAt(0) || '?'}</span>
                  </div>
                  <span className="font-medium text-surface-700 min-w-[120px] truncate">{a.full_name}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 shrink-0">{a.action}</span>
                  <span className="text-surface-400 flex-1 truncate">{a.details || ''}</span>
                  <span className="text-[11px] text-surface-300 shrink-0">{formatDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* System Activity */}
      {tab === 'system' && (
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
          {err ? (
            <div className="text-center py-12 text-surface-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{err}</p><button onClick={() => fetchData(tab)} className="flat-btn-surface text-xs mt-3">Retry</button></div>
          ) : loading ? (
            <SkeletonList rows={6} />
          ) : systemData.length === 0 ? (
            <div className="text-center py-12 text-surface-400"><Server className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No system activity yet.</p></div>
          ) : (
            <div className="divide-y divide-surface-100 max-h-[70vh] overflow-y-auto">
              {systemData.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                    <Server className="w-3.5 h-3.5 text-surface-500" />
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 shrink-0">{a.action}</span>
                  <span className="text-surface-400 flex-1 truncate">{a.details || ''}</span>
                  <span className="text-[11px] text-surface-300 shrink-0">{formatDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All Activity */}
      {tab === 'all' && (
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
          {err ? (
            <div className="text-center py-12 text-surface-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{err}</p><button onClick={() => fetchData(tab)} className="flat-btn-surface text-xs mt-3">Retry</button></div>
          ) : loading ? (
            <SkeletonList rows={6} />
          ) : allData.length === 0 ? (
            <div className="text-center py-12 text-surface-400"><List className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No activity yet.</p></div>
          ) : (
            <div className="divide-y divide-surface-100 max-h-[70vh] overflow-y-auto">
              {allData.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-accent-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-accent-700">{a.full_name?.charAt(0) || '?'}</span>
                  </div>
                  <span className="font-medium text-surface-700 min-w-[120px] truncate">{a.full_name || 'System'}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 shrink-0">{a.action}</span>
                  <span className="text-surface-500 text-[11px] font-mono shrink-0">{a.entity_type}#{a.entity_id}</span>
                  <span className="text-surface-400 flex-1 truncate">{a.details || ''}</span>
                  <span className="text-[11px] text-surface-300 shrink-0">{formatDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    {/* Toasts */}
      {tab === 'toasts' && (
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
          {err ? (
            <div className="text-center py-12 text-surface-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{err}</p><button onClick={() => fetchData(tab)} className="flat-btn-surface text-xs mt-3">Retry</button></div>
          ) : loading ? (
            <SkeletonList rows={6} />
          ) : toastData.length === 0 ? (
            <div className="text-center py-12 text-surface-400"><Bell className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No toasts broadcast yet.</p></div>
          ) : (
            <div className="divide-y divide-surface-100 max-h-[70vh] overflow-y-auto">
              {toastData.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-accent-100 flex items-center justify-center shrink-0">
                    <Bell className="w-3.5 h-3.5 text-accent-700" />
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 shrink-0 font-mono">{a.event_name}</span>
                  {(() => { const info = toastPayloadInfo(a.payload); return info ? (
                    <span className="font-medium text-surface-700 min-w-[120px] truncate">{info}</span>
                  ) : null; })()}
                  <span className="text-surface-400 flex-1 truncate">{a.payload ? a.payload.slice(0, 120) : ''}</span>
                  <span className="text-[11px] text-surface-300 shrink-0">{formatDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
