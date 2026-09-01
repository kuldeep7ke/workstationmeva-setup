import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { io } from 'socket.io-client';
import {
  AlertTriangle, Loader2, Clock, CheckCircle2,
  Clock4, XCircle, Play, Pencil, Trash2, Layers, ListTodo, Ban,
} from 'lucide-react';

function getMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function fmtTime(timeStr?: string | null): string {
  if (!timeStr) return '—';
  const match = timeStr.match(/\d{2}:\d{2}/);
  return match ? match[0] : timeStr;
}

const PICK_WINDOW = 270; // 4.5 hours before publish time

const GRACE_MINUTES = 60; // 1-hour grace after publish time before expiry

const SHIFT_END = 22 * 60; // evening shift end in minutes (22:00)

const SKIP_REASONS = [
  'Staff Unavailable',
  'Technical Issue',
  'Schedule Change',
  'Holiday / Special Day',
  'Content Not Ready',
  'Replaced by Live Coverage',
  'Replaced by Special Program',
];

type SlotStatus = 'upcoming' | 'available' | 'in_progress' | 'in_grace' | 'done' | 'skipped' | 'expired';

function computeStatus(publishTime: string, now: Date, taskCount: number, doneCount: number, skipReason?: string, hasExpired?: boolean): SlotStatus {
  if (skipReason) return 'skipped';
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const pubMin = getMinutes(publishTime);

  // Past end of last shift (22:00) — day is over
  if (nowMin >= SHIFT_END) {
    if (taskCount > 0 && doneCount < taskCount) return 'expired';
    if (taskCount > 0 && doneCount === taskCount) return 'done';
    return 'skipped';
  }

  // Past publish + grace period with incomplete tasks
  if (taskCount > 0 && doneCount < taskCount && nowMin > pubMin + GRACE_MINUTES) return 'expired';

  // Slot was picked but task expired (only after publish time, otherwise show in_progress)
  if (hasExpired) {
    if (nowMin > pubMin) return 'expired';
    return 'in_progress';
  }

  // Past publish but within grace period
  if (taskCount > 0 && doneCount < taskCount && nowMin > pubMin && nowMin <= pubMin + GRACE_MINUTES) return 'in_grace';

  // All tasks done
  if (taskCount > 0 && doneCount === taskCount) return 'done';

  // Tasks assigned but not all done
  if (taskCount > 0) return 'in_progress';

  // Past publish time — no one picked, slot missed for today
  if (nowMin > pubMin) return 'skipped';

  // Within pick window (4.5 hours before publish)
  if (nowMin >= pubMin - PICK_WINDOW) return 'available';

  return 'upcoming';
}

