import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Save, Lock, User, Loader2, CalendarClock, Clock, CheckCircle, XCircle, Send } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState({
    username: user?.username || '',
    email: user?.email || '',
    full_name: user?.full_name || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', newPw: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ reason: '', start_date: '', end_date: '', arrangement_profile_id: '' });
  const [savingLeave, setSavingLeave] = useState(false);
  const [sameRoleProfiles, setSameRoleProfiles] = useState<any[]>([]);

  useEffect(() => {
    setLoadingLeaves(true);
    api.get('/leaves/my').then((res) => setMyLeaves(res.data)).catch(() => {})
      .finally(() => setLoadingLeaves(false));
  }, [user?.profile_id]);

  useEffect(() => {
    if (user?.role) {
      api.get(`/users/available?role=${user.role}`).then((res) => {
        setSameRoleProfiles((res.data || []).filter((p: any) => p.profile_id !== user.profile_id));
      }).catch(() => {});
    }
  }, [user?.role, user?.profile_id]);

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.reason || !leaveForm.start_date || !leaveForm.end_date) {
      toast('Reason, start and end date required', 'error');
      return;
    }
    setSavingLeave(true);
    try {
      await api.post('/leaves', {
        reason: leaveForm.reason,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        arrangement_profile_id: leaveForm.arrangement_profile_id || undefined,
      });
      toast('Leave request submitted', 'success');
      setShowLeaveForm(false);
      setLeaveForm({ reason: '', start_date: '', end_date: '', arrangement_profile_id: '' });
      api.get('/leaves/my').then((res) => setMyLeaves(res.data)).catch(() => {});
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to submit leave', 'error');
    } finally { setSavingLeave(false); }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put('/auth/me/profile', profile);
      toast('Profile updated', 'success');
      await refreshUser();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update profile', 'error');
    } finally { setSavingProfile(false); }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPw !== passwords.confirm) {
      toast('Passwords do not match', 'error');
      return;
    }
    if (passwords.newPw.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await api.post('/auth/change-password', {
        new_password: passwords.newPw,
        current_password: passwords.current,
      });
      toast('Password changed', 'success');
      setPasswords({ current: '', newPw: '', confirm: '' });
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to change password', 'error');
    } finally { setSavingPw(false); }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Profile</h1>
          <p className="text-sm text-surface-400 mt-0.5">Manage your account</p>
        </div>
      </div>

      <div className="flat-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-700 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-accent-500" /> My Leave Requests
          </h3>
          <button onClick={() => setShowLeaveForm(!showLeaveForm)} className="flat-btn-accent text-xs">
            {showLeaveForm ? 'Cancel' : 'Request Leave'}
          </button>
        </div>

        {showLeaveForm && (
          <form onSubmit={handleLeaveSubmit} className="mb-5 p-4 rounded-xl border border-surface-200 bg-surface-50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="flat-label">Reason *</label>
                <input className="flat-input" required value={leaveForm.reason} placeholder="Why are you taking leave?"
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Start Date *</label>
                <input type="date" className="flat-input" required value={leaveForm.start_date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">End Date *</label>
                <input type="date" className="flat-input" required value={leaveForm.end_date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Arrangement (cover)</label>
                <select className="flat-select" value={leaveForm.arrangement_profile_id}
                  onChange={(e) => setLeaveForm({ ...leaveForm, arrangement_profile_id: e.target.value })}>
                  <option value="">No arrangement</option>
                  {sameRoleProfiles.map((p: any) => (
                    <option key={p.profile_id} value={p.profile_id}>{p.full_name}</option>
                  ))}
                </select>
                {sameRoleProfiles.length === 0 && (
                  <p className="text-[11px] text-surface-400 mt-1">No other {user?.role} profiles available for cover.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowLeaveForm(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button type="submit" disabled={savingLeave} className="flat-btn-accent text-xs">
                {savingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {savingLeave ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
        {loadingLeaves ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>
        ) : myLeaves.length === 0 ? (
          <div className="text-center py-8">
            <CalendarClock className="w-10 h-10 text-surface-300 mx-auto mb-2" />
            <p className="text-sm text-surface-400">No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myLeaves.slice(0, 7).map((lv) => (
              <div key={lv.id} className="flex items-center justify-between p-3 rounded-xl border border-surface-200">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-800 truncate">{lv.reason}</p>
                  <p className="text-[11px] text-surface-400">{lv.start_date?.slice(0, 10)} → {lv.end_date?.slice(0, 10)}{lv.arrangement_name ? ` · Cover: ${lv.arrangement_name}` : ''}</p>
                </div>
                <span className={`flat-badge text-xs font-medium border shrink-0 ml-3 ${
                  lv.status === 'pending' ? 'bg-warning-50 text-warning-700 border-warning-200' :
                  lv.status === 'approved' ? 'bg-success-50 text-success-700 border-success-200' :
                  'bg-danger-50 text-danger-700 border-danger-200'
                }`}>
                  {lv.status === 'pending' && <Clock className="w-3 h-3 inline mr-1" />}
                  {lv.status === 'approved' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                  {lv.status === 'rejected' && <XCircle className="w-3 h-3 inline mr-1" />}
                  {lv.status.charAt(0).toUpperCase() + lv.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flat-card">
        <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-accent-500" /> Profile Information
        </h3>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flat-label">Full Name</label>
              <input className="flat-input" value={profile.full_name}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            </div>
            <div>
              <label className="flat-label">Username</label>
              <input className="flat-input bg-surface-100 text-surface-500 cursor-not-allowed" value={profile.username} readOnly tabIndex={-1} />
            </div>
            <div className="sm:col-span-2">
              <label className="flat-label">Email</label>
              <input type="email" className="flat-input" value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingProfile} className="flat-btn-accent">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="flat-card">
        <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-accent-500" /> Change Password
        </h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <PasswordInput label="Current Password" required value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <PasswordInput label="New Password" required minLength={6} value={passwords.newPw}
                onChange={(e) => setPasswords({ ...passwords, newPw: e.target.value })} />
            </div>
            <div>
              <PasswordInput label="Confirm New Password" required minLength={6} value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingPw} className="flat-btn-accent">
              {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {savingPw ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
