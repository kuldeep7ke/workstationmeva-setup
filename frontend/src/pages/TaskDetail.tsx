import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatDate, formatDateTime } from '../utils/dates';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import SplashLoader from '../components/SplashLoader';
import { ArrowLeft, ArrowRight, Save, CheckCircle, Camera, Video, AlertTriangle, Loader2, Youtube, Monitor, Trash2, Play, XCircle, User, Send, FileText, Share2, Upload, ExternalLink, Copy, Check, Clock, ListTodo, Plus, RefreshCw } from 'lucide-react';
import { formatLabel } from '../utils/roles';

const WORKFLOW_PHASES = [
  { key: 'draft', label: 'Draft', icon: Clock },
  { key: 'script_writing', label: 'Write Script', icon: FileText },
  { key: 'footage_collection', label: 'Gather Footage', icon: Video },
  { key: 'waiting_confirmation', label: 'Confirmation', icon: Send },
  { key: 'correction_required', label: 'Correction', icon: AlertTriangle },
  { key: 'approved', label: 'Approved', icon: CheckCircle },
  { key: 'editor_assigned', label: 'Assign Editor', icon: User },
  { key: 'teleprompter_ready', label: 'Teleprompter', icon: Monitor },
  { key: 'prompting', label: 'Prompting', icon: Play },
  { key: 'recording_done', label: 'Recording Done', icon: Camera },
  { key: 'editing', label: 'Editing', icon: Video },
  { key: 'uploading', label: 'Uploading', icon: Upload },
  { key: 'published', label: 'Published', icon: Youtube },
  { key: 'under_review', label: 'Review', icon: CheckCircle },
  { key: 'completed', label: 'Completed', icon: Save },
];

const STATUS_STEPS: Record<string, string[]> = {
  draft: ['script_writing', 'cancelled'],
  script_writing: ['footage_collection'],
  footage_collection: ['waiting_confirmation'],
  waiting_confirmation: ['approved'],
  correction_required: ['waiting_confirmation'],
  approved: ['editor_assigned'],
  editor_assigned: ['teleprompter_ready'],
  teleprompter_ready: ['prompting'],
  prompting: ['recording_done'],
  recording_done: ['editing'],
  editing: ['uploading'],
  uploading: ['published'],
  published: ['under_review'],
  under_review: ['completed'],
  completed: [],
  cancelled: ['draft'],
};

const DELETABLE_STATUSES = ['draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'published', 'under_review', 'cancelled'];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', script_writing: 'Write Script', footage_collection: 'Gather Footage',
  waiting_confirmation: 'Confirmation', correction_required: 'Correction Required',
  approved: 'Approved', editor_assigned: 'Editor Assigned', teleprompter_ready: 'Teleprompter', prompting: 'Prompting',
  recording_done: 'Recording Done', editing: 'Editing', uploading: 'Uploading',
  published: 'Published', under_review: 'Under Review', completed: 'Completed', cancelled: 'Cancelled',
};