export default function Bulletins() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [type, setType] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', bulletin_type: 'general' });
  const [err, setErr] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateTime, setTemplateTime] = useState('');
  const [templateNewsCount, setTemplateNewsCount] = useState(5);
  const [templateNewsLevel, setTemplateNewsLevel] = useState('local');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [skipModal, setSkipModal] = useState<{ id: number; reason: string } | null>(null);
  const [hasCustomDefaults, setHasCustomDefaults] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [assignSlot, setAssignSlot] = useState<any>(null);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedAssignUser, setSelectedAssignUser] = useState('');

  const [tab, setTab] = useState('schedule');
  const [onlineProfiles, setOnlineProfiles] = useState<number[]>([]);
  const [confirmPick, setConfirmPick] = useState<any>(null);
  const [confirmUnpick, setConfirmUnpick] = useState<any>(null);

  const navigate = useNavigate();
  const canCreate = (user?.access_level || 3) <= 3;
  const isAdmin = (user?.access_level || 3) <= 1;

  const fetchAll = useCallback(() => {
    setLoading(true);
    setErr('');
    Promise.all([
      api.get(`/bulletins?${new URLSearchParams(type !== 'all' ? { type } : {})}`),
      api.get('/bulletin-templates'),
      api.get('/tasks?all_tasks=true'),
    ])
      .then(([b, t, ts]) => {
        setBulletins(b.data);
        setTemplates(t.data);
        setTasks(ts.data);
      })
      .catch(() => setErr('Failed to load data'))
      .finally(() => setLoading(false));
  }, [type]);

  useEffect(() => { fetchAll(); }, [type]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (isAdmin) {
      api.get('/bulletin-templates/custom-defaults')
        .then((r) => setHasCustomDefaults(r.data.saved))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = io(window.location.origin, {
      auth: { token: localStorage.getItem('token') },
    });
    socket.on('users:online', (users: any[]) => setOnlineProfiles(Array.isArray(users) ? users.map((u: any) => u.profile_id) : []));
    socket.on('task:created', () => fetchAll());
    socket.on('task:updated', () => fetchAll());
    socket.on('task:deleted', () => fetchAll());
    return () => { socket.disconnect(); };
  }, [user?.profile_id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/bulletins', form);
      toast('Bulletin created', 'success');
      setShowCreate(false);
      setForm({ title: '', content: '', bulletin_type: 'general' });
      fetchAll();
    } catch { toast('Failed to create bulletin', 'error'); } finally { setSaving(false); }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) { toast('Name is required', 'error'); return; }
    setSavingTemplate(true);
    try {
      const payload = { name: templateName.trim(), publish_time: templateTime || null, news_count: templateNewsCount, news_level: templateNewsLevel };
      if (editingTemplate) {
        await api.put(`/bulletin-templates/${editingTemplate.id}`, payload);
        toast('Slot updated', 'success');
      } else {
        await api.post('/bulletin-templates', payload);
        toast('Slot created', 'success');
      }
      setShowTemplateForm(false);
      setEditingTemplate(null);
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally { setSavingTemplate(false); }
  };

  const handleDeleteTemplate = async () => {
    if (deleteConfirm === null) return;
    try {
      await api.delete(`/bulletin-templates/${deleteConfirm}`);
      toast('Slot deleted', 'success');
      setDeleteConfirm(null);
      fetchAll();
    } catch { toast('Failed to delete', 'error'); }
  };

  const handlePickSlot = async (template: any) => {
    try {
      await api.post('/tasks', {
        title: `Prepare: ${template.name}`,
        description: '',
        assigned_to: user?.profile_id,
        task_type: 'general',
          priority: 'medium',
          bulletin_template_id: template.id,
          bulletin_date: todayStr,
        });
        toast(`You picked "${template.name}"`, 'success');
      setConfirmPick(null);
      fetchAll();
    } catch (err: any) {
      if (err.response?.status === 409) {
        toast('This slot was already picked by someone else', 'error');
        setConfirmPick(null);
        fetchAll();
      } else {
        toast(err.response?.data?.error || 'Failed to pick slot', 'error');
      }
    }
  };

  const handleUnpickSlot = async (template: any) => {
    const myTask = tasks.find((t: any) => t.bulletin_template_id === template.id && t.bulletin_date === todayStr && t.assigned_to === user?.profile_id && (t.status === 'draft' || t.status === 'script_writing'));
    if (!myTask) return;
    try {
      await api.delete(`/tasks/${myTask.id}`);
      toast(`Unpicked "${template.name}"`, 'success');
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to unpick slot', 'error');
    }
  };

  const handleAssignSlot = async (template: any) => {
    try {
      const existing = tasks.find((t: any) => t.bulletin_template_id === template.id && t.bulletin_date === todayStr);
      if (existing) {
        await api.put(`/tasks/${existing.id}`, { assigned_to: Number(selectedAssignUser) });
      } else {
        await api.post('/tasks', {
          title: `Prepare: ${template.name}`,
          description: '',
          assigned_to: Number(selectedAssignUser),
          task_type: 'general',
          priority: 'medium',
          bulletin_template_id: template.id,
          bulletin_date: todayStr,
        });
      }
      const userName = availableUsers.find((u: any) => u.profile_id === Number(selectedAssignUser))?.full_name || 'user';
      toast(`${existing ? 'Reassigned' : 'Assigned'} "${template.name}" to ${userName}`, 'success');
      setAssignSlot(null);
      setSelectedAssignUser('');
      fetchAll();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to assign slot', 'error');
    }
  };

  const openAssignModal = async (template: any) => {
    try {
      const res = await api.get('/users/available');
      const existing = tasks.find((t: any) => t.bulletin_template_id === template.id && t.bulletin_date === todayStr);
      let users = res.data;
      if (existing) {
        users = users.filter((u: any) => u.profile_id !== existing.assigned_to);
      }
      setAvailableUsers(users);
      setAssignSlot(template);
      setSelectedAssignUser('');
    } catch {
      toast('Failed to load available users', 'error');
    }
  };

  const openEditTemplate = (t: any) => {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setTemplateTime(t.publish_time || '');
    setTemplateNewsCount(t.news_count || 5);
    setTemplateNewsLevel(t.news_level || 'local');
    setShowTemplateForm(true);
  };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const tasksForTemplate = (templateId: number) => tasks.filter((t: any) =>
    t.bulletin_template_id === templateId && t.bulletin_date === todayStr
  );

  const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Bulletins</h1>
          <p className="text-sm text-surface-400 mt-0.5">Daily schedule & news bulletins</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button onClick={() => { setEditingTemplate(null); setTemplateName(''); setTemplateTime(''); setShowTemplateForm(true); }}
                className="flat-btn-surface self-start">
                <Layers className="w-4 h-4" /> Manage Slots
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flat-card-static">
        <div className="flex items-center gap-2 mb-4">
          <Clock4 className="w-4 h-4 text-accent-600" />
          <h2 className="text-sm font-semibold text-surface-700">Today's Schedule</h2>
          <span className="text-xs text-surface-400 ml-auto">Now: {nowTimeStr}</span>
        </div>

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-accent-500 animate-spin" />
          </div>
        ) : err ? (
          <div className="py-8 text-center">
            <AlertTriangle className="w-6 h-6 text-danger-500 mx-auto mb-2" />
            <p className="text-sm text-surface-500 mb-3">{err}</p>
            <button onClick={fetchAll} className="flat-btn-surface text-xs">Retry</button>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-6">
            <Layers className="w-8 h-8 text-surface-300 mx-auto mb-2" />
            <p className="text-sm text-surface-400">No slots defined</p>
            {isAdmin && (
              <button onClick={() => { setEditingTemplate(null); setTemplateName(''); setTemplateTime(''); setShowTemplateForm(true); }}
                className="flat-btn-brand mt-3 text-xs">Add Slot</button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {templates.map((t) => {
              const related = tasksForTemplate(t.id);
              const doneCount = related.filter((r: any) => r.status === 'completed' || r.status === 'under_review').length;
              const hasExpired = related.some((r: any) => r.status === 'cancelled');
              const status = computeStatus(t.publish_time, now, related.length, doneCount, t.skip_reason, hasExpired);
              const statusConfig: Record<SlotStatus, { label: string; icon: any; class: string }> = {
                upcoming: { label: 'Upcoming', icon: Clock, class: 'text-surface-400 bg-surface-50' },
                available: { label: 'Available', icon: Play, class: 'text-success-600 bg-success-50 icon-pulse' },
                in_progress: { label: 'In Progress', icon: ListTodo, class: 'text-accent-600 bg-accent-50' },
                in_grace: { label: 'Grace Period', icon: Clock4, class: 'text-warning-600 bg-warning-50' },
                done: { label: 'Done', icon: CheckCircle2, class: 'text-success-600 bg-success-50' },
                skipped: { label: t.skip_reason ? 'Skipped' : 'Missed', icon: XCircle, class: 'text-danger-400 bg-danger-50' },
                expired: { label: 'Expired', icon: XCircle, class: 'text-danger-500 bg-danger-50' },
              };
              const sc = statusConfig[status];
              const StatusIcon = sc.icon;

              return (
                <div key={t.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                  status === 'available' ? 'border-success-300 bg-success-50/30' :
                  status === 'in_progress' ? 'border-accent-200 bg-accent-50/30' :
                  status === 'in_grace' ? 'border-warning-300 bg-warning-50/30' :
                  status === 'skipped' || status === 'expired' ? 'border-danger-200 bg-danger-50/20' :
                  'border-surface-200 bg-white'
                }`}>
                  <div className="w-14 text-center shrink-0">
                    <p className="text-sm font-bold text-surface-800">{fmtTime(t.publish_time)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800">{t.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] font-medium ${sc.class}`}>
                        <StatusIcon className="w-3 h-3" /> {sc.label}
                      </span>
                      {!!t.news_count && (
                        <span className="text-[11px] text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded">
                          {t.news_count} news
                        </span>
                      )}
                      {!!t.news_level && (
                        <span className="text-[11px] text-accent-600 bg-accent-50 px-1.5 py-0.5 rounded capitalize">
                          {t.news_level}
                        </span>
                      )}
                      {t.skip_reason && (
                        <span className="text-[11px] text-danger-500 italic" title={t.skip_reason}>
                          {t.skip_reason.length > 30 ? t.skip_reason.slice(0, 30) + '...' : t.skip_reason}
                        </span>
                      )}
                      {related.length > 0 && (
                        <div className="flex flex-col gap-1 mt-0.5 w-full">
                          {related.map((r: any) => (
                            <div key={r.id} className="text-[11px] text-surface-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-mono text-[10px] text-surface-400">{r.uid || `#${r.id}`}</span>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                r.status === 'completed' || r.status === 'under_review' ? 'bg-success-500' :
                                ['script_writing','footage_collection','editing','approved','editor_assigned','teleprompter_ready','prompting','recording_done'].includes(r.status) ? 'bg-accent-500' :
                                r.status === 'cancelled' ? 'bg-danger-500' :
                                'bg-surface-300'
                              }`} />
                              <span className="font-medium text-surface-600">{r.assigned_to_name || 'Unassigned'}</span>
                              {r.assigned_by_name && r.assigned_by_name !== r.assigned_to_name && (
                                <span className="text-surface-400">(by {r.assigned_by_name})</span>
                              )}
                              <span className={r.status === 'completed' || r.status === 'under_review' ? 'text-success-600' : 'text-surface-400'}>
                                {r.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(status === 'available' || status === 'upcoming') && user?.role === 'anchor' && (
                      <button onClick={() => setConfirmPick(t)}
                        className="flat-btn-brand text-xs px-3 py-1.5 min-h-0">
                        <Play className="w-3 h-3" /> Pick
                      </button>
                    )}
                    {(status === 'available' || status === 'upcoming') && (user?.access_level ?? 3) <= 2 && (
                      <button onClick={() => openAssignModal(t)}
                        className="flat-btn-brand text-xs px-3 py-1.5 min-h-0">
                        <Play className="w-3 h-3" /> Assign
                      </button>
                    )}
                    {related.length > 0 && (user?.access_level ?? 3) <= 2 && (
                      <button onClick={() => openAssignModal(t)}
                        className="flat-btn-surface text-xs px-3 py-1.5 min-h-0">
                        Reassign
                      </button>
                    )}
                    {(status === 'in_grace' || status === 'expired') && related.length > 0 && related[0]?.id && (
                      <button onClick={() => navigate(`/dashboard/tasks/${related[0].id}`)}
                        className={`flat-btn-${status === 'expired' ? 'danger' : 'surface'} text-xs px-3 py-1.5 min-h-0 inline-flex items-center gap-1`}>
                        <Clock4 className="w-3 h-3" /> {status === 'expired' ? 'Recover' : 'Extend'}
                      </button>
                    )}
                    {related.some((r: any) => r.assigned_to === user?.profile_id && (r.status === 'draft' || r.status === 'script_writing')) && (
                      <button onClick={() => setConfirmUnpick(t)}
                        className="flat-btn-danger text-xs px-3 py-1.5 min-h-0">
                        <XCircle className="w-3 h-3" /> Unpick
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        {!t.skip_reason ? (
                          <button onClick={() => setSkipModal({ id: t.id, reason: '' })}
                            className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                            title="Skip this slot">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={async () => {
                            try {
                              await api.put(`/bulletin-templates/${t.id}`, { skip_reason: null });
                              toast('Slot unskipped', 'success');
                              fetchAll();
                            } catch { toast('Failed to unskip', 'error'); }
                          }}
                            className="p-1.5 rounded-lg text-surface-400 hover:text-success-600 hover:bg-success-50 transition-colors"
                            title="Unskip">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => openEditTemplate(t)}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteConfirm(t.id)}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
      </div>
    );
    })}
          </div>
        )}
      </div>

      {/* Template Form Modal */}
      {showTemplateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowTemplateForm(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-surface-700 mb-4">
              {editingTemplate ? 'Edit Slot' : 'New Slot'}
            </h3>
            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div>
                <label className="flat-label">Name *</label>
                <input className="flat-input" required value={templateName}
                   onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Morning Bulletin" />
              </div>
              <div>
                <label className="flat-label">Publish Time</label>
                <input className="flat-input" type="time" value={templateTime}
                  onChange={(e) => setTemplateTime(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flat-label">News Count</label>
                  <input className="flat-input" type="number" min="1" max="50" value={templateNewsCount}
                    onChange={(e) => setTemplateNewsCount(parseInt(e.target.value) || 5)} />
                </div>
                <div>
                  <label className="flat-label">News Level</label>
                  <select className="flat-select" value={templateNewsLevel}
                    onChange={(e) => setTemplateNewsLevel(e.target.value)}>
                    <option value="local">Local</option>
                    <option value="district">District</option>
                    <option value="state">State</option>
                    <option value="national">National</option>
                    <option value="world">World</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }} className="flat-btn-surface">Cancel</button>
                <button type="submit" disabled={savingTemplate} className="flat-btn-brand">
                  {savingTemplate ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skip Modal */}
      {skipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSkipModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-danger-100 rounded-xl flex items-center justify-center">
                <Ban className="w-4 h-4 text-danger-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-700">Skip Slot — Why?</h3>
                <p className="text-xs text-surface-400">{templates.find((t: any) => t.id === skipModal.id)?.name}</p>
              </div>
            </div>
            <p className="text-xs font-medium text-surface-500 mb-3">Select a reason or type your own:</p>
            <div className="space-y-1.5 mb-4">
              {SKIP_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setSkipModal({ ...skipModal, reason: r })}
                  className={`block w-full text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
                    skipModal.reason === r
                      ? 'border-danger-300 bg-danger-50 text-danger-700 font-medium'
                      : 'border-surface-200 text-surface-600 hover:border-surface-300 hover:bg-surface-50'
                  }`}>
                  {r === skipModal.reason && <Ban className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5 text-danger-500" />}
                  {r}
                </button>
              ))}
            </div>
            <div>
              <label className="flat-label text-xs font-medium text-surface-500">Or type your own reason:</label>
              <input className="flat-input" placeholder="Why is this slot being skipped?" value={skipModal.reason}
                onChange={(e) => setSkipModal({ ...skipModal, reason: e.target.value })} />
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button type="button" onClick={() => setSkipModal(null)} className="flat-btn-surface">Cancel</button>
              <button type="button" disabled={!skipModal.reason.trim()} onClick={async () => {
                try {
                  await api.put(`/bulletin-templates/${skipModal.id}`, { skip_reason: skipModal.reason.trim() });
                  toast('Slot skipped with reason', 'success');
                  setSkipModal(null);
                  fetchAll();
                } catch { toast('Failed to skip', 'error'); }
              }} className="flat-btn-danger">
                <Ban className="w-4 h-4" /> Skip This Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Slot Modal */}
      {assignSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => { setAssignSlot(null); setSelectedAssignUser(''); }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <Play className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">
                  {tasks.some((t: any) => t.bulletin_template_id === assignSlot.id) ? 'Reassign Slot' : 'Assign Slot'}
                </h3>
                <p className="text-xs text-surface-400">{assignSlot.name} · {fmtTime(assignSlot.publish_time)}</p>
              </div>
            </div>
            <div className="bg-surface-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
              <p className="text-surface-700">
                {tasks.some((t: any) => t.bulletin_template_id === assignSlot.id)
                  ? <>Reassign <span className="font-medium text-surface-800">"{assignSlot.name}"</span> to:</>
                  : <>A task <span className="font-medium text-surface-800">"Prepare: {assignSlot.name}"</span> will be created. Assign to:</>
                }
              </p>
              <select className="flat-select w-full mt-2 text-sm" value={selectedAssignUser}
                onChange={(e) => setSelectedAssignUser(e.target.value)}>
                <option value="">Select anchor...</option>
                {availableUsers.map((u: any) => (
                  <option key={u.id} value={u.profile_id || u.id}>
                    {u.full_name}{onlineProfiles.includes(u.profile_id) ? ' ●' : ''}
                  </option>
                ))}
              </select>
              {availableUsers.length === 0 && (
                <p className="text-xs text-surface-400 mt-2">No available anchors right now.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setAssignSlot(null); setSelectedAssignUser(''); }} className="flat-btn-surface">Cancel</button>
              <button onClick={() => handleAssignSlot(assignSlot)} disabled={!selectedAssignUser} className="flat-btn-brand">
                <Play className="w-4 h-4" /> {tasks.some((t: any) => t.bulletin_template_id === assignSlot.id) ? 'Confirm Reassign' : 'Confirm Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmPick(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <Play className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Pick Slot</h3>
                <p className="text-xs text-surface-400">You are about to pick "{confirmPick.name}"</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">A task will be created and assigned to you. You can unpick it while the task is still pending.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmPick(null)} className="flat-btn-surface">Cancel</button>
              <button onClick={() => { const t = confirmPick; setConfirmPick(null); handlePickSlot(t); }} className="flat-btn-brand">
                <Play className="w-4 h-4" /> Confirm Pick
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmUnpick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmUnpick(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-danger-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Unpick Slot</h3>
                <p className="text-xs text-surface-400">You are about to unpick "{confirmUnpick.name}"</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">The associated task will be deleted. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmUnpick(null)} className="flat-btn-surface">Cancel</button>
              <button onClick={() => { const t = confirmUnpick; setConfirmUnpick(null); handleUnpickSlot(t); }} className="flat-btn-danger">
                <XCircle className="w-4 h-4" /> Confirm Unpick
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Delete Slot</h3>
                <p className="text-xs text-surface-500">Tasks linked to this slot will be unlinked.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleDeleteTemplate}
                className="flat-btn-danger text-xs px-4 py-2">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
