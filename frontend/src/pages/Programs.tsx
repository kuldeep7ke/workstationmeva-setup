import { useState, useEffect } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useUndo } from '../context/UndoContext';
import { useAuth } from '../context/AuthContext';
import { canCreateProgram } from '../utils/roles';
import { Plus, Radio, Calendar, User, AlertTriangle, Loader2, Trash2, Play, CheckCircle2, Ban, RotateCcw, Mic, Circle, Activity, Pause, Square } from 'lucide-react';
import { formatLabel } from '../utils/roles';

const statusBadge: Record<string, string> = {
  planned: 'badge-pending', ongoing: 'badge-in_progress',
  completed: 'badge-completed', cancelled: 'badge-cancelled',
  paused: 'bg-surface-100 text-surface-600 border border-surface-200',
};

const statusLabels: Record<string, string> = {
  planned: 'Planned', ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled', paused: 'Paused',
};

const typeColors: Record<string, string> = {
  live_coverage: 'bg-danger-50 text-danger-700',
  special_program: 'bg-blue-50 text-blue-700',
  interview: 'bg-surface-100 text-surface-700',
  event: 'bg-success-50 text-success-700',
};

// Flow buttons per status (Create -> Implements -> Stop / Done). Reset undoes an accidental start.
const FLOW_ACTIONS: Record<string, { label: string; status: string; cls: string; icon: any; confirm?: boolean; tone: string }[]> = {
  planned: [
    { label: 'Start', status: 'ongoing', cls: 'flat-btn-brand', icon: Play, confirm: true, tone: 'start' },
    { label: 'Cancel', status: 'cancelled', cls: 'flat-btn-danger-ghost', icon: Ban, confirm: true, tone: 'cancel' },
  ],
  ongoing: [
    { label: 'Pause', status: 'paused', cls: 'flat-btn-surface', icon: Pause, tone: 'pause' },
    { label: 'Stop', status: 'completed', cls: 'flat-btn-success', icon: Square, confirm: true, tone: 'stop' },
    { label: 'Reset', status: 'planned', cls: 'flat-btn-ghost', icon: RotateCcw, confirm: true, tone: 'reset' },
    { label: 'Cancel', status: 'cancelled', cls: 'flat-btn-danger-ghost', icon: Ban, confirm: true, tone: 'cancel' },
  ],
  paused: [
    { label: 'Resume', status: 'ongoing', cls: 'flat-btn-brand', icon: Play, tone: 'resume' },
    { label: 'Stop', status: 'completed', cls: 'flat-btn-success', icon: Square, confirm: true, tone: 'stop' },
    { label: 'Reset', status: 'planned', cls: 'flat-btn-ghost', icon: RotateCcw, confirm: true, tone: 'reset' },
    { label: 'Cancel', status: 'cancelled', cls: 'flat-btn-danger-ghost', icon: Ban, confirm: true, tone: 'cancel' },
  ],
  completed: [],
  cancelled: [
    { label: 'Reopen', status: 'planned', cls: 'flat-btn-surface', icon: RotateCcw, tone: 'reopen' },
  ],
};

const VERBS: Record<string, string> = {
  start: 'started', resume: 'resumed', pause: 'paused', stop: 'stopped',
  reset: 'reset to planned', cancel: 'cancelled', reopen: 'reopened',
};

