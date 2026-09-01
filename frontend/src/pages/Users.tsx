import { useState, useEffect } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../context/SocketContext';
import { useDialog } from '../context/DialogContext';
import { AlertTriangle, Loader2, Users as UsersIcon, Wifi, WifiOff, UserPlus, UserCheck, Archive, Pencil, RotateCcw, KeyRound, CalendarClock, CheckCircle, XCircle, Send, UserX, Shield } from 'lucide-react';
import { ROLES, getRoleLabel, SEAT_LIMITS, getPriorityOptionsForRole } from '../utils/roles';
import PasswordInput from '../components/PasswordInput';
import LeavesTab from '../components/LeavesTab';

const ACCESS_LEVELS = [
  { value: 1, label: 'Admin', desc: 'Full access' },
  { value: 2, label: 'Manager', desc: 'Manage tasks & content' },
  { value: 3, label: 'Staff', desc: 'Basic access' },
];

const levelColors: Record<number, string> = {
  1: 'bg-danger-50 text-danger-700 border-danger-200',
  2: 'bg-accent-50 text-accent-700 border-accent-200',
  3: 'bg-surface-100 text-surface-600 border-surface-300',
};

export default function Users() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { connected } = useSocket();
  const dialog = useDialog();
  const [seats, setSeats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'seats' | 'profiles' | 'archived' | 'leaves' | 'pending'>('seats');

  // Create seat
  const [seatLimits, setSeatLimits] = useState<{ limits: Record<string, number>; counts: Record<string, number> } | null>(null);
  const [creatingRole, setCreatingRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: '', password: '', confirm: '', password_hint: '' });
  const [showPw, setShowPw] = useState(false);

  // Profiles
  const [profiles, setProfiles] = useState<any[]>([]);
  const [archived, setArchived] = useState<any[]>([]);
  const [loadP, setLoadP] = useState(false);

  // Create profile
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [profForm, setProfForm] = useState({ user_id: 0, full_name: '', email: '', role: 'editorial', access_level: 3, password_hint: '' });
  const [savingProf, setSavingProf] = useState(false);

  // Restore
  const [showRestore, setShowRestore] = useState<any>(null);
  const [restoreTarget, setRestoreTarget] = useState(0);

  // Edit profile
  const [editProfile, setEditProfile] = useState<any>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', role: 'editorial', access_level: 3, password_hint: '', shift_type: 'general', shift_start: '09:00', shift_end: '17:00', weekly_off: '[]' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Change password (admin)
  const [changePasswordTarget, setChangePasswordTarget] = useState<any>(null);
  const [changePasswordForm, setChangePasswordForm] = useState({ password: '', confirm: '' });
  const [savingChangePassword, setSavingChangePassword] = useState(false);

  // PIN management
  const [pinTarget, setPinTarget] = useState<any>(null);
  const [newPin, setNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  // Profile lifecycle (offline / archive / terminate)
  const [busyProfile, setBusyProfile] = useState<number | null>(null);

  // Pending requests
  const [pendingSignups, setPendingSignups] = useState<any[]>([]);
  const [pinRequests, setPinRequests] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [approvingSignup, setApprovingSignup] = useState<number | null>(null);
  const [approvingLeave, setApprovingLeave] = useState<number | null>(null);
  const [pinRequestNotifId, setPinRequestNotifId] = useState<number | null>(null);

  const fetchSeats = () => {
    setLoading(true); setErr('');
    Promise.all([
      api.get('/users'),
      api.get('/users/seat-limits'),
    ]).then(([s, l]) => {
      setSeats(s.data);
      setSeatLimits(l.data);
    }).catch(() => setErr('Failed to load')).finally(() => setLoading(false));
  };

  const fetchSeatLimits = () => {
    api.get('/users/seat-limits').then(res => setSeatLimits(res.data)).catch(() => {});
  };

  const fetchProfiles = () => {
    setLoadP(true);
    api.get('/users/profiles').then(res => setProfiles(res.data)).catch(() => toast('Failed to load profiles', 'error')).finally(() => setLoadP(false));
  };

  const fetchArchived = () => {
    setLoadP(true);
    api.get('/users/profiles/archived').then(res => setArchived(res.data)).catch(() => toast('Failed to load archived', 'error')).finally(() => setLoadP(false));
  };

  const fetchPendingRequests = () => {
    setLoadingPending(true);
    Promise.all([
      api.get('/pending-requests/signups'),
      api.get('/pending-requests/pin-requests'),
      api.get('/pending-requests/leaves'),
    ]).then(([s, p, lv]) => {
      setPendingSignups(Array.isArray(s.data) ? s.data : []);
      setPinRequests(Array.isArray(p.data) ? p.data : []);
      setPendingLeaves(Array.isArray(lv.data) ? lv.data : []);
    }).catch(() => {}).finally(() => setLoadingPending(false));
  };

  useEffect(() => { fetchSeats(); fetchProfiles(); }, []);

  useEffect(() => {
    if (tab === 'profiles') fetchProfiles();
    if (tab === 'archived') fetchArchived();
    if (tab === 'pending') fetchPendingRequests();
  }, [tab]);

  const handleCreateSeat = async (e: React.FormEvent) => {
    e.preventDefault(); if (!creatingRole) return; setSaving(true);
    if (createForm.password !== createForm.confirm) { toast('Passwords do not match', 'error'); setSaving(false); return; }
    try {
      await api.post('/users', {
        password: createForm.password,
        password_hint: createForm.password_hint || undefined,
        role: creatingRole,
        full_name: createForm.full_name,
      });
      toast('Seat created', 'success');
      setCreatingRole(null); setCreateForm({ full_name: '', password: '', confirm: '', password_hint: '' });
      fetchSeatLimits(); fetchSeats();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const previewUsername = (name: string) => {
    const parts = name.trim().toLowerCase().split(/\s+/);
    if (parts.length < 2) return parts[0] || '?';
    const first = parts[0].replace(/[^a-z]/g, '');
    const last = parts[parts.length - 1].replace(/[^a-z]/g, '');
    if (!first || !last) return '?';
    return first[0] + last[0];
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingProf(true);
    try {
      await api.post('/users/profiles', profForm);
      toast('Profile created — replaces current active', 'success');
      setShowNewProfile(false);
      fetchProfiles(); fetchSeats();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSavingProf(false); }
  };

  const handleRestore = async () => {
    if (!showRestore) return;
    try {
      await api.put(`/users/profiles/${showRestore.id}/restore`, { user_id: restoreTarget || undefined });
      toast(`Profile restored to user`, 'success');
      setShowRestore(null);
      fetchArchived(); fetchSeats(); fetchProfiles();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed to restore', 'error'); }
  };

  const handleEditProfile = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editProfile) return; setSavingEdit(true);
    try {
      await api.put(`/users/profiles/${editProfile.id}`, editForm);
      toast('Profile updated', 'success');
      setEditProfile(null);
      fetchProfiles(); fetchSeats();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSavingEdit(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); if (!changePasswordTarget) return; setSavingChangePassword(true);
    if (changePasswordForm.password !== changePasswordForm.confirm) { toast('Passwords do not match', 'error'); setSavingChangePassword(false); return; }
    if (changePasswordForm.password.length < 6) { toast('Password must be at least 6 characters', 'error'); setSavingChangePassword(false); return; }
    try {
      await api.put(`/users/${changePasswordTarget.user_id ?? changePasswordTarget.id}/password`, { new_password: changePasswordForm.password });
      toast(`Password changed for ${changePasswordTarget.full_name}`, 'success');
      setChangePasswordTarget(null);
      setChangePasswordForm({ password: '', confirm: '' });
    } catch (err: any) { toast(err.response?.data?.error || 'Failed to change password', 'error'); }
    finally { setSavingChangePassword(false); }
  };

  const handleSetPin = async () => {
    if (!pinTarget || !pinTarget.profile_id || newPin.length !== 4) { toast('PIN must be exactly 4 digits', 'error'); return; }
    setSavingPin(true);
    try {
      await api.put(`/profiles/${pinTarget.profile_id}/pin`, { pin: newPin });
      toast('PIN set successfully', 'success');
      if (pinRequestNotifId) {
        await api.post(`/notifications/read/${pinRequestNotifId}`).catch(() => {});
        setPinRequestNotifId(null);
      }
      setPinTarget(null);
      setNewPin('');
      fetchSeats();
      fetchPendingRequests();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed to set PIN', 'error'); }
    finally { setSavingPin(false); }
  };

  const handleRemovePin = async () => {
    if (!pinTarget || !pinTarget.profile_id) return;
    if (!(await dialog.confirm({ title: 'Remove PIN', message: `Remove PIN for ${pinTarget.full_name}?`, danger: true, confirmLabel: 'Remove PIN' }))) return;
    try {
      await api.delete(`/profiles/${pinTarget.profile_id}/pin`);
      toast('PIN removed', 'success');
      setPinTarget(null);
      fetchSeats();
      fetchPendingRequests();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed to remove PIN', 'error'); }
  };

  const handleSetOffline = async (profileId: number, fullName: string, offline: boolean) => {
    setBusyProfile(profileId);
    try {
      await api.put(`/users/profiles/${profileId}/offline`, { offline });
      toast(offline ? `${fullName} is now offline` : `${fullName} is back online`, 'success');
      fetchSeats(); fetchProfiles();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setBusyProfile(null); }
  };

  const handleArchiveProfile = async (profileId: number, fullName: string) => {
    if (!(await dialog.confirm({ title: 'Archive profile', message: `Archive ${fullName}? The profile moves to the Archived tab and can no longer log in. You can restore it later.`, danger: true, confirmLabel: 'Archive' }))) return;
    setBusyProfile(profileId);
    try {
      await api.put(`/users/profiles/${profileId}/archive`);
      toast('Profile archived', 'success');
      fetchSeats(); fetchProfiles(); fetchArchived();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setBusyProfile(null); }
  };

  const handleTerminateProfile = async (profileId: number, fullName: string) => {
    if (!(await dialog.confirm({ title: 'Terminate profile', message: `Terminate ${fullName}? They lose all access immediately and the seat is freed. This can be reversed with Reactivate.`, danger: true, confirmLabel: 'Terminate' }))) return;
    setBusyProfile(profileId);
    try {
      await api.put(`/users/profiles/${profileId}/terminate`);
      toast('Profile terminated', 'success');
      fetchSeats(); fetchProfiles();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setBusyProfile(null); }
  };

  const handleReactivateProfile = async (profileId: number, fullName: string) => {
    if (!(await dialog.confirm({ title: 'Reactivate profile', message: `Reactivate ${fullName}? They regain access and the seat counts again.`, confirmLabel: 'Reactivate' }))) return;
    setBusyProfile(profileId);
    try {
      await api.put(`/users/profiles/${profileId}/reactivate`);
      toast('Profile reactivated', 'success');
      fetchSeats(); fetchProfiles();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setBusyProfile(null); }
  };

  const handleApproveSignup = async (profileId: number) => {
    setApprovingSignup(profileId);
    try {
      await api.put(`/auth/approve-signup/${profileId}`);
      toast('Signup approved', 'success');
      fetchPendingRequests();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setApprovingSignup(null); }
  };

  const handleRejectSignup = async (profileId: number) => {
    if (!(await dialog.confirm({ title: 'Reject signup', message: 'Reject this signup? This cannot be undone.', danger: true, confirmLabel: 'Reject' }))) return;
    setApprovingSignup(profileId);
    try {
      await api.delete(`/auth/reject-signup/${profileId}`);
      toast('Signup rejected', 'success');
      fetchPendingRequests();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setApprovingSignup(null); }
  };

  const handleApproveLeave = async (id: number) => {
    setApprovingLeave(id);
    try {
      await api.put(`/leaves/${id}`, { status: 'approved' });
      toast('Leave approved', 'success');
      fetchPendingRequests();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setApprovingLeave(null); }
  };

  const handleRejectLeave = async (id: number) => {
    if (!(await dialog.confirm({ title: 'Reject leave', message: 'Reject this leave request?', danger: true, confirmLabel: 'Reject' }))) return;
    setApprovingLeave(id);
    try {
      await api.put(`/leaves/${id}`, { status: 'rejected' });
      toast('Leave rejected', 'success');
      fetchPendingRequests();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setApprovingLeave(null); }
  };

  // The first admin (the only active admin) cannot be offlined/archived/terminated:
  // no other admin would remain to bring it back online. Options are hidden for it.
  const protectedAdminProfileId = (() => {
    const admins = seats.filter((s: any) => s.access_level === 1 && s.profile_id && s.status !== 'suspended');
    return admins.length === 1 ? admins[0].profile_id : null;
  })();
  const protectedProfileId = (() => {
    const admins = profiles.filter((p: any) => p.access_level === 1 && p.is_active && p.status !== 'suspended');
    return admins.length === 1 ? admins[0].id : null;
  })();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Users &amp; Profiles</h1>
          <p className="text-sm text-surface-400 mt-0.5">Manage user seats and role profiles</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className={`flex items-center gap-1 text-xs ${connected ? 'text-success-600' : 'text-danger-500'}`}>
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 overflow-x-auto">
        <button onClick={() => setTab('seats')}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${tab === 'seats' ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <UsersIcon className="w-3 h-3 inline mr-1" /> Seats
        </button>
        <button onClick={() => setTab('profiles')}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${tab === 'profiles' ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <UserCheck className="w-3 h-3 inline mr-1" /> Active Profiles
        </button>
        <button onClick={() => setTab('archived')}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${tab === 'archived' ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <Archive className="w-3 h-3 inline mr-1" /> Archived
        </button>
        <button onClick={() => setTab('leaves')}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${tab === 'leaves' ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <CalendarClock className="w-3 h-3 inline mr-1" /> Leaves
        </button>
        <button onClick={() => setTab('pending')}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${tab === 'pending' ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <Send className="w-3 h-3 inline mr-1" /> Pending
        </button>
      </div>

      {/* SEATS TAB */}
      {tab === 'seats' && (
        <>
          {/* Seat limits overview */}
          {seatLimits && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-surface-700">Create a new seat by role</h3>
                <button onClick={async () => {
                  try { const r = await api.post('/users/regenerate-usernames'); toast(`Updated ${r.data.updated} usernames`, 'success'); fetchSeats(); }
                  catch (e: any) { toast(e.response?.data?.error || 'Failed', 'error'); }
                }} className="text-xs text-accent-600 hover:text-accent-700 font-medium">Fix usernames</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {Object.entries(SEAT_LIMITS).filter(([r]) => r !== 'admin').map(([roleId, max]) => {
                  const used = seatLimits.counts[roleId] || 0;
                  const remaining = max - used;
                  const roleDef = ROLES.find(r => r.id === roleId);
                  const level = roleDef?.defaultLevel || 3;
                  const isFull = remaining <= 0;
                  return (
                    <button key={roleId} disabled={isFull}
                      onClick={() => { setCreatingRole(roleId); setCreateForm({ full_name: '', password: '', confirm: '', password_hint: '' }); }}
                      className={`flat-card p-4 text-left transition-all ${isFull ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'}`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${level === 2 ? 'bg-accent-100 text-accent-700' : 'bg-surface-100 text-surface-600'}`}>
                        <UsersIcon className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-semibold text-surface-800 leading-tight">{roleDef?.label || roleId}</p>
                      <p className="text-xs mt-1">
                        <span className="font-medium text-surface-600">{used}/{max}</span>
                        <span className="text-surface-400 ml-1">seats</span>
                      </p>
                      {isFull ? (
                        <span className="text-xs text-danger-500 font-medium">Full</span>
                      ) : (
                        <span className="text-xs text-success-600 font-medium">{remaining} available</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Existing seats table */}
          <div>
            <h3 className="text-sm font-semibold text-surface-700 mb-3">Existing Seats</h3>
            {loading ? (
              <SkeletonTable rows={6} cols={5} />
            ) : err ? (
              <div className="flat-card-static text-center py-12">
                <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
                <p className="text-surface-500">{err}</p>
                <button onClick={fetchSeats} className="flat-btn-accent mt-4">Retry</button>
              </div>
            ) : seats.length === 0 ? (
              <div className="flat-card-static text-center py-12">
                <UsersIcon className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-400">No user seats yet</p>
              </div>
            ) : (
              <div className="flat-card-static overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Seat</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Current Profile</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Role / Level</th>
                        {user?.access_level === 1 && <th className="text-right px-4 py-3 font-medium text-surface-500">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {seats.map((s) => (
                        <tr key={s.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-accent-100 rounded-xl flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-accent-700">{(s.full_name || s.username)?.charAt(0)}</span>
                              </div>
                              <div>
                                <p className="font-medium text-surface-800">
                                  {s.full_name || 'No profile'}
                                  {s.status === 'hold' && (
                                    <span className="ml-2 flat-badge text-[10px] border bg-amber-50 text-amber-700 border-amber-200">Offline</span>
                                  )}
                                  {s.status === 'suspended' && (
                                    <span className="ml-2 flat-badge text-[10px] border bg-danger-50 text-danger-700 border-danger-200">Terminated</span>
                                  )}
                                </p>
                                <p className="text-xs text-surface-400">@{s.username}{s.has_pin ? ' · PIN set' : ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-surface-500">
                            {s.profile_id ? (
                              <span className="text-xs text-surface-600">{s.full_name}</span>
                            ) : (
                              <span className="text-xs text-warning-600">No active profile</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {s.role ? (
                              <span className={`flat-badge border text-xs font-medium ${levelColors[s.access_level] || levelColors[3]}`}>
                                {getRoleLabel(s.role)} · L{s.access_level}
                              </span>
                            ) : (
                              <span className="text-xs text-surface-400">—</span>
                            )}
                          </td>
                            {user?.access_level === 1 && (
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {!!s.profile_id && (
                                  <>
                                    {s.status === 'active' ? (
                                      s.profile_id !== protectedAdminProfileId ? (
                                        <button onClick={() => handleSetOffline(s.profile_id, s.full_name, true)} disabled={busyProfile === s.profile_id}
                                          className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors" title="Set offline (block login)">
                                          {busyProfile === s.profile_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiOff className="w-4 h-4" />}
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-danger-50 text-danger-700 border border-danger-200"
                                          title="Protected — the first admin cannot be taken offline, archived or terminated. No other admin would remain to bring them back online.">
                                          <Shield className="w-3.5 h-3.5" /> Protected
                                        </span>
                                      )
                                    ) : (
                                      <button onClick={() => handleSetOffline(s.profile_id, s.full_name, false)} disabled={busyProfile === s.profile_id}
                                        className="p-1.5 rounded-lg text-success-600 hover:bg-success-50 transition-colors" title="Bring online">
                                        {busyProfile === s.profile_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                      </button>
                                    )}
                                    {s.status === 'suspended' ? (
                                      <button onClick={() => handleReactivateProfile(s.profile_id, s.full_name)} disabled={busyProfile === s.profile_id}
                                        className="p-1.5 rounded-lg text-success-600 hover:bg-success-50 transition-colors" title="Reactivate account">
                                        <RotateCcw className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      s.profile_id !== protectedAdminProfileId && (
                                        <>
                                          <button onClick={() => handleArchiveProfile(s.profile_id, s.full_name)} disabled={busyProfile === s.profile_id}
                                            className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors" title="Send to archive">
                                            <Archive className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => handleTerminateProfile(s.profile_id, s.full_name)} disabled={busyProfile === s.profile_id}
                                            className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors" title="Terminate account">
                                            <UserX className="w-4 h-4" />
                                          </button>
                                        </>
                                      )
                                    )}
                                    <button onClick={() => { setPinTarget(s); setNewPin(''); }}
                                      className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors" title={s.has_pin ? 'Change PIN' : 'Set PIN'}>
                                      <KeyRound className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                <button onClick={() => { setProfForm({ user_id: s.id, full_name: '', email: '', role: 'editorial', access_level: 3, password_hint: '' }); setShowNewProfile(true); }}
                                  className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors" title="Assign new profile">
                                  <UserPlus className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* PROFILES TAB */}
      {tab === 'profiles' && (
        loadP ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-accent-600 animate-spin" /></div>
        ) : profiles.length === 0 ? (
          <div className="flat-card-static text-center py-12">
            <UserCheck className="w-10 h-10 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-400">No active profiles</p>
          </div>
        ) : (
          <div className="flat-card-static overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="text-left px-4 py-3 font-medium text-surface-500">Profile</th>
                    <th className="text-left px-4 py-3 font-medium text-surface-500">User</th>
                    <th className="text-left px-4 py-3 font-medium text-surface-500">Role / Level</th>
                    <th className="text-left px-4 py-3 font-medium text-surface-500">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-surface-500">Created</th>
                    {user?.access_level === 1 && <th className="text-right px-4 py-3 font-medium text-surface-500">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-accent-100 rounded-xl flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-accent-700">{p.full_name?.charAt(0)}</span>
                          </div>
                          <p className="font-medium text-surface-800">{p.full_name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-surface-500 text-xs">@{p.username}</td>
                      <td className="px-4 py-3">
                        <span className={`flat-badge border text-xs font-medium ${levelColors[p.access_level] || levelColors[3]}`}>
                          {getRoleLabel(p.role)} · L{p.access_level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.is_active ? (
                          <span className={`flat-badge text-[10px] border ${p.status === 'hold' ? 'bg-amber-50 text-amber-700 border-amber-200' : p.status === 'suspended' ? 'bg-danger-50 text-danger-700 border-danger-200' : 'bg-success-50 text-success-700 border-success-200'}`}>
                            {p.status === 'hold' ? 'Offline' : p.status === 'suspended' ? 'Terminated' : 'Active'}
                          </span>
                        ) : (
                          <span className="text-xs text-surface-400">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-400 text-right">{p.created_at?.slice(0, 10)}</td>
                      {user?.access_level === 1 && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!!p.is_active && (
                              <>
                                {p.status === 'active' ? (
                                  p.id !== protectedProfileId ? (
                                    <button onClick={() => handleSetOffline(p.id, p.full_name, true)} disabled={busyProfile === p.id}
                                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors" title="Set offline (block login)">
                                      {busyProfile === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiOff className="w-4 h-4" />}
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-danger-50 text-danger-700 border border-danger-200"
                                      title="Protected — the first admin cannot be taken offline, archived or terminated. No other admin would remain to bring them back online.">
                                      <Shield className="w-3.5 h-3.5" /> Protected
                                    </span>
                                  )
                                ) : (
                                  <button onClick={() => handleSetOffline(p.id, p.full_name, false)} disabled={busyProfile === p.id}
                                    className="p-1.5 rounded-lg text-success-600 hover:bg-success-50 transition-colors" title="Bring online">
                                    {busyProfile === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                  </button>
                                )}
                                {p.status === 'suspended' ? (
                                  <button onClick={() => handleReactivateProfile(p.id, p.full_name)} disabled={busyProfile === p.id}
                                    className="p-1.5 rounded-lg text-success-600 hover:bg-success-50 transition-colors" title="Reactivate account">
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                ) : (
                                  p.id !== protectedProfileId && (
                                    <>
                                      <button onClick={() => handleArchiveProfile(p.id, p.full_name)} disabled={busyProfile === p.id}
                                        className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors" title="Send to archive">
                                        <Archive className="w-4 h-4" />
                                      </button>
                                      <button onClick={() => handleTerminateProfile(p.id, p.full_name)} disabled={busyProfile === p.id}
                                        className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors" title="Terminate account">
                                        <UserX className="w-4 h-4" />
                                      </button>
                                    </>
                                  )
                                )}
                              </>
                            )}
                            <button onClick={() => { setEditProfile(p); setEditForm({ full_name: p.full_name, email: p.email || '', role: p.role, access_level: p.access_level, password_hint: p.password_hint || '', shift_type: p.shift_type || 'general', shift_start: p.shift_start || '09:00', shift_end: p.shift_end || '17:00', weekly_off: p.weekly_off || '[]' }); }}
                              className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors" title="Edit profile">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setChangePasswordTarget(p); setChangePasswordForm({ password: '', confirm: '' }); }}
                              className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors" title="Change password">
                              <KeyRound className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ARCHIVED TAB */}
      {tab === 'archived' && (
        loadP ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-accent-600 animate-spin" /></div>
        ) : archived.length === 0 ? (
          <div className="flat-card-static text-center py-12">
            <Archive className="w-10 h-10 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-400">No archived profiles</p>
          </div>
        ) : (
          <div className="flat-card-static overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="text-left px-4 py-3 font-medium text-surface-500">Archived Profile</th>
                    <th className="text-left px-4 py-3 font-medium text-surface-500">Original User</th>
                    <th className="text-left px-4 py-3 font-medium text-surface-500">Role / Level</th>
                    <th className="text-left px-4 py-3 font-medium text-surface-500">Deactivated</th>
                    {user?.access_level === 1 && <th className="text-right px-4 py-3 font-medium text-surface-500">Restore</th>}
                  </tr>
                </thead>
                <tbody>
                  {archived.map((p) => (
                    <tr key={p.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-surface-200 rounded-xl flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-surface-500">{p.full_name?.charAt(0)}</span>
                          </div>
                          <p className="font-medium text-surface-600 line-through">{p.full_name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-400">@{p.username}</td>
                      <td className="px-4 py-3">
                        <span className="flat-badge border text-xs font-medium text-surface-500 border-surface-200">
                          {getRoleLabel(p.role)} · L{p.access_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-400">{p.deactivated_at?.slice(0, 10) || '—'}</td>
                      {user?.access_level === 1 && (
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => { setShowRestore(p); setRestoreTarget(p.user_id); }}
                            className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors" title="Restore profile">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* LEAVES TAB */}
      {tab === 'pending' && (
        <div className="space-y-4">
          {loadingPending ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>
          ) : (
            <>
              {/* Pending Signups */}
              <div className="flat-card">
                <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-accent-500" /> Pending Signups
                  {pendingSignups.length > 0 && (
                    <span className="bg-danger-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingSignups.length}</span>
                  )}
                </h3>
                {pendingSignups.length === 0 ? (
                  <p className="text-sm text-surface-400 py-4 text-center">No pending signup requests.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingSignups.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-surface-200 bg-surface-50">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-accent-100 rounded-xl flex items-center justify-center">
                            <span className="text-sm font-bold text-accent-700">{s.full_name?.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-surface-800">{s.full_name}</p>
                            <p className="text-[11px] text-surface-400">{s.role} {s.email ? `· ${s.email}` : ''}</p>
                            <p className="text-[11px] text-surface-300">@{s.username} · {s.created_at?.slice(0, 10)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleApproveSignup(s.id)} disabled={approvingSignup === s.id}
                            className="flat-btn-sm">
                            {approvingSignup === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Approve
                          </button>
                          <button onClick={() => handleRejectSignup(s.id)} disabled={approvingSignup === s.id}
                            className="flat-btn-sm">
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* PIN Requests */}
              <div className="flat-card">
                <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-accent-500" /> PIN Requests
                  {pinRequests.length > 0 && (
                    <span className="bg-danger-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pinRequests.length}</span>
                  )}
                </h3>
                {pinRequests.length === 0 ? (
                  <p className="text-sm text-surface-400 py-4 text-center">No pending PIN requests.</p>
                ) : (
                  <div className="space-y-2">
                    {pinRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-surface-200 bg-surface-50">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-warning-50 rounded-xl flex items-center justify-center">
                            <KeyRound className="w-4 h-4 text-warning-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-surface-800">{r.full_name || 'Unknown'}</p>
                            <p className="text-[11px] text-surface-400">{r.role || '—'} · {r.created_at?.slice(0, 10)}</p>
                          </div>
                        </div>
                        <button onClick={() => {
                          const seat = seats.find((s) => s.profile_id === r.profile_id);
                          if (seat) { setPinRequestNotifId(r.id); setPinTarget(seat); }
                          else toast('Set PIN from the Seats tab', 'info');
                        }} className="flat-btn-sm">
                          <KeyRound className="w-3 h-3" /> Set PIN
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Leaves */}
              {(user?.access_level ?? 3) <= 2 && (
                <div className="flat-card">
                  <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-accent-500" /> Pending Leaves
                    {pendingLeaves.length > 0 && (
                      <span className="bg-danger-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingLeaves.length}</span>
                    )}
                  </h3>
                  {pendingLeaves.length === 0 ? (
                    <p className="text-sm text-surface-400 py-4 text-center">No pending leave requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {pendingLeaves.map((lv) => (
                        <div key={lv.id} className="flex items-center justify-between p-3 rounded-xl border border-surface-200 bg-surface-50">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                              <CalendarClock className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-surface-800">{lv.profile_name || 'Unknown'}</p>
                              <p className="text-[11px] text-surface-400">{lv.profile_role || '—'} · {lv.start_date} → {lv.end_date}{lv.arrangement_name ? ` · Cover: ${lv.arrangement_name}` : ''}</p>
                              <p className="text-[11px] text-surface-500 mt-0.5">"{lv.reason}"</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => handleApproveLeave(lv.id)} disabled={approvingLeave === lv.id}
                              className="flat-btn-sm">
                              {approvingLeave === lv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              Approve
                            </button>
                            <button onClick={() => handleRejectLeave(lv.id)} disabled={approvingLeave === lv.id}
                              className="flat-btn-sm">
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'leaves' && <LeavesTab profiles={profiles} user={user} />}

      {/* NEW PROFILE MODAL */}
      {showNewProfile && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowNewProfile(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-surface-800 mb-1">New Profile</h3>
              <p className="text-xs text-surface-400 mb-4">This will replace the current active profile. The old one is archived.</p>
              <form onSubmit={handleCreateProfile} className="space-y-4">
                <div>
                  <label className="flat-label">Full Name *</label>
                  <input className="flat-input" required value={profForm.full_name}
                    onChange={(e) => setProfForm({ ...profForm, full_name: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Email</label>
                  <input type="email" className="flat-input" value={profForm.email}
                    onChange={(e) => setProfForm({ ...profForm, email: e.target.value })} placeholder="optional" />
                </div>
                <div>
                  <label className="flat-label">Password Hint</label>
                  <input className="flat-input" value={profForm.password_hint}
                    onChange={(e) => setProfForm({ ...profForm, password_hint: e.target.value })} placeholder="shown when wrong password entered" />
                </div>
                <div>
                  <label className="flat-label">Role *</label>
                  <select className="flat-select" required value={profForm.role}
                    onChange={(e) => {
                      const role = ROLES.find(r => r.id === e.target.value);
                      setProfForm({ ...profForm, role: e.target.value, access_level: role ? role.defaultLevel : 3 });
                    }}>
                    {ROLES.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="flat-label">Access Level</label>
                  <select className="flat-select" value={profForm.access_level}
                    onChange={(e) => setProfForm({ ...profForm, access_level: Number(e.target.value) })}>
                    {ACCESS_LEVELS.map((l) => (<option key={l.value} value={l.value}>Level {l.value} — {l.label}</option>))}
                  </select>
                </div>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowNewProfile(false)} className="flat-btn-surface">Cancel</button>
                  <button type="submit" disabled={savingProf} className="flat-btn-accent">
                    {savingProf ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    {savingProf ? 'Creating...' : 'Create Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* RESTORE MODAL */}
      {showRestore && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowRestore(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-surface-800 mb-1">Restore Profile</h3>
              <p className="text-xs text-surface-400 mb-4">
                Restore <strong>{showRestore.full_name}</strong> to a user seat. The current profile will be archived.
              </p>
              <div className="mb-4">
                <label className="flat-label">Target User Seat</label>
                <select className="flat-select" value={restoreTarget} onChange={(e) => setRestoreTarget(Number(e.target.value))}>
                  {seats.map((s) => (
                    <option key={s.id} value={s.id}>@{s.username} — {s.full_name || 'No profile'}</option>
                  ))}
                </select>
                </div>
                <div className="flex gap-3 justify-end">
                <button onClick={() => setShowRestore(null)} className="flat-btn-surface">Cancel</button>
                <button onClick={handleRestore} className="flat-btn-accent">
                  <RotateCcw className="w-4 h-4" /> Restore
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* EDIT PROFILE MODAL */}
      {editProfile && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setEditProfile(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-surface-800 mb-1">Edit Profile</h3>
              <p className="text-xs text-surface-400 mb-4">Update details for <strong>{editProfile.full_name}</strong></p>
              <form onSubmit={handleEditProfile} className="space-y-4">
                <div>
                  <label className="flat-label">Full Name *</label>
                  <input className="flat-input" required value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Email</label>
                  <input type="email" className="flat-input" value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="optional" />
                </div>
                <div>
                  <label className="flat-label">Role *</label>
                  <select className="flat-select" required value={editForm.role}
                    onChange={(e) => {
                      const role = ROLES.find(r => r.id === e.target.value);
                      setEditForm({ ...editForm, role: e.target.value, access_level: role ? role.defaultLevel : 3 });
                    }}>
                    {ROLES.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="flat-label">Access Level</label>
                  <select className="flat-select" value={editForm.access_level}
                    onChange={(e) => setEditForm({ ...editForm, access_level: Number(e.target.value) })}>
                    {ACCESS_LEVELS.map((l) => (<option key={l.value} value={l.value}>Level {l.value} — {l.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="flat-label">Shift Type</label>
                  <select className="flat-select" value={editForm.shift_type}
                    onChange={(e) => {
                      const defaults: Record<string, { start: string; end: string }> = {
                        morning: { start: '06:00', end: '14:00' },
                        general: { start: '09:00', end: '17:00' },
                        evening: { start: '14:00', end: '22:00' },
                      };
                      const d = defaults[e.target.value] || defaults.general;
                      setEditForm({ ...editForm, shift_type: e.target.value, shift_start: d.start, shift_end: d.end });
                    }}>
                    <option value="morning">Morning (06:00–14:00)</option>
                    <option value="general">General (09:00–17:00)</option>
                    <option value="evening">Evening (14:00–22:00)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flat-label">Shift Start</label>
                    <input type="time" className="flat-input" value={editForm.shift_start}
                      onChange={(e) => setEditForm({ ...editForm, shift_start: e.target.value })} />
                  </div>
                  <div>
                    <label className="flat-label">Shift End</label>
                    <input type="time" className="flat-input" value={editForm.shift_end}
                      onChange={(e) => setEditForm({ ...editForm, shift_end: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="flat-label">Weekly Off</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day) => {
                      let offDays: string[] = [];
                      try { offDays = JSON.parse(editForm.weekly_off || '[]'); } catch { offDays = []; }
                      const checked = offDays.includes(day);
                      return (
                        <label key={day} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${checked ? 'bg-danger-50 text-danger-700 border-danger-200' : 'bg-surface-50 text-surface-500 border-surface-200 hover:border-surface-300'}`}>
                          <input type="checkbox" className="sr-only" checked={checked}
                            onChange={() => {
                              const updated = checked ? offDays.filter((d: string) => d !== day) : [...offDays, day];
                              setEditForm({ ...editForm, weekly_off: JSON.stringify(updated) });
                            }} />
                          {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setEditProfile(null)} className="flat-btn-surface">Cancel</button>
                  <button type="submit" disabled={savingEdit} className="flat-btn-accent">
                    {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
      {/* CREATE SEAT MODAL */}
      {creatingRole && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setCreatingRole(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-surface-800 mb-1">Create {getRoleLabel(creatingRole)} Seat</h3>
              <p className="text-xs text-surface-400 mb-4">
                Seat limit: {seatLimits?.counts[creatingRole] || 0}/{SEAT_LIMITS[creatingRole]}
              </p>
              <form onSubmit={handleCreateSeat} className="space-y-4">
                <div>
                  <label className="flat-label">Full Name *</label>
                  <input className="flat-input" required placeholder="e.g. John Doe" value={createForm.full_name}
                    onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} />
                  {createForm.full_name.trim().length > 0 && (
                    <p className="text-xs text-accent-600 mt-1">Username: <strong>@{previewUsername(createForm.full_name)}</strong></p>
                  )}
                </div>
                <div>
                  <PasswordInput label="Password *" required value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                </div>
                <div>
                  <PasswordInput label="Confirm Password *" required value={createForm.confirm}
                    onChange={(e) => setCreateForm({ ...createForm, confirm: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Password Hint (optional)</label>
                  <input className="flat-input" placeholder="e.g. your pet's name" value={createForm.password_hint}
                    onChange={(e) => setCreateForm({ ...createForm, password_hint: e.target.value })} />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setCreatingRole(null)} className="flat-btn-surface">Cancel</button>
                  <button type="submit" disabled={saving} className="flat-btn-accent">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    {saving ? 'Creating...' : 'Create Seat'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
      {/* CHANGE PASSWORD MODAL */}
      {changePasswordTarget && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setChangePasswordTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-surface-800 mb-1">Change Password</h3>
              <p className="text-xs text-surface-400 mb-4">Set new password for <strong>{changePasswordTarget.full_name}</strong> (@{changePasswordTarget.username})</p>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <PasswordInput label="New Password *" required minLength={6} value={changePasswordForm.password}
                    onChange={(e) => setChangePasswordForm({ ...changePasswordForm, password: e.target.value })} />
                </div>
                <div>
                  <PasswordInput label="Confirm Password *" required minLength={6} value={changePasswordForm.confirm}
                    onChange={(e) => setChangePasswordForm({ ...changePasswordForm, confirm: e.target.value })} />
                </div>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setChangePasswordTarget(null)} className="flat-btn-surface">Cancel</button>
                  <button type="submit" disabled={savingChangePassword} className="flat-btn-accent">
                    {savingChangePassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    {savingChangePassword ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
      {/* PIN MODAL */}
      {pinTarget && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setPinTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-xs shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-accent-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-6 h-6 text-accent-600" />
                </div>
                <h3 className="text-sm font-semibold text-surface-800">
                  {pinTarget.has_pin ? 'Change PIN' : 'Set PIN'}
                </h3>
                <p className="text-xs text-surface-400 mt-1">{pinTarget.full_name}</p>
              </div>
              <input type="text" inputMode="numeric" maxLength={4} autoFocus
                className="flat-input text-center text-lg tracking-[0.3em]"
                placeholder="• • • •" value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter') handleSetPin(); }} />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setPinTarget(null)} className="flat-btn-surface flex-1 justify-center">Cancel</button>
                <button onClick={handleSetPin} disabled={newPin.length !== 4 || savingPin}
                  className="flat-btn-accent flex-1 justify-center disabled:opacity-50">
                  {savingPin ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save PIN'}
                </button>
              </div>
              {pinTarget.has_pin === 1 && (
                <button onClick={handleRemovePin} className="w-full text-xs text-danger-500 hover:text-danger-600 mt-3 font-medium">
                  Remove PIN
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}