import { useState, useEffect } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import api from '../utils/api';
import { formatDate, formatDateTime } from '../utils/dates';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useUndo } from '../context/UndoContext';
import {
  Newspaper, Plus, AlertTriangle, Loader2, Trash2, Pencil, Send,
  CheckCircle2, XCircle, User, Clock, Activity, FileText, MessageSquare,
  BarChart3, ExternalLink, Globe, Hash, X,
} from 'lucide-react';
import { formatLabel } from '../utils/roles';

const STORY_TYPES = [
  { value: 'special_report', label: 'Special Report' },
  { value: 'ground_report', label: 'Ground Report' },
  { value: 'interview', label: 'Interview' },
  { value: 'cover_story', label: 'Cover Story' },
  { value: 'crime_story', label: 'Crime Story' },
  { value: 'weather_report', label: 'Weather Report' },
  { value: 'viral_story', label: 'Viral Story' },
];

const STORY_TABS = [
  { key: 'all', label: 'All Stories' },
  { key: 'mine', label: 'My Stories' },
  { key: 'pending', label: 'Pending Approval', adminOnly: true },
];

const STATUS_FLOW: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'text-surface-400 bg-surface-50', icon: FileText },
  data_gathering: { label: 'Data Gathering', color: 'text-blue-600 bg-blue-50', icon: BarChart3 },
  script_writing: { label: 'Script Writing', color: 'text-accent-600 bg-accent-50', icon: FileText },
  plotting: { label: 'Plotting', color: 'text-purple-600 bg-purple-50', icon: BarChart3 },
  add_ons: { label: "Add On's", color: 'text-cyan-600 bg-cyan-50', icon: FileText },
  confirmation: { label: 'Confirmation', color: 'text-yellow-600 bg-yellow-50', icon: Send },
  approved: { label: 'Approved', color: 'text-success-600 bg-success-50', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-danger-600 bg-danger-50', icon: XCircle },
  send_to_tasks: { label: 'Sent to Tasks', color: 'text-green-600 bg-green-50', icon: CheckCircle2 },
};

const NEXT_STATUS: Record<string, string> = {
  draft: 'data_gathering',
  data_gathering: 'script_writing',
  script_writing: 'plotting',
  plotting: 'add_ons',
  add_ons: 'confirmation',
};