const CONFIRM_TONES: Record<string, { title: string; desc: string; btnLabel: string; btnCls: string; bg: string; color: string; icon: any }> = {
  start: { title: 'Start Program?', desc: 'Moves to Ongoing. Implementation begins now.', btnLabel: 'Start Program', btnCls: 'flat-btn-brand', bg: 'bg-accent-50', color: 'text-accent-600', icon: Play },
  resume: { title: 'Resume Program?', desc: 'Moves back to Ongoing.', btnLabel: 'Resume Program', btnCls: 'flat-btn-brand', bg: 'bg-accent-50', color: 'text-accent-600', icon: Play },
  stop: { title: 'Stop Program?', desc: 'Marks this program as Completed.', btnLabel: 'Stop Program', btnCls: 'flat-btn-success', bg: 'bg-success-50', color: 'text-success-600', icon: CheckCircle2 },
  reset: { title: 'Reset to Planned?', desc: 'Undo the start. Program goes back to Planned.', btnLabel: 'Reset to Planned', btnCls: 'flat-btn-surface', bg: 'bg-surface-100', color: 'text-surface-600', icon: RotateCcw },
  cancel: { title: 'Cancel Program?', desc: 'Cancelled programs can be reopened anytime.', btnLabel: 'Cancel Program', btnCls: 'flat-btn-danger', bg: 'bg-danger-50', color: 'text-danger-600', icon: Ban },
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatTime = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hh = Number(h);
  if (Number.isNaN(hh)) return t;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hr = hh % 12 || 12;
  return `${hr}:${m} ${suffix}`;
};

const makeEmptyForm = () => ({ title: '', program_type: 'special_program', description: '', schedule_date: todayStr(), schedule_time: '', assigned_to: '', reporter_id: '' });

