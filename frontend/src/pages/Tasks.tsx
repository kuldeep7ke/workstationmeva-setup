import { useState, useEffect } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useUndo } from '../context/UndoContext';
import { Plus, Filter, ArrowUpDown, AlertTriangle, ListTodo, Trash2, User, ExternalLink, Share2, CheckCircle2, Clock, Users } from 'lucide-react';
import { getTaskTypesForRole, getRoleLabel, canCreateTask, getPriorityOptionsForRole, PRIORITY_LABELS, formatLabel } from '../utils/roles';

const STATUS_OPTIONS = ['all', 'draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'published', 'under_review', 'completed', 'cancelled'];
const TIME_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All' },
];
const PRIORITY_OPTIONS = ['all', 'urgent', 'high', 'medium', 'low'];
const ALL_TASK_TYPES = [
  { value: 'breaking', label: 'Breaking' },
  { value: 'press', label: 'Press' },
  { value: 'feature', label: 'Feature' },
  { value: 'on_field', label: 'On Field' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'footage_collection', label: 'Footage Collection' },
  { value: 'field_report', label: 'Field Report' },
  { value: 'ground_coverage', label: 'Ground Coverage' },
  { value: 'recording', label: 'Recording' },
  { value: 'script_writing', label: 'Script Writing' },
  { value: 'video_edit', label: 'Video Edit' },
  { value: 'thumbnail', label: 'Thumbnail' },
  { value: 'motion_graphics', label: 'Motion Graphics' },
  { value: 'graphics', label: 'Graphics' },
  { value: 'graphic_design', label: 'Graphic Design' },
  { value: 'social_post', label: 'Social Post' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'content_create', label: 'Content Create' },
  { value: 'platform_upload', label: 'Platform Upload' },
  { value: 'digital', label: 'Digital' },
  { value: 'ad_creation', label: 'Ad Creation' },
  { value: 'voice_over', label: 'Voice Over' },
  { value: 'update', label: 'Update' },
  { value: 'local', label: 'Local' },
  { value: 'national', label: 'National' },
  { value: 'international', label: 'International' },
  { value: 'upcoming_schedule', label: 'Upcoming Schedule' },
  { value: 'archive', label: 'Archive' },
  { value: 'planning', label: 'Planning' },
  { value: 'general_duty', label: 'General Duty' },
  { value: 'support', label: 'Support' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'review', label: 'Review' },
  { value: 'approval', label: 'Approval' },
];
const FOOTAGE_OPTIONS = [
  { value: 'internet', label: 'Internet' },
  { value: 'reporter', label: 'Reporter' },
  { value: 'local', label: 'Local' },
  { value: 'animated', label: 'Animated' },
  { value: 'ai_generated', label: 'AI Generated' },
  { value: 'archive', label: 'Archive' },
];

const PRIORITY_TASK_TYPES: Record<string, string[]> = {
  urgent: ['breaking', 'press', 'on_field', 'update', 'footage_collection'],
  high: ['breaking', 'press', 'on_field', 'footage_collection'],
  medium: ['feature', 'recording', 'video_edit', 'graphics', 'social_post', 'coverage', 'footage_collection'],
  low: ['feature', 'archive', 'planning', 'local', 'general_duty', 'upcoming_schedule', 'support'],
  breaking_news: ['breaking', 'on_field', 'footage_collection', 'update'],
  single_news: ['footage_collection', 'recording', 'video_edit', 'thumbnail', 'update'],
  special_report: ['feature', 'footage_collection', 'on_field', 'video_edit', 'motion_graphics'],
  ground_report: ['ground_coverage', 'field_report', 'on_field', 'footage_collection', 'coverage'],
  trending: ['social_post', 'shorts', 'video_edit', 'thumbnail', 'motion_graphics', 'digital', 'content_create'],
  local_news: ['local', 'on_field', 'coverage', 'footage_collection'],
  new_ads: ['ad_creation', 'script_writing', 'video_edit', 'graphics', 'voice_over', 'motion_graphics'],
  new_graphics: ['graphics', 'thumbnail', 'motion_graphics', 'graphic_design'],
  entertainment: ['social_post', 'shorts', 'content_create', 'video_edit'],
  digital: ['digital', 'social_post', 'shorts', 'thumbnail', 'platform_upload', 'video_edit'],
};

