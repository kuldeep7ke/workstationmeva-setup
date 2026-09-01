import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Monitor, Loader2, AlertTriangle, ExternalLink, History, Radio, Archive, PenLine, Trash2, Play } from 'lucide-react';
import { formatLabel } from '../utils/roles';
import { formatDate } from '../utils/dates';
import { listCustomScripts, saveCustomScript, deleteCustomScript, TpCustomScript } from '../utils/tpCustom';

export default function TeleprompterList() {
  const navigate = useNavigate();
  const [stories, setStories] = useState<any[]>([]);
  const [readyTasks, setReadyTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [archived, setArchived] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customText, setCustomText] = useState('');
  const [customScripts, setCustomScripts] = useState<TpCustomScript[]>(() => listCustomScripts());

  useEffect(() => {
    setLoading(true);
    fetch('/api/stories/teleprompter/approved')
      .then((r) => r.json())
      .then((data) => setStories(Array.isArray(data) ? data : []))
      .catch(() => setErr('Failed to load approved scripts'))
      .finally(() => setLoading(false));
    fetch('/api/tasks/teleprompter/ready')
      .then((r) => r.json())
      .then((data) => setReadyTasks(Array.isArray(data) ? data : []))
      .catch(() => setReadyTasks([]));
    fetch('/api/tasks/teleprompter/history')
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
    fetch('/api/tasks/teleprompter/history?archive=1')
      .then((r) => r.json())
      .then((data) => setArchived(Array.isArray(data) ? data : []))
      .catch(() => setArchived([]));
  }, []);

  const STATUS_LABEL: Record<string, string> = {
    teleprompter_ready: 'Ready',
    prompting: 'Prompting',
    recording_done: 'Recorded',
    editing: 'Editing',
    uploading: 'Uploading',
    under_review: 'Under Review',
    completed: 'Completed',
  };

  const handleSaveCustom = () => {
    if (!customText.trim()) return;
    const saved = saveCustomScript(customTitle, customText);
    setCustomScripts(listCustomScripts());
    setCustomTitle('');
    setCustomText('');
    setShowForm(false);
    navigate(`/teleprompter/${saved.id}`);
  };

  const handleDeleteCustom = (id: string) => {
    deleteCustomScript(id);
    setCustomScripts(listCustomScripts());
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white/70 text-lg">{err}</p>
          <Link to="/" className="inline-block mt-6 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Monitor className="w-6 h-6 text-green-400" />
          <h1 className="text-xl font-bold">Teleprompter — Approved Scripts</h1>
        </div>

        {/* Custom scripts: paste your own text and prompt it right away */}
        <div className="mb-8">
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-white/20 bg-white/[0.03] hover:bg-white/[0.07] text-white/70 hover:text-white transition-colors">
              <PenLine className="w-4 h-4" /> New Script — paste your own text for prompting
            </button>
          ) : (
            <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5">
              <h3 className="text-base font-semibold text-white/90 mb-3">New Custom Script</h3>
              <input value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Title (optional)"
                maxLength={120}
                className="w-full mb-3 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-green-500/50" />
              <textarea value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Paste or type the script here…"
                rows={10}
                className="w-full mb-3 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-white/30 text-sm leading-relaxed focus:outline-none focus:border-green-500/50 resize-y" />
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => { setShowForm(false); setCustomTitle(''); setCustomText(''); }}
                  className="px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 transition-colors">Cancel</button>
                <button onClick={handleSaveCustom} disabled={!customText.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <Play className="w-4 h-4" /> Save &amp; Open
                </button>
              </div>
            </div>
          )}

          {customScripts.length > 0 && (
            <div className="mt-3 space-y-2">
              {customScripts.map((c) => (
                <div key={c.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                  <Link to={`/teleprompter/${c.id}`} className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-white/90 truncate">{c.title}</h4>
                    <p className="text-xs text-white/40 mt-0.5">
                      Custom · saved {formatDate(c.created_at)} · {c.text.length.toLocaleString()} chars
                    </p>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link to={`/teleprompter/${c.id}`}
                      className="p-2 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors" title="Open">
                      <Play className="w-4 h-4" />
                    </Link>
                    <button onClick={() => handleDeleteCustom(c.id)}
                      className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {stories.length === 0 && readyTasks.length === 0 ? (
          <div className="text-center py-16">
            <Monitor className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No approved scripts yet</p>
            <Link to="/" className="inline-block mt-6 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 text-sm">Back to Home</Link>
          </div>
        ) : (
          <>
            {readyTasks.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <Radio className="w-5 h-5 text-green-400" />
                  <h2 className="text-lg font-bold">Ready to Record</h2>
                </div>
                <div className="space-y-3 mb-8">
                  {readyTasks.map((t) => (
                    <Link key={t.task_id} to={`/teleprompter/${t.task_id}`}
                      className="block p-4 rounded-xl border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-white/90">{t.task_title}</h3>
                          <p className="text-sm text-white/40 mt-1">
                            {t.anchor_name || 'Unknown anchor'} · {t.script_imported_at ? `Loaded ${new Date(t.script_imported_at.replace(' ', 'T')).toLocaleString()}` : 'Not imported'}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-xs font-medium shrink-0 mt-1 bg-green-500/20 text-green-400">Ready</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {stories.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <Monitor className="w-5 h-5 text-white/50" />
                  <h2 className="text-lg font-bold">Approved Stories</h2>
                </div>
                <div className="space-y-3 mb-8">
                  {stories.map((s) => (
                    <Link key={s.id} to={`/teleprompter/${s.id}`}
                      className="block p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-white/90">{s.title}</h3>
                          <p className="text-sm text-white/40 mt-1">
                            {formatLabel(s.story_type)} · {s.created_by_name || 'Unknown'} · {s.created_at ? formatDate(s.created_at) : ''}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-green-400 shrink-0 mt-1" />
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="flex items-center gap-3 mt-10 mb-4">
          <History className="w-6 h-6 text-white/50" />
          <h2 className="text-lg font-bold">Previously Loaded Scripts — Today</h2>
        </div>

        {history.length === 0 ? (
          <p className="text-white/40 text-sm">No task scripts loaded today yet</p>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <Link key={h.task_id} to={`/teleprompter/${h.task_id}`}
                className="block p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white/90">{h.task_title}</h3>
                    <p className="text-sm text-white/40 mt-1">
                      {h.anchor_name || 'Unknown anchor'} · {h.script_imported_at ? new Date(h.script_imported_at.replace(' ', 'T')).toLocaleString() : ''}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-medium shrink-0 mt-1 bg-white/10 text-white/60">
                    {STATUS_LABEL[h.status] || h.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-10 mb-4">
          <Archive className="w-6 h-6 text-white/40" />
          <h2 className="text-lg font-bold">Archived Scripts</h2>
        </div>

        {archived.length === 0 ? (
          <p className="text-white/40 text-sm">No archived scripts</p>
        ) : (
          <div className="space-y-3">
            {archived.map((h) => (
              <Link key={h.task_id} to={`/teleprompter/${h.task_id}`}
                className="block p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors opacity-80">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white/90">{h.task_title}</h3>
                    <p className="text-sm text-white/40 mt-1">
                      {h.anchor_name || 'Unknown anchor'} · {h.script_imported_at ? new Date(h.script_imported_at.replace(' ', 'T')).toLocaleString() : ''}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-medium shrink-0 mt-1 bg-white/10 text-white/60">
                    {STATUS_LABEL[h.status] || h.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