const STATUS_BACK: Record<string, string> = {
  script_writing: 'draft',
  footage_collection: 'script_writing',
  waiting_confirmation: 'footage_collection',
  correction_required: 'waiting_confirmation',
  approved: 'waiting_confirmation',
  editor_assigned: 'approved',
  teleprompter_ready: 'editor_assigned',
  prompting: 'teleprompter_ready',
  recording_done: 'teleprompter_ready',
  editing: 'recording_done',
  uploading: 'editing',
  published: 'uploading',
  under_review: 'published',
  completed: 'under_review',
  cancelled: 'draft',
};

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingAnchor, setSavingAnchor] = useState(false);
  const [savingEditor, setSavingEditor] = useState(false);

  const [anchorForm, setAnchorForm] = useState({ script: '', footage_url: '', recording_url: '', publish_link: '', status: '', remarks: '', audio_url: '' });
  const [editorForm, setEditorForm] = useState({ edited_video_url: '', thumbnail_url: '', upload_url: '', retakes: 0, corrections: '', anchoring_tone: '', news_age: '', remarks: '', status: '' });
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [savingNewsItem, setSavingNewsItem] = useState<number | null>(null);
  const [deleteNewsItemId, setDeleteNewsItemId] = useState<number | null>(null);
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [expandedCorrectionId, setExpandedCorrectionId] = useState<number | null>(null);
  const [correctionModalItem, setCorrectionModalItem] = useState<any>(null);
  const [correctionModalNotes, setCorrectionModalNotes] = useState('');
  const [newsForm, setNewsForm] = useState({ slug: '', news_script: '', reporter_id: '', reporter_name: '', anchor_name: '', footage_description: '', footage_type: 'from_internet', location: '' });
  const [editingNewsId, setEditingNewsId] = useState<number | null>(null);
  const [showNewsCreated, setShowNewsCreated] = useState(false);
  const [reporters, setReporters] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [recentLocations, setRecentLocations] = useState<string[]>([]);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showReporterDropdown, setShowReporterDropdown] = useState(false);
  const [assignEditorModal, setAssignEditorModal] = useState(false);
  const [availableEditors, setAvailableEditors] = useState<any[]>([]);
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [metaForm, setMetaForm] = useState({ youtube_title: '', youtube_description: '', youtube_keywords: '', youtube_url: '' });
  const [reviewForm, setReviewForm] = useState({ rating: '', comment: '', extra: '' });
  const [generatedMeta, setGeneratedMeta] = useState<any>(null);
  const [showGenerateFor, setShowGenerateFor] = useState<string | null>(null);
  const [ytInfo, setYtInfo] = useState<any>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpick, setConfirmUnpick] = useState(false);
  const [confirmMarkUploaded, setConfirmMarkUploaded] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmSendBack, setConfirmSendBack] = useState(false);
  const [correctedNews, setCorrectedNews] = useState<number[]>([]);
  const [copiedNewsField, setCopiedNewsField] = useState<{ id: number; field: string } | null>(null);
  const [confirmBackStage, setConfirmBackStage] = useState<string | null>(null);
  const [channelMeta, setChannelMeta] = useState<any>(null);
  const [showExtendDeadline, setShowExtendDeadline] = useState(false);
  const [extendDeadlineValue, setExtendDeadlineValue] = useState('');
  const [extendDeadlineReason, setExtendDeadlineReason] = useState('');
  const [extendingDeadline, setExtendingDeadline] = useState(false);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [reuseResults, setReuseResults] = useState<{ overall_percent: number; matches: any[] } | null>(null);
  const [showReuseModal, setShowReuseModal] = useState(false);
  const [pendingConfirmationStatus, setPendingConfirmationStatus] = useState<string | null>(null);
  const [remarksText, setRemarksText] = useState('');
  const [newsCorrectionInput, setNewsCorrectionInput] = useState<{ id: number; notes: string } | null>(null);
  const [reuseViewResults, setReuseViewResults] = useState<{ overall_percent: number; matches: any[] } | null>(null);
  const [reuseViewLoading, setReuseViewLoading] = useState(false);
  const [reusePopupTask, setReusePopupTask] = useState<any>(null);
  const [reusePopupNews, setReusePopupNews] = useState<any[]>([]);
  const [reusePopupLoading, setReusePopupLoading] = useState(false);
  const [showReassignCancelled, setShowReassignCancelled] = useState(false);
  const [reassignUserId, setReassignUserId] = useState('');
  const [reassignDeadline, setReassignDeadline] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [userWorkload, setUserWorkload] = useState<any[] | null>(null);
  const [workloadLoading, setWorkloadLoading] = useState(false);
  const [taskActivity, setTaskActivity] = useState<any[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchTask = () => {
    setLoading(!task);
    api.get(`/tasks/${id}`)
      .then((res) => {
        const t = res.data;
        setTask(t);
        setYtInfo(null);
        if (t.youtube_url) {
          api.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(t.youtube_url)}&format=json`)
            .then((yr) => setYtInfo(yr.data)).catch(() => {});
        }
        setRemarksText(t.remarks || '');
        setMetaForm({ youtube_title: t.youtube_title || '', youtube_description: t.youtube_description || '', youtube_keywords: t.youtube_keywords || '', youtube_url: t.youtube_url || '' });
        let rd: any = {};
        if (t.role_data) { try { rd = typeof t.role_data === 'string' ? JSON.parse(t.role_data) : t.role_data; } catch { rd = {}; } }
        setReviewForm({ rating: rd.review_rating || '', comment: rd.review_comment || '', extra: rd.review_extra || '' });
        if (t.status === 'draft' && !t.bulletin_template_id && user?.role === 'anchor' && t.assigned_to === user?.profile_id) {
          api.put(`/tasks/${id}`, { status: 'script_writing' }).then(() => { t.status = 'script_writing'; }).catch(() => {});
        }
        const anchorName = t.assigned_to_role === 'anchor' ? t.assigned_to_name : t.assigned_by_role === 'anchor' ? t.assigned_by_name : '';
        if (anchorName) {
          setNewsForm((prev) => ({ ...prev, anchor_name: anchorName }));
        }
        if (res.data.anchor_task) {
          const a = res.data.anchor_task;
          setAnchorForm({
            script: a.script || '', footage_url: a.footage_url || '',
            recording_url: a.recording_url || '', publish_link: a.publish_link || '',
            status: a.status || '', remarks: a.remarks || '', audio_url: a.audio_url || '',
          });
        }
        if (res.data.video_editor_task) {
          const e = res.data.video_editor_task;
          setEditorForm({
            edited_video_url: e.edited_video_url || '', thumbnail_url: e.thumbnail_url || '',
            upload_url: e.upload_url || '', retakes: e.retakes || 0,
            corrections: e.corrections || '', anchoring_tone: e.anchoring_tone || '',
            news_age: e.news_age || '', remarks: e.remarks || '', status: e.status || '',
          });
        }
        api.get(`/tasks/${id}/news-items`).then((nr) => {
          const items = Array.isArray(nr.data) ? nr.data : [];
          setNewsItems(items);
          if (!['draft', 'script_writing', 'footage_collection'].includes(t.status) && items.length > 0) {
            setReuseViewLoading(true);
            api.get(`/tasks/${id}/detect-reuse`)
              .then(r => setReuseViewResults(r.data))
              .catch(() => setReuseViewResults(null))
              .finally(() => setReuseViewLoading(false));
          }
        }).catch(() => {});
      })
      .catch(() => toast('Failed to load task', 'error'))
      .finally(() => setLoading(false));
    api.get('/reporters')
      .then((r) => setReporters(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    api.get('/users/available')
      .then((r) => setAvailableUsers(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    api.get('/tasks/locations/recent')
      .then((r) => setRecentLocations(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    api.get('/channel-metadata')
      .then((r) => setChannelMeta(r.data))
      .catch(() => {});
    api.get(`/tasks/${id}/activity`)
      .then((r) => setTaskActivity(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  };

  useEffect(() => { fetchTask(); }, [id]);

  useEffect(() => { setCorrectedNews([]); }, [task?.id, task?.status]);

  const updateAnchor = async () => {
    if (anchorForm.status === 'published' && !task.youtube_url) {
      toast('Add a YouTube URL before publishing', 'error');
      return;
    }
    setSavingAnchor(true);
    try {
      await api.put(`/tasks/${id}/anchor`, anchorForm);
      toast('Anchor task saved', 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally { setSavingAnchor(false); }
  };

  const updateEditor = async () => {
    if ((editorForm.status === 'verified' || editorForm.status === 'reviewed') && !task.youtube_url) {
      toast('Add a YouTube URL before completing', 'error');
      return;
    }
    setSavingEditor(true);
    try {
      await api.put(`/tasks/${id}/editor`, editorForm);
      toast('Editor task saved', 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally { setSavingEditor(false); }
  };

  const openAssignEditorModal = async () => {
    try {
      const res = await api.get('/users/available-editors');
      setAvailableEditors(res.data);
      setAssignEditorModal(true);
    } catch { toast('Failed to load video editors', 'error'); }
  };

  const handleAssignEditor = async (editorId: number) => {
    try {
      await api.put(`/tasks/${id}/assign-editor`, { video_editor_id: editorId });
      toast('Video editor assigned — task sent to editing', 'success');
      setAssignEditorModal(false);
      navigate('/dashboard/tasks');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to assign editor', 'error');
    }
  };

  const handleVerifyConfirm = async () => {
    setConfirmVerify(false);
    try {
      await api.put(`/tasks/${id}`, { status: 'editing' });
      toast('Task approved — sent to editing', 'success');
      if (user?.role === 'video_editor' && (user?.access_level || 3) === 2) {
        await handleAssignEditor(user.profile_id!);
      } else {
        await openAssignEditorModal();
      }
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to verify', 'error');
    }
  };

  const updateTaskStatus = async (status: string, extra: any = {}) => {
    if (status === 'editing') {
      setConfirmVerify(true);
      return;
    }
    if (status === 'waiting_confirmation') {
      setReuseLoading(true);
      setShowReuseModal(true);
      setPendingConfirmationStatus('waiting_confirmation');
      try {
        const res = await api.get(`/tasks/${id}/detect-reuse`);
        setReuseResults(res.data);
      } catch {
        setReuseResults(null);
      } finally {
        setReuseLoading(false);
      }
      return;
    }
    try {
      await api.put(`/tasks/${id}`, { status, ...extra });
      toast(`Task ${STATUS_LABELS[status] || status}`, 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update status', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    setConfirmDelete(false);
    try {
      await api.delete(`/tasks/${id}`);
      toast('Task moved to recycle bin', 'success');
      navigate('/dashboard/tasks');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to trash task', 'error');
    }
  };

  const handleMarkUploadedConfirm = async () => {
    setConfirmMarkUploaded(false);
    try {
      await api.put(`/tasks/${id}`, { status: 'uploading' });
      toast('Production marked as complete — uploading...', 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update', 'error');
    }
  };

  const handleFinalizeConfirm = async () => {
    setConfirmFinalize(false);
    try {
      await api.put(`/tasks/${id}`, { status: 'completed' });
      toast('Task completed', 'success');
      navigate('/dashboard/tasks');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to finalize', 'error');
    }
  };

  const handleSendBackConfirm = async () => {
    setConfirmSendBack(false);
    try {
      await api.put(`/tasks/${id}`, { status: 'correction_required' });
      toast('Task sent back for correction', 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to send back', 'error');
    }
  };

  const handleSubmitAllCorrected = async () => {
    const allCorrected = newsItems.length > 0 && newsItems.every((i: any) => correctedNews.includes(i.id));
    if (!allCorrected) { toast('Mark all news items as corrected first', 'error'); return; }
    try {
      await api.put(`/tasks/${id}`, { status: 'waiting_confirmation', correction_response: 'All news items corrected and resubmitted' });
      toast('Corrections submitted for re-confirmation', 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to submit corrections', 'error');
    }
  };

  const toggleCorrectedNews = (newsId: number) => {
    setCorrectedNews((prev) => prev.includes(newsId) ? prev.filter((n) => n !== newsId) : [...prev, newsId]);
  };

  const copyText = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`, 'success');
    } catch {
      toast('Copy failed — select and copy manually', 'error');
    }
  };

  const copyNewsField = (item: any, field: string) => {
    const label = field === 'reporter_name' ? 'Reporter' : field === 'footage_description' ? 'Footage description' : field === 'slug' ? 'Title' : 'Location';
    copyText(String(item[field] || ''), label);
    setCopiedNewsField({ id: item.id, field });
    setTimeout(() => setCopiedNewsField((c) => (c && c.id === item.id && c.field === field ? null : c)), 1500);
  };

  const copyNewsDetails = (item: any) => {
    const lines = [
      item.slug && `Title: ${item.slug}`,
      item.location && `Location: ${item.location}`,
      item.reporter_name && `Reporter: ${item.reporter_name}`,
      item.footage_description && `Footage Description: ${item.footage_description}`,
    ].filter(Boolean);
    copyText(lines.join('\n'), 'News details');
    setCopiedNewsField({ id: item.id, field: 'all' });
    setTimeout(() => setCopiedNewsField((c) => (c && c.id === item.id && c.field === 'all' ? null : c)), 1500);
  };

  const handleSaveCorrectionNotes = async () => {
    if (!correctionModalItem) return;
    try {
      await api.put(`/tasks/${id}/news-items/${correctionModalItem.id}`, { correction_notes: correctionModalNotes });
      setNewsItems(newsItems.map((i: any) => i.id === correctionModalItem.id ? { ...i, correction_notes: correctionModalNotes } : i));
      setCorrectionModalItem(null);
      toast('Correction notes saved', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    }
  };

  const handleExtendDeadline = async () => {
    if (!extendDeadlineValue || !extendDeadlineReason.trim()) return;
    setExtendingDeadline(true);
    try {
      await api.post(`/tasks/${id}/extend-deadline`, {
        new_deadline: extendDeadlineValue,
        reason: extendDeadlineReason.trim(),
      });
      toast('Deadline extended', 'success');
      setShowExtendDeadline(false);
      setExtendDeadlineReason('');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to extend deadline', 'error');
    } finally {
      setExtendingDeadline(false);
    }
  };

  if (loading) {
    return <SplashLoader />;
  }

  if (!task) {
    return (
      <div className="flat-card-static text-center py-12">
        <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
        <p className="text-surface-500">Task not found</p>
        <Link to="/dashboard/tasks" className="flat-btn-brand mt-4 inline-flex">Back to Tasks</Link>
      </div>
    );
  }

  const isAssigned = task.assigned_to === user!.profile_id || task.video_editor_id === user!.profile_id;
  const isAdmin = (user?.access_level || 3) <= 2;
  const canDelete = user?.access_level === 1 && DELETABLE_STATUSES.includes(task.status);

  let nextSteps = STATUS_STEPS[task.status] || [];
  if (task.bulletin_template_id) {
    nextSteps = nextSteps.filter((s) => s !== 'script_writing' && s !== 'footage_collection');
  }
  let backStep = STATUS_BACK[task.status];
  if (task.bulletin_template_id && (backStep === 'script_writing' || backStep === 'footage_collection')) {
    backStep = 'draft';
  }
  const deleteNewsItem = async () => {
    if (deleteNewsItemId === null) return;
    try {
      await api.delete(`/tasks/${id}/news-items/${deleteNewsItemId}`);
      setNewsItems(newsItems.filter((i: any) => i.id !== deleteNewsItemId));
      setDeleteNewsItemId(null);
    } catch { toast('Failed to delete', 'error'); }
  };

  const resetNewsForm = () => {
    setNewsForm({ slug: '', news_script: '', reporter_id: '', reporter_name: '', anchor_name: '', footage_description: '', footage_type: 'from_internet', location: '' });
    setEditingNewsId(null);
    setShowLocationDropdown(false);
  };

  const handleSaveNews = async () => {
    if (!newsForm.slug?.trim()) { toast('Slug / Title is required', 'error'); return; }
    if (!newsForm.location?.trim() && !(task.status === 'correction_required' && user?.role === 'anchor')) { toast('Location is required', 'error'); return; }
    if (newsForm.footage_type === 'stock' && !newsForm.footage_description?.trim()) {
      toast('Footage description is required when Archive is selected', 'error');
      return;
    }
    setSavingNewsItem(editingNewsId || -1);
    try {
      const anchorName = task.assigned_to_role === 'anchor' ? task.assigned_to_name : task.assigned_by_role === 'anchor' ? task.assigned_by_name : newsForm.anchor_name;
      const payload = { ...newsForm, anchor_name: anchorName, reporter_id: newsForm.reporter_id ? Number(newsForm.reporter_id) : null };
      if (editingNewsId) {
        await api.put(`/tasks/${id}/news-items/${editingNewsId}`, payload);
        toast('News updated', 'success');
      } else {
        const res = await api.post(`/tasks/${id}/news-items`, payload);
        setNewsItems([...newsItems, res.data]);
        setShowNewsCreated(true);
        setTimeout(() => setShowNewsCreated(false), 2500);
      }
       // Removed automatic stage advancement - user should manually advance after reviewing news
       // if (task.status === 'draft') {
       //   await api.put(`/tasks/${id}`, { status: task.bulletin_template_id ? 'waiting_confirmation' : 'script_writing' }).catch(() => {});
       // }
      fetchTask();
      resetNewsForm();
      if (editingNewsId) {
        const res = await api.get(`/tasks/${id}/news-items`);
        setNewsItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch { toast('Failed to save', 'error'); }
    finally { setSavingNewsItem(null); }
  };

  const handleSubmitConfirm = async () => {
    setConfirmSubmit(false);
    try {
      const fresh = (await api.get(`/tasks/${id}`)).data;
      let next: string | undefined;
      if (fresh.bulletin_template_id) {
        next = ['draft', 'correction_required', 'script_writing', 'footage_collection'].includes(fresh.status)
          ? 'waiting_confirmation'
          : (STATUS_STEPS[fresh.status] || [])[0];
      } else {
        next = (STATUS_STEPS[fresh.status] || [])[0];
      }
      if (!next) { toast('No next step available', 'info'); return; }
      await api.put(`/tasks/${id}`, { status: next });
      toast(`Task submitted — ${STATUS_LABELS[next] || next}`, 'success');
      navigate('/dashboard/tasks');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to submit', 'error');
    }
  };

  const handleSubmitNews = () => {
    setConfirmSubmit(true);
  };

  const handleBackStage = async () => {
    if (!confirmBackStage) return;
    const target = confirmBackStage;
    setConfirmBackStage(null);
    try {
      await api.put(`/tasks/${id}`, { status: target });
      toast(`Stage moved back to ${STATUS_LABELS[target] || target}`, 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to move stage back', 'error');
    }
  };

  const handleReuseProceed = async () => {
    const status = pendingConfirmationStatus;
    setShowReuseModal(false);
    setReuseResults(null);
    setPendingConfirmationStatus(null);
    if (!status) return;
    try {
      await api.put(`/tasks/${id}`, { status });
      toast(`Task ${STATUS_LABELS[status] || status}`, 'success');
      fetchTask();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update status', 'error');
    }
  };

  const handleSaveMetaField = async (field: string, value: string) => {
    try {
      await api.put(`/tasks/${id}`, { [field]: value });
      setTask((t: any) => (t ? { ...t, [field]: value } : t));
    } catch { /* silent fail */ }
  };

  const handleGenerateMeta = async (field: string) => {
    try {
      if (!generatedMeta) {
        const res = await api.get(`/tasks/${id}/generate-metadata`);
        setGeneratedMeta(res.data);
      }
      setShowGenerateFor(showGenerateFor === field ? null : field);
    } catch { toast('Failed to generate options', 'error'); }
  };

  const handleSelectMetaOption = async (field: string, value: string) => {
    const newForm = { ...metaForm, [field]: value };
    setMetaForm(newForm);
    setShowGenerateFor(null);
    setTask((t: any) => (t ? { ...t, [field]: value } : t));
    // Auto-save
    try {
      await api.put(`/tasks/${id}`, { [field]: value });
      toast(`${field.replace('youtube_', '').charAt(0).toUpperCase() + field.replace('youtube_', '').slice(1)} saved`, 'success');
    } catch { toast('Failed to save', 'error'); }
  };

  const handleEditNews = (item: any) => {
    setNewsForm({
      slug: item.slug || '', news_script: item.news_script || '',
      reporter_id: item.reporter_id ? String(item.reporter_id) : '', reporter_name: '',
      anchor_name: item.anchor_name || '',
      footage_description: item.footage_description || '', footage_type: item.footage_type || '',
      location: item.location || '',
    });
    setEditingNewsId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const runReuseCheck = async () => {
    setReuseViewLoading(true);
    setReuseViewResults(null);
    try {
      const res = await api.get(`/tasks/${id}/detect-reuse`);
      setReuseViewResults(res.data);
    } catch {
      toast('Failed to check reuse', 'error');
      setReuseViewResults(null);
    } finally {
      setReuseViewLoading(false);
    }
  };

  const bulletinName = task.headline || task.title?.replace(/^Prepare:\s*/i, '');

  const reviewRoleData = () => {
    let rd: any = {};
    if (task.role_data) { try { rd = typeof task.role_data === 'string' ? JSON.parse(task.role_data) : task.role_data; } catch { rd = {}; } }
    return { ...rd, review_rating: reviewForm.rating, review_comment: reviewForm.comment, review_extra: reviewForm.extra };
  };

  const ytDisplayTitle = task.youtube_title || ytInfo?.title || bulletinName || task.title || 'Video';

  const ytDisplayHashtags = (): string[] => {
    const saved = (task.youtube_keywords || '').split(',').map((k: string) => k.trim()).filter((k: string) => k && /^[a-zA-Z0-9\s]+$/.test(k));
    if (saved.length) return saved.slice(0, 3);
    const stop = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'all', 'can', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'who', 'did', 'she', 'use', 'way', 'say', 'too', 'any', 'try', 'last', 'first', 'after', 'back', 'other', 'than', 'then', 'them', 'these', 'so', 'some', 'very', 'when', 'come', 'there', 'each', 'which', 'their', 'what', 'said', 'this', 'have', 'from', 'they', 'been', 'were', 'into', 'just', 'like', 'over', 'only', 'know', 'take', 'year', 'good', 'could', 'state', 'work', 'life', 'even', 'more', 'much', 'here', 'well', 'news', 'today', 'yesterday', 'reported', 'reports', 'bulletin']);
    const words = [...(ytDisplayTitle || '').split(/\s+/), ...(bulletinName || '').toLowerCase().split(/\s+/)]
      .map((w: string) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w: string) => w.length >= 3 && !stop.has(w.toLowerCase()));
    return Array.from(new Set(words)).slice(0, 3);
  };

  const ytDisplayDescription = task.youtube_description || newsItems.map((i: any) => [i.slug, i.news_script].filter(Boolean).join('\n')).filter(Boolean).join('\n\n').substring(0, 500);

  const FOOTAGE_TYPES = [
    { value: 'on_scene', label: 'On Scene' },
    { value: 'from_internet', label: 'From Internet' },
    { value: 'stock', label: 'Archive' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Back + Workflow Stepper */}
      <div className="flex items-center justify-between">
        <Link to="/dashboard/tasks" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Tasks
        </Link>
        <span className="text-xs text-surface-400">v{task.version_number || 1}</span>
      </div>

      {/* Workflow Stepper */}
      <div className="flat-card">
        <div className="flex items-center gap-2 mb-3">
          <ListTodo className="w-4 h-4 text-accent-500" />
          <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Production Pipeline</span>
        </div>
        <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
          {WORKFLOW_PHASES.map((phase, idx) => {
            const currentIdx = WORKFLOW_PHASES.findIndex(p => p.key === task.status);
            const isActive = phase.key === task.status;
            const isPast = currentIdx > idx;
            const isCorrection = phase.key === 'correction_required';
            return (
              <div key={phase.key} className={`flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 rounded-lg transition-colors ${
                isActive ? 'bg-accent-100 text-accent-700 font-semibold ring-1 ring-accent-300' :
                isPast ? 'bg-success-50 text-success-600' :
                isCorrection ? 'text-orange-500' : 'bg-surface-100 text-surface-400'
              }`}>
                <phase.icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>{phase.label}</span>
                {idx < WORKFLOW_PHASES.length - 1 && <ArrowRight className="w-2 h-2 sm:w-3 sm:h-3 text-surface-300 hidden sm:block" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Info Card */}
      <div className="flat-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge-${task.priority}`}>{(task.priority || '').charAt(0).toUpperCase() + (task.priority || '').slice(1) || 'Medium'}</span>
            <span className={`badge-${task.status}`}>{STATUS_LABELS[task.status] || formatLabel(task.status)}</span>
            <span className="flat-badge bg-surface-100 text-surface-600 border border-surface-300 text-xs ml-1">{formatLabel(task.task_type)}</span>
          </div>
          {(isAdmin && (nextSteps.length > 0 || backStep)) || canDelete ? (
            <div className="flex flex-wrap gap-2">
              {isAdmin && backStep && task.status !== 'draft' && (
                <button onClick={() => setConfirmBackStage(backStep)} className="flat-btn-surface text-xs" title="Move the task back to the previous stage. All task data is preserved.">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to {STATUS_LABELS[backStep] || formatLabel(backStep)}
                </button>
              )}
              {isAdmin && nextSteps.map((step) => {
                const btnClass = step === 'cancelled' ? 'flat-btn-danger' :
                  step === 'completed' ? 'flat-btn-accent' :
                  step === 'published' ? 'flat-btn-brand' : 'flat-btn-brand';
                const label = step === 'editor_assigned' ? 'Next' : step === 'recording_done' ? 'Done' : (STATUS_LABELS[step] || step.charAt(0).toUpperCase() + step.slice(1).replace(/_/g, ' '));
                return (
                  <button key={step} onClick={() => updateTaskStatus(step)} className={`${btnClass} text-xs`}>
                    {step === 'cancelled' && <XCircle className="w-3.5 h-3.5" />}
                    {step === 'script_writing' && <Play className="w-3.5 h-3.5" />}
                    {step === 'correction_required' && <AlertTriangle className="w-3.5 h-3.5" />}
                    {label}
                  </button>
                );
              })}
              {canDelete && (
                <button onClick={() => setConfirmDelete(true)} className="flat-btn-danger text-xs">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
              {(isAdmin || user?.profile_id === task.assigned_by) && task.status !== 'completed' && task.status !== 'cancelled' && !['approved', 'editor_assigned', 'teleprompter_ready', 'recording_done', 'editing', 'uploading', 'published', 'under_review'].includes(task.status) && (
                <button onClick={() => {
                  if (task.deadline) {
                    const dt = task.deadline.replace(' ', 'T') + 'Z';
                    const local = new Date(dt);
                    const y = local.getFullYear();
                    const mo = String(local.getMonth() + 1).padStart(2, '0');
                    const d = String(local.getDate()).padStart(2, '0');
                    const h = String(local.getHours()).padStart(2, '0');
                    const mi = String(local.getMinutes()).padStart(2, '0');
                    setExtendDeadlineValue(`${y}-${mo}-${d}T${h}:${mi}`);
                  }
                  setShowExtendDeadline(true);
                }} className="flat-btn-surface text-xs">
                  <Clock className="w-3.5 h-3.5" /> Extend Deadline
                </button>
              )}
            </div>
          ) : null}
        </div>
        <h2 className="text-lg font-bold text-surface-800">{task.headline || task.title}</h2>
        {task.description && <p className="text-sm text-surface-500 mt-1.5">{task.description}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          <div>
            <p className="text-[11px] text-surface-400 uppercase tracking-wider">Assigned To</p>
            <p className="font-medium text-surface-700">{task.assigned_to_name || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-surface-400 uppercase tracking-wider">Assigned By</p>
            <p className="font-medium text-surface-700">{task.assigned_by_name || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-surface-400 uppercase tracking-wider">Type</p>
            <p className="font-medium text-surface-700">{formatLabel(task.task_type)}</p>
          </div>
          {task.archive_id && task.archive_name && (
            <div>
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Archive Footage</p>
              <p className="font-medium text-surface-700">{task.archive_name}{task.archive_location ? ` (${task.archive_location})` : ''}</p>
              {task.archive_details && <p className="text-[11px] text-surface-400 mt-0.5">{task.archive_details}</p>}
            </div>
          )}
          {task.location_id && task.location_name && (
            <div>
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Location</p>
              <p className="font-medium text-surface-700">{task.location_name}{task.location_region && task.location_region !== 'local' ? ` (${task.location_region})` : ''}</p>
            </div>
          )}
          {task.bulletin_template_name && (
            <div>
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Bulletin Slot</p>
              <p className="font-medium text-surface-700">{task.bulletin_template_name}{task.bulletin_template_time ? ` (${task.bulletin_template_time})` : ''}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] text-surface-400 uppercase tracking-wider">Created</p>
            <p className="font-medium text-surface-700">{task.created_at ? formatDate(task.created_at) : '—'}</p>
          </div>
          {task.video_editor_name && (
            <div>
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Video Editor</p>
              <p className="font-medium text-surface-700">{task.video_editor_name}</p>
            </div>
          )}
          {task.reviewer_name && (
            <div>
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Reviewer</p>
              <p className="font-medium text-surface-700">{task.reviewer_name}</p>
            </div>
          )}
          {task.deadline && (
            <div>
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Deadline</p>
              <p className="font-medium text-surface-700">
                {formatDateTime(task.deadline)}
                {task.deadline_extended ? ' (extended)' : ''}
              </p>
            </div>
          )}
          {task.duration && (
            <div>
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Duration</p>
              <p className="font-medium text-surface-700">{task.duration}</p>
            </div>
          )}
        </div>
        {task.correction_notes && ['correction_required', 'script_writing', 'under_review'].includes(task.status) && (
          <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-[11px] uppercase tracking-wider text-orange-600 font-semibold mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Correction Notes
            </p>
            <p className="text-sm text-orange-800">{task.correction_notes}</p>
            {task.correction_response && (
              <>
                <div className="border-t border-orange-200 my-2"></div>
                <p className="text-[11px] uppercase tracking-wider text-orange-600 font-semibold mb-1">Anchor Response</p>
                <p className="text-sm text-orange-800">{task.correction_response}</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Stage: Cancelled - Reassign */}
      {task.status === 'cancelled' && isAdmin && (
        <div className="flat-card border-danger-200">
          <div className="text-center py-4">
            <XCircle className="w-12 h-12 text-danger-500 mx-auto mb-2" />
            <h3 className="text-lg font-bold text-danger-700">Task Cancelled</h3>
            <p className="text-sm text-surface-500 mt-1">This task was cancelled due to deadline expiry.</p>
          </div>
          <div className="flex justify-center mt-2">
            <button onClick={() => {
              const now = new Date();
              const y = now.getFullYear();
              const mo = String(now.getMonth() + 1).padStart(2, '0');
              const d = String(now.getDate()).padStart(2, '0');
              const h = String(now.getHours()).padStart(2, '0');
              const mi = String(now.getMinutes()).padStart(2, '0');
              setReassignDeadline(`${y}-${mo}-${d}T${h}:${mi}`);
              setReassignUserId('');
              setShowReassignCancelled(true);
            }} className="flat-btn-accent text-sm">
              <RefreshCw className="w-4 h-4" /> Reassign Task
            </button>
          </div>
        </div>
      )}

      {/* Stage: Script Writing (Anchor) */}
      {task.status === 'script_writing' && !task.bulletin_template_id && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-500" /> Stage 1: Write Script
          </h3>
          <p className="text-xs text-surface-400 mb-4">Create the complete news script for recording.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="flat-label">Headline *</label>
              <input className="flat-input" required placeholder="News headline" value={task.headline || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { headline: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div className="sm:col-span-2">
              <label className="flat-label">Slug</label>
              <input className="flat-input" placeholder="url-friendly-slug" value={task.slug || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { slug: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div className="sm:col-span-2">
              <label className="flat-label">Anchor Intro</label>
              <textarea className="flat-input" rows={2} placeholder="Anchor introduction..."
                value={anchorForm.script} onChange={(e) => setAnchorForm({ ...anchorForm, script: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="flat-label">Main Story / Body *</label>
              <textarea className="flat-input" required rows={4} placeholder="Main story content..."
                value={task.main_story || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { main_story: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div className="sm:col-span-2">
              <label className="flat-label">Closing *</label>
              <textarea className="flat-input" required rows={2} placeholder="Closing remarks..."
                value={task.closing || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { closing: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Visual Cues</label>
              <input className="flat-input" placeholder="e.g. Show graphic at 0:30" value={task.visual_cues || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { visual_cues: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Pronunciation Notes</label>
              <input className="flat-input" placeholder="Hard-to-pronounce words" value={task.pronunciation_notes || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { pronunciation_notes: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Source Reference</label>
              <input className="flat-input" placeholder="Source of the news" value={task.source_reference || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { source_reference: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Duration</label>
              <select className="flat-select" value={task.duration || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { duration: e.target.value }); fetchTask(); } catch {} }}>
                <option value="">Select duration...</option>
                <option value="30 sec">30 sec</option>
                <option value="1 min">1 min</option>
                <option value="2 min">2 min</option>
                <option value="3 min">3 min</option>
                <option value="5 min">5 min</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={() => updateTaskStatus('footage_collection')} className="flat-btn-brand text-sm">
              <ArrowRight className="w-4 h-4" /> Submit Script
            </button>
          </div>
        </div>
      )}

      {/* Stage: Footage Collection */}
      {task.status === 'footage_collection' && !task.bulletin_template_id && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-accent-500" /> Stage 2: Gather Footage
          </h3>
          <p className="text-xs text-surface-400 mb-4">Collect all required media before recording.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flat-label">Camera Footage URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.camera_footage || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { camera_footage: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Reporter Footage URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.reporter_footage || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { reporter_footage: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Mobile Videos URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.mobile_videos || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { mobile_videos: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Photos URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.photos || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { photos: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Drone Shots URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.drone_shots || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { drone_shots: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Logos URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.logos || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { logos: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Graphics URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.graphics || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { graphics: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Archive Footage URL</label>
              <input className="flat-input" placeholder="https://, LAN, or drive path" value={task.archive_footage || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { archive_footage: e.target.value }); fetchTask(); } catch {} }} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={() => updateTaskStatus('waiting_confirmation')} className="flat-btn-brand text-sm">
              <ArrowRight className="w-4 h-4" /> Complete Stage
            </button>
          </div>
        </div>
      )}

      {/* Stage: Waiting Confirmation */}
      {task.status === 'waiting_confirmation' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 text-accent-500" /> Stage 3: Confirmation
          </h3>
          {user?.access_level !== undefined && (user.access_level <= 1 || user.role === 'editorial' || (user.role === 'video_editor' && user.access_level <= 2)) ? (
            <p className="text-xs text-surface-400 mb-4">Review each news item below. Flag any that need correction, or approve all to proceed.</p>
          ) : (
            <p className="text-xs text-surface-400">Awaiting review by an editor or admin.</p>
          )}
        </div>
      )}

      {/* Stage: Approved */}
      {task.status === 'approved' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success-500" /> Stage 4: Approved
          </h3>
          <div className="bg-success-50 border border-success-200 rounded-xl p-4 text-center">
            <CheckCircle className="w-10 h-10 text-success-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-success-700">Script Locked & Approved</p>
            <p className="text-xs text-success-500 mt-1">The script is now read-only. Approved for production.</p>
          </div>
          {isAdmin ? (
            task.video_editor_name ? (
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-surface-500">
                  <User className="w-3.5 h-3.5 text-accent-500" /> Video Editor: <span className="font-medium text-surface-700">{task.video_editor_name}</span>
                </div>
                <button onClick={() => openAssignEditorModal()} className="flat-btn-surface text-xs">
                  <User className="w-3.5 h-3.5" /> Change Editor
                </button>
              </div>
            ) : user?.role === 'video_editor' && (user?.access_level || 3) === 2 ? (
              <div className="mt-4 flex justify-end">
                <button onClick={() => handleAssignEditor(user.profile_id!)} className="flat-btn-brand text-sm">
                  <User className="w-4 h-4" /> Assign Me as Editor & Continue
                </button>
              </div>
            ) : (
              <div className="mt-4 flex justify-end">
                <button onClick={() => openAssignEditorModal()} className="flat-btn-brand text-sm">
                  <ArrowRight className="w-4 h-4" /> Assign Video Editor & Continue
                </button>
              </div>
            )
          ) : (
            <div className="mt-4 text-right">
              <p className="text-xs text-surface-400">Awaiting editor assignment by the admin.</p>
            </div>
          )}
        </div>
      )}

      {/* Stage: Teleprompter */}
      {(task.status === 'teleprompter_ready' || task.status === 'prompting') && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-accent-500" /> Stage 6: Teleprompter
          </h3>
          <p className="text-xs text-surface-400 mb-4">Load the approved script into the teleprompter, then record the video in the studio.</p>
          <div className="bg-surface-50 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-surface-700">Script Preview</p>
            <p className="text-xs text-surface-500 mt-1 whitespace-pre-wrap">
              {anchorForm.script || (newsItems.length > 0 ? newsItems.map((i: any) => `# ${i.slug || 'News'}\n\n${i.news_script || ''}`).join('\n\n---\n\n') : 'No script')}
            </p>
          </div>
          {task.script_imported_at ? (
            <div className="bg-success-50 border border-success-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-success-700">Script imported at {new Date(task.script_imported_at.replace(' ', 'T')).toLocaleString()}</p>
            </div>
          ) : (
            <button onClick={async () => {
              try { await api.put(`/tasks/${id}`, { script_imported_at: new Date().toISOString() }); fetchTask(); toast('Script loaded to teleprompter', 'success'); } catch {}
            }} className="flat-btn-accent text-sm mb-4">
              <Monitor className="w-4 h-4" /> Load Script
            </button>
          )}
          <div className="flex justify-end">
            <button onClick={() => updateTaskStatus(task.status === 'prompting' ? 'recording_done' : 'prompting')} className="flat-btn-brand text-sm">
              <ArrowRight className="w-4 h-4" /> {task.status === 'prompting' ? 'Mark Recording Done' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {/* Stage: Recording Done */}
      {task.status === 'recording_done' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <Camera className="w-4 h-4 text-accent-500" /> Stage 7: Recording Complete
          </h3>
          <p className="text-xs text-surface-400 mb-4">Recording finished — confirm to send the task to editing.</p>
          <div className="mt-4 flex justify-end">
            <button onClick={async () => {
              try { await api.put(`/tasks/${id}`, { status: 'editing' }); toast('Recording marked complete — sent to editing', 'success'); fetchTask(); }
              catch { toast('Failed to save', 'error'); }
            }} className="flat-btn-brand text-sm">
              <ArrowRight className="w-4 h-4" /> Mark Recording Complete
            </button>
          </div>
        </div>
      )}

      {/* Stage 10: Review & Mark Complete — admin only */}
      {isAdmin && task.status === 'under_review' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-accent-500" /> Stage 10: Review & Mark Complete
          </h3>
          <p className="text-xs text-surface-400 mb-4">Final quality check before completing the task — all fields optional.</p>
          <div className="space-y-4 mb-4">
            <div>
              <label className="flat-label">Rating</label>
              <div className="flex flex-wrap gap-2">
                {['Ok', 'Good', 'Not Bad', 'Average', 'Excellent'].map((r) => (
                  <button key={r} onClick={() => setReviewForm({ ...reviewForm, rating: r })}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${reviewForm.rating === r ? 'bg-accent-500 text-white border-accent-500' : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="flat-label">Comment</label>
              <textarea className="flat-input" rows={3} placeholder="Write your review comment..." value={reviewForm.comment}
                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })} />
            </div>
            <div>
              <label className="flat-label">Extra Notes</label>
              <input className="flat-input" placeholder="Any additional notes..." value={reviewForm.extra}
                onChange={(e) => setReviewForm({ ...reviewForm, extra: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => updateTaskStatus('correction_required', { role_data: reviewRoleData() })} className="flat-btn-danger text-sm">
              <AlertTriangle className="w-4 h-4" /> Send for Re-edit
            </button>
            <button onClick={() => updateTaskStatus('completed', { role_data: reviewRoleData() })} className="flat-btn-brand text-sm">
              <CheckCircle className="w-4 h-4" /> Mark Complete
            </button>
          </div>
        </div>
      )}

      {/* Stage: Completed Info */}
      {task.status === 'completed' && (
        <div className="flat-card border-success-200">
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-success-500 mx-auto mb-2" />
            <h3 className="text-lg font-bold text-success-700">Task Completed</h3>
            <p className="text-sm text-surface-500 mt-1">This task has been completed and archived.</p>
            {task.completed_at && <p className="text-xs text-surface-400 mt-1">Completed at: {new Date(task.completed_at.replace(' ', 'T') + 'Z').toLocaleString()}</p>}
            {task.published_at && <p className="text-xs text-surface-400">Published at: {formatDateTime(task.published_at)}</p>}
          </div>
        </div>
      )}

      {/* News Items */}
      {(isAssigned || isAdmin) && ['draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'under_review'].includes(task.status) && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 flex items-center gap-2 mb-4">
            <Video className="w-4 h-4 text-accent-500" /> {bulletinName} News
            {task.assigned_to_role === 'anchor' && task.assigned_to_name && (
              <span className="ml-auto text-xs font-normal text-surface-500 bg-surface-100 px-3 py-1 rounded-pill">
                Anchor: {task.assigned_to_name}
              </span>
            )}
          </h3>

          {(showNewsForm || editingNewsId) && !['published', 'under_review', 'completed', 'cancelled'].includes(task.status) && (
          <div className="bg-surface-50 rounded-xl p-4 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                {editingNewsId ? 'Edit News' : 'New News'}
              </span>
              {editingNewsId && (
                <button onClick={resetNewsForm} className="text-xs text-surface-400 hover:text-surface-600">Cancel Edit</button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`sm:col-span-2 grid grid-cols-1 ${task.status === 'correction_required' && user?.role === 'anchor' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
                <div>
                  <label className="flat-label">Reporter</label>
                  <div className="relative">
                    <input className="flat-input text-sm" placeholder="None" autoComplete="off"
                      value={(() => { const r = reporters.find((x: any) => String(x.id) === newsForm.reporter_id); return r ? r.name : newsForm.reporter_name || ''; })()}
                      onFocus={() => setShowReporterDropdown(true)}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = reporters.find((r: any) => r.name.toLowerCase() === val.toLowerCase());
                        setNewsForm({ ...newsForm, reporter_id: match ? String(match.id) : '', reporter_name: val });
                        setShowReporterDropdown(true);
                      }}
                      onBlur={() => setTimeout(() => setShowReporterDropdown(false), 200)} />
                    {showReporterDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-dropdown z-10 max-h-48 overflow-y-auto">
                        {(reporters.filter((r: any) => r.status !== 'inactive' && (!newsForm.reporter_name || r.name.toLowerCase().includes(newsForm.reporter_name.toLowerCase())))
                          .slice(0, newsForm.reporter_name ? undefined : 3)
                          .map((r: any) => (
                          <button key={r.id} type="button" onMouseDown={() => { setNewsForm({ ...newsForm, reporter_id: String(r.id), reporter_name: '' }); setShowReporterDropdown(false); }}
                            className="block w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
                            {r.name}{r.location ? ` (${r.location})` : ''}
                          </button>
                        )))}
                        {reporters.filter((r: any) => r.status !== 'inactive' && (!newsForm.reporter_name || r.name.toLowerCase().includes(newsForm.reporter_name.toLowerCase()))).length === 0 && (
                          <p className="px-3 py-2 text-sm text-surface-400">No matching reporters</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {!(task.status === 'correction_required' && user?.role === 'anchor') && (
                <div>
                  <label className="flat-label">Location <span className="text-danger-500">*</span></label>
                  <div className="relative">
                    <input className={`flat-input text-sm ${!newsForm.location?.trim() ? 'border-danger-400' : ''}`} placeholder="News location..." autoComplete="off"
                      value={newsForm.location}
                      onFocus={() => {
                        if (!newsForm.location) {
                          setShowLocationDropdown(true);
                        }
                      }}
                      onChange={(e) => {
                        setNewsForm({ ...newsForm, location: e.target.value });
                        setShowLocationDropdown(true);
                      }}
                      onBlur={() => setTimeout(() => setShowLocationDropdown(false), 200)} />
                    {showLocationDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-dropdown z-10 max-h-48 overflow-y-auto">
                        {recentLocations
                          .filter((l) => !newsForm.location || l.toLowerCase().includes(newsForm.location.toLowerCase()))
                          .map((l) => (
                            <button key={l} type="button" onMouseDown={() => { setNewsForm({ ...newsForm, location: l }); setShowLocationDropdown(false); }}
                              className="block w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
                              {l}
                            </button>
                          ))}
                        {newsForm.location && !recentLocations.some((l) => l.toLowerCase() === newsForm.location.toLowerCase()) && (
                          <button type="button" onMouseDown={() => {
                            setRecentLocations([newsForm.location, ...recentLocations.filter(l => l !== newsForm.location)].slice(0, 3));
                            setShowLocationDropdown(false);
                          }}
                            className="block w-full text-left px-3 py-2 text-sm text-accent-600 font-medium hover:bg-accent-50">
                            + Create "{newsForm.location}"
                          </button>
                        )}
                        {recentLocations.filter((l) => !newsForm.location || l.toLowerCase().includes(newsForm.location.toLowerCase())).length === 0 && !newsForm.location && (
                          <p className="px-3 py-2 text-sm text-surface-400">No recent locations</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                )}
                <div>
                  <label className="flat-label">Footage Type</label>
                  <select className="flat-select text-sm" value={newsForm.footage_type}
                    onChange={(e) => setNewsForm({ ...newsForm, footage_type: e.target.value })}>
                    <option value="">Select footage type...</option>
                    {FOOTAGE_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>{ft.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Slug / Title <span className="text-danger-500">*</span></label>
                <input className="flat-input text-sm" placeholder="e.g. PCMC Water Supply Update" autoComplete="off"
                  value={newsForm.slug}
                  onChange={(e) => setNewsForm({ ...newsForm, slug: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">News Script</label>
                <textarea className="flat-input text-sm" rows={4} placeholder="Write the news script here..." autoComplete="off"
                  value={newsForm.news_script}
                  onChange={(e) => setNewsForm({ ...newsForm, news_script: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">
                  Footage Description
                  {newsForm.footage_type === 'stock' && <span className="text-danger-500 ml-1">*</span>}
                </label>
                <textarea className={`flat-input text-sm ${newsForm.footage_type === 'stock' && !newsForm.footage_description?.trim() ? 'border-danger-400' : ''}`}
                  rows={2} autoComplete="off"
                  placeholder={newsForm.footage_type === 'stock' ? 'Required: Describe the archive footage needed...' : 'Describe what footage is needed for this news item...'}
                  value={newsForm.footage_description}
                  onChange={(e) => setNewsForm({ ...newsForm, footage_description: e.target.value })} />
                {newsForm.footage_type === 'stock' && !newsForm.footage_description?.trim() && (
                  <p className="text-xs text-danger-500 mt-1">Archive footage requires a description.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={async () => {
                if (task.status === 'correction_required' && editingNewsId) {
                  const valid = newsForm.slug?.trim() && !(newsForm.footage_type === 'stock' && !newsForm.footage_description?.trim());
                  if (!valid) { handleSaveNews(); return; }
                  setSavingNewsItem(editingNewsId);
                  try {
                    const anchorName = task.assigned_to_role === 'anchor' ? task.assigned_to_name : task.assigned_by_role === 'anchor' ? task.assigned_by_name : newsForm.anchor_name;
                    const payload = { ...newsForm, anchor_name: anchorName, reporter_id: newsForm.reporter_id ? Number(newsForm.reporter_id) : null };
                    await api.put(`/tasks/${id}/news-items/${editingNewsId}`, payload);
                    const res = await api.get(`/tasks/${id}/news-items`);
                    setNewsItems(Array.isArray(res.data) ? res.data : []);
                    resetNewsForm();
                    setCorrectedNews((prev) => prev.includes(editingNewsId) ? prev : [...prev, editingNewsId]);
                    toast('News corrected', 'success');
                  } catch { toast('Failed to save', 'error'); }
                  finally { setSavingNewsItem(null); }
                } else {
                  handleSaveNews();
                }
              }} disabled={savingNewsItem !== null} className="flat-btn-brand text-sm">
                {savingNewsItem !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingNewsItem !== null ? 'Saving...' : editingNewsId && task.status === 'correction_required' ? 'Corrected' : editingNewsId ? 'Update News' : 'Add News'}
              </button>
            </div>
          </div>
          )}

          <div className="space-y-2">
            {newsItems.length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-surface-400 mb-3">No news added yet.</p>
                 {!showNewsForm && !editingNewsId && ['draft', 'script_writing', 'correction_required'].includes(task.status) && (
                   <button onClick={() => { resetNewsForm(); setShowNewsForm(true); }} className="flat-btn-brand text-xs">
                     <Plus className="w-3.5 h-3.5" /> Add News
                   </button>
                 )}
              </div>
            )}
            {newsItems.length > 0 && !showNewsForm && !editingNewsId && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-surface-400">{newsItems.length} news item{newsItems.length > 1 ? 's' : ''}</span>
                 {['draft', 'script_writing', 'correction_required'].includes(task.status) && (
                   <button onClick={() => { resetNewsForm(); setShowNewsForm(true); }} className="flat-btn-brand text-xs">
                     <Plus className="w-3.5 h-3.5" /> Add News
                   </button>
                 )}
              </div>
            )}
            {newsItems.map((item: any, idx: number) => (
              <div key={item.id} className="border border-surface-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-surface-400">News #{idx + 1}</span>
                      {item.slug && (
                        <button onClick={() => copyNewsField(item, 'slug')} title="Click to copy title"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-800 cursor-copy transition-colors hover:text-accent-600">
                          {item.slug}
                          {copiedNewsField?.id === item.id && copiedNewsField?.field === 'slug'
                            ? <Check className="w-3.5 h-3.5 text-success-500 shrink-0" />
                            : <Copy className="w-3 h-3 text-surface-300 shrink-0" />}
                        </button>
                      )}
                    </div>
                    {item.news_script && (
                      <p className="text-xs text-surface-500 line-clamp-2">{item.news_script}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {item.location && (
                        <button onClick={() => copyNewsField(item, 'location')} title="Click to copy location"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 cursor-copy transition-all duration-150 hover:bg-accent-50 hover:text-accent-700 active:scale-95">
                          Location: {item.location}
                          {copiedNewsField?.id === item.id && copiedNewsField?.field === 'location'
                            ? <Check className="w-3 h-3 text-success-500" />
                            : <Copy className="w-2.5 h-2.5 text-surface-300" />}
                        </button>
                      )}
                      {item.reporter_name && (
                        <button onClick={() => copyNewsField(item, 'reporter_name')} title="Click to copy reporter"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 cursor-copy transition-all duration-150 hover:bg-accent-50 hover:text-accent-700 active:scale-95">
                          Reporter: {item.reporter_name}
                          {copiedNewsField?.id === item.id && copiedNewsField?.field === 'reporter_name'
                            ? <Check className="w-3 h-3 text-success-500" />
                            : <Copy className="w-2.5 h-2.5 text-surface-300" />}
                        </button>
                      )}
                      {item.anchor_name && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-100 text-surface-500">Anchor: {item.anchor_name}</span>
                      )}
                      {item.footage_type && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-100 text-surface-500">
                          {({
                            on_scene: 'On Scene', from_internet: 'From Internet', stock: 'Archive'
                          } as any)[item.footage_type] || item.footage_type}
                        </span>
                      )}
                      {reuseViewResults && !reuseViewLoading && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          reuseViewResults.overall_percent >= 50 ? 'bg-danger-50 text-danger-700' :
                          reuseViewResults.overall_percent >= 30 ? 'bg-warning-50 text-warning-700' :
                          'bg-success-50 text-success-700'
                        }`}>
                          {reuseViewResults.overall_percent}% reused
                        </span>
                      )}
                    </div>
                    {item.footage_description && (
                      <button onClick={() => copyNewsField(item, 'footage_description')} title="Click to copy footage description"
                        className="block w-full text-left cursor-copy transition-colors hover:text-accent-600">
                        <span className="text-[11px] text-surface-400 font-medium">Footage: </span>
                        <span className="text-xs text-surface-500">{item.footage_description}</span>
                        {copiedNewsField?.id === item.id && copiedNewsField?.field === 'footage_description'
                          ? <Check className="w-3 h-3 text-success-500 inline ml-1" />
                          : <Copy className="w-2.5 h-2.5 text-surface-300 inline ml-1" />}
                      </button>
                    )}
                    <button onClick={() => copyNewsDetails(item)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-600 hover:text-accent-700 transition-colors">
                      <Copy className="w-3 h-3" /> Copy Details
                    </button>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {task.status === 'correction_required' && (isAssigned || isAdmin) && (
                      <button onClick={() => toggleCorrectedNews(item.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 active:scale-90 ${
                          correctedNews.includes(item.id)
                            ? 'bg-success-50 text-success-700 ring-1 ring-success-300'
                            : 'text-surface-400 hover:text-success-600 hover:bg-success-50'
                        }`}
                        title={correctedNews.includes(item.id) ? 'Marked as corrected — click to undo' : 'Mark this news as corrected'}>
                        <CheckCircle className={`w-3.5 h-3.5 ${correctedNews.includes(item.id) ? 'fill-success-500 text-white' : ''}`} />
                        {correctedNews.includes(item.id) ? 'Corrected' : 'Mark Corrected'}
                      </button>
                    )}
                    <button onClick={() => handleEditNews(item)}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50 transition-all duration-150 active:scale-90"
                      title="Edit">
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    {task.status === 'correction_required' && isAssigned && item.correction_notes && (
                      <button onClick={() => setExpandedCorrectionId(expandedCorrectionId === item.id ? null : item.id)}
                        className={`p-1.5 rounded-lg transition-all duration-150 active:scale-90 ${expandedCorrectionId === item.id ? 'text-orange-600 bg-orange-50' : 'text-orange-600 bg-orange-50 hover:bg-orange-100 animate-pulse-correction'}`}
                        title="View Correction">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {task.status === 'completed' && isAdmin && (
                      <button onClick={() => { setCorrectionModalItem(item); setCorrectionModalNotes(item.correction_notes || ''); }}
                        className={`p-1.5 rounded-lg transition-all duration-150 active:scale-90 ${item.correction_notes ? 'text-orange-600 bg-orange-50 hover:bg-orange-100 animate-pulse-correction' : 'text-surface-400 hover:text-orange-600 hover:bg-orange-50'}`}
                        title={item.correction_notes ? 'Edit Correction Notes' : 'Add Correction'}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {['waiting_confirmation', 'correction_required', 'under_review', 'completed'].includes(task.status) && user?.access_level !== undefined && (user.access_level <= 1 || user.role === 'editorial' || (user.role === 'video_editor' && user.access_level <= 2)) && (
                      <button
                        onClick={() => setNewsCorrectionInput(newsCorrectionInput?.id === item.id ? null : { id: item.id, notes: '' })}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-orange-600 hover:bg-orange-50 transition-all duration-150 active:scale-90"
                        title="Mark Correction Required">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setDeleteNewsItemId(item.id)}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-all duration-150 active:scale-90"
                      title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {item.correction_notes && expandedCorrectionId === item.id && (
                  <div className="mt-2 pt-2 border-t border-orange-200">
                    <p className="text-xs text-orange-700"><span className="font-semibold">Corrections:</span> {item.correction_notes}</p>
                  </div>
                )}
                {item.correction_notes && expandedCorrectionId !== item.id && (
                  <div className="mt-2 pt-2 border-t border-orange-200">
                    <p className="text-[11px] text-orange-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Correction needed
                    </p>
                  </div>
                )}
                {newsCorrectionInput?.id === item.id && (() => {
                  const corr = newsCorrectionInput!;
                  return (
                  <div className="mt-2 pt-2 border-t border-orange-200">
                    <textarea className="flat-input text-xs w-full mb-2" rows={2} placeholder="Describe what needs to be corrected..."
                      value={corr.notes} onChange={(e) => setNewsCorrectionInput({ id: item.id, notes: e.target.value })} />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setNewsCorrectionInput(null)} className="flat-btn-secondary text-xs px-3 py-1.5">Cancel</button>
                      <button onClick={async () => {
                        if (!corr.notes.trim()) { toast('Please describe the correction needed', 'error'); return; }
                        try {
                          await api.put(`/tasks/${id}/news-items/${item.id}`, { correction_notes: corr.notes });
                          setNewsCorrectionInput(null);
                          if (task.status === 'waiting_confirmation' || task.status === 'under_review') {
                            await updateTaskStatus('correction_required');
                          } else {
                            toast('Correction flagged — send the task back to the anchor', 'success');
                            fetchTask();
                          }
                        } catch { toast('Failed to mark correction', 'error'); }
                      }} className="flat-btn-danger text-xs px-3 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Submit Correction
                      </button>
                    </div>
                  </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {task.status === 'completed' && isAdmin && newsItems.some((i: any) => i.correction_notes) && (
            <div className="flex justify-end mt-4">
              <button onClick={() => setConfirmSendBack(true)} className="flat-btn-warning text-sm">
                <AlertTriangle className="w-4 h-4" /> Send Back
              </button>
            </div>
          )}

          {['draft', 'script_writing', 'footage_collection'].includes(task.status) && newsItems.length > 0 && user?.profile_id === task.assigned_to && (
            <div className="flex justify-end mt-4">
              <button onClick={handleSubmitNews}
                className="flat-btn-brand text-xs px-3 py-1.5">
                <Send className="w-3.5 h-3.5" /> Submit for Approval
              </button>
            </div>
          )}

          {task.status === 'correction_required' && (isAssigned || isAdmin) && newsItems.length > 0 && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-orange-800">
                  <span className="font-semibold">{correctedNews.length} / {newsItems.length}</span> news items corrected
                  {correctedNews.length < newsItems.length && (
                    <span className="block text-orange-600 mt-0.5">Mark all news items as corrected to submit for re-confirmation.</span>
                  )}
                </div>
                <button onClick={handleSubmitAllCorrected}
                  disabled={correctedNews.length < newsItems.length}
                  className="flat-btn-accent text-xs px-3 py-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Submit All Corrected
                </button>
              </div>
            </div>
          )}

          {task.status === 'waiting_confirmation' && user?.access_level !== undefined && (user.access_level <= 1 || user.role === 'editorial' || (user.role === 'video_editor' && user.access_level <= 2)) && newsItems.length > 0 && (
            <div className="flex justify-end mt-4">
              <button onClick={() => updateTaskStatus('approved')} className="flat-btn-brand text-sm">
                <CheckCircle className="w-4 h-4" /> Approve All News
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stage: Editing / Uploading - Video production */}
      {(task.status === 'editing' || task.status === 'uploading') && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-accent-500" /> Stage {task.status === 'editing' ? '8' : '9'}: {task.status === 'editing' ? 'Video Editing' : 'Uploading'}
          </h3>
          <div className="flex items-center justify-between gap-2 mb-4 rounded-xl bg-surface-50 p-3">
            <div className="flex items-center gap-2 text-xs text-surface-500">
              <User className="w-3.5 h-3.5 text-accent-500" /> Video Editor: <span className="font-medium text-surface-700">{task.video_editor_name || 'Not assigned'}</span>
            </div>
            <button onClick={() => openAssignEditorModal()} className="flat-btn-surface text-xs">
              <User className="w-3.5 h-3.5" /> {task.video_editor_name ? 'Change Editor' : 'Assign Editor'}
            </button>
          </div>
          {task.status === 'uploading' && (
            <div className="mb-4">
              <label className="flat-label">Video Link (YouTube)</label>
              <input className="flat-input" placeholder="https://www.youtube.com/watch?v=..."
                value={metaForm.youtube_url}
                onChange={(e) => setMetaForm({ ...metaForm, youtube_url: e.target.value })}
                onBlur={(e) => handleSaveMetaField('youtube_url', e.target.value)} />
              {!metaForm.youtube_url && <p className="text-xs text-surface-400 mt-1">Upload the rendered video to YouTube and paste the video link here before publishing.</p>}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            {task.status === 'editing' && (
              <button onClick={() => updateTaskStatus('uploading')} className="flat-btn-brand text-sm">
                <Loader2 className="w-4 h-4" /> Rendering Video
              </button>
            )}
            {task.status === 'uploading' && (
              <button onClick={() => updateTaskStatus('published')} className="flat-btn-brand text-sm">
                <CheckCircle className="w-4 h-4" /> Publish
              </button>
            )}
          </div>
        </div>
      )}

      {/* YouTube Metadata */}
      {(isAssigned || isAdmin) && task.status === 'uploading' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 flex items-center gap-2 mb-4">
            <Youtube className="w-4 h-4 text-danger-500" /> YouTube Metadata
          </h3>
          <div className="space-y-4">
            <div>
              <label className="flat-label">Title</label>
              <div className="flex gap-2">
                <input className="flat-input flex-1 cursor-pointer" placeholder="YouTube video title"
                  value={metaForm.youtube_title}
                  onChange={(e) => setMetaForm({ ...metaForm, youtube_title: e.target.value })}
                  onBlur={(e) => handleSaveMetaField('youtube_title', e.target.value)}
                  onClick={(e) => {
                    const target = e.target as HTMLInputElement;
                    target.select();
                    if (metaForm.youtube_title) {
                      navigator.clipboard.writeText(metaForm.youtube_title);
                      toast('Title copied!', 'success');
                    }
                  }} />
                <button onClick={() => handleGenerateMeta('youtube_title')} className="flat-btn-surface text-sm whitespace-nowrap">
                  <FileText className="w-4 h-4" /> Generate
                </button>
              </div>
              {showGenerateFor === 'youtube_title' && generatedMeta?.titleOptions && (
                <div className="mt-2 space-y-1 bg-surface-50 rounded-xl p-2">
                  {generatedMeta.titleOptions.map((opt: any, i: number) => (
                    <button key={i} onMouseDown={() => handleSelectMetaOption('youtube_title', opt.value)}
                      className="block w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 rounded-lg">
                      <span className="text-xs text-surface-400 block">{opt.label}</span>
                      <span className="font-medium">{opt.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="flat-label">Description / Summary</label>
              <div className="flex gap-2">
                <textarea className="flat-input flex-1 cursor-pointer" rows={3} placeholder="YouTube video description"
                  value={metaForm.youtube_description}
                  onChange={(e) => setMetaForm({ ...metaForm, youtube_description: e.target.value })}
                  onBlur={(e) => handleSaveMetaField('youtube_description', e.target.value)}
                  onClick={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.select();
                    if (metaForm.youtube_description) {
                      navigator.clipboard.writeText(metaForm.youtube_description);
                      toast('Description copied!', 'success');
                    }
                  }} />
                <button onClick={() => handleGenerateMeta('youtube_description')} className="flat-btn-surface text-sm whitespace-nowrap self-start">
                  <FileText className="w-4 h-4" /> Generate
                </button>
              </div>
              {showGenerateFor === 'youtube_description' && generatedMeta?.descriptionOptions && (
                <div className="mt-2 space-y-1 bg-surface-50 rounded-xl p-2">
                  {generatedMeta.descriptionOptions.map((opt: any, i: number) => (
                    <button key={i} onMouseDown={() => handleSelectMetaOption('youtube_description', opt.value)}
                      className="block w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 rounded-lg">
                      <span className="text-xs text-surface-400 block">{opt.label}</span>
                      <span className="font-medium">{opt.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="flat-label">Keywords</label>
              <div className="flex gap-2">
                <input className="flat-input flex-1 cursor-pointer" placeholder="keyword1, keyword2, keyword3"
                  value={metaForm.youtube_keywords}
                  onChange={(e) => setMetaForm({ ...metaForm, youtube_keywords: e.target.value })}
                  onBlur={(e) => handleSaveMetaField('youtube_keywords', e.target.value)}
                  onClick={(e) => {
                    const target = e.target as HTMLInputElement;
                    target.select();
                    if (metaForm.youtube_keywords) {
                      navigator.clipboard.writeText(metaForm.youtube_keywords);
                      toast('Keywords copied!', 'success');
                    }
                  }} />
                <button onClick={() => handleGenerateMeta('youtube_keywords')} className="flat-btn-surface text-sm whitespace-nowrap">
                  <FileText className="w-4 h-4" /> Generate
                </button>
              </div>
              {showGenerateFor === 'youtube_keywords' && generatedMeta?.keywordOptions && (
                <div className="mt-2 space-y-1 bg-surface-50 rounded-xl p-2">
                  {generatedMeta.keywordOptions.map((opt: any, i: number) => (
                    <button key={i} onMouseDown={() => handleSelectMetaOption('youtube_keywords', opt.value)}
                      className="block w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 rounded-lg">
                      <span className="text-xs text-surface-400 block">{opt.label}</span>
                      <span className="font-medium">{opt.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {showNewsCreated && (
        <div className="fixed bottom-6 right-6 z-50 bg-white rounded-xl shadow-lg border border-success-200 p-4 flex items-center gap-3 animate-slide-up">
          <CheckCircle className="w-5 h-5 text-success-500" />
          <p className="text-sm text-surface-700">News created below — verify it.</p>
        </div>
      )}

      {(task.youtube_url) && (
        <div className="flat-card">
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href={task.youtube_url} target="_blank" rel="noopener noreferrer"
              className="shrink-0 group flex justify-center">
              <img src={`https://img.youtube.com/vi/${task.youtube_url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || ''}/mqdefault.jpg`} alt=""
                className="w-full sm:w-44 h-24 rounded-lg object-cover border border-surface-200 group-hover:border-accent-300 transition-colors" />
            </a>
            <div className="min-w-0 flex-1">
              {/* YouTube Link */}
              <div className="flex items-center gap-2 mb-2">
                <a href={task.youtube_url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1">
                  <ExternalLink className="w-4 h-4" /> Watch on YouTube
                </a>
              </div>
              
              {/* Hashtags in lowercase badges */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ytDisplayHashtags().map((k: string) => (
                  <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-accent-50 text-accent-600 border border-accent-100 lowercase">
                    {k.toLowerCase()}
                  </span>
                ))}
              </div>
              
              {/* Title */}
              <p className="text-sm font-semibold text-surface-800 truncate mb-1">{ytDisplayTitle}</p>
              
              {/* Description */}
              {(() => {
                if (!ytDisplayDescription) return null;
                const full = ytDisplayDescription.split('\n').map((l: string) => l.trim()).filter(Boolean).join(' ');
                const text = full.slice(0, 220);
                return (
                  <p className="text-xs text-surface-500 line-clamp-2">
                    {text}{full.length > text.length ? '...' : ''}
                  </p>
                );
              })()}
            </div>
            {task.youtube_url && (
              <button onClick={() => {
                    const slugs = (newsItems || []).map((n: any) => n.slug).filter(Boolean);
                    const metaText = [task.youtube_title || '', task.youtube_description || ''].join(' ').toLowerCase();
                    const filteredSlugs = slugs.filter((s: string) => !metaText.includes(s.toLowerCase()));
                    const slugSection = filteredSlugs.length > 0 ? filteredSlugs.slice(0, 3).join('\n------------\n') + '\n------------\n' : '';
                    const ch = channelMeta || {} as any;
                    const channelName = ch.channel_name || 'Workstation Meva';
                    const channelDisplay = ch.channel_display_name || channelName;
                    const website = ch.website_url || '';
                    const editorName = ch.editor_name || '';
                    const editorPosition = ch.editor_position || '';
                    const msg = [
                      `*${channelName}*`,
                      `*${bulletinName || task.title || ''}*`,
                      '------------',
                      slugSection,
                      task.youtube_url,
                      '------------',
                      `महत्वाच्या घडामोडींचे अपडेट्स मिळवण्यासाठी "${channelDisplay}" चॅनलला *SUBSCRIBE* करा`,
                      website,
                      'या संकेतस्थळाला भेट द्या',
                      `${editorName}, ${editorPosition}, ${channelDisplay}`,
                    ].filter(Boolean).join('\n');
                    navigator.clipboard.writeText(msg);
                    toast('Share link copied to clipboard', 'success');
                  }}
                    className="flat-btn-surface text-xs shrink-0">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                )}
              </div>
            </div>
      )}

      {/* Published stage - publish links */}
      {task.status === 'published' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
            <Youtube className="w-4 h-4 text-danger-500" /> Stage 9: Published
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="flat-label">YouTube Link</label>
              <input className="flat-input" placeholder="https://youtube.com/..." value={task.youtube_url || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { youtube_url: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Facebook Link</label>
              <input className="flat-input" placeholder="https://facebook.com/..." value={task.facebook_link || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { facebook_link: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Instagram Link</label>
              <input className="flat-input" placeholder="https://instagram.com/..." value={task.instagram_link || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { instagram_link: e.target.value }); fetchTask(); } catch {} }} />
            </div>
            <div>
              <label className="flat-label">Website Link</label>
              <input className="flat-input" placeholder="https://..." value={task.website_link || ''}
                onChange={async (e) => { try { await api.put(`/tasks/${id}`, { website_link: e.target.value }); fetchTask(); } catch {} }} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={() => updateTaskStatus('under_review')} className="flat-btn-brand text-sm">
              <ArrowRight className="w-4 h-4" /> Send for Review
            </button>
          </div>
        </div>
      )}

      {/* Content Reuse Check — only when news items exist */}
      {newsItems.length > 0 && ['draft', 'script_writing', 'footage_collection', 'waiting_confirmation', 'correction_required', 'approved', 'editor_assigned', 'teleprompter_ready', 'prompting', 'recording_done', 'editing', 'uploading', 'under_review', 'completed', 'cancelled'].includes(task.status) && (
        <div className="flat-card">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-surface-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-surface-400" /> Content Reuse Check
            </h3>
            {!reuseViewLoading && !reuseViewResults && (
              <button onClick={runReuseCheck} className="flat-btn-surface text-xs">
                <RefreshCw className="w-3.5 h-3.5" /> Check Reuse
              </button>
            )}
            {reuseViewResults && !reuseViewLoading && (
              <span className={`text-xs font-bold ${reuseViewResults.overall_percent >= 50 ? 'text-danger-600' : reuseViewResults.overall_percent >= 30 ? 'text-warning-600' : 'text-success-600'}`}>
                {reuseViewResults.overall_percent}% reused
              </span>
            )}
          </div>
          {reuseViewLoading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-full h-1.5 bg-surface-200 rounded-full overflow-hidden animate-pulse"><div className="w-1/3 h-full bg-accent-200 rounded-full" /></div>
              <span className="text-xs text-surface-400 shrink-0">Scanning...</span>
            </div>
          ) : reuseViewResults ? (
            reuseViewResults.matches.length > 0 ? (
              <>
                <div className="w-full h-1.5 bg-surface-200 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${reuseViewResults.overall_percent >= 50 ? 'bg-danger-500' : reuseViewResults.overall_percent >= 30 ? 'bg-warning-500' : 'bg-success-500'}`}
                    style={{ width: `${reuseViewResults.overall_percent}%` }} />
                </div>
                <div className="space-y-1.5">
                  {reuseViewResults.matches.slice(0, 5).map((m: any) => (
                    <div key={m.task_id} className="flex items-center justify-between p-2 rounded-lg border border-surface-100 hover:border-accent-100 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-surface-700 truncate">{m.title}</p>
                        <p className="text-[11px] text-surface-400">{m.created_at?.slice(0, 10)} — {m.match_percent}% match</p>
                      </div>
                      <button onClick={async () => {
                        setReusePopupTask(m);
                        setReusePopupLoading(true);
                        setReusePopupNews([]);
                        try {
                          const res = await api.get(`/tasks/${m.task_id}/news-items`);
                          setReusePopupNews(Array.isArray(res.data) ? res.data : []);
                        } catch {}
                        setReusePopupLoading(false);
                      }} className="text-xs text-accent-600 hover:text-accent-700 font-medium shrink-0 ml-2">View</button>
                    </div>
                  ))}
                  {reuseViewResults.matches.length > 5 && (
                    <p className="text-[11px] text-surface-400 text-center">+{reuseViewResults.matches.length - 5} more</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-surface-400">No significant content reuse detected in last 7 days</p>
            )
          ) : (
            <p className="text-xs text-surface-400">Click "Check Reuse" to scan for content similarity with recent tasks.</p>
          )}
        </div>
      )}

      {task.status === 'under_review' && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-surface-500" /> Review Remarks
          </h3>
          <textarea
            className="flat-input text-sm w-full"
            rows={3}
            placeholder="Add remarks for this task..."
            value={remarksText}
            onChange={(e) => setRemarksText(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <button onClick={async () => {
              try {
                await api.put(`/tasks/${id}`, { remarks: remarksText });
                toast('Remarks saved', 'success');
              } catch { toast('Failed to save remarks', 'error'); }
            }} className="flat-btn-accent text-xs">
              <Save className="w-3.5 h-3.5" /> Save Remarks
            </button>
          </div>
        </div>
      )}

      {/* Task Activity (Admin only) */}
      {isAdmin && taskActivity && taskActivity.length > 0 && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-surface-500" /> Task Activity
          </h3>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {taskActivity.map((log: any) => (
              <div key={log.id} className="flex items-start gap-2 text-xs text-surface-500 py-1.5 border-b border-surface-100 last:border-0">
                <span className="shrink-0 w-16 text-[10px] text-surface-400">{log.created_at?.slice(0, 10)}</span>
                <span className="font-medium text-surface-600 shrink-0">{log.full_name || `User #${log.user_id}`}</span>
                <span className="text-surface-400 truncate">{log.details || log.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmVerify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmVerify(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-success-50 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-success-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Verify & Assign Editor</h3>
                <p className="text-xs text-surface-400">Confirm the recording and send the task to editing.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Verify "{task?.title}" recording and assign an editor?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmVerify(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleVerifyConfirm} className="flat-btn-accent text-xs">
                <CheckCircle className="w-4 h-4" /> Verify & Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {showReuseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => { setShowReuseModal(false); setReuseResults(null); setPendingConfirmationStatus(null); }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-warning-50 flex items-center justify-center">
                {reuseLoading ? <Loader2 className="w-5 h-5 text-warning-600 animate-spin" /> : <AlertTriangle className="w-5 h-5 text-warning-600" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Content Reuse Detection</h3>
                <p className="text-xs text-surface-400">Checking recent 7 days for similar content</p>
              </div>
            </div>
            {reuseLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-accent-500 animate-spin" />
                <span className="ml-2 text-sm text-surface-500">Scanning for reused content...</span>
              </div>
            ) : reuseResults && reuseResults.overall_percent > 0 ? (
              <>
                <div className="bg-surface-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-surface-700">Reuse Score</span>
                    <span className={`text-lg font-bold ${reuseResults.overall_percent >= 50 ? 'text-danger-600' : reuseResults.overall_percent >= 30 ? 'text-warning-600' : 'text-success-600'}`}>
                      {reuseResults.overall_percent}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-surface-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${reuseResults.overall_percent >= 50 ? 'bg-danger-500' : reuseResults.overall_percent >= 30 ? 'bg-warning-500' : 'bg-success-500'}`}
                      style={{ width: `${reuseResults.overall_percent}%` }} />
                  </div>
                  <p className="text-xs text-surface-400 mt-2">
                    {reuseResults.overall_percent >= 50 ? 'High similarity — consider rewriting' :
                     reuseResults.overall_percent >= 30 ? 'Moderate similarity — review matches below' :
                     'Low similarity — content appears fresh'}
                  </p>
                </div>
                <p className="text-xs font-medium text-surface-500 mb-2">Matched in {reuseResults.matches.length} recent task{reuseResults.matches.length !== 1 ? 's' : ''}:</p>
                <div className="space-y-2">
                  {reuseResults.matches.map((m: any) => (
                    <div key={m.task_id} className="flex items-center justify-between p-2.5 rounded-xl border border-surface-200 hover:border-accent-200 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-800 truncate">{m.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-surface-400 mt-0.5">
                          <span>{m.created_at?.slice(0, 10) || '—'}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            m.status === 'completed' || m.status === 'published' || m.status === 'under_review' ? 'bg-success-50 text-success-600' : 'bg-surface-100 text-surface-500'
                          }`}>{m.status}</span>
                          <span className="font-medium text-accent-600">{m.match_percent}% match</span>
                        </div>
                      </div>
                      <button onClick={() => { setShowReuseModal(false); window.open(`/dashboard/tasks/${m.task_id}`, '_blank'); }}
                        className="flat-btn-surface text-xs px-2.5 py-1.5 shrink-0 ml-2">
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-success-50 rounded-xl p-4 mb-4 text-center">
                <CheckCircle className="w-8 h-8 text-success-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-success-700">No significant content reuse detected</p>
                <p className="text-xs text-success-500 mt-1">Content appears original compared to the last 7 days</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4 border-t border-surface-100 pt-4">
              <button onClick={() => { setShowReuseModal(false); setReuseResults(null); setPendingConfirmationStatus(null); }}
                className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleReuseProceed} disabled={reuseLoading}
                className="flat-btn-accent text-xs">
                <Send className="w-4 h-4" /> Proceed to Confirmation
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmSubmit(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-warning-50 flex items-center justify-center">
                <Send className="w-5 h-5 text-warning-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Submit Task</h3>
                <p className="text-xs text-surface-400">Submit this task for verification.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Submit "{task?.title}" for verification?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmSubmit(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleSubmitConfirm} className="flat-btn-accent text-xs">
                <Send className="w-4 h-4" /> Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {assignEditorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setAssignEditorModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <User className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Assign Video Editor</h3>
                <p className="text-xs text-surface-400">Select an available video editor for production</p>
              </div>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {availableEditors.some((ed: any) => ed.is_online) && (
                <button onClick={() => { const online = availableEditors.find((ed: any) => ed.is_online); if (online) handleAssignEditor(online.profile_id); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 mb-2 rounded-xl bg-success-50 text-success-700 text-sm font-medium hover:bg-success-100 transition-colors">
                  <User className="w-4 h-4" /> Auto Assign Online Editor
                </button>
              )}
              {availableEditors.length === 0 && (
                <p className="text-sm text-surface-400 text-center py-4">No video editors available</p>
              )}
              {availableEditors.map((ed: any) => (
                <button key={ed.profile_id} onClick={() => handleAssignEditor(ed.profile_id)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-50 transition-colors text-left">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${ed.is_online ? 'bg-green-500' : 'bg-surface-300'}`}></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-700">{ed.full_name}</p>
                    <p className="text-xs text-surface-400">{ed.is_online ? 'Online' : 'Offline'}{ed.access_level ? ` · Level ${ed.access_level}` : ''}</p>
                  </div>
                  <span className="text-xs text-accent-600 font-medium">Assign</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setAssignEditorModal(false)} className="flat-btn-surface text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {correctionModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setCorrectionModalItem(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Correction Notes</h3>
                <p className="text-xs text-surface-400">News: {correctionModalItem.slug || `#${newsItems.indexOf(correctionModalItem) + 1}`}</p>
              </div>
            </div>
            <textarea className="flat-input w-full" rows={4} placeholder="Describe what needs to be corrected in this news item..."
              value={correctionModalNotes} onChange={(e) => setCorrectionModalNotes(e.target.value)} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setCorrectionModalItem(null)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleSaveCorrectionNotes} className="flat-btn-warning text-xs">
                <AlertTriangle className="w-4 h-4" /> Save Correction
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteNewsItemId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDeleteNewsItemId(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Delete News Item</h3>
                <p className="text-xs text-surface-400">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete this news item and all its content?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteNewsItemId(null)} className="flat-btn-secondary">Cancel</button>
              <button onClick={deleteNewsItem} className="flat-btn-danger">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-danger-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Trash Task</h3>
                <p className="text-xs text-surface-400">Move to recycle bin</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Move "{task?.title}" to the recycle bin?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleDeleteConfirm} className="flat-btn-danger text-xs">
                <Trash2 className="w-4 h-4" /> Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmMarkUploaded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmMarkUploaded(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <Upload className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Mark Production Complete</h3>
                <p className="text-xs text-surface-400">Notify anchor for final review</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Mark production as complete for "{task?.title}"?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmMarkUploaded(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleMarkUploadedConfirm} className="flat-btn-accent text-xs">
                <Upload className="w-4 h-4" /> Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmFinalize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmFinalize(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Finalize Task</h3>
                <p className="text-xs text-surface-400">Complete this task</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Finalize "{task?.title}" as complete?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmFinalize(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleFinalizeConfirm} className="flat-btn-accent text-xs">
                <CheckCircle className="w-4 h-4" /> Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBackStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmBackStage(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Move Stage Back</h3>
                <p className="text-xs text-surface-400">Move this task to the previous stage</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Move "{task?.title}" back to {STATUS_LABELS[confirmBackStage] || confirmBackStage}? All task data and content will be preserved.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmBackStage(null)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleBackStage} className="flat-btn-surface text-xs">
                <ArrowLeft className="w-4 h-4" /> Move Back
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSendBack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmSendBack(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Send Back</h3>
                <p className="text-xs text-surface-400">Send this task back to the anchor for correction</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">All news items with correction notes will be sent back to the anchor. Continue?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmSendBack(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleSendBackConfirm} className="flat-btn-danger text-xs">
                <AlertTriangle className="w-4 h-4" /> Send Back
              </button>
            </div>
          </div>
        </div>
      )}

      {showExtendDeadline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowExtendDeadline(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Extend Deadline</h3>
                <p className="text-xs text-surface-400">Push the deadline for this task</p>
              </div>
            </div>
            {task?.deadline && (
              <p className="text-xs text-surface-500 mb-3">
                Current: {formatDateTime(task.deadline)}
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="flat-label">New Deadline *</label>
                <input type="datetime-local" className="flat-input" required value={extendDeadlineValue}
                  onChange={(e) => setExtendDeadlineValue(e.target.value)} />
              </div>
              <div>
                <label className="flat-label">Reason *</label>
                <textarea className="flat-input" rows={3} required placeholder="Why is this deadline being extended?"
                  value={extendDeadlineReason} onChange={(e) => setExtendDeadlineReason(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowExtendDeadline(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={handleExtendDeadline} disabled={extendingDeadline || !extendDeadlineValue || !extendDeadlineReason.trim()} className="flat-btn-accent text-xs">
                {extendingDeadline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                {extendingDeadline ? 'Extending...' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReassignCancelled && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowReassignCancelled(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Reassign Task</h3>
                <p className="text-xs text-surface-400">Assign this task to a user with a new deadline</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="flat-label">Assign To *</label>
                <select className="flat-select" value={reassignUserId} onChange={async (e) => {
                  const uid = e.target.value;
                  setReassignUserId(uid);
                  setUserWorkload(null);
                  if (uid) {
                    setWorkloadLoading(true);
                    try { const r = await api.get(`/users/${uid}/workload`); setUserWorkload(r.data); } catch {} finally { setWorkloadLoading(false); }
                  }
                }}>
                  <option value="">Select a user...</option>
                  {availableUsers.filter((u: any) => u.role === 'anchor').map((u: any) => (
                    <option key={u.id} value={u.profile_id ?? u.id}>{u.full_name} ({u.role})</option>
                  ))}
                </select>
                {workloadLoading && <p className="text-xs text-surface-400 mt-1"><Loader2 className="w-3 h-3 inline animate-spin" /> Loading workload...</p>}
                {userWorkload && userWorkload.length > 0 && (
                  <div className="mt-2 bg-surface-50 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Current Tasks ({userWorkload.length})</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {userWorkload.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between text-xs">
                          <span className="text-surface-700 truncate max-w-[160px]">{t.title}</span>
                          <span className={`ml-2 shrink-0 badge-${t.status || 'draft'}`}>{t.status?.replace(/_/g, ' ') || 'draft'}</span>
                          {t.deadline && <span className="ml-2 text-surface-400 shrink-0">{formatDate(t.deadline)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {userWorkload && userWorkload.length === 0 && (
                  <p className="text-xs text-success-600 mt-1">No active tasks for this user.</p>
                )}
              </div>
              <div>
                <label className="flat-label">New Deadline *</label>
                <input type="datetime-local" className="flat-input" required value={reassignDeadline}
                  onChange={(e) => setReassignDeadline(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowReassignCancelled(false)} className="flat-btn-surface text-xs">Cancel</button>
              <button onClick={async () => {
                if (!reassignUserId || !reassignDeadline) { toast('Select a user and deadline', 'error'); return; }
                setReassigning(true);
                try {
                  await api.post(`/tasks/${id}/reassign`, { user_id: Number(reassignUserId), deadline: reassignDeadline + ':00' });
                  toast('Task reassigned', 'success');
                  setShowReassignCancelled(false);
                  fetchTask();
                } catch (err: any) { toast(err.response?.data?.error || 'Failed to reassign', 'error'); }
                finally { setReassigning(false); }
              }} disabled={reassigning || !reassignUserId || !reassignDeadline} className="flat-btn-accent text-xs">
                {reassigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {reassigning ? 'Reassigning...' : 'Reassign & Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reusePopupTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setReusePopupTask(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-surface-800">{reusePopupTask.title}</h3>
                <p className="text-[11px] text-surface-400">{reusePopupTask.created_at?.slice(0, 10)} — {reusePopupTask.match_percent}% match</p>
              </div>
              <button onClick={() => setReusePopupTask(null)} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            {reusePopupLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-surface-300" /></div>
            ) : reusePopupNews.length === 0 ? (
              <p className="text-sm text-surface-400 text-center py-4">No news items in this task.</p>
            ) : (
              <div className="space-y-2">
                {reusePopupNews.map((item: any, idx: number) => (
                  <div key={item.id} className="border border-surface-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-surface-400">News #{idx + 1}</span>
                      {item.slug && <span className="text-sm font-medium text-surface-800">{item.slug}</span>}
                    </div>
                    {item.news_script && (
                      <p className="text-xs text-surface-500 line-clamp-3">{item.news_script}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] text-surface-400">
                      {item.reporter_name && <span>Reporter: {item.reporter_name}</span>}
                      {item.location && <span>Location: {item.location}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