export default function Stories() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { showUndo } = useUndo();
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingStory, setEditingStory] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [showActivity, setShowActivity] = useState<number | null>(null);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [scriptEditStory, setScriptEditStory] = useState<any>(null);
  const [scriptForm, setScriptForm] = useState({ start: '', middle: '', end: '', editor_instructions: '', voice_over_script: '', vo_artist: '', footage_details: '', guest_names: '' });
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingStory, setApprovingStory] = useState<any>(null);
  const [approveAssignTo, setApproveAssignTo] = useState('');
  const [reassignStoryId, setReassignStoryId] = useState<number | null>(null);
  const [assignStoryId, setAssignStoryId] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectStoryId, setRejectStoryId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const emptyStoryForm = () => ({ title: '', story_type: 'special_report', description: '', data_gathered: '', script: '', plot_notes: '', assigned_to: '', deadline: tomorrowStr(), headline: '', short_description: '', hashtags: '', is_open: false });

  const [form, setForm] = useState(emptyStoryForm);

  const canApprove = user && user.access_level <= 2;

  useEffect(() => {
    api.get('/users/assignable').then((r) => setUsers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const fetchStories = () => {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams();
    if (tab === 'mine' && user) {
      params.set('assigned_to', String(user.profile_id));
    }
    if (tab === 'pending') params.set('status', 'confirmation');
    api.get(`/stories?${params.toString()}`)
      .then((res) => setStories(Array.isArray(res.data) ? res.data : []))
      .catch(() => setErr('Failed to load stories'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStories(); }, [tab]);

  const openActivity = (id: number) => {
    setShowActivity(id);
    api.get(`/stories/${id}`)
      .then((res) => setActivities(res.data.activities || []))
      .catch(() => setActivities([]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { title: form.title.trim(), story_type: form.story_type, description: form.description.trim() };
      if (form.deadline) body.deadline = form.deadline;
      if (form.headline) body.headline = form.headline.trim();
      if (form.short_description) body.short_description = form.short_description.trim();
      if (form.hashtags) body.hashtags = form.hashtags.trim();
      body.is_open = form.is_open ? 1 : 0;
      if (editingStory) {
        body.data_gathered = form.data_gathered;
        body.script = form.script;
        body.plot_notes = form.plot_notes;
        await api.put(`/stories/${editingStory.id}`, body);
        toast('Story updated', 'success');
      } else {
        const res = await api.post('/stories', body);
        toast('Story created', 'success');
        showUndo('Story created', async () => {
          await api.delete(`/stories/${res.data.id}`);
          fetchStories();
        });
      }
      setShowCreate(false);
      setEditingStory(null);
      setForm(emptyStoryForm());
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save story', 'error');
    } finally { setSaving(false); }
  };

  const handleAdvanceStatus = async (id: number, status: string) => {
    const story = stories.find((s: any) => s.id === id);
    const prevStatus = story?.status;
    try {
      await api.put(`/stories/${id}`, { status });
      toast(`Status changed to ${STATUS_FLOW[status]?.label || status}`, 'success');
      if (prevStatus) {
        showUndo(`Moved to ${STATUS_FLOW[status]?.label || status}`, async () => {
          await api.post(`/stories/${id}/revert`, { status: prevStatus });
          fetchStories();
        });
      }
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update status', 'error');
    }
  };

  const handleSendToConfirmation = async (id: number) => {
    try {
      await api.put(`/stories/${id}`, { status: 'confirmation' });
      toast('Story sent for confirmation', 'success');
      showUndo('Sent for confirmation', async () => {
        await api.post(`/stories/${id}/revert`, { status: 'add_ons' });
        fetchStories();
      });
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to send', 'error');
    }
  };

  const handleApprove = async () => {
    if (!approvingStory) return;
    setSaving(true);
    try {
      const body: any = { approved: true };
      if (approveAssignTo) body.assigned_to = Number(approveAssignTo);
      const res = await api.post(`/stories/${approvingStory.id}/confirm`, body);
      toast('Story approved', 'success');
      setShowApproveModal(false);
      setApprovingStory(null);
      setApproveAssignTo('');
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to approve', 'error');
    } finally { setSaving(false); }
  };

  const openRejectModal = (id: number) => {
    setRejectStoryId(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    const trimmed = rejectionReason.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.post(`/stories/${rejectStoryId}/confirm`, { approved: false, rejection_reason: trimmed });
      toast('Story rejected', 'success');
      setShowRejectModal(false);
      setRejectStoryId(null);
      setRejectionReason('');
      setShowApproveModal(false);
      setApprovingStory(null);
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to reject', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (deleteConfirm === null) return;
    const story = stories.find((s: any) => s.id === deleteConfirm);
    try {
      await api.delete(`/stories/${deleteConfirm}`);
      toast('Story deleted', 'success');
      if (story) {
        showUndo('Story deleted', async () => {
          await api.post('/stories', {
            title: story.title, story_type: story.story_type, description: story.description,
            headline: story.headline, short_description: story.short_description,
            hashtags: story.hashtags, is_open: story.is_open ? 1 : 0,
          });
          fetchStories();
        });
      }
      setDeleteConfirm(null);
      fetchStories();
    } catch { toast('Failed to delete', 'error'); }
  };

  const handleReassign = async (storyId: number, userId: string) => {
    if (!userId) { setReassignStoryId(null); return; }
    try {
      const res = await api.post(`/stories/${storyId}/reassign`, { user_id: Number(userId) });
      if (!res.data.found) {
        toast('No production task found for this story yet — send it to tasks first', 'info');
      } else {
        toast('Editor assigned', 'success');
        if (res.data.previous_assignee != null) {
          showUndo('Editor reassigned', async () => {
            await api.post(`/stories/${storyId}/reassign`, { user_id: res.data.previous_assignee });
            fetchStories();
          });
        }
      }
      setReassignStoryId(null);
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to reassign', 'error');
    }
  };

  const handleReassignStory = async (storyId: number, userId: string) => {
    if (!userId) { setAssignStoryId(null); return; }
    const story = stories.find((s: any) => s.id === storyId);
    const prevAssignee = story?.assigned_to;
    try {
      await api.post(`/stories/${storyId}/assign`, { user_id: Number(userId) });
      toast('Story reassigned', 'success');
      showUndo('Story assigned', async () => {
        if (prevAssignee) {
          await api.post(`/stories/${storyId}/assign`, { user_id: prevAssignee });
        } else {
          await api.put(`/stories/${storyId}`, { assigned_to: null });
        }
        fetchStories();
      });
      setAssignStoryId(null);
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to reassign story', 'error');
    }
  };

  const handleOpenScriptEditor = (story: any) => {
    setScriptEditStory(story);
    // Check for saved draft in localStorage
    const saved = localStorage.getItem(`script_draft_${story.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setScriptForm({
          start: parsed.start || '',
          middle: parsed.middle || '',
          end: parsed.end || '',
          editor_instructions: parsed.editor_instructions || '',
          voice_over_script: parsed.voice_over_script || '',
          vo_artist: parsed.vo_artist ? String(parsed.vo_artist) : '',
          footage_details: parsed.footage_details || '',
          guest_names: parsed.guest_names || '',
        });
        setShowScriptEditor(true);
        return;
      } catch {}
    }
    // Parse existing script into sections if it has markers, otherwise put it all in start
    const existing = story.script || '';
    const startMatch = existing.match(/=== START ===\n([\s\S]*?)\n=== MIDDLE ===/);
    const middleMatch = existing.match(/=== MIDDLE ===\n([\s\S]*?)\n=== END ===/);
    const endMatch = existing.match(/=== END ===\n([\s\S]*)/);
    setScriptForm({
      start: startMatch ? startMatch[1].trim() : (!existing.includes('=== MIDDLE ===') ? existing : ''),
      middle: middleMatch ? middleMatch[1].trim() : '',
      end: endMatch ? endMatch[1].trim() : '',
      editor_instructions: story.editor_instructions || '',
      voice_over_script: story.voice_over_script || '',
      vo_artist: story.vo_artist ? String(story.vo_artist) : '',
      footage_details: story.footage_details || '',
      guest_names: story.guest_names || '',
    });
    setShowScriptEditor(true);
  };

  // Auto-save script draft to localStorage on every change
  useEffect(() => {
    if (showScriptEditor && scriptEditStory) {
      localStorage.setItem(`script_draft_${scriptEditStory.id}`, JSON.stringify(scriptForm));
    }
  }, [scriptForm, showScriptEditor]);

  const handleSaveScript = async () => {
    if (!scriptEditStory) return;
    setSaving(true);
    const combined = `=== START ===\n${scriptForm.start.trim()}\n\n=== MIDDLE ===\n${scriptForm.middle.trim()}\n\n=== END ===\n${scriptForm.end.trim()}`;
    try {
      const payload: any = {
        script: combined,
        editor_instructions: scriptForm.editor_instructions.trim(),
        voice_over_script: scriptForm.voice_over_script.trim(),
        vo_artist: scriptForm.vo_artist ? Number(scriptForm.vo_artist) : null,
        footage_details: scriptForm.footage_details.trim(),
        guest_names: scriptForm.guest_names.trim(),
      };
      // Only advance a script_writing story to plotting; keep the current
      // status otherwise (no status field = no transition validation).
      if (scriptEditStory.status === 'script_writing') payload.status = 'plotting';
      await api.put(`/stories/${scriptEditStory.id}`, payload);
      toast(scriptEditStory.status === 'script_writing' ? 'Script saved and moved to Plotting' : 'Script saved', 'success');
      localStorage.removeItem(`script_draft_${scriptEditStory.id}`);
      setShowScriptEditor(false);
      setScriptEditStory(null);
      fetchStories();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save script', 'error');
    } finally { setSaving(false); }
  };

  const openEdit = (story: any) => {
    setEditingStory(story);
    setForm({
      title: story.title || '',
      story_type: story.story_type || 'special_report',
      description: story.description || '',
      data_gathered: story.data_gathered || '',
      script: story.script || '',
      plot_notes: story.plot_notes || '',
      assigned_to: story.assigned_to ? String(story.assigned_to) : '',
      deadline: story.deadline || '',
      headline: story.headline || '',
      short_description: story.short_description || '',
      hashtags: story.hashtags || '',
      is_open: !!story.is_open,
    });
    setShowCreate(true);
  };

  const openCreate = () => {
    setEditingStory(null);
    setForm(emptyStoryForm());
    setShowCreate(true);
  };

  const canEdit = (story: any) => user && (user.access_level <= 2 || story.created_by === user.profile_id || story.is_open);
  const canDelete = user?.access_level === 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Stories</h1>
          <p className="text-sm text-surface-400 mt-0.5">Develop reports from research to teleprompter-ready scripts</p>
        </div>
        <button onClick={() => { if (showCreate) { setShowCreate(false); setEditingStory(null); } else openCreate(); }} className="flat-btn-accent self-start">
          <Plus className="w-4 h-4" /> {showCreate ? 'Close' : 'New Story'}
        </button>
      </div>

      {showCreate && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">{editingStory ? 'Edit Story' : 'New Story'}</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="flat-label">Title *</label>
                <input className="flat-input" required value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Story headline" />
              </div>
              <div>
                <label className="flat-label">Story Type</label>
                <select className="flat-select" value={form.story_type}
                  onChange={(e) => setForm({ ...form, story_type: e.target.value })}>
                  {STORY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="flat-label">Deadline</label>
                <input className="flat-input" type="date" value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Description</label>
                <textarea className="flat-input" rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief summary of the story" />
              </div>
              {/* Publishing fields */}
              <div className="sm:col-span-2">
                <label className="flat-label flex items-center gap-1.5">
                  <ExternalLink className="w-3 h-3 text-surface-400" /> Headline <span className="text-surface-300 font-normal">(on-air title)</span>
                </label>
                <textarea className="flat-input" rows={2} value={form.headline}
                  onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Broadcast headline — appears on screen" />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label flex items-center gap-1.5">
                  <Hash className="w-3 h-3 text-surface-400" /> Hashtags
                </label>
                <input className="flat-input" value={form.hashtags}
                  onChange={(e) => setForm({ ...form, hashtags: e.target.value })} placeholder="#news #breaking" />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-surface-400" /> Short Description
                </label>
                <textarea className="flat-input" rows={2} value={form.short_description}
                  onChange={(e) => setForm({ ...form, short_description: e.target.value })} placeholder="Teaser / social media description" />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_open}
                    onChange={(e) => setForm({ ...form, is_open: e.target.checked })}
                    className="w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500" />
                  <span className="text-sm text-surface-600 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> Open for collaboration
                  </span>
                </label>
                <span className="text-xs text-surface-400">Anyone can edit this story</span>
              </div>
              {editingStory && (
                <>
                  <div className="sm:col-span-2">
                    <label className="flat-label">Data Gathered</label>
                    <textarea className="flat-input" rows={3} value={form.data_gathered}
                      onChange={(e) => setForm({ ...form, data_gathered: e.target.value })} placeholder="Research notes, sources, data collected" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flat-label">Plot / Structure Notes</label>
                    <textarea className="flat-input" rows={3} value={form.plot_notes}
                      onChange={(e) => setForm({ ...form, plot_notes: e.target.value })} placeholder="Story structure, key points, visual ideas" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flat-label">Script</label>
                    <textarea className="flat-input" rows={6} value={form.script}
                      onChange={(e) => setForm({ ...form, script: e.target.value })} placeholder="Full script for teleprompter" />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowCreate(false); setEditingStory(null); }} className="flat-btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="flat-btn-accent">
                {saving ? 'Saving...' : editingStory ? 'Update Story' : 'Create Story'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {STORY_TABS.filter(t => !t.adminOnly || canApprove).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`filter-pill ${tab === t.key ? 'filter-pill-active' : 'filter-pill-inactive'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : err ? (
        <div className="flat-card-static text-center py-12">
          <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
          <p className="text-surface-500">{err}</p>
          <button onClick={fetchStories} className="flat-btn-brand mt-4">Retry</button>
        </div>
      ) : stories.length === 0 ? (
        <div className="flat-card-static text-center py-12">
          <Newspaper className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-400">No stories found</p>
          <button onClick={openCreate} className="flat-btn-brand mt-4">Create First Story</button>
        </div>
      ) : (
        <div className="space-y-3">
          {stories.map((story) => {
            const sc = STATUS_FLOW[story.status] || STATUS_FLOW.draft;
            const StatusIcon = sc.icon;
            return (
              <div key={story.id} className="flat-card">
                <div className="flex flex-wrap items-center gap-2 mb-2 justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`flat-badge text-xs font-semibold border ${sc.color}`}>
                      <StatusIcon className="w-3 h-3 inline mr-1 -mt-0.5" /> {sc.label}
                    </span>
                    <span className="text-xs text-surface-400 uppercase tracking-wider">
                      {formatLabel(story.story_type)}
                    </span>
                    {story.is_open ? (
                      <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Open
                      </span>
                    ) : null}
                    {story.assigned_to_name && (
                      <span className="text-xs text-surface-400 flex items-center gap-1">
                        <User className="w-3 h-3" /> {story.assigned_to_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openActivity(story.id)}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50 transition-colors"
                      title="Activity">
                      <Activity className="w-3.5 h-3.5" />
                    </button>
                    {story.status === 'approved' && (
                      <a href={`/teleprompter/${story.id}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-surface-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                        title="Open in Teleprompter">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {canEdit(story) && !['approved', 'send_to_tasks', 'cancelled', 'confirmation'].includes(story.status) && (
                      <button onClick={() => openEdit(story)}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteConfirm(story.id)}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-surface-800">{story.title}</h3>
                {story.description && <p className="text-sm text-surface-500 mt-1 line-clamp-2">{story.description}</p>}
                {/* Publishing info */}
                {(story.headline || story.short_description || story.hashtags) && (
                  <div className="mt-2 pt-2 border-t border-surface-50 space-y-1">
                    {story.headline && <p className="text-xs text-surface-600"><ExternalLink className="w-3 h-3 inline mr-1 -mt-0.5" /><span className="font-medium">Headline:</span> {story.headline}</p>}
                    {story.short_description && <p className="text-xs text-surface-500 line-clamp-1">{story.short_description}</p>}
                    {story.hashtags && <p className="text-xs text-accent-600"><Hash className="w-3 h-3 inline mr-1 -mt-0.5" />{story.hashtags}</p>}
                  </div>
                )}
                {(story.voice_over_script || story.vo_artist_name || story.footage_details || story.guest_names) && (
                  <div className="mt-2 pt-2 border-t border-surface-50 space-y-1">
                    {story.vo_artist_name && <p className="text-xs text-surface-600"><User className="w-3 h-3 inline mr-1 -mt-0.5" /><span className="font-medium">VO:</span> {story.vo_artist_name}</p>}
                    {story.guest_names && <p className="text-xs text-surface-600"><User className="w-3 h-3 inline mr-1 -mt-0.5" /><span className="font-medium">Guests:</span> {story.guest_names}</p>}
                    {story.voice_over_script && <p className="text-xs text-surface-500 line-clamp-1"><FileText className="w-3 h-3 inline mr-1 -mt-0.5" /> VO script ready</p>}
                    {story.footage_details && <p className="text-xs text-surface-500 line-clamp-1"><BarChart3 className="w-3 h-3 inline mr-1 -mt-0.5" /> Footage: {story.footage_details}</p>}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {story.created_by_name && (
                    <span className="text-xs text-surface-400">By {story.created_by_name}</span>
                  )}
                  {story.assigned_to_name && (
                    <span className="text-xs text-surface-400">· Assigned: {story.assigned_to_name}</span>
                  )}
                  {story.approved_by_name && (
                    <span className="text-xs text-surface-400">· Approved by {story.approved_by_name}</span>
                  )}
                  {story.deadline && (
                    <span className="text-xs text-warning-600 font-medium">· Deadline: {formatDate(story.deadline)}</span>
                  )}
                  <span className="text-xs text-surface-300">· {story.created_at ? formatDate(story.created_at) : ''}</span>
                </div>

                {/* Workflow actions */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-surface-100">
                  {story.status === 'draft' && (
                    <button onClick={() => handleAdvanceStatus(story.id, 'data_gathering')}
                      className="flat-btn-surface text-xs">
                      <BarChart3 className="w-3 h-3" /> Start Data Gathering
                    </button>
                  )}
                  {story.status === 'data_gathering' && (
                    <button onClick={() => handleAdvanceStatus(story.id, 'script_writing')}
                      className="flat-btn-surface text-xs">
                      <FileText className="w-3 h-3" /> Move to Script Writing
                    </button>
                  )}
                  {(story.status === 'script_writing' || story.status === 'plotting' || story.status === 'add_ons') && (
                    <button onClick={() => handleOpenScriptEditor(story)}
                      className="flat-btn-surface text-xs">
                      <FileText className="w-3 h-3" /> {story.status === 'script_writing' ? 'Write Script' : 'Edit Script'}
                    </button>
                  )}
                  {story.status === 'script_writing' && story.script && story.script.trim() && (
                    <button onClick={() => handleAdvanceStatus(story.id, 'plotting')}
                      className="flat-btn-surface text-xs">
                      <BarChart3 className="w-3 h-3" /> Move to Plotting
                    </button>
                  )}
                  {story.status === 'plotting' && (
                    <button onClick={() => handleAdvanceStatus(story.id, 'add_ons')}
                      className="flat-btn-surface text-xs">
                      <FileText className="w-3 h-3" /> Add On's
                    </button>
                  )}
                  {story.status === 'add_ons' && (
                    <button onClick={() => handleSendToConfirmation(story.id)}
                      className="flat-btn-accent text-xs">
                      <Send className="w-3 h-3" /> Send to Confirmation
                    </button>
                  )}
                  {story.status === 'confirmation' && canApprove && (
                    <>
                      <button onClick={() => { setApprovingStory(story); setShowApproveModal(true); }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-success-600 hover:bg-success-700 shadow-sm shadow-success-200 px-3 py-1.5 rounded-lg transition-all">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => openRejectModal(story.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 border border-danger-200 px-3 py-1.5 rounded-lg transition-all">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
{story.status === 'approved' && (
                    <button onClick={async () => {
                      try {
                        const res = await api.post(`/stories/${story.id}/send-to-tasks`, {});
                        toast('Story sent to tasks', 'success');
                        fetchStories();
                      } catch (err: any) {
                        toast(err.response?.data?.error || 'Failed to send to tasks', 'error');
                      }
                    }} className="flat-btn-brand text-xs">
                      <Activity className="w-3 h-3" /> Send to Tasks
                    </button>
                  )}
                  {story.status === 'send_to_tasks' && canApprove && (
                    <div className="relative">
                      {reassignStoryId === story.id ? (
                        <select className="flat-select text-xs py-1 px-2 min-w-[180px]" autoFocus
                          value="" onChange={(e) => handleReassign(story.id, e.target.value)}
                          onBlur={() => setReassignStoryId(null)}>
                          <option value="">Change editor...</option>
                          {users.filter(u => u.role === 'video_editor').map((u: any) => (
                            <option key={u.profile_id} value={u.profile_id}>{u.full_name}</option>
                          ))}
                        </select>
                      ) : (
                        <button onClick={() => setReassignStoryId(story.id)}
                          className="flat-btn-surface text-xs">
                          <User className="w-3 h-3" /> Change Editor
                        </button>
                      )}
                    </div>
                  )}
                  {story.status === 'cancelled' && (
                    <>
                      {story.rejection_reason && (
                        <div className="w-full text-xs text-danger-600 italic mb-1">Reason: {story.rejection_reason}</div>
                      )}
                      <button onClick={() => handleAdvanceStatus(story.id, 'add_ons')}
                        className="flat-btn-accent text-xs">
                        <FileText className="w-3 h-3" /> Work Again (Add On's)
                      </button>
                      <button onClick={() => { setDeleteConfirm(story.id); }}
                        className="flat-btn-danger text-xs">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </>
                  )}
                  {(canApprove || (user?.access_level === 3 && !!story.is_open)) && !['cancelled', 'send_to_tasks', 'confirmation'].includes(story.status) && (
                    <div className="relative">
                      {assignStoryId === story.id ? (
                        <select className="flat-select text-xs py-1 px-2 min-w-[160px]" autoFocus
                          value="" onChange={(e) => handleReassignStory(story.id, e.target.value)}
                          onBlur={() => setAssignStoryId(null)}>
                          <option value="">Assign user...</option>
                          {users.filter(u => u.access_level >= (user?.access_level || 3) && (user?.access_level === 1 || u.role !== user?.role)).map((u: any) => (
                            <option key={u.profile_id} value={u.profile_id}>{u.full_name} — {u.role?.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      ) : (
                        <button onClick={() => { api.get('/users/assignable').then(r => setUsers(r.data)).catch(() => {}); setAssignStoryId(story.id); }}
                          className="flat-btn-surface text-xs">
                          <User className="w-3 h-3" /> Assign User
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Script Editor Modal */}
      {showScriptEditor && scriptEditStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => { setShowScriptEditor(false); setScriptEditStory(null); }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-accent-500" />
              <h3 className="text-sm font-semibold text-surface-700">Script Editor — {scriptEditStory.title}</h3>
              <button onClick={() => { setShowScriptEditor(false); setScriptEditStory(null); }}
                aria-label="Close script editor"
                className="ml-auto p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flat-label text-surface-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Starting <span className="text-surface-400 font-normal">(Intro / Lead)</span>
                </label>
                <textarea className="flat-input" rows={4} value={scriptForm.start}
                  onChange={(e) => setScriptForm({ ...scriptForm, start: e.target.value })}
                  placeholder="Opening lines, anchor introduction, key hook..." />
              </div>
              <div>
                <label className="flat-label text-surface-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-accent-500" /> Middle <span className="text-surface-400 font-normal">(Body / Details)</span>
                </label>
                <textarea className="flat-input" rows={6} value={scriptForm.middle}
                  onChange={(e) => setScriptForm({ ...scriptForm, middle: e.target.value })}
                  placeholder="Main content, interviews, data, visuals..." />
              </div>
              <div>
                <label className="flat-label text-surface-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> End <span className="text-surface-400 font-normal">(Closing / Sign-off)</span>
                </label>
                <textarea className="flat-input" rows={4} value={scriptForm.end}
                  onChange={(e) => setScriptForm({ ...scriptForm, end: e.target.value })}
                  placeholder="Closing remarks, anchor sign-off, next preview..." />
              </div>
              <div className="border-t border-surface-200 pt-4">
                <label className="flat-label text-surface-600 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-surface-400" /> Instructions for Video Editor
                </label>
                <textarea className="flat-input" rows={3} value={scriptForm.editor_instructions}
                  onChange={(e) => setScriptForm({ ...scriptForm, editor_instructions: e.target.value })}
                  placeholder="Visual style, graphics, cuts, pacing notes for the editor..." />
              </div>

              {/* Voice Over & Production details */}
              <div className="border-t border-surface-200 pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flat-label flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-surface-400" /> VO Artist
                    </label>
                    <select className="flat-select" value={scriptForm.vo_artist}
                      onChange={(e) => setScriptForm({ ...scriptForm, vo_artist: e.target.value })}>
                      <option value="">Not assigned</option>
                      {user && <option value={String(user.profile_id)}>Self ({user.full_name})</option>}
                      {users.filter(u => u.role === 'anchor' && u.profile_id !== user?.profile_id).map((u: any) => (
                        <option key={u.profile_id} value={u.profile_id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="flat-label flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-surface-400" /> Guest / Reporter Names
                    </label>
                    <input className="flat-input" value={scriptForm.guest_names}
                      onChange={(e) => setScriptForm({ ...scriptForm, guest_names: e.target.value })}
                      placeholder="Guests, reporter names" />
                  </div>
                </div>
                <div>
                  <label className="flat-label flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-surface-400" /> Voice Over Script
                  </label>
                  <textarea className="flat-input" rows={4} value={scriptForm.voice_over_script}
                    onChange={(e) => setScriptForm({ ...scriptForm, voice_over_script: e.target.value })}
                    placeholder="Narration / voice over script separate from on-air script..." />
                </div>
                <div>
                  <label className="flat-label flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-surface-400" /> Footage Details
                  </label>
                  <textarea className="flat-input" rows={3} value={scriptForm.footage_details}
                    onChange={(e) => setScriptForm({ ...scriptForm, footage_details: e.target.value })}
                    placeholder="B-roll, file footage, graphics, timings, sources..." />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => { localStorage.removeItem(`script_draft_${scriptEditStory.id}`); setShowScriptEditor(false); setScriptEditStory(null); }} className="flat-btn-secondary">Cancel</button>
                <button onClick={handleSaveScript} disabled={saving} className="flat-btn-accent">
                  {saving ? 'Saving...' : 'Save Script & Move to Plotting'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && approvingStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowApproveModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-success-500" />
              <h3 className="text-sm font-semibold text-surface-700">Approve Story</h3>
            </div>

            <div className="space-y-3 mb-5">
              <div className="bg-surface-50 rounded-xl p-3">
                <p className="text-sm font-semibold text-surface-800">{approvingStory.title}</p>
                <p className="text-xs text-surface-400 mt-1">{formatLabel(approvingStory.story_type)}</p>
              </div>

              {/* Workflow steps */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">What happens next:</p>
                <div className="flex items-center gap-2 text-xs text-surface-600">
                  <div className="w-6 h-6 rounded-full bg-success-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-success-600" />
                  </div>
                  <span>Story status set to <strong>Approved</strong></span>
                </div>
                <div className="flex items-center gap-2 text-xs text-surface-600">
                  <div className="w-6 h-6 rounded-full bg-accent-50 flex items-center justify-center shrink-0">
                    <FileText className="w-3 h-3 text-accent-600" />
                  </div>
                  <span>Production task created in <strong>Pending / Unassigned</strong></span>
                </div>
                <div className="flex items-center gap-2 text-xs text-surface-600">
                  <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-blue-600" />
                  </div>
                  <span>Video editors can <strong>Pick</strong> the task from Dashboard</span>
                </div>
              </div>

              {/* Assign video editor */}
              <div className="border-t border-surface-200 pt-3">
                <label className="flat-label flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-surface-400" /> Assign to Video Editor <span className="text-surface-300 font-normal">(optional)</span>
                </label>
                <select className="flat-select" value={approveAssignTo}
                  onChange={(e) => setApproveAssignTo(e.target.value)}>
                  <option value="">Leave unassigned — editors can pick</option>
                  {users.filter(u => u.role === 'video_editor').map((u: any) => (
                    <option key={u.profile_id} value={u.profile_id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-surface-100">
              <button type="button" onClick={() => { setShowApproveModal(false); setApprovingStory(null); setApproveAssignTo(''); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 bg-white hover:bg-surface-50 border border-surface-200 px-4 py-2 rounded-lg transition-all">Cancel</button>
              <button onClick={() => { setShowApproveModal(false); openRejectModal(approvingStory.id); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 border border-danger-200 px-3.5 py-2 rounded-lg transition-all">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
              <button onClick={handleApprove} disabled={saving}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-success-600 hover:bg-success-700 shadow-sm shadow-success-200 px-5 py-2 rounded-lg transition-all disabled:opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5" /> {saving ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => { setShowRejectModal(false); setRejectStoryId(null); setRejectionReason(''); }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="w-4 h-4 text-danger-500" />
              <h3 className="text-sm font-semibold text-surface-700">Reject Story</h3>
            </div>
            <p className="text-sm text-surface-500 mb-3">Provide a reason for rejection — this will be visible to the creator.</p>
            <textarea className="flat-input w-full" rows={4} value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection..." autoFocus />
            <div className="flex gap-3 justify-end mt-4">
              <button type="button" onClick={() => { setShowRejectModal(false); setRejectStoryId(null); setRejectionReason(''); }}
                className="flat-btn-secondary">Cancel</button>
              <button onClick={handleReject} disabled={saving || !rejectionReason.trim()}
                className="flat-btn-danger">
                <XCircle className="w-3.5 h-3.5" /> {saving ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {showActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowActivity(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-accent-500" />
              <h3 className="text-sm font-semibold text-surface-700">Activity Timeline</h3>
            </div>
            {activities.length === 0 ? (
              <p className="text-sm text-surface-400 text-center py-6">No activity recorded</p>
            ) : (
              <div className="space-y-3">
                {activities.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-surface-100 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-3 h-3 text-surface-400" />
                    </div>
                    <div>
                      <p className="text-surface-700">
                        <span className="font-medium text-surface-800">{a.user_name || 'System'}</span>
                        {' '}{formatLabel(a.action)}
                      </p>
                      {a.details && <p className="text-surface-400 text-xs mt-0.5">{a.details}</p>}
                      <p className="text-surface-300 text-xs mt-0.5">
                        <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
                        {a.created_at ? formatDateTime(a.created_at) : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowActivity(null)} className="flat-btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Delete Story</h3>
                <p className="text-xs text-surface-500">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete this story and all its activity history?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flat-btn text-xs px-4 py-2">Cancel</button>
              <button onClick={handleDelete} className="flat-btn-danger text-xs px-4 py-2"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
