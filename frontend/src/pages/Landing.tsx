import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { io as ioClient } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../context/SocketContext';
import api from '../utils/api';
import { getSavedLogins, removeLogin, updatePin, getSessionHistory, SessionRecord } from '../utils/quickLogin';
import { formatLabel } from '../utils/roles';
import { getAppName } from '../utils/appConfig';
import { getAppVersionLabel } from '../utils/appMeta';
import SplashLoader from '../components/SplashLoader';
import { ListTodo, CheckCircle2, Clock, Users, LogIn, UserPlus, X, Lock, KeyRound, Monitor, Send, AlertCircle, History, Filter, Loader2 } from 'lucide-react';

const PERIODS = [
  { label: 'Today', value: 'day' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: 'all' },
];

function filterSessions(sessions: SessionRecord[], period: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfDay);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  return sessions.filter(s => {
    const t = new Date(s.timestamp).getTime();
    switch (period) {
      case 'day': return t >= startOfDay.getTime();
      case 'yesterday': return t >= startOfYesterday.getTime() && t < startOfDay.getTime();
      case 'week': return t >= startOfWeek.getTime();
      case 'month': return t >= startOfMonth.getTime();
      case 'year': return t >= startOfYear.getTime();
      default: return true;
    }
  });
}

export default function Landing() {
  const { user, login, loading } = useAuth();
  const { toast } = useToast();
  const { socket, connected, loginApproved, loginRejected, clearLoginApproval, onlineUsers } = useSocket();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [savedLogins, setSavedLogins] = useState<any[]>([]);
  const [dbProfiles, setDbProfiles] = useState<any[]>([]);
  const [sessionPeriod, setSessionPeriod] = useState('all');
  const [landingOnline, setLandingOnline] = useState<any[]>([]);
  const [landingConnected, setLandingConnected] = useState(false);
  const landingSocketRef = useRef<any>(null);
  const pendingApprovalRef = useRef<{ email: string; full_name: string; password: string } | null>(null);

  const fetchLandingData = useCallback(() => {
    api.get('/analytics/landing').then(r => setData(r.data)).catch(() => {});
    setSavedLogins(getSavedLogins().filter(s => s.access_level === 3));
    api.get('/profiles/level3').then(r => setDbProfiles(r.data || [])).catch(() => {});
  }, []);

  const reconnectSocket = useCallback(() => {
    setLandingConnected(false);
    landingSocketRef.current?.disconnect();
    const s = ioClient(window.location.origin);
    landingSocketRef.current = s;
    s.on('connect', () => setLandingConnected(true));
    s.on('disconnect', () => setLandingConnected(false));
    s.on('users:online', (users: any[]) => { setLandingOnline(users); });
    s.on('login:approved', () => completeApprovalLogin());
    s.on('login:rejected', () => rejectApproval());
  }, []);

  useEffect(() => {
    const s = ioClient(window.location.origin);
    landingSocketRef.current = s;
    s.on('connect', () => setLandingConnected(true));
    s.on('disconnect', () => setLandingConnected(false));
    s.on('users:online', (users: any[]) => {
      setLandingOnline(users);
    });
    s.on('login:approved', () => completeApprovalLogin());
    s.on('login:rejected', () => rejectApproval());
    return () => { s.disconnect(); landingSocketRef.current = null; };
  }, []);

  const [pinModal, setPinModal] = useState<{ email: string; full_name: string; password: string; pin: string } | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLogining, setPinLogining] = useState(false);
  const [pinResetMode, setPinResetMode] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  const [pinSetupTarget, setPinSetupTarget] = useState<{ email: string; full_name: string; password: string } | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // PIN entry modal for DB profiles
  const [pinEntryProfile, setPinEntryProfile] = useState<any | null>(null);
  const [pinEntryValue, setPinEntryValue] = useState('');
  const [pinEntryError, setPinEntryError] = useState('');
  const [pinEntryLoading, setPinEntryLoading] = useState(false);

  // Request PIN modal
  const [requestPinProfile, setRequestPinProfile] = useState<any | null>(null);
  const [requestPinSent, setRequestPinSent] = useState(false);

  // Approval request state
  const [awaitingApproval, setAwaitingApproval] = useState<{ email: string; full_name: string; password: string } | null>(null);
  const [approvalRejected, setApprovalRejected] = useState(false);
  const [approvalPendingProfile, setApprovalPendingProfile] = useState<any>(null);

  // Handle approval - logs in whether PIN modal is open or not
  useEffect(() => {
    if (loginApproved && (awaitingApproval || approvalPendingProfile)) {
      const target = awaitingApproval || approvalPendingProfile;
      setPinLogining(true);
      login(target.email, target.password).then(() => {
        toast('Welcome back!', 'success');
        setPinModal(null);
        setAwaitingApproval(null);
        setApprovalPendingProfile(null);
      }).catch((err: any) => {
        toast(err.response?.data?.error || 'Login failed', 'error');
      }).finally(() => setPinLogining(false));
    }
  }, [loginApproved]);

  useEffect(() => {
    if (loginRejected && awaitingApproval) {
      setApprovalRejected(true);
      setTimeout(() => { setAwaitingApproval(null); setApprovalRejected(false); }, 4000);
    }
  }, [loginRejected]);

  const handlePinEntryLogin = async () => {
    if (!pinEntryProfile || pinEntryValue.length !== 4) return;
    setPinEntryLoading(true);
    setPinEntryError('');
    try {
      const res = await api.post('/auth/login-with-pin', { profile_id: pinEntryProfile.id, pin: pinEntryValue });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      sessionStorage.setItem('welcome_pending', '1');
      window.location.href = '/dashboard';
    } catch (err: any) {
      setPinEntryError(err.response?.data?.error || 'Wrong PIN');
    } finally { setPinEntryLoading(false); }
  };

  const handleRequestPin = async () => {
    if (!requestPinProfile) return;
    try {
      await api.post(`/profiles/${requestPinProfile.id}/request-pin`, { message: `Please set a PIN for ${requestPinProfile.full_name}` });
      setRequestPinSent(true);
      toast('Request sent to admin', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to send request', 'error');
    }
  };

  const allSessions = useMemo(() => getSessionHistory(), []);
  const filteredSessions = useMemo(() => filterSessions(allSessions, sessionPeriod), [allSessions, sessionPeriod]);

  const aggregated = useMemo(() => {
    const map = new Map<string, { email: string; full_name: string; count: number; totalSec: number; lastTs: string }>();
    filteredSessions.forEach(s => {
      const key = s.email;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.totalSec += s.durationSec;
        if (s.timestamp > existing.lastTs) existing.lastTs = s.timestamp;
      } else {
        map.set(key, { email: s.email, full_name: s.full_name, count: 1, totalSec: s.durationSec, lastTs: s.timestamp });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.lastTs.localeCompare(a.lastTs));
  }, [filteredSessions]);

  function fmtDuration(totalSec: number) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}h ${remMins}m`;
    }
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  useEffect(() => {
    if (!loading && user && user.access_level > 1) navigate('/dashboard');
  }, [user, loading, navigate]);

  useEffect(() => {
    fetchLandingData();
  }, [fetchLandingData]);

  // Fresh install (0 staff): clear any stale custom branding so default shows
  useEffect(() => {
    if (data && data.totalUsers === 0) {
      try {
        const savedApp = localStorage.getItem('app_name');
        if (savedApp && savedApp !== 'Workstation Meva' && savedApp !== 'Workstation Tracker') {
          const channelDisplay = localStorage.getItem('channel_display_name');
          localStorage.removeItem('app_name');
          if (channelDisplay) localStorage.removeItem('channel_display_name');
        }
      } catch {}
    }
  }, [data]);

  const quickLoginClick = (s: any) => {
    if (!s.password) {
      navigate(`/login?email=${encodeURIComponent(s.email)}`);
      return;
    }
    // Open PIN window for all saved logins
    setPinValue('');
    setPinError('');
    setPinModal(s);
    // Request approval via the guest socket (server validates the profile is an
    // active level-3 account before broadcasting the request)
    if (s.access_level === 3) {
      pendingApprovalRef.current = s;
      setApprovalPendingProfile(s);
      setApprovalRejected(false);
      const profile = dbProfiles.find((p: any) => (p.email && p.email === s.email) || p.full_name === s.full_name);
      landingSocketRef.current?.emit('login:request', { profile_id: profile?.id, full_name: s.full_name });
      toast('Login request sent to video editors', 'info');
    }
  };

  const completeApprovalLogin = () => {
    const target = pendingApprovalRef.current || awaitingApproval;
    if (!target) return;
    setPinLogining(true);
    login(target.email, target.password).then(() => {
      toast('Welcome back!', 'success');
      setPinModal(null);
      pendingApprovalRef.current = null;
      setAwaitingApproval(null);
      setApprovalPendingProfile(null);
    }).catch((err: any) => {
      toast(err.response?.data?.error || 'Login failed', 'error');
      pendingApprovalRef.current = null;
    }).finally(() => setPinLogining(false));
  };

  const rejectApproval = () => {
    if (!pendingApprovalRef.current && !awaitingApproval) return;
    setApprovalRejected(true);
    setTimeout(() => { pendingApprovalRef.current = null; setAwaitingApproval(null); setApprovalRejected(false); }, 4000);
  };

  const doDirectLogin = async (s: any) => {
    if (!s.password) {
      navigate(`/login?email=${encodeURIComponent(s.email)}`);
      return;
    }
    setPinLogining(true);
    try {
      const res = await login(s.email, s.password);
      toast('Welcome back!', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Login failed', 'error');
    } finally { setPinLogining(false); }
  };

  const handlePinSubmit = async () => {
    if (!pinModal) return;
    setPinError('');
    const profile = dbProfiles.find((p: any) => (p.email && p.email === pinModal.email) || p.full_name === pinModal.full_name);
    if (profile?.id) {
      // Validate against the server (rate-limited) so a stale local PIN can't lock
      // the user out — if it fails, offer the password-based reset instead.
      try {
        await api.post(`/profiles/${profile.id}/verify-pin`, { pin: pinValue });
      } catch {
        setPinError('Wrong PIN. Use "Forgot PIN" to reset it with your password.');
        return;
      }
    } else if (pinValue !== pinModal.pin) {
      setPinError('Wrong PIN');
      return;
    }
    await doDirectLogin(pinModal);
    setPinModal(null);
  };

  const handleResetPin = async () => {
    if (!pinModal) return;
    if (!resetPassword) { setPinError('Enter your password to reset PIN'); return; }
    setPinError('');
    // The password is verified server-side when the new PIN is saved
    // (POST /profiles/:id/set-pin) — no login here, so the landing page
    // doesn't navigate away mid-flow.
    setPinResetMode(false);
    setPinSetupTarget({ ...pinModal, password: resetPassword });
    setResetPassword('');
  };

  const handleSetPin = async () => {
    if (!pinSetupTarget) return;
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { toast('PIN must be 4 digits', 'error'); return; }
    if (newPin !== confirmPin) { toast('PINs do not match', 'error'); return; }
    const profile = dbProfiles.find((p: any) => (p.email && p.email === pinSetupTarget.email) || p.full_name === pinSetupTarget.full_name);
    if (profile?.id) {
      try {
        await api.post(`/profiles/${profile.id}/set-pin`, { password: pinSetupTarget.password || resetPassword, pin: newPin });
      } catch (err: any) {
        toast(err.response?.data?.error || 'Failed to update PIN on server', 'error');
        return;
      }
    } else {
      toast('Profile not found on server', 'error');
      return;
    }
    updatePin(pinSetupTarget.email, newPin);
    setSavedLogins(getSavedLogins());
    setPinSetupTarget(null);
    setNewPin('');
    setConfirmPin('');
    toast('PIN set successfully!', 'success');
  };

  if (loading) {
    return <SplashLoader />;
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="relative text-white overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #2d2a24, #1a1814)' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top right, rgba(249,115,22,0.15), transparent 50%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, transparent 30%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.1) 48%, transparent 58%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 70% 90%, rgba(255,255,255,0.1) 0%, transparent 35%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 text-accent-400 text-xs font-medium mb-3 border border-accent-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
                Live News Production System
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warning-500/15 text-warning-400 text-xs font-semibold border border-warning-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning-400 animate-pulse" />
                  Beta Release &middot; Testing Mode
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-surface-400 text-[11px] font-medium border border-white/10">
                  {getAppVersionLabel()}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
                {getAppName()}
              </h1>
              <p className="text-surface-300 mt-3 text-sm sm:text-base max-w-lg mx-auto lg:mx-0">
                Complete news production tracking &mdash; from assignment to broadcast. Manage tasks, bulletins, teleprompter, and your entire workflow in one place.
              </p>
              <div className="flex flex-wrap gap-3 mt-6 justify-center lg:justify-start">
                <Link to="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-accent-600/25">
                  <LogIn className="w-4 h-4" /> Login
                </Link>
                <Link to="/signup"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-semibold transition-all border border-white/10">
                  <UserPlus className="w-4 h-4" /> Sign Up
                </Link>
                <Link to="/teleprompter"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600/80 hover:bg-green-500/80 text-white rounded-xl text-sm font-semibold transition-all border border-green-400/20">
                  <Monitor className="w-4 h-4" /> Teleprompter
                </Link>
              </div>
            </div>

            <div className="relative grid grid-cols-2 gap-3 w-full max-w-sm">
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl" style={{ background: 'linear-gradient(155deg, transparent 30%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.07) 46%, transparent 55%)' }} />
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-8 h-8 rounded-lg bg-accent-500/20 flex items-center justify-center mb-2">
                  <ListTodo className="w-4 h-4 text-accent-400" />
                </div>
                <p className="text-2xl font-bold">{data?.totalTasks || 0}</p>
                <p className="text-[11px] text-surface-400">Total Tasks</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-8 h-8 rounded-lg bg-success-500/20 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-4 h-4 text-success-400" />
                </div>
                <p className="text-2xl font-bold">{data?.completed || 0}</p>
                <p className="text-[11px] text-surface-400">Completed</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-8 h-8 rounded-lg bg-warning-500/20 flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4 text-warning-400 animate-pulse" />
                </div>
                <p className="text-2xl font-bold">{data?.inProgress || 0}</p>
                <p className="text-[11px] text-surface-400">In Progress</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-8 h-8 rounded-lg bg-surface-500/20 flex items-center justify-center mb-2">
                  <Users className="w-4 h-4 text-surface-300" />
                </div>
                <p className="text-2xl font-bold">{data?.totalUsers || 0}</p>
                <p className="text-[11px] text-surface-400">Staff</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Online Staff */}
        <div className="bg-white rounded-2xl border border-surface-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-accent-500" /> Online Staff
            </h2>
            {connected || landingConnected ? (
              <span className="flex items-center gap-1.5 text-[11px] text-success-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
                {(connected ? onlineUsers : landingOnline).length} online
              </span>
            ) : (
              <span className="text-[11px] text-surface-400">Disconnected</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(connected ? onlineUsers : landingOnline).map((u) => (
              <div key={u.profile_id}
                className="flex items-center gap-2 bg-surface-50 rounded-xl border border-surface-200 px-3 py-2 text-sm">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  Number(u.access_level) === 1 ? 'bg-accent-400' :
                  (u.status || 'online') === 'in_task' ? 'bg-warning-500' : 'bg-success-500'
                }`} />
                <span className="font-medium text-surface-700">{u.full_name}</span>
              </div>
            ))}
            {(connected ? onlineUsers : landingOnline).length === 0 && (
              <p className="text-sm text-surface-400">No staff currently online.</p>
            )}
          </div>
        </div>

        {/* Quick Login */}
        <div className="bg-white rounded-2xl border border-surface-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
              <LogIn className="w-4 h-4 text-accent-500" /> Quick Login
            </h2>
            <span className="text-[11px] text-surface-400">{(connected ? onlineUsers : landingOnline).length} online</span>
          </div>

          {(() => {
            const combined: any[] = [];
            const seenNames = new Set<string>();
            const seenEmails = new Set<string>();
            const addProfile = (p: any, role: string) => {
              const nameKey = (p.full_name || '').toLowerCase().trim();
              const emailKey = (p.email || '').toLowerCase().trim();
              if (seenNames.has(nameKey)) return;
              if (emailKey && seenEmails.has(emailKey)) return;
              seenNames.add(nameKey);
              if (emailKey) seenEmails.add(emailKey);
              combined.push({ ...p, role });
            };
            savedLogins.forEach((s: any) => {
              // Only show saved logins whose profile is still present in active DB profiles
              // (terminated/archived profiles are excluded server-side, so a missing match means removed)
              const match = dbProfiles.find((d: any) => d.email === s.email || d.full_name === s.full_name);
              if (!match) return;
              addProfile(s, match?.role || s.role || '');
            });
            dbProfiles.forEach((p: any) => {
              addProfile(p, p.role || '');
            });
            const anchors = combined.filter(p => p.role === 'anchor');
            const editors = combined.filter(p => p.role === 'video_editor');

            if (anchors.length === 0 && editors.length === 0) {
              return <p className="text-sm text-surface-400">No saved logins yet. Sign in to save your account for quick access.</p>;
            }

            const renderProfile = (p: any, isSaved: boolean) => (
              <div key={(isSaved ? 's-' : 'd-') + (p.email || p.id)} className="flex items-center gap-2 bg-surface-50 rounded-xl border border-surface-200 px-3 py-2 hover:border-accent-300 transition-colors group">
                <button onClick={() => isSaved ? quickLoginClick(p) : (() => {
                  if (!p.email) { navigate(`/login?name=${encodeURIComponent(p.full_name)}`); return; }
                  if (p.has_pin) { setPinEntryProfile(p); setPinEntryValue(''); setPinEntryError(''); }
                  else { setRequestPinProfile(p); setRequestPinSent(false); }
                })()}
                  className="flex items-center gap-2 text-sm font-medium text-surface-700">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isSaved ? 'bg-accent-100' : 'bg-surface-100'}`}>
                    <span className={`text-xs font-bold ${isSaved ? 'text-accent-700' : 'text-surface-600'}`}>{p.full_name.charAt(0)}</span>
                  </div>
                  <span>{p.full_name}</span>
                  {isSaved && p.pin && <Lock className="w-3 h-3 text-surface-300" />}
                  {!isSaved && !!p.has_pin && <Lock className="w-3 h-3 text-surface-300" />}
                  {!isSaved && !p.has_pin && <span className="text-[10px] text-accent-500">new</span>}
                </button>
                {isSaved && (
                  <button onClick={() => { removeLogin(p.email); setSavedLogins(getSavedLogins().filter(x => x.access_level === 3)); }}
                    className="p-1 rounded text-surface-300 hover:text-danger-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );

            return (
              <div className="space-y-4">
                {anchors.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-2">Anchors</p>
                    <div className="flex flex-wrap gap-2">
                      {anchors.map(p => renderProfile(p, savedLogins.some((s: any) => s.email === p.email)))}
                    </div>
                  </div>
                )}
                {editors.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-2">Editors</p>
                    <div className="flex flex-wrap gap-2">
                      {editors.map(p => renderProfile(p, savedLogins.some((s: any) => s.email === p.email)))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Session History */}
        {allSessions.length > 0 && (
          <div className="bg-white rounded-2xl border border-surface-200 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
                <History className="w-4 h-4 text-accent-500" /> Session History
              </h2>
             <div className="flex items-center gap-2">
               <Filter className="w-3.5 h-3.5 text-surface-400" />
               <div className="flex flex-wrap gap-1">
                 {PERIODS.map(p => (
                   <button key={p.value} onClick={() => setSessionPeriod(p.value)}
                     className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                       sessionPeriod === p.value
                         ? 'bg-accent-100 text-accent-700'
                         : 'text-surface-500 hover:bg-surface-100'
                     }`}>
                     {p.label}
                   </button>
                 ))}
              </div>
            </div>
            </div>

            {aggregated.length > 0 ? (
              <div className="overflow-x-auto -mx-5 sm:-mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-surface-400 border-b border-surface-100">
                      <th className="text-left px-5 sm:px-6 py-2 font-medium">User</th>
                      <th className="text-left px-5 sm:px-6 py-2 font-medium">Logins</th>
                      <th className="text-left px-5 sm:px-6 py-2 font-medium">Total Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregated.map((a, i) => (
                      <tr key={a.email} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                        <td className="px-5 sm:px-6 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-accent-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-accent-700">{a.full_name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-surface-700">{a.full_name}</p>
                              <p className="text-[11px] text-surface-400">{a.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 sm:px-6 py-2.5">
                          <span className="text-sm font-semibold text-surface-700">{a.count}</span>
                          <span className="text-[11px] text-surface-400 ml-1">{a.count === 1 ? 'login' : 'logins'}</span>
                        </td>
                        <td className="px-5 sm:px-6 py-2.5 text-surface-600 font-medium">{fmtDuration(a.totalSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-surface-400 py-4 text-center">No sessions for this period.</p>
            )}
          </div>
        )}

        {/* Recent Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-surface-200 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success-500" /> Recently Completed
            </h2>
            <div className="space-y-2">
              {(data?.recentCompleted || []).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-50">
                  <div className="w-7 h-7 rounded-lg bg-success-50 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">{t.title}</p>
                    <p className="text-[11px] text-surface-400">{formatLabel(t.task_type)}</p>
                  </div>
                </div>
              ))}
              {(!data?.recentCompleted || data.recentCompleted.length === 0) && (
                <p className="text-sm text-surface-400 py-4 text-center">No completed tasks yet.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-surface-200 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning-500 animate-pulse" /> In Progress
            </h2>
            <div className="space-y-2">
              {(data?.recentInProgress || []).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-50">
                  <div className="w-7 h-7 rounded-lg bg-warning-50 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-3.5 h-3.5 text-warning-600 animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">{t.title}</p>
                    <p className="text-[11px] text-surface-400">{formatLabel(t.task_type)}</p>
                  </div>
                </div>
              ))}
              {(!data?.recentInProgress || data.recentInProgress.length === 0) && (
                <p className="text-sm text-surface-400 py-4 text-center">No tasks in progress.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-surface-200 p-5 sm:p-6 lg:col-span-2">
            <h2 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-surface-500" /> Upcoming / Pending
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(data?.recentPending || []).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-50">
                  <div className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                    <ListTodo className="w-3.5 h-3.5 text-surface-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">{t.title}</p>
                    <p className="text-[11px] text-surface-400">{formatLabel(t.task_type)}</p>
                  </div>
                </div>
              ))}
              {(!data?.recentPending || data.recentPending.length === 0) && (
                <p className="text-sm text-surface-400 py-4 text-center col-span-full">No pending tasks.</p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* PIN Entry Modal */}
      {pinModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { setPinModal(null); setPinResetMode(false); setResetPassword(''); }}>
          <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-xs shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-accent-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                {pinResetMode ? <KeyRound className="w-6 h-6 text-accent-600" /> : <Lock className="w-6 h-6 text-accent-600" />}
              </div>
              <h3 className="text-sm font-semibold text-surface-800">{pinResetMode ? 'Reset PIN' : 'Enter PIN'}</h3>
              <p className="text-xs text-surface-400 mt-1">{pinModal.full_name}</p>
            </div>
            {pinError && <p className="text-xs text-danger-600 text-center mb-2">{pinError}</p>}
            {!pinResetMode ? (
              <>
                <input type="password" inputMode="numeric" maxLength={4} autoFocus
                  className="flat-input text-center text-lg tracking-[0.3em]"
                  placeholder="• • • •" value={pinValue}
                  onChange={e => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={e => { if (e.key === 'Enter') handlePinSubmit(); }} />
                <button onClick={() => { setPinResetMode(true); setPinError(''); setPinValue(''); }}
                  className="w-full text-xs text-accent-600 hover:text-accent-700 mt-2 font-medium">
                  Forgot PIN?
                </button>
              </>
            ) : (
              <>
                <input type="password" inputMode="numeric" maxLength={4} autoFocus
                  className="flat-input text-center text-lg tracking-[0.3em] mb-2"
                  placeholder="• • • • (New PIN)" value={pinValue}
                  onChange={e => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={e => { if (e.key === 'Enter') handleResetPin(); }} />
                <input type="password" inputMode="text" autoComplete="current-password"
                  className="flat-input mb-2"
                  placeholder="Current Password (to verify)" value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)} />
                <button onClick={() => { setPinResetMode(false); setResetPassword(''); }}
                  className="w-full text-xs text-surface-500 hover:text-surface-700 mt-1 font-medium">
                  Back to PIN Entry
                </button>
              </>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setPinModal(null); setPinResetMode(false); setResetPassword(''); }} className="flat-btn-surface flex-1 justify-center">Cancel</button>
              <button onClick={pinResetMode ? handleResetPin : handlePinSubmit} disabled={(pinResetMode ? pinValue.length !== 4 || !resetPassword : pinValue.length !== 4) || pinLogining}
                className="flat-btn-accent flex-1 justify-center disabled:opacity-50">
                {pinLogining ? 'Logging in...' : pinResetMode ? 'Reset PIN' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set PIN Modal */}
      {pinSetupTarget && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setPinSetupTarget(null)}>
          <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-xs shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-accent-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6 text-accent-600" />
              </div>
              <h3 className="text-sm font-semibold text-surface-800">Set PIN</h3>
              <p className="text-xs text-surface-400 mt-1">4-digit PIN for {pinSetupTarget.full_name}</p>
            </div>
            <input type="password" inputMode="numeric" maxLength={4} autoFocus
              className="flat-input text-center text-lg tracking-[0.3em] mb-2"
              placeholder="New PIN" value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            <input type="password" inputMode="numeric" maxLength={4}
              className="flat-input text-center text-lg tracking-[0.3em]"
              placeholder="Confirm PIN" value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPinSetupTarget(null)} className="flat-btn-surface flex-1 justify-center">Cancel</button>
              <button onClick={handleSetPin}
                className="flat-btn-accent flex-1 justify-center">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Awaiting Approval Modal */}
      {awaitingApproval && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-xs shadow-xl text-center">
            <div className="w-14 h-14 bg-warning-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              {approvalRejected ? (
                <AlertCircle className="w-7 h-7 text-danger-500" />
              ) : pinLogining ? (
                <div className="w-6 h-6 border-2 border-accent-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-7 h-7 text-warning-500" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-surface-800">
              {approvalRejected ? 'Approval Rejected' : pinLogining ? 'Logging in...' : 'Awaiting Approval'}
            </h3>
            <p className="text-xs text-surface-400 mt-1">
              {approvalRejected
                ? 'Your login request was rejected by the manager.'
                : pinLogining
                  ? 'Please wait...'
                  : `Request sent for ${awaitingApproval.full_name}. Waiting for manager/admin to approve...`}
            </p>
            {!pinLogining && !approvalRejected && (
              <div className="mt-4">
                <div className="w-6 h-6 border-2 border-accent-600 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            )}
            {approvalRejected && (
              <button onClick={() => { setAwaitingApproval(null); setApprovalRejected(false); }}
                className="flat-btn-surface flex-1 justify-center mt-4 w-full">
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* PIN Entry Modal (for DB profiles with PIN set) */}
      {pinEntryProfile && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { setPinEntryProfile(null); setPinEntryError(''); }}>
          <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-xs shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-accent-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-accent-600" />
              </div>
              <h3 className="text-sm font-semibold text-surface-800">Enter PIN</h3>
              <p className="text-xs text-surface-400 mt-1">{pinEntryProfile.full_name}</p>
            </div>
            {pinEntryError && <p className="text-xs text-danger-600 text-center mb-2">{pinEntryError}</p>}
            <input type="password" inputMode="numeric" maxLength={4} autoFocus
              className="flat-input text-center text-lg tracking-[0.3em]"
              placeholder="• • • •" value={pinEntryValue}
              onChange={e => setPinEntryValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => { if (e.key === 'Enter') handlePinEntryLogin(); }} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setPinEntryProfile(null); setPinEntryError(''); }} className="flat-btn-surface flex-1 justify-center">Cancel</button>
              <button onClick={handlePinEntryLogin} disabled={pinEntryValue.length !== 4 || pinEntryLoading}
                className="flat-btn-accent flex-1 justify-center disabled:opacity-50">
                {pinEntryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock'}
              </button>
            </div>
            <button onClick={() => { setPinEntryProfile(null); setRequestPinProfile(pinEntryProfile); setRequestPinSent(false); }}
              className="w-full text-xs text-surface-500 hover:text-accent-600 mt-3 font-medium">
              Forgot PIN? Request admin to change it
            </button>
          </div>
        </div>
      )}

      {/* Request PIN Modal (for DB profiles without PIN) */}
      {requestPinProfile && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { setRequestPinProfile(null); setRequestPinSent(false); }}>
          <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-xs shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-warning-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              {requestPinSent ? <CheckCircle2 className="w-6 h-6 text-success-600" /> : <KeyRound className="w-6 h-6 text-warning-600" />}
            </div>
            <h3 className="text-sm font-semibold text-surface-800">
              {requestPinSent ? 'Request Sent' : 'No PIN Set'}
            </h3>
            <p className="text-xs text-surface-400 mt-1">
              {requestPinSent
                ? 'Admin has been notified. They will set a PIN for you shortly.'
                : `${requestPinProfile.full_name} does not have a PIN yet. Request admin to set one.`}
            </p>
            {!requestPinSent ? (
              <div className="flex flex-col gap-2 mt-4">
                <button onClick={handleRequestPin} className="flat-btn-accent flex-1 justify-center">
                  <Send className="w-3.5 h-3.5" /> Request PIN from Admin
                </button>
                <button onClick={() => { setRequestPinProfile(null); navigate(`/login?name=${encodeURIComponent(requestPinProfile.full_name)}`); }}
                  className="flat-btn-surface flex-1 justify-center text-xs">
                  Login with password instead
                </button>
              </div>
            ) : (
              <button onClick={() => setRequestPinProfile(null)} className="flat-btn-surface flex-1 justify-center mt-4 w-full">
                Done
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-surface-200 py-6 text-center text-xs text-surface-400">
        <p>{getAppName()} &copy; {new Date().getFullYear()} &mdash; Free &amp; public domain (Unlicense) &middot; {getAppVersionLabel()} &middot; Testing Mode</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link to="/about" className="hover:text-surface-600 transition-colors">About</Link>
          <Link to="/contact" className="hover:text-surface-600 transition-colors">Contact</Link>
          <Link to="/faq" className="hover:text-surface-600 transition-colors">FAQ</Link>
          <Link to="/terms" className="hover:text-surface-600 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-surface-600 transition-colors">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
