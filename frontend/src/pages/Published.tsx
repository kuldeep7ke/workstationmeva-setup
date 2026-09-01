import { useState, useEffect } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { AlertTriangle, Loader2, CheckCircle, ExternalLink, Clock, User, Film } from 'lucide-react';
import { formatLabel } from '../utils/roles';
import { parseDate } from '../utils/dates';

const TIME_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const STORY_STATUSES = ['completed', 'send_to_tasks'];
const PROGRAM_STATUSES = ['completed'];

const inTime = (iso: string | null, time: string) => {
  if (!iso) return false;
  // parseDate treats TZ-less SQLite timestamps as UTC and ISO 'Z' strings as-is
  const d = parseDate(iso);
  if (!d) return false;
  const now = new Date();
  if (time === 'today') return d.toDateString() === now.toDateString();
  if (time === 'week') return now.getTime() - d.getTime() <= 7 * 24 * 3600 * 1000;
  if (time === 'month') return now.getTime() - d.getTime() <= 30 * 24 * 3600 * 1000;
  return true;
};

export default function Published() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [time, setTime] = useState('today');

  const fetchAll = () => {
    setLoading(true);
    setErr('');
    Promise.all([
      api.get(`/tasks/published?time=${time}`).then((r) => setTasks(Array.isArray(r.data) ? r.data : [])).catch(() => { setTasks([]); setErr('Failed to load published items'); }),
      api.get('/stories').then((r) => setStories(Array.isArray(r.data) ? r.data : [])).catch(() => setStories([])),
      api.get('/programs').then((r) => setPrograms(Array.isArray(r.data) ? r.data : [])).catch(() => setPrograms([])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [time]);

  const visibleStories = stories.filter((s) => STORY_STATUSES.includes(s.status) && inTime(s.updated_at || s.created_at, time));
  const visiblePrograms = programs.filter((p) => PROGRAM_STATUSES.includes(p.status) && inTime(p.updated_at || p.created_at, time));
  const statusIcons: Record<string, any> = { completed: CheckCircle, published: CheckCircle, under_review: CheckCircle };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Published</h1>
          <p className="text-sm text-surface-400 mt-0.5">Completed and published tasks, stories and programs</p>
        </div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 w-fit max-w-full overflow-x-auto">
        {TIME_OPTIONS.map((o) => (
          <button key={o.value} onClick={() => setTime(o.value)}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${time === o.value ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {err ? (
        <div className="flat-card-static text-center py-12">
          <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
          <p className="text-surface-500 text-sm">{err}</p>
          <button onClick={fetchAll} className="flat-btn-surface text-xs mt-4">Retry</button>
        </div>
      ) : loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : tasks.length === 0 && visibleStories.length === 0 && visiblePrograms.length === 0 ? (
        <div className="flat-card-static text-center py-12">
          <CheckCircle className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-400">Nothing published in this period</p>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {tasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-success-500" />
                <h2 className="text-sm font-semibold text-surface-700">Published Tasks</h2>
                <span className="text-xs text-surface-400 ml-auto">{tasks.length} tasks</span>
              </div>
              <div className="flat-card-static overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Title</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Assigned To</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Video Editor</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Bulletin</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-surface-500">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t) => {
                        const StatusIcon = statusIcons[t.status] || CheckCircle;
                        return (
                          <tr key={t.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link to={`/dashboard/tasks/${t.id}`} className="font-medium text-accent-600 hover:underline flex items-center gap-1">
                                {t.title} <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-xs text-surface-500">{formatLabel(t.task_type)}</td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1 text-xs text-surface-600">
                                <User className="w-3 h-3 text-surface-400" /> {t.assigned_to_name || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-surface-500">{t.video_editor_name || '—'}</td>
                            <td className="px-4 py-3 text-xs text-surface-500">{t.bulletin_title || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`flat-badge text-xs font-medium border ${
                                t.status === 'completed' ? 'bg-success-50 text-success-700 border-success-200' :
                                t.status === 'under_review' ? 'bg-accent-50 text-accent-700 border-accent-200' :
                                'bg-surface-100 text-surface-600 border-surface-300'
                              }`}>
                                <StatusIcon className="w-3 h-3 inline mr-1" />
                                {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-surface-400 text-right">
                              <span className="flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" /> {t.updated_at?.slice(0, 10) || '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {visibleStories.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-success-500" />
                <h2 className="text-sm font-semibold text-surface-700">Completed / Published Stories</h2>
                <span className="text-xs text-surface-400 ml-auto">{visibleStories.length} stories</span>
              </div>
              <div className="flat-card-static overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Title</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Assigned To</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Created By</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-surface-500">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStories.map((s) => (
                        <tr key={s.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link to="/dashboard/stories" className="font-medium text-accent-600 hover:underline flex items-center gap-1">
                              {s.title} <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-xs text-surface-500">{formatLabel(s.story_type)}</td>
                          <td className="px-4 py-3 text-xs text-surface-600">{s.assigned_to_name || '—'}</td>
                          <td className="px-4 py-3 text-xs text-surface-500">{s.created_by_name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="flat-badge bg-success-50 text-success-700 border-success-200 text-xs font-medium border">
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              {s.status === 'send_to_tasks' ? 'Published' : 'Completed'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-surface-400 text-right">
                            <span className="flex items-center gap-1 justify-end">
                              <Clock className="w-3 h-3" /> {(s.updated_at || s.created_at)?.slice(0, 10) || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {visiblePrograms.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Film className="w-4 h-4 text-success-500" />
                <h2 className="text-sm font-semibold text-surface-700">Completed / Published Programs</h2>
                <span className="text-xs text-surface-400 ml-auto">{visiblePrograms.length} programs</span>
              </div>
              <div className="flat-card-static overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Title</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Assigned To</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Reporter</th>
                        <th className="text-left px-4 py-3 font-medium text-surface-500">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-surface-500">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePrograms.map((p) => (
                        <tr key={p.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link to="/dashboard/programs" className="font-medium text-accent-600 hover:underline flex items-center gap-1">
                              {p.title} <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-xs text-surface-500">{formatLabel(p.program_type)}</td>
                          <td className="px-4 py-3 text-xs text-surface-600">{p.assigned_to_name || '—'}</td>
                          <td className="px-4 py-3 text-xs text-surface-500">{p.reporter_name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="flat-badge bg-success-50 text-success-700 border-success-200 text-xs font-medium border">
                              <CheckCircle className="w-3 h-3 inline mr-1" /> Completed
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-surface-400 text-right">
                            <span className="flex items-center gap-1 justify-end">
                              <Clock className="w-3 h-3" /> {(p.updated_at || p.created_at)?.slice(0, 10) || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