export default function Programs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { showUndo } = useUndo();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [reporters, setReporters] = useState<any[]>([]);
  const [form, setForm] = useState(makeEmptyForm);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'planned' | 'ongoing' | 'paused' | 'completed' | 'cancelled'>('planned');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; title: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ p: any; action: any } | null>(null);
  const [statusBusy, setStatusBusy] = useState<number | null>(null);

  const canCreate = canCreateProgram(user);
  const isAdmin = (user?.access_level || 3) <= 2;

  const fetch = () => {
    setLoading(true);
    setErr('');
    api.get('/programs').then((res) => setPrograms(res.data))
      .catch(() => setErr('Failed to load programs')).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);
  useEffect(() => {
    if (showCreate) {
      Promise.all([
        api.get('/users/available', { params: { role: 'video_editor' } }).catch(() => ({ data: [] })),
        api.get('/users/available', { params: { role: 'anchor' } }).catch(() => ({ data: [] })),
      ]).then(([editors, anchors]) => {
        setUsers([...editors.data, ...anchors.data]);
      });
      api.get('/reporters').then((res) => setReporters(Array.isArray(res.data) ? res.data : [])).catch(() => {});
    }
  }, [showCreate]);

  const canUpdateProgram = (p: any) =>
    isAdmin || user?.profile_id === p.assigned_to || user?.profile_id === p.created_by;
  // Deleting (trash) is reserved for managers/admins or the program owner.
  const canDeleteProgram = (p: any) =>
    isAdmin || user?.profile_id === p.assigned_to || user?.profile_id === p.created_by;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required'); return; }
    if (!form.program_type) { setErr('Program type is required'); return; }
    setErr('');
    setSaving(true);
    try {
      const res = await api.post('/programs', {
        title: form.title.trim(), program_type: form.program_type,
        description: form.description, schedule_date: form.schedule_date || null,
        schedule_time: form.schedule_time || null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        reporter_id: form.reporter_id ? Number(form.reporter_id) : null,
      });
      toast('Program created', 'success');
      showUndo('Program created', async () => {
        await api.delete(`/programs/${res.data.id}`);
        fetch();
      });
      setShowCreate(false);
      setForm(makeEmptyForm());
      fetch();
    } catch (err: any) {
      setErr(err.response?.data?.error || 'Failed to create program');
    } finally { setSaving(false); }
  };

  const runAction = (p: any, action: any) => {
    if (action.confirm) setConfirmAction({ p, action });
    else updateStatus(p, action);
  };

  const doConfirm = async () => {
    if (!confirmAction) return;
    const { p, action } = confirmAction;
    setConfirmAction(null);
    await updateStatus(p, action);
  };

  const updateStatus = async (p: any, action: any) => {
    setStatusBusy(p.id);
    try {
      await api.put(`/programs/${p.id}`, { status: action.status });
      if (action.tone === 'cancel') {
        showUndo('Program cancelled', async () => {
          await api.put(`/programs/${p.id}`, { status: p.status });
          fetch();
        });
      }
      toast(`Program ${VERBS[action.tone] || action.status}`, 'success');
      fetch();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update status', 'error');
    } finally { setStatusBusy(null); }
  };

  const deleteProgram = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/programs/${deleteConfirm.id}`);
      toast('Program moved to recycle bin', 'success');
      setDeleteConfirm(null);
      fetch();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to delete program', 'error');
    }
  };

  const filtered = filter === 'all' ? programs : programs.filter((p: any) => p.status === filter);
  const counts = {
    all: programs.length,
    planned: programs.filter((p: any) => p.status === 'planned').length,
    ongoing: programs.filter((p: any) => p.status === 'ongoing').length,
    paused: programs.filter((p: any) => p.status === 'paused').length,
    completed: programs.filter((p: any) => p.status === 'completed').length,
    cancelled: programs.filter((p: any) => p.status === 'cancelled').length,
  };

  const FILTERS: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'planned', label: 'Planned' },
    { id: 'ongoing', label: 'Ongoing' },
    { id: 'paused', label: 'Paused' },
    { id: 'completed', label: 'Done' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Special Programs</h1>
          <p className="text-sm text-surface-400 mt-0.5">Plan, implement and complete programs — live coverage, interviews & events</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(!showCreate)} className="flat-btn-brand self-start">
            <Plus className="w-4 h-4 icon-bounce" /> New Program
          </button>
        )}
      </div>

      {showCreate && canCreate && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-1">Create Program</h3>
          <p className="text-xs text-surface-400 mb-4">A new program starts in <span className="badge-pending">Planned</span> — start it when implementation begins.</p>
          <form onSubmit={handleCreate} className="space-y-4">
            {err && <div className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-xs text-danger-700">{err}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="flat-label">Program Title *</label>
                <input className="flat-input" required placeholder="e.g. Ganpati Visarjan Live Coverage" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Program Type *</label>
                <select className="flat-select" value={form.program_type}
                  onChange={(e) => setForm({ ...form, program_type: e.target.value })}>
                  <option value="special_program">Special Program</option>
                  <option value="live_coverage">Live Coverage</option>
                  <option value="interview">Interview</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div>
                <label className="flat-label">Schedule Date</label>
                <input type="date" className="flat-input" value={form.schedule_date}
                  onChange={(e) => setForm({ ...form, schedule_date: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Schedule Time</label>
                <input type="time" className="flat-input" value={form.schedule_time}
                  onChange={(e) => setForm({ ...form, schedule_time: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Assign To</label>
                <select className="flat-select" value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                  <option value="">Select anchor or video editor</option>
                  <optgroup label="Anchors">
                    {users.filter((u) => u.role === 'anchor').map((u) => (
                      <option key={u.id} value={u.profile_id || u.id}>{u.full_name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Video Editors">
                    {users.filter((u) => u.role === 'video_editor').map((u) => (
                      <option key={u.id} value={u.profile_id || u.id}>{u.full_name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="flat-label">Reporter</label>
                <select className="flat-select" value={form.reporter_id}
                  onChange={(e) => setForm({ ...form, reporter_id: e.target.value })}>
                  <option value="">No reporter</option>
                  {reporters.filter((r) => r.status !== 'inactive').map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Description</label>
                <textarea className="flat-input" rows={3} placeholder="Program brief, guests, crew requirements..." value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowCreate(false); setErr(''); }} className="flat-btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="flat-btn-brand">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Creating...' : 'Create Program'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.id
              ? 'bg-accent-600 text-white'
              : 'bg-surface-50 border border-surface-200 text-surface-500 hover:text-surface-700'}`}>
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : err ? (
        <div className="flat-card-static text-center py-12">
          <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
          <p className="text-surface-500">{err}</p>
          <button onClick={fetch} className="flat-btn-brand mt-4">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flat-card-static text-center py-12">
          <Radio className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-400">{filter === 'all' ? 'No programs scheduled' : `No ${filter} programs`}</p>
          {filter === 'all' && canCreate && (
            <button onClick={() => setShowCreate(true)} className="flat-btn-brand mt-4"><Plus className="w-4 h-4" /> Create first program</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="flat-card flex flex-col">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`${statusBadge[p.status] || 'badge-pending'} ${p.status === 'ongoing' ? 'icon-live' : ''}`}>
                  {p.status === 'ongoing' && <Activity className="w-3 h-3 inline -mt-0.5 mr-1" />}
                  {p.status === 'paused' && <Pause className="w-3 h-3 inline -mt-0.5 mr-1" />}
                  {statusLabels[p.status] || p.status}
                </span>
                <span className={`flat-badge text-xs font-medium ${typeColors[p.program_type] || 'bg-surface-100 text-surface-600'}`}>
                  {formatLabel(p.program_type)}
                </span>
                <span className="text-[11px] font-mono text-surface-300">{p.uid}</span>
                {canDeleteProgram(p) && p.status !== 'completed' && (
                  <button onClick={() => setDeleteConfirm({ id: p.id, title: p.title })}
                    className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors ml-auto"
                    title="Move to recycle bin">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
                <Radio className="w-4 h-4 text-accent-500 shrink-0" /> {p.title}
                {p.status === 'ongoing' && <span className="w-2 h-2 rounded-full bg-danger-500 icon-live" />}
              </h3>
              {p.description && <p className="text-sm text-surface-500 mt-1 line-clamp-2">{p.description}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-surface-400">
                {p.schedule_date && (
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {p.schedule_date}{p.schedule_time ? `, ${formatTime(p.schedule_time)}` : ''}</span>
                )}
                {p.assigned_to_name && (
                  <span className="flex items-center gap-1"><User className="w-3 h-3" /> {p.assigned_to_name}</span>
                )}
                {p.reporter_name && (
                  <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {p.reporter_name}</span>
                )}
                {p.created_by_name && !p.assigned_to_name && (
                  <span className="flex items-center gap-1"><Circle className="w-3 h-3" /> {p.created_by_name}</span>
                )}
                {p.completed_at && (
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success-500" /> Done {p.completed_at?.slice(0, 10)}</span>
                )}
              </div>

              {canUpdateProgram(p) && FLOW_ACTIONS[p.status]?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-surface-100">
                  {FLOW_ACTIONS[p.status].map((a) => (
                    <button key={a.status} onClick={() => runAction(p, a)} disabled={statusBusy === p.id}
                      className={`flat-btn-sm ${a.cls}`}>
                      {statusBusy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <a.icon className="w-3.5 h-3.5" />}
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Delete Program</h3>
                <p className="text-xs text-surface-500">Moves to recycle bin. You can restore it later.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete "{deleteConfirm.title}"?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flat-btn-sm flat-btn-surface">Keep it</button>
              <button onClick={deleteProgram} className="flat-btn-sm flat-btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (() => {
        const tone = CONFIRM_TONES[confirmAction.action.tone] || CONFIRM_TONES.start;
        const Icon = tone.icon;
        return (
          <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setConfirmAction(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tone.bg}`}>
                  <Icon className={`w-5 h-5 ${tone.color}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-surface-800">{tone.title}</h3>
                  <p className="text-xs text-surface-500">{tone.desc}</p>
                </div>
              </div>
              <p className="text-sm text-surface-600 mb-4">"{confirmAction.p.title}"</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmAction(null)} className="flat-btn-sm flat-btn-surface">Keep it</button>
                <button onClick={doConfirm} className={`flat-btn-sm ${tone.btnCls}`}>{tone.btnLabel}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