const statusLabels: Record<string, string> = {
  draft: 'Draft', script_writing: 'Script Writing', footage_collection: 'Footage Collection',
  waiting_confirmation: 'Confirmation', correction_required: 'Correction Required',
  approved: 'Approved', editor_assigned: 'Editor Assigned', teleprompter_ready: 'Teleprompter', prompting: 'Prompting',
  recording_done: 'Recording Done', editing: 'Editing', uploading: 'Uploading',
  published: 'Published', under_review: 'Under Review', completed: 'Completed', cancelled: 'Cancelled',
};
const DELETABLE_STATUSES = ['draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'published', 'under_review', 'cancelled'];
const FINAL_STATUSES = ['uploading', 'published', 'under_review', 'completed'];

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { showUndo } = useUndo();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [timeFilter, setTimeFilter] = useState('today');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', priority: '', task_type: '', bulletin_id: '', footage_source: 'internet', reporter_id: '' });
  const [customType, setCustomType] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [reporters, setReporters] = useState<any[]>([]);
  const [recentArchives, setRecentArchives] = useState<any[]>([]);
  const [archiveResults, setArchiveResults] = useState<any[]>([]);
  const [archiveQuery, setArchiveQuery] = useState('');
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [recentLocations, setRecentLocations] = useState<any[]>([]);
  const [locationResults, setLocationResults] = useState<any[]>([]);
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [selectedUserRole, setSelectedUserRole] = useState('');
  const [err, setErr] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; title: string } | null>(null);
  const [reassignTaskId, setReassignTaskId] = useState<number | null>(null);

  const canCreate = canCreateTask(user);
  const canDelete = user?.access_level === 1;
  const isAdmin = user?.access_level === 1;
  const availableTaskTypes = selectedUserRole ? getTaskTypesForRole(selectedUserRole) : [{ value: 'general', label: 'General' }];

  const allTaskTypes = [
    ...availableTaskTypes,
    ...ALL_TASK_TYPES,
  ].filter((t, i, arr) => arr.findIndex(x => x.value === t.value) === i);

  const relatedTaskTypes = form.priority && PRIORITY_TASK_TYPES[form.priority]
    ? allTaskTypes.filter(t => PRIORITY_TASK_TYPES[form.priority].includes(t.value))
    : allTaskTypes;

  const typeOptions = relatedTaskTypes.filter(t => t.value !== 'general');
  if (form.task_type && form.task_type !== '__custom__' && !typeOptions.some(t => t.value === form.task_type)) {
    const current = allTaskTypes.find(t => t.value === form.task_type);
    if (current) typeOptions.unshift(current);
  }

  // Visibility rules:
  //   Finished (completed/verified) → all profiles see all tasks
  //   Working → admin sees all, manager sees their tasks + approval-needed tasks,
  //             staff sees only assigned_to/assigned_by
  const canViewTask = (task: any) => {
    if (!user) return false;
    if (['completed', 'under_review', 'published'].includes(task.status)) return true; // finished: all can see
    if (user.access_level <= 1) return true; // admin: all
    const isMyTask = task.assigned_to === user.profile_id || task.assigned_by === user.profile_id;
    if (user.access_level === 2) return isMyTask || ['waiting_confirmation', 'correction_required', 'approved'].includes(task.status);
    return isMyTask;
  };

  const fetchTasks = () => {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams();
    if (status !== 'all') params.append('status', status);
    if (priority !== 'all') params.append('priority', priority);
    if (timeFilter === 'today') params.append('time', 'today');
    else if (timeFilter === 'yesterday') params.append('time', 'yesterday');
    else if (timeFilter === 'week') params.append('time', 'week');
    else if (timeFilter === 'month') params.append('time', 'month');
    params.append('all_tasks', 'true');
    api.get(`/tasks?${params}`)
      .then((res) => setTasks(Array.isArray(res.data) ? res.data : []))
      .catch(() => { setErr('Failed to load tasks'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTasks(); }, [status, priority, timeFilter]);
  useEffect(() => { if (showCreate) api.get('/users/assignable').then((res) => setUsers(res.data)).catch(() => {}); }, [showCreate]);
  useEffect(() => { if (showCreate) api.get('/reporters').then((res) => setReporters(res.data)).catch(() => {}); }, [showCreate]);
  useEffect(() => { if (showCreate) api.get('/archives/recent').then((res) => setRecentArchives(Array.isArray(res.data) ? res.data : [])).catch(() => {}); }, [showCreate]);
  useEffect(() => { if (showCreate) api.get('/locations/recent').then((res) => setRecentLocations(Array.isArray(res.data) ? res.data : [])).catch(() => {}); }, [showCreate]);
  useEffect(() => {
    const q = archiveQuery.trim();
    if (q) {
      api.get(`/archives?q=${encodeURIComponent(q)}`).then((res) => setArchiveResults(Array.isArray(res.data) ? res.data : [])).catch(() => setArchiveResults([]));
    } else {
      setArchiveResults([]);
    }
  }, [archiveQuery]);
  useEffect(() => {
    const q = locationQuery.trim();
    if (q) {
      api.get(`/locations?q=${encodeURIComponent(q)}`).then((res) => setLocationResults(Array.isArray(res.data) ? res.data : [])).catch(() => setLocationResults([]));
    } else {
      setLocationResults([]);
    }
  }, [locationQuery]);

  const resetArchiveField = () => { setArchiveQuery(''); setSelectedArchiveId(null); setArchiveOpen(false); };
  const resetLocationField = () => { setLocationQuery(''); setSelectedLocationId(null); setLocationOpen(false); };

  const selectArchive = (a: any) => {
    setSelectedArchiveId(a.id);
    setArchiveQuery(a.name);
    setArchiveOpen(false);
  };

  const selectLocation = (l: any) => {
    setSelectedLocationId(l.id);
    setLocationQuery(l.name);
    setLocationOpen(false);
  };

  const autofillLocationFromReporter = (locationName: string) => {
    setLocationQuery(locationName);
    setSelectedLocationId(null);
    if (locationName) {
      api.get(`/locations?q=${encodeURIComponent(locationName)}`)
        .then((res) => {
          const exact = (Array.isArray(res.data) ? res.data : []).find((l: any) => l.name.toLowerCase() === locationName.toLowerCase());
          if (exact) setSelectedLocationId(exact.id);
        })
        .catch(() => {});
    }
  };

  const resolveLocationId = async (): Promise<number | null> => {
    if (selectedLocationId) return selectedLocationId;
    const name = locationQuery.trim();
    if (!name) return null;
    const existing = locationResults.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    try {
      const res = await api.post('/locations', { name });
      toast(`Location "${name}" created`, 'success');
      return res.data.id;
    } catch (err: any) {
      if (err.response?.data?.locationId) return err.response.data.locationId;
      toast(err.response?.data?.error || 'Failed to save location', 'error');
      return null;
    }
  };

  const createArchiveFromQuery = async () => {
    const name = archiveQuery.trim();
    if (!name) return;
    try {
      const res = await api.post('/archives', { name, category: 'footage' });
      toast('Archive entry created', 'success');
      setSelectedArchiveId(res.data.id);
      setArchiveOpen(false);
      api.get('/archives/recent').then((r) => setRecentArchives(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    } catch (err: any) {
      if (err.response?.data?.archiveId) {
        setSelectedArchiveId(err.response.data.archiveId);
        setArchiveOpen(false);
        toast('Linked to existing archive entry', 'success');
      } else {
        toast(err.response?.data?.error || 'Failed to create archive entry', 'error');
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.footage_source === 'archive' && !selectedArchiveId) {
      toast('Select or create an archive entry for archive footage', 'error');
      return;
    }
    setSaving(true);
    try {
      const finalTaskType = form.task_type === '__custom__'
        ? (customType.trim() || 'general')
        : (form.task_type || 'general');
      const finalLocationId = await resolveLocationId();
      const res = await api.post('/tasks', {
        ...form,
        task_type: finalTaskType,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        bulletin_id: form.bulletin_id ? Number(form.bulletin_id) : null,
        priority: form.priority || 'medium',
        footage_source: form.footage_source || 'internet',
        reporter_id: form.footage_source === 'reporter' && form.reporter_id ? Number(form.reporter_id) : null,
        archive_id: form.footage_source === 'archive' ? selectedArchiveId : null,
        location_id: finalLocationId,
      });
      toast('Task created', 'success');
      showUndo('Task created', async () => {
        await api.delete(`/tasks/${res.data.id}`);
        fetchTasks();
      });
      setShowCreate(false);
      setCustomType('');
      resetArchiveField();
      resetLocationField();
      setForm({ title: '', description: '', assigned_to: '', priority: '', task_type: '', bulletin_id: '', footage_source: 'internet', reporter_id: '' });
      fetchTasks();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to create task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (task: any) => {
    try {
      await api.delete(`/tasks/${task.id}`);
      toast('Task deleted', 'success');
      showUndo('Task deleted', async () => {
        await api.post('/tasks', {
          title: task.title, description: task.description, assigned_to: task.assigned_to,
          priority: task.priority || 'medium', task_type: task.task_type || 'general',
          footage_source: task.footage_source || 'internet', bulletin_id: task.bulletin_id,
        });
        fetchTasks();
      });
      setDeleteConfirm(null);
      fetchTasks();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to delete task', 'error');
      setDeleteConfirm(null);
    }
  };

  const handleReassign = async (taskId: number, userId: string) => {
    if (!userId) { setReassignTaskId(null); return; }
    const task = tasks.find((t: any) => t.id === taskId);
    const prevAssignee = task?.assigned_to;
    try {
      await api.post(`/tasks/${taskId}/reassign`, { user_id: Number(userId) });
      toast('Task reassigned', 'success');
      if (prevAssignee) {
        showUndo('Task reassigned', async () => {
          await api.post(`/tasks/${taskId}/reassign`, { user_id: prevAssignee });
          fetchTasks();
        });
      }
      setReassignTaskId(null);
      fetchTasks();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to reassign', 'error');
    }
  };

  const badgeClass = (s: string) => {
    const map: Record<string, string> = {
      draft: 'badge-draft', script_writing: 'badge-script_writing', footage_collection: 'badge-footage_collection',
      waiting_confirmation: 'badge-waiting_confirmation', correction_required: 'badge-correction_required',
      approved: 'badge-approved', editor_assigned: 'badge-editor_assigned', teleprompter_ready: 'badge-teleprompter_ready', prompting: 'badge-prompting',
      recording_done: 'badge-recording_done', editing: 'badge-production', uploading: 'badge-uploading',
      published: 'badge-published', under_review: 'badge-under_review', completed: 'badge-completed',
      cancelled: 'badge-cancelled', trashed: 'badge-trashed',
    };
    return map[s] || 'badge-pending';
  };

  const renderTaskCard = (task: any) => (
    <Link key={task.id} to={`/dashboard/tasks/${task.id}`}
      className="flat-card flex items-center gap-3 sm:gap-4 cursor-pointer p-3 sm:p-4">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className={priorityBadge(task.priority)}>{PRIORITY_LABELS[task.priority] || task.priority}</span>
          <span className={`${badgeClass(task.status)} ${task.priority === 'urgent' ? 'icon-pulse' : ''}`}>{statusLabels[task.status] || task.status}</span>
          <span className="flat-badge bg-surface-100 text-surface-600 border border-surface-300 text-[11px]">
            {formatLabel(task.task_type)}
          </span>
          {task.bulletin_template_name && (
            <span className="text-[11px] text-accent-600 bg-accent-50 px-2 py-0.5 rounded-pill font-medium">
              {task.bulletin_template_name}
            </span>
          )}
          {task.collaborator_count > 0 && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-pill border ${
              task.collaborator_count >= 3
                ? 'text-purple-700 bg-purple-50 border-purple-200'
                : task.collaborator_count === 2
                ? 'text-blue-600 bg-blue-50 border-blue-200'
                : 'text-surface-500 bg-surface-50 border-surface-200'
            }`}>
              <Users className="w-3 h-3" />
              {task.collaborator_count >= 3 ? 'Group' : task.collaborator_count === 2 ? 'Regular' : 'Individual'} ({task.collaborator_count})
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-surface-800 truncate">{task.title}</h3>
        <p className="text-xs text-surface-400 mt-0.5">
          {task.assigned_to_name && <>To: <span className="font-medium text-surface-600">{task.assigned_to_name}</span></>}
          {task.assigned_by_name && <> · By: <span className="font-medium text-surface-600">{task.assigned_by_name}</span></>}
          {task.bulletin_title && <> · {task.bulletin_title}</>}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {task.footage_source && (
            <span className="text-[11px] text-surface-500 bg-surface-50 px-2 py-0.5 rounded-pill border border-surface-200">
              Footage: {FOOTAGE_OPTIONS.find(o => o.value === task.footage_source)?.label || task.footage_source}
              {task.footage_source === 'archive' && task.archive_name && ` — ${task.archive_name}`}
              {task.footage_source === 'reporter' && task.reporter_name && ` — ${task.reporter_name}`}
            </span>
          )}
          {task.location_name && (
            <span className="text-[11px] text-surface-500 bg-surface-50 px-2 py-0.5 rounded-pill border border-surface-200">
              Location: {task.location_name}{task.location_region && task.location_region !== 'local' ? ` (${task.location_region})` : ''}
            </span>
          )}
          {task.completed_at && (
            <span className="text-[11px] text-surface-400">
              Finished {new Date(task.completed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      {/* Right side - YouTube thumbnail with actions */}
      {task.youtube_url && (
        <div className="shrink-0 hidden sm:flex flex-col items-center gap-2">
          <a href={task.youtube_url} target="_blank" rel="noopener noreferrer"
            className="relative group block">
            <img
              src={`https://img.youtube.com/vi/${task.youtube_url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || ''}/mqdefault.jpg`}
              alt="YouTube Thumbnail"
              className="w-28 h-16 rounded-lg object-cover border border-surface-200 group-hover:border-accent-300 transition-colors"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
              <ExternalLink className="w-5 h-5 text-white" />
            </div>
          </a>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigator.clipboard.writeText(task.youtube_url);
              toast('Video link copied to clipboard', 'success');
            }}
            className="flex items-center gap-1 text-[10px] text-accent-600 hover:text-accent-700 bg-accent-50 hover:bg-accent-100 border border-accent-100 rounded-md px-2 py-1 transition-colors"
          >
            <Share2 className="w-3 h-3" /> Copy Link
          </button>
        </div>
      )}
      <div className="text-right shrink-0 hidden sm:block space-y-2">
        {isAdmin && !FINAL_STATUSES.includes(task.status) && (
          reassignTaskId === task.id ? (
            <select className="flat-select text-xs py-1 px-2 min-w-[160px]" autoFocus
              value="" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onChange={(e) => handleReassign(task.id, e.target.value)}
              onBlur={() => setReassignTaskId(null)}>
              <option value="">Assign user...</option>
              {users.filter(u => u.user_active && u.profile_active).map((u: any) => (
                <option key={u.id} value={u.profile_id || u.id}>{u.full_name}</option>
              ))}
            </select>
          ) : (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); api.get('/users').then(r => { setUsers(r.data); setReassignTaskId(task.id); }).catch(() => {}); }}
              className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 bg-accent-50 hover:bg-accent-100 border border-accent-100 rounded-lg px-2 py-1 transition-colors">
              <User className="w-3 h-3" /> Reassign
            </button>
          )
        )}
        {canDelete && DELETABLE_STATUSES.includes(task.status) && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirm({ id: task.id, title: task.title }); }}
            className="inline-flex items-center gap-1 text-xs text-danger-600 hover:text-danger-700 bg-danger-50 hover:bg-danger-100 border border-danger-100 rounded-lg px-2 py-1 transition-colors">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        )}
      </div>
    </Link>
  );

  const priorityBadge = (p: string) => {
    const map: Record<string, string> = {
      urgent: 'badge-urgent',
      high: 'badge-high',
      medium: 'badge-medium',
      low: 'badge-low',
    };
    return map[p] || 'flat-badge bg-surface-50 text-surface-500 border border-surface-200';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Tasks</h1>
          <p className="text-sm text-surface-400 mt-0.5">Track and manage production tasks</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(!showCreate)} className="flat-btn-brand self-start">
            <Plus className="w-4 h-4 icon-bounce" /> New Task
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-2 bg-white rounded-lg border border-surface-200 px-3 py-1.5">
          <Filter className="w-4 h-4 text-surface-400 shrink-0" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="text-sm bg-transparent border-none outline-none text-surface-600 pr-2">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All Status' : statusLabels[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border border-surface-200 px-3 py-1.5">
          <ArrowUpDown className="w-4 h-4 text-surface-400 shrink-0" />
          <select value={priority} onChange={(e) => setPriority(e.target.value)}
            className="text-sm bg-transparent border-none outline-none text-surface-600 pr-2">
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p === 'all' ? 'All Priority' : PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 bg-surface-100 rounded-lg p-1 overflow-x-auto">
          {TIME_OPTIONS.map((t) => (
            <button key={t.value} onClick={() => setTimeFilter(t.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                timeFilter === t.value ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {showCreate && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">Create New Task</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flat-label">Title *</label>
                <input className="flat-input" required value={form.title} placeholder="Enter task title"
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Assign To</label>
                    <select className="flat-select" value={form.assigned_to}
                      onChange={(e) => {
                        const uid = e.target.value;
                        const u = users.find(u2 => u2.profile_id === Number(uid));
                        setForm({ ...form, assigned_to: uid });
                        setSelectedUserRole(u?.role || '');
                      }}>
                  <option value="">Not assigned (pick later)</option>
                  {users.map((u) => (
                    <option key={u.profile_id} value={u.profile_id}>{u.full_name} ({getRoleLabel(u.role)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flat-label">Priority *</label>
                <select className="flat-select" required value={form.priority}
                  onChange={(e) => { setForm({ ...form, priority: e.target.value, task_type: '' }); setCustomType(''); }}>
                  <option value="">Select priority...</option>
                  {getPriorityOptionsForRole(selectedUserRole || user?.role || '').map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flat-label">Task Type *</label>
                <select className="flat-select" required value={form.task_type} disabled={!form.priority}
                  onChange={(e) => { setForm({ ...form, task_type: e.target.value }); if (e.target.value !== '__custom__') setCustomType(''); }}>
                  <option value="">{form.priority ? 'Select task type...' : 'Select priority first'}</option>
                  {typeOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                  {form.priority && <option value="__custom__">Custom…</option>}
                </select>
                {form.task_type === '__custom__' && (
                  <input className="flat-input mt-2" placeholder="Type your own task type (e.g. Live Debrief)" maxLength={60}
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)} />
                )}
                {!form.priority && (
                  <p className="text-[11px] text-surface-400 mt-1">Select a priority first — task types are linked to it.</p>
                )}
              </div>
              <div>
                <label className="flat-label">Footage Source *</label>
                <select className="flat-select" required value={form.footage_source}
                  onChange={(e) => setForm({ ...form, footage_source: e.target.value, reporter_id: e.target.value === 'reporter' ? form.reporter_id : '' })}>
                  {FOOTAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {form.footage_source === 'reporter' && (
                <div>
                  <label className="flat-label">Reporter *</label>
                  <select className="flat-select" required value={form.reporter_id}
                    onChange={(e) => {
                      setForm({ ...form, reporter_id: e.target.value });
                      const rep = reporters.find((r) => String(r.id) === e.target.value);
                      if (rep?.location) autofillLocationFromReporter(rep.location);
                    }}>
                    <option value="">Select reporter...</option>
                    {reporters.filter((r) => r.status !== 'inactive').map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.specialization ? ` — ${r.specialization}` : ''}{r.location ? ` (${r.location})` : ''}
                      </option>
                    ))}
                  </select>
                  {reporters.length === 0 && (
                    <p className="text-[11px] text-warning-600 mt-1">No reporters found. Add reporters from the Reporters section first.</p>
                  )}
                </div>
              )}
              {form.footage_source === 'archive' && (
                <div className="relative">
                  <label className="flat-label">Archive Footage *</label>
                  <input className="flat-input" placeholder="Search archive footage (e.g. Shahar Police Shrigonda)..."
                    value={archiveQuery}
                    onChange={(e) => { setArchiveQuery(e.target.value); if (selectedArchiveId) setSelectedArchiveId(null); setArchiveOpen(true); }}
                    onFocus={() => setArchiveOpen(true)}
                    onBlur={() => setTimeout(() => setArchiveOpen(false), 150)}
                  />
                  {archiveOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-surface-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                      {!archiveQuery.trim() && recentArchives.length > 0 && (
                        <div>
                          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Recent</p>
                          {recentArchives.map((a) => (
                            <button key={a.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent-50 flex items-center justify-between gap-2"
                              onMouseDown={(e) => { e.preventDefault(); selectArchive(a); }}>
                              <span className="text-sm text-surface-700 truncate">{a.name}</span>
                              {a.location && <span className="text-[11px] text-surface-400 shrink-0">{a.location}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {archiveResults.length > 0 && (
                        <div>
                          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Matches</p>
                          {archiveResults.map((a) => (
                            <button key={a.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent-50 flex items-center justify-between gap-2"
                              onMouseDown={(e) => { e.preventDefault(); selectArchive(a); }}>
                              <span className="text-sm text-surface-700 truncate">{a.name}</span>
                              {a.location && <span className="text-[11px] text-surface-400 shrink-0">{a.location}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {archiveQuery.trim() && !archiveResults.some((a) => a.name.toLowerCase() === archiveQuery.trim().toLowerCase()) && (
                        <button type="button" className="w-full text-left px-3 py-2 bg-accent-50 hover:bg-accent-100 border-t border-accent-100"
                          onMouseDown={(e) => { e.preventDefault(); createArchiveFromQuery(); }}>
                          <span className="text-sm font-medium text-accent-700">+ Create new archive &quot;{archiveQuery.trim()}&quot;</span>
                        </button>
                      )}
                      {!archiveQuery.trim() && recentArchives.length === 0 && archiveResults.length === 0 && (
                        <p className="px-3 py-3 text-sm text-surface-400">No archive entries yet. Type a name to create one.</p>
                      )}
                    </div>
                  )}
                  {selectedArchiveId && (
                    <p className="text-[11px] text-success-600 mt-1">Archive footage linked ✓ — managed in the Archive section</p>
                  )}
                </div>
              )}
              <div className="relative">
                <label className="flat-label">Location</label>
                <input className="flat-input" placeholder="Search or type a location (e.g. Shrigonda, Ahmednagar)..."
                  value={locationQuery}
                  onChange={(e) => { setLocationQuery(e.target.value); if (selectedLocationId) setSelectedLocationId(null); setLocationOpen(true); }}
                  onFocus={() => setLocationOpen(true)}
                  onBlur={() => setTimeout(() => setLocationOpen(false), 150)}
                />
                {locationOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-surface-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {!locationQuery.trim() && recentLocations.length > 0 && (
                      <div>
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Recent</p>
                        {recentLocations.map((l) => (
                          <button key={l.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent-50 flex items-center justify-between gap-2"
                            onMouseDown={(e) => { e.preventDefault(); selectLocation(l); }}>
                            <span className="text-sm text-surface-700 truncate">{l.name}</span>
                            <span className="text-[11px] text-surface-400 shrink-0 capitalize">{l.region}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {locationResults.length > 0 && (
                      <div>
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Matches</p>
                        {locationResults.map((l) => (
                          <button key={l.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent-50 flex items-center justify-between gap-2"
                            onMouseDown={(e) => { e.preventDefault(); selectLocation(l); }}>
                            <span className="text-sm text-surface-700 truncate">{l.name}</span>
                            <span className="text-[11px] text-surface-400 shrink-0 capitalize">{l.region}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {locationQuery.trim() && !locationResults.some((l) => l.name.toLowerCase() === locationQuery.trim().toLowerCase()) && (
                      <p className="px-3 py-2 text-[11px] text-surface-400 border-t border-surface-100">
                        &quot;{locationQuery.trim()}&quot; will be saved to the location library on submit.
                      </p>
                    )}
                    {!locationQuery.trim() && recentLocations.length === 0 && locationResults.length === 0 && (
                      <p className="px-3 py-3 text-sm text-surface-400">No locations yet. Type one — it will be added to the library.</p>
                    )}
                  </div>
                )}
                {selectedLocationId && (
                  <p className="text-[11px] text-success-600 mt-1">Location linked ✓ — library managed in the Reporters section</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Description</label>
                <textarea className="flat-input" rows={3} value={form.description} placeholder="Put here basic information about task or the news"
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowCreate(false); resetArchiveField(); resetLocationField(); }} className="flat-btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="flat-btn-brand">
                {saving ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={7} cols={5} />
      ) : err ? (
        <div className="flat-card-static text-center py-12">
          <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
          <p className="text-surface-500">{err}</p>
          <button onClick={fetchTasks} className="flat-btn-brand mt-4">Retry</button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flat-card-static text-center py-12">
          <ListTodo className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-400">No tasks found</p>
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="flat-btn-brand mt-4">
              <Plus className="w-4 h-4" /> Create Task
            </button>
          )}
        </div>
      ) : (() => {
          const finishedTasks = tasks.filter(t => ['completed', 'under_review', 'published'].includes(t.status));
          const visibleWorkingTasks = tasks.filter(t => !['completed', 'under_review', 'published', 'cancelled'].includes(t.status) && canViewTask(t));
          const hasSections = finishedTasks.length > 0 || visibleWorkingTasks.length > 0;
          return (
        <div className="space-y-6 sm:space-y-8">
          {/* Finished / Uploaded Section — all profiles see all */}
          {finishedTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-success-500" />
                <h2 className="text-sm font-semibold text-surface-700">Finished / Uploaded</h2>
                <span className="text-xs text-surface-400 ml-auto">{finishedTasks.length} tasks</span>
              </div>
              <div className="space-y-2">
                {finishedTasks.map((task) => renderTaskCard(task))}
              </div>
            </div>
          )}

          {/* Working / Pending Section — visibility-filtered */}
          {visibleWorkingTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-accent-500" />
                <h2 className="text-sm font-semibold text-surface-700">Working / Pending</h2>
                <span className="text-xs text-surface-400 ml-auto">{visibleWorkingTasks.length} tasks</span>
              </div>
              <div className="space-y-2">
                {visibleWorkingTasks.map((task) => renderTaskCard(task))}
              </div>
            </div>
          )}

          {!hasSections && tasks.length > 0 && (
            <div className="flat-card-static text-center py-12">
              <ListTodo className="w-10 h-10 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-400">No active tasks to display</p>
              <p className="text-xs text-surface-300 mt-1">All tasks are cancelled or expired</p>
            </div>
          )}
        </div>
          );
      })()}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Delete Task</h3>
                <p className="text-xs text-surface-500">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete task "{deleteConfirm.title}"?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flat-btn text-xs px-4 py-2">
                Cancel
              </button>
              <button onClick={() => deleteTask({ id: deleteConfirm.id, title: deleteConfirm.title })}
                className="flat-btn-danger text-xs px-4 py-2">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
