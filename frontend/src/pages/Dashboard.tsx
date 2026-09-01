import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { formatDate } from '../utils/dates';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocket, OnlineUser } from '../context/SocketContext';
import { getRoleLabel, formatLabel } from '../utils/roles';
import {
  ListTodo, CheckCircle2, Clock, AlertTriangle, Users,
  TrendingUp, Megaphone, User, Video, Camera, UserCheck,
  Wifi, WifiOff, LogIn, UserPlus, Check, X, AlertCircle, ThumbsUp,
  Radio, CalendarClock, Zap,
} from 'lucide-react';

const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { socket, connected, onlineUsers, loginApprovalRequest, clearLoginApproval } = useSocket();
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState('day');
  const [activity, setActivity] = useState<any[]>([]);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [pendingApprovalTasks, setPendingApprovalTasks] = useState<any[]>([]);
  const [countdown, setCountdown] = useState<{ task_id: number; seconds: number } | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showUrgentBanner, setShowUrgentBanner] = useState(false);
  const [urgentBannerTasks, setUrgentBannerTasks] = useState<any[]>([]);

  useEffect(() => {
    setErr('');
    api.get(`/analytics/dashboard?period=${period}`)
      .then((r) => setData(r.data))
      .catch(() => setErr('Failed to load dashboard'));
    api.get('/analytics/activity?limit=10')
      .then((r) => setActivity(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    api.get('/tasks?limit=15')
      .then((r) => setRecentTasks(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    api.get('/users/available')
      .then((r) => setAvailableUsers(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [period]);

  // Socket event listeners for collaboration features
  useEffect(() => {
    if (!socket || !connected) return;

    const accessLevel = user?.access_level;

    // Fetch pending approval tasks when higher-up comes online
    if (accessLevel && accessLevel <= 2) {
      api.get('/tasks/pending-approval').then(r => {
        if (Array.isArray(r.data) && r.data.length > 0) {
          setPendingApprovalTasks(r.data);
        }
      }).catch(() => {});
    }

    const handleUrgentPending = (data: { tasks: any[] }) => {
      if (accessLevel && accessLevel <= 2 && data.tasks?.length > 0) {
        setShowUrgentBanner(true);
        setUrgentBannerTasks(data.tasks);
        setTimeout(() => setShowUrgentBanner(false), 10000);
      }
    };

    const handleCountdown = (data: { task_id: number; seconds: number }) => {
      if (accessLevel && accessLevel === 3) {
        setCountdown(data);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        let seconds = data.seconds;
        countdownTimerRef.current = setInterval(() => {
          seconds--;
          if (seconds <= 0) {
            clearInterval(countdownTimerRef.current!);
            countdownTimerRef.current = null;
            setCountdown(null);
            api.put(`/tasks/${data.task_id}/auto-approve`).catch(() => {});
          } else {
            setCountdown(prev => prev ? { ...prev, seconds } : null);
          }
        }, 1000);
      }
    };

    const handleApprovedBatch = (data: { task_ids: number[] }) => {
      if (data.task_ids?.length > 0) {
        toast(`${data.task_ids.length} urgent task(s) approved!`, 'success');
        setShowUrgentBanner(false);
        setUrgentBannerTasks([]);
        // Refresh tasks list
        api.get('/tasks?limit=15').then(r => setRecentTasks(Array.isArray(r.data) ? r.data : [])).catch(() => {});
      }
    };

    socket.on('tasks:urgent-pending', handleUrgentPending);
    socket.on('task:auto-approve-countdown', handleCountdown);
    socket.on('tasks:approved-batch', handleApprovedBatch);

    // Send urgent request if there are pending urgent tasks
    if (accessLevel && accessLevel <= 2) {
      socket.emit('tasks:urgent-request', { tasks: [] });
    }

    return () => {
      socket.off('tasks:urgent-pending', handleUrgentPending);
      socket.off('task:auto-approve-countdown', handleCountdown);
      socket.off('tasks:approved-batch', handleApprovedBatch);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [socket, connected, user?.access_level]);

  if (!data && !err) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-accent-600 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (err) {
    return (
      <div className="flat-card-static text-center py-12">
        <AlertTriangle className="w-10 h-10 text-danger-500 mx-auto mb-3 icon-bounce" />
        <p className="text-surface-500">{err}</p>
        <button onClick={() => window.location.reload()} className="flat-btn-brand mt-4">Retry</button>
      </div>
    );
  }

  const s = data.taskStats || {};
  const statCards = [
    { label: 'Total Tasks', value: s.total_tasks || 0, icon: ListTodo, color: 'bg-accent-50 text-accent-600', anim: '' },
    { label: 'Completed', value: s.completed || 0, icon: CheckCircle2, color: 'bg-success-50 text-success-600', anim: '' },
    { label: 'In Progress', value: s.in_progress || 0, icon: Clock, color: 'bg-warning-50 text-warning-600', anim: 'icon-pulse' },
    { label: 'Pending', value: s.pending || 0, icon: AlertTriangle, color: 'bg-danger-50 text-danger-500', anim: '' },
    { label: 'Breaking News', value: s.breaking || 0, icon: TrendingUp, color: 'bg-danger-50 text-danger-600', anim: 'icon-live' },
    { label: 'Active Ads', value: data.activeAds || 0, icon: Megaphone, color: 'bg-accent-50 text-accent-600', anim: '' },
    { label: 'Staff', value: data.usersByLevel?.reduce((a: any, b: any) => a + b.count, 0) || 0, icon: Users, color: 'bg-warning-50 text-warning-600', anim: '' },
    { label: 'Avg Time', value: `${Math.round(data.avgCompletion || 0)}m`, icon: Clock, color: 'bg-surface-100 text-surface-500', anim: '' },
  ];

   return (
     <div className="space-y-4 sm:space-y-6">
 <div className="page-header">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-danger-500 icon-live" />
          <div>
            <h1 className="text-xl font-bold text-surface-800">Dashboard</h1>
            <p className="text-sm text-surface-400 mt-0.5">Live news production overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`filter-pill ${
                period === p.value ? 'filter-pill-active' : 'filter-pill-inactive'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        </div>
      </div>
    </div>

      {/* Urgent Approval Banner */}
      {showUrgentBanner && user && user.access_level <= 2 && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3 animate-slide-down">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-danger-600 shrink-0 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-danger-800">Urgent Tasks Pending Approval</p>
              <p className="text-xs text-danger-600">{urgentBannerTasks.length} urgent task(s) from staff need your approval</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={async () => {
              try {
                const res = await api.post('/tasks/approve-urgent', { task_ids: urgentBannerTasks.map((t: any) => t.id) });
                toast(`Approved ${res.data.approved.length} urgent task(s)`, 'success');
                setShowUrgentBanner(false);
                setUrgentBannerTasks([]);
              } catch { toast('Failed to approve', 'error'); }
            }} className="flat-btn-sm">
              <ThumbsUp className="w-3 h-3" /> Approve All
            </button>
            <button onClick={() => setShowUrgentBanner(false)} className="flat-btn-sm">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* User Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center shrink-0">
            <Wifi className="w-5 h-5 text-success-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{onlineUsers.filter(u => u.status === 'online').length}</p>
            <p className="text-[11px] text-surface-400">Online</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 rounded-xl bg-surface-50 flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5 text-surface-500" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">—</p>
            <p className="text-[11px] text-surface-400">Offline</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-warning-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{onlineUsers.filter(u => u.status === 'in_task').length}</p>
            <p className="text-[11px] text-surface-400">In Task</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center shrink-0">
            <LogIn className="w-5 h-5 text-accent-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{onlineUsers.filter(u => u.status === 'logging_in').length}</p>
            <p className="text-[11px] text-surface-400">Logging In</p>
          </div>
        </div>
      </div>

      {/* Live / Current / Upcoming Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-danger-400">
          <div className="w-10 h-10 rounded-xl bg-danger-50 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-danger-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{data.breakingTasks ?? data.taskStats?.breaking ?? 0}</p>
            <p className="text-[11px] text-surface-400">Breaking / Live</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-warning-400">
          <div className="w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-warning-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{data.inProgressTasks ?? data.taskStats?.in_progress ?? 0}</p>
            <p className="text-[11px] text-surface-400">In Progress</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-accent-400">
          <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-accent-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{data.confirmationTasks ?? 0}</p>
            <p className="text-[11px] text-surface-400">Needs Approval</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-success-400">
          <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5 text-success-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{data.upcomingBulletins ?? 0}</p>
            <p className="text-[11px] text-surface-400">Open Slots Today</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-orange-400">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{data.dueToday ?? 0}</p>
            <p className="text-[11px] text-surface-400">Due Today</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-rose-400">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{data.expiringSoon ?? 0}</p>
            <p className="text-[11px] text-surface-400">Expiring (&lt;2h)</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-sky-400">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{data.upcomingPrograms ?? 0}</p>
            <p className="text-[11px] text-surface-400">Upcoming Programs</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4 border-l-4 border-l-violet-400">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-surface-800">{onlineUsers.length}</p>
            <p className="text-[11px] text-surface-400">Online Now</p>
          </div>
        </div>
      </div>

      {/* Login Approval Request (for level 1-2 managers/admins) */}
      {loginApprovalRequest && user && user.access_level <= 2 && (
        <div className="bg-accent-50 border border-accent-200 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3 animate-slide-down">
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-5 h-5 text-accent-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-accent-800">Login Approval Request</p>
              <p className="text-xs text-accent-600">{loginApprovalRequest.full_name} wants to log in</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => {
              socket?.emit('login:approve', { request_profile_id: loginApprovalRequest.profile_id, approved_by: user?.profile_id });
              clearLoginApproval();
              toast('Approved login request', 'success');
            }} className="flat-btn-sm">
              <Check className="w-3 h-3" /> Approve
            </button>
            <button onClick={() => {
              socket?.emit('login:reject', { request_profile_id: loginApprovalRequest.profile_id });
              clearLoginApproval();
              toast('Rejected login request', 'info');
            }} className="flat-btn-sm">
              <X className="w-3 h-3" /> Reject
            </button>
          </div>
        </div>
      )}

      {/* Auto-approve Countdown (for level 3) */}
      {countdown && user && user.access_level === 3 && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-warning-600 shrink-0 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-warning-800">Auto-approval Countdown</p>
              <p className="text-xs text-warning-600">Task #{countdown.task_id} will be auto-approved in {countdown.seconds}s if no higher-up approves</p>
            </div>
          </div>
          <div className="text-lg font-bold text-warning-700 shrink-0">{countdown.seconds}s</div>
        </div>
      )}

      {/* Pending Approval Tasks (for level 1/2) */}
      {user && user.access_level <= 2 && pendingApprovalTasks.length > 0 && (
        <div className="flat-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-warning-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-surface-700">Pending Approvals ({pendingApprovalTasks.length})</h3>
          </div>
          <div className="space-y-2">
            {pendingApprovalTasks.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-warning-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate">{t.title}</p>
                  <p className="text-[11px] text-surface-400">
                    {formatLabel(t.priority)} · by {t.assigned_by_name || '—'}
                  </p>
                </div>
                <button onClick={async () => {
                  try {
                    await api.put(`/tasks/${t.id}`, { status: 'approved' });
                    toast('Task approved!', 'success');
                    setPendingApprovalTasks(prev => prev.filter(pt => pt.id !== t.id));
                  } catch { toast('Failed to approve', 'error'); }
                }} className="flat-btn-accent text-xs px-2.5 py-1.5 min-h-0 shrink-0">
                  <Check className="w-3 h-3" /> Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Online Users List */}
      {onlineUsers.length > 0 && (
        <div className="flat-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-success-400" />
            <h3 className="text-sm font-semibold text-surface-700">Online Staff ({onlineUsers.length})</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {onlineUsers.map((u: OnlineUser) => (
              <div key={u.profile_id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-50 border border-surface-200 text-xs font-medium">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  u.role === 'admin' || u.access_level === 1 ? 'bg-accent-500' :
                  (u.status || 'online') === 'online' ? 'bg-success-500' :
                  (u.status || 'online') === 'in_task' ? 'bg-warning-500' :
                  (u.status || 'online') === 'logging_in' ? 'bg-accent-500' : 'bg-surface-400'
                }`} />
                <span className="text-surface-700">{u.full_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((c, i) => (
          <div key={i} className="flat-card flex items-center gap-3 p-3 sm:p-4">
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${c.color} ${c.anim}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-bold text-surface-800 leading-tight">{c.value}</p>
              <p className="text-[11px] sm:text-xs text-surface-400 truncate">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {user && user.access_level === 3 && (() => {
          const myTasks = recentTasks.filter((t) =>
            t.assigned_to === user.profile_id && !['completed', 'cancelled', 'published', 'under_review', 'trashed'].includes(t.status));
          return (
            <div className="flat-card">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-accent-500" />
                <h3 className="text-sm font-semibold text-surface-700">My Tasks ({myTasks.length})</h3>
              </div>
              <div className="space-y-2">
                {myTasks.slice(0, 6).map((t) => (
                  <Link key={t.id} to={`/dashboard/tasks/${t.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center shrink-0">
                      <ListTodo className="w-4 h-4 text-accent-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800 truncate group-hover:text-accent-600 transition-colors">{t.title}</p>
                      <p className="text-[11px] text-surface-400">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-300">{t.status.replace(/_/g, ' ')}</span>
                        {t.assigned_by_name && <> · by {t.assigned_by_name}</>}
                        {t.task_type && <> · {formatLabel(t.task_type)}</>}
                      </p>
                    </div>
                  </Link>
                ))}
                {myTasks.length === 0 && (
                  <p className="text-sm text-surface-400 py-4 text-center">No tasks assigned to you.</p>
                )}
              </div>
            </div>
          );
        })()}

        <div className="flat-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-surface-400" />
            <h3 className="text-sm font-semibold text-surface-700">Pending / Unassigned</h3>
          </div>
          <div className="space-y-2">
            {recentTasks.filter((t) => t.status === 'draft' && !t.assigned_to).slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-surface-50 flex items-center justify-center shrink-0">
                  <ListTodo className="w-4 h-4 text-surface-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate">{t.title}</p>
                  <p className="text-[11px] text-surface-400">
                    Created by <span className="font-medium text-surface-600">{t.assigned_by_name || '—'}</span>
                    {t.task_type && <> · {formatLabel(t.task_type)}</>}
                  </p>
                </div>
                <button onClick={async () => {
                  try {
                    await api.put(`/tasks/${t.id}`, { assigned_to: user!.profile_id });
                    toast('Task picked!', 'success');
                    const res = await api.get('/tasks?limit=15');
                    setRecentTasks(Array.isArray(res.data) ? res.data : []);
                  } catch { toast('Failed to pick task', 'error'); }
                }} className="flat-btn-sm shrink-0">
                  Pick
                </button>
              </div>
            ))}
            {recentTasks.filter((t) => t.status === 'draft' && !t.assigned_to).length === 0 && (
              <p className="text-sm text-surface-400 py-4 text-center">No unassigned tasks.</p>
            )}
          </div>
        </div>

        <div className="flat-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-accent-400 icon-pulse" />
            <h3 className="text-sm font-semibold text-surface-700">In Progress</h3>
          </div>
          <div className="space-y-2">
            {recentTasks.filter((t) => ['script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading'].includes(t.status)).slice(0, 6).map((t) => (
              <Link key={t.id} to={`/dashboard/tasks/${t.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-warning-600 icon-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate group-hover:text-accent-600 transition-colors">{t.title}</p>
                  <p className="text-[11px] text-surface-400">
                    Created by <span className="font-medium text-surface-600">{t.assigned_by_name || '—'}</span>
                    {' → Processing: '}<span className="font-medium text-surface-600">{t.assigned_to_name || '—'}</span>
                    {t.task_type && <> · {formatLabel(t.task_type)}</>}
                  </p>
                </div>
              </Link>
            ))}
            {recentTasks.filter((t) => ['script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading'].includes(t.status)).length === 0 && (
              <p className="text-sm text-surface-400 py-4 text-center">No tasks in progress.</p>
            )}
          </div>
        </div>

        <div className="flat-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-success-400" />
            <h3 className="text-sm font-semibold text-surface-700">Completed / Finished</h3>
          </div>
          <div className="space-y-2">
            {recentTasks.filter((t) => t.status === 'completed' || t.status === 'under_review').slice(0, 6).map((t) => (
              <Link key={t.id} to={`/dashboard/tasks/${t.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
                  {t.task_type === 'video_edit' ? <Camera className="w-4 h-4 text-success-600" /> : <CheckCircle2 className="w-4 h-4 text-success-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate group-hover:text-accent-600 transition-colors">{t.title}</p>
                  <p className="text-[11px] text-surface-400">
                    <span className="text-success-600 font-medium">Finished</span>
                    {' by '}<span className="font-medium text-surface-600">{t.assigned_to_name || '—'}</span>
                    {t.task_type && <> · {formatLabel(t.task_type)}</>}
                    {t.completed_at && <> · {new Date(t.completed_at).toLocaleDateString()}</>}
                  </p>
                </div>
                {t.youtube_url && (
                  <span className="text-[11px] text-red-500 shrink-0">▶</span>
                )}
              </Link>
            ))}
            {recentTasks.filter((t) => t.status === 'completed' || t.status === 'under_review').length === 0 && (
              <p className="text-sm text-surface-400 py-4 text-center">No completed tasks yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flat-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-warning-400 icon-pulse" />
          <h3 className="text-sm font-semibold text-surface-700">Recent Activity</h3>
        </div>
        <div className="space-y-1">
          {activity.slice(0, 8).map((a: any, i: number) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-surface-100 last:border-0">
              <div className="w-2 h-2 rounded-full bg-accent-400 mt-1.5 shrink-0" />
              <p className="text-sm text-surface-600 flex-1 min-w-0">
                <span className="font-medium text-surface-700">{a.full_name || 'System'}</span> {a.details || a.action}
              </p>
              <span className="text-[11px] text-surface-400 whitespace-nowrap mt-0.5">
                {a.created_at ? formatDate(a.created_at) : ''}
              </span>
            </div>
          ))}
          {activity.length === 0 && <p className="text-sm text-surface-400 py-4 text-center">No recent activity.</p>}
        </div>
      </div>

      <div className="flat-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-success-400 icon-pulse" />
          <h3 className="text-sm font-semibold text-surface-700">Available Anchors</h3>
        </div>
        <div className="space-y-1">
          {availableUsers.filter((u: any) => u.role === 'anchor').length === 0 ? (
            <p className="text-sm text-surface-400 py-4 text-center">All anchors are busy.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableUsers.filter((u: any) => u.role === 'anchor').map((u: any) => (
                <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success-50 text-success-700 text-xs font-medium">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{u.full_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
