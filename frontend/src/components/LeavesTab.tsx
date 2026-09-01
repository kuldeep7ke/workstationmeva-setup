import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { CalendarClock, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-warning-50 text-warning-700 border-warning-200',
  approved: 'bg-success-50 text-success-700 border-success-200',
  rejected: 'bg-danger-50 text-danger-700 border-danger-200',
};

export default function LeavesTab({ profiles, user }: { profiles: any[]; user: any }) {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ profile_id: '', reason: '', start_date: '', end_date: '', arrangement_profile_id: '' });

  const fetchLeaves = () => {
    setLoading(true);
    api.get('/leaves').then(res => setLeaves(res.data)).catch(() => toast('Failed to load leaves', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchLeaves(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reason || !form.start_date || !form.end_date) { toast('Reason, start and end date required', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/leaves', {
        profile_id: form.profile_id || undefined,
        reason: form.reason,
        start_date: form.start_date,
        end_date: form.end_date,
        arrangement_profile_id: form.arrangement_profile_id || undefined,
      });
      toast('Leave request submitted', 'success');
      setShowForm(false);
      setForm({ profile_id: '', reason: '', start_date: '', end_date: '', arrangement_profile_id: '' });
      fetchLeaves();
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id: number, status: string) => {
    try {
      const res = await api.put(`/leaves/${id}`, { status });
      toast(`Leave ${status}`, 'success');
      setLeaves(leaves.map((l: any) => l.id === id ? res.data : l));
    } catch (err: any) { toast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const filteredLeaves = filter === 'all' ? leaves : leaves.filter((l: any) => l.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">Leave requests and approval management</p>
        <button onClick={() => setShowForm(!showForm)} className="flat-btn-brand text-xs">
          {showForm ? 'Cancel' : 'Request Leave'}
        </button>
      </div>

      {showForm && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">Request Leave</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {user?.access_level <= 2 && (
                <div>
                  <label className="flat-label">Profile *</label>
                  <select className="flat-select" required value={form.profile_id}
                    onChange={(e) => setForm({ ...form, profile_id: e.target.value })}>
                    <option value="">Select profile...</option>
                    {profiles.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="flat-label">Reason *</label>
                <input className="flat-input" required value={form.reason} placeholder="Why are you taking leave?"
                  onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Start Date *</label>
                <input type="date" className="flat-input" required value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">End Date *</label>
                <input type="date" className="flat-input" required value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Arrangement (cover)</label>
                <select className="flat-select" value={form.arrangement_profile_id}
                  onChange={(e) => setForm({ ...form, arrangement_profile_id: e.target.value })}>
                  <option value="">No arrangement</option>
                  {profiles.filter((p: any) => p.id !== Number(form.profile_id)).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="flat-btn-accent text-xs">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 w-fit">
        {['all', 'approved', 'rejected'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${filter === s ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-accent-600 animate-spin" /></div>
      ) : filteredLeaves.length === 0 ? (
        <div className="flat-card-static text-center py-12">
          <CalendarClock className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-400">No leave requests found</p>
        </div>
      ) : (
        <div className="flat-card-static overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Profile</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Reason</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Dates</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Arrangement</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Requested</th>
                  {(user?.access_level || 3) <= 2 && <th className="text-right px-4 py-3 font-medium text-surface-500">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredLeaves.map((l: any) => (
                  <tr key={l.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-surface-700">{l.profile_name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-600 max-w-[200px] truncate">{l.reason}</td>
                    <td className="px-4 py-3 text-xs text-surface-600">
                      {l.start_date?.slice(0, 10)} → {l.end_date?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-600">{l.arrangement_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`flat-badge text-xs font-medium border ${STATUS_CLASSES[l.status] || ''}`}>
                        {l.status === 'pending' && <Clock className="w-3 h-3 inline mr-1" />}
                        {l.status === 'approved' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                        {l.status === 'rejected' && <XCircle className="w-3 h-3 inline mr-1" />}
                        {STATUS_LABELS[l.status] || l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-400">{l.created_at?.slice(0, 10)}</td>
                    {(user?.access_level || 3) <= 2 && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {l.status === 'pending' && (
                            <>
                              <button onClick={() => handleApprove(l.id, 'approved')} className="p-1 rounded-lg text-success-600 hover:bg-success-50" title="Approve">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleApprove(l.id, 'rejected')} className="p-1 rounded-lg text-danger-600 hover:bg-danger-50" title="Reject">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
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
  );
}
