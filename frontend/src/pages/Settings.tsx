import { useState, useEffect } from 'react';
import {
  Download, Loader2, Save, Settings as SettingsIcon,
  Info, Mail, Globe, Code, Heart, Moon, Sun,
  Database, ExternalLink, Phone, MapPin, Tv, Youtube, Link,
  Trash2, AlertTriangle,
} from 'lucide-react';
import { getAppName, setAppName, dispatchChannelDisplay } from '../utils/appConfig';
import { clearSessionHistory, clearAllLogins } from '../utils/quickLogin';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import api from '../utils/api';

const APP_VERSION = '1.0.0';
const BUILD_DATE = '2026-07-22';

function BulletinSlotRestore() {
  const { toast } = useToast();
  const dialog = useDialog();
  const [hasSaved, setHasSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [slotCount, setSlotCount] = useState(0);

  useEffect(() => {
    api.get('/bulletin-templates/custom-defaults')
      .then((r) => { setHasSaved(r.data.saved); setSlotCount(r.data.count); })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!(await dialog.confirm({
      title: 'Save current slots as default?',
      message: 'Your current bulletin slot names & times will be saved as a restore point. This replaces any previously saved defaults.',
      confirmLabel: 'Save',
    }))) return;
    setSaving(true);
    try {
      const r = await api.post('/bulletin-templates/save-defaults');
      setHasSaved(true);
      setSlotCount(r.data.count);
      toast('Current slots saved as restore point', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const handleRestore = async () => {
    if (!(await dialog.confirm({
      title: 'Restore from saved defaults?',
      message: 'Your current bulletin slot names & times will be overwritten by your saved restore point. This cannot be undone.',
      danger: true,
      confirmLabel: 'Restore',
    }))) return;
    setRestoring(true);
    try {
      const r = await api.post('/bulletin-templates/restore-custom-defaults');
      setSlotCount(r.data.count);
      toast(`Restored ${r.data.count} slots from saved defaults`, 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to restore', 'error');
    } finally { setRestoring(false); }
  };

  const handleRestoreDefaults = async () => {
    if (!(await dialog.confirm({
      title: 'Restore factory defaults?',
      message: 'Your current bulletin slot names & times will be overwritten by the built-in factory defaults. This cannot be undone.',
      danger: true,
      confirmLabel: 'Restore',
    }))) return;
    setRestoringDefaults(true);
    try {
      const r = await api.post('/bulletin-templates/restore-defaults', { force_factory: true });
      setSlotCount(r.data.count);
      toast(`Restored ${r.data.count} factory default slots`, 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to restore defaults', 'error');
    } finally { setRestoringDefaults(false); }
  };

  const [hasSystemDefaults, setHasSystemDefaults] = useState(false);
  const [systemSlotCount, setSystemSlotCount] = useState(0);
  const [systemSaving, setSystemSaving] = useState(false);
  const [systemRestoring, setSystemRestoring] = useState(false);

  useEffect(() => {
    api.get('/bulletin-templates/system-defaults')
      .then((r) => { setHasSystemDefaults(r.data.saved); setSystemSlotCount(r.data.count); })
      .catch(() => {});
  }, []);

  const handleSaveSystemDefaults = async () => {
    if (!(await dialog.confirm({
      title: 'Save as system defaults?',
      message: 'Your current bulletin slot names & times will be saved as system-wide defaults. These apply to all users and replace any previously saved system defaults.',
      confirmLabel: 'Save',
    }))) return;
    setSystemSaving(true);
    try {
      const r = await api.post('/bulletin-templates/save-system-defaults');
      setHasSystemDefaults(true);
      setSystemSlotCount(r.data.count);
      toast('Current slots saved as system defaults', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally { setSystemSaving(false); }
  };

  const handleRestoreSystemDefaults = async () => {
    if (!(await dialog.confirm({
      title: 'Restore system defaults?',
      message: 'Your current bulletin slot names & times will be overwritten by the system defaults. This cannot be undone.',
      danger: true,
      confirmLabel: 'Restore',
    }))) return;
    setSystemRestoring(true);
    try {
      const r = await api.post('/bulletin-templates/restore-defaults');
      setSystemSlotCount(r.data.count);
      toast(`Restored ${r.data.count} system default slots`, 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to restore', 'error');
    } finally { setSystemRestoring(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleSave} disabled={saving} className="flat-btn-accent text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Current as Default'}
        </button>
        <button onClick={handleRestore} disabled={restoring || !hasSaved}
          className={`flat-btn-surface text-sm ${!hasSaved ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {restoring ? 'Restoring...' : `Restore from Saved${hasSaved ? ` (${slotCount} slots)` : ''}`}
        </button>
        <button onClick={handleRestoreDefaults} disabled={restoringDefaults}
          className="flat-btn-surface text-sm">
          {restoringDefaults ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {restoringDefaults ? 'Restoring...' : 'Restore Factory Defaults'}
        </button>
      </div>
      <div className="pt-3 border-t border-surface-200">
        <h4 className="text-xs font-semibold text-surface-700 mb-2">System Defaults (Admin)</h4>
        <p className="text-xs text-surface-500 mb-3">Save/restore system-wide default slots (applies to all users).</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleSaveSystemDefaults} disabled={systemSaving} className="flat-btn-accent text-sm">
            {systemSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {systemSaving ? 'Saving...' : 'Save as System Defaults'}
          </button>
          <button onClick={handleRestoreSystemDefaults} disabled={systemRestoring || !hasSystemDefaults}
            className={`flat-btn-surface text-sm ${!hasSystemDefaults ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {systemRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {systemRestoring ? 'Restoring...' : `Restore System Defaults${hasSystemDefaults ? ` (${systemSlotCount} slots)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [name, setName] = useState(getAppName());
  const [darkMode, setDarkMode] = useState(() => {
    try { return document.body.classList.contains('dark'); }
    catch { return false; }
  });
  const [channelMeta, setChannelMeta] = useState({
    channel_name: '', channel_display_name: '', website_url: '',
    editor_name: '', editor_position: '', subscribe_url: '',
  });
  const [savingChannel, setSavingChannel] = useState(false);
  const [confirmClearChannel, setConfirmClearChannel] = useState(false);
  const [cleanMode, setCleanMode] = useState<'user-data' | 'all-data' | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [captchaA, setCaptchaA] = useState(0);
  const [captchaB, setCaptchaB] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [cleanResult, setCleanResult] = useState<{ total?: number; message?: string } | null>(null);

  const generateCaptcha = () => {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    setCaptchaA(a);
    setCaptchaB(b);
    setCaptchaAnswer('');
    setCaptchaError('');
    setCleanResult(null);
  };

  const isAdmin = (user?.access_level || 3) <= 1;

  useEffect(() => {
    api.get('/channel-metadata')
      .then((r) => setChannelMeta(r.data))
      .catch(() => {});
  }, []);

  const handleSaveAppName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast('App name is required', 'error'); return; }
    setAppName(trimmed);
    toast('App name saved', 'success');
  };

  const handleToggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.body.classList.toggle('dark', next);
    localStorage.setItem('darkMode', String(next));
  };

  const handleSaveChannelMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChannel(true);
    try {
      const res = await api.put('/channel-metadata', channelMeta);
      setChannelMeta(res.data);
      if (res.data?.channel_display_name) dispatchChannelDisplay(res.data.channel_display_name);
      toast('Channel metadata saved', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally { setSavingChannel(false); }
  };

  const handleCleanData = async () => {
    const ans = parseInt(captchaAnswer, 10);
    if (isNaN(ans) || ans !== captchaA + captchaB) {
      setCaptchaError('Incorrect answer. Try again.');
      return;
    }
    setCleaning(true);
    setCaptchaError('');
    try {
      const endpoint = cleanMode === 'all-data' ? '/settings/clean-all-data' : '/settings/clean-user-data';
      const res = await api.post(endpoint);
      clearSessionHistory();
      clearAllLogins();
      setCleanResult(res.data);
      if (cleanMode === 'all-data') {
        toast('All data cleared. Default admin account recreated.', 'success');
      } else {
        toast(`Cleared ${res.data.total} rows. User accounts preserved.`, 'success');
      }
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to clean data', 'error');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-accent-500" /> Settings
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">Application settings & preferences</p>
        </div>
      </div>

      {/* App Settings */}
      <div className="flat-card">
        <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-accent-500" /> App Settings
        </h3>
        <form onSubmit={handleSaveAppName} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="flat-label">Application Name</label>
            <input className="flat-input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Workstation Tracker" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="flat-btn-accent">
              <Save className="w-4 h-4" /> Save Name
            </button>
          </div>
        </form>
      </div>

      {/* Appearance */}
      <div className="flat-card">
        <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
          {darkMode ? <Moon className="w-4 h-4 text-accent-500" /> : <Sun className="w-4 h-4 text-accent-500" />}
          Appearance
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-surface-800">Dark Mode</p>
            <p className="text-xs text-surface-400">Toggle between light and dark theme</p>
          </div>
          <button onClick={handleToggleDarkMode}
            role="switch" aria-checked={darkMode} aria-label="Toggle dark mode"
            className="toggle-track" data-on={darkMode}>
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      {isAdmin && (
        <>
          {/* Channel Metadata */}
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
              <Tv className="w-4 h-4 text-accent-500" /> Channel Metadata
            </h3>
            <form onSubmit={handleSaveChannelMetadata} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="flat-label">Channel Name (English)</label>
                  <input className="flat-input" placeholder="e.g. Workstation Meva"
                    value={channelMeta.channel_name}
                    onChange={(e) => setChannelMeta({ ...channelMeta, channel_name: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Channel Name (Display)</label>
                  <input className="flat-input" placeholder="e.g. Workstation Meva"
                    value={channelMeta.channel_display_name}
                    onChange={(e) => setChannelMeta({ ...channelMeta, channel_display_name: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Website URL</label>
                  <input className="flat-input" placeholder="e.g. www.workstation.com"
                    value={channelMeta.website_url}
                    onChange={(e) => setChannelMeta({ ...channelMeta, website_url: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Subscribe URL</label>
                  <input className="flat-input" placeholder="e.g. https://youtube.com/c/..."
                    value={channelMeta.subscribe_url}
                    onChange={(e) => setChannelMeta({ ...channelMeta, subscribe_url: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Chief Editor</label>
                  <input className="flat-input" placeholder="e.g. System Admin"
                    value={channelMeta.editor_name}
                    onChange={(e) => setChannelMeta({ ...channelMeta, editor_name: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Position</label>
                  <input className="flat-input" placeholder="e.g. Administrator"
                    value={channelMeta.editor_position}
                    onChange={(e) => setChannelMeta({ ...channelMeta, editor_position: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <button type="button" onClick={() => {
                  if (!confirmClearChannel) { setConfirmClearChannel(true); return; }
                  setConfirmClearChannel(false);
                  const cleared = { channel_name: '', channel_display_name: '', website_url: '', editor_name: '', editor_position: '', subscribe_url: '' };
                  setChannelMeta(cleared);
                  api.put('/channel-metadata', cleared).then(() => toast('Channel metadata cleared', 'success')).catch(() => toast('Failed to clear', 'error'));
                }} className={`flat-btn-surface text-xs ${confirmClearChannel ? 'text-danger-600 border-danger-300' : 'text-danger-600'}`}>
                  <Trash2 className="w-4 h-4" /> {confirmClearChannel ? 'Click again to confirm' : 'Clear All'}
                </button>
                <button type="submit" disabled={savingChannel} className="flat-btn-accent text-sm">
                  {savingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingChannel ? 'Saving...' : 'Save Channel Metadata'}
                </button>
              </div>
            </form>
          </div>

          {/* Bulletin Slot Restore */}
          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
              <Save className="w-4 h-4 text-accent-500" /> Bulletin Slot Restore
            </h3>
            <p className="text-xs text-surface-500 mb-4">Save the current bulletin slots (names & times) as a restore point, or restore from a previously saved point.</p>
            <BulletinSlotRestore />
          </div>

          {/* Clean Data */}
          <div className="flat-card border-danger-200">
            <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger-500" /> Clean Data
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <h4 className="text-sm font-semibold text-surface-800 mb-1">Clean User Data</h4>
                <p className="text-xs text-surface-500 mb-4">Remove tasks, bulletins, logs, leaves, etc. Keeps users, profiles, and bulletin slots.</p>
                <button onClick={() => { setCleanMode('user-data'); generateCaptcha(); }}
                  className="flat-btn-surface text-sm">
                  <Trash2 className="w-4 h-4" /> Clean User Data
                </button>
              </div>
              <div className="rounded-xl border border-danger-200 bg-danger-50 p-4">
                <h4 className="text-sm font-semibold text-danger-800 mb-1">Clean All Data</h4>
                <p className="text-xs text-danger-600 mb-4">Erase everything — tasks, profiles, users, slots. Factory reset with default admin.</p>
                <button onClick={() => { setCleanMode('all-data'); generateCaptcha(); }}
                  className="flat-btn-danger text-sm">
                  <Trash2 className="w-4 h-4" /> Clean All Data
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Clean Data Modal */}
      {cleanMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => { if (!cleaning && !cleanResult) { setCleanMode(null); } }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 pb-4 border-b border-surface-100">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cleanMode === 'all-data' ? 'bg-danger-50' : 'bg-warning-50'}`}>
                <Trash2 className={`w-4 h-4 ${cleanMode === 'all-data' ? 'text-danger-500' : 'text-warning-500'}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">
                  {cleanMode === 'all-data' ? 'Clean all data' : 'Clean user data'}
                </h3>
                <p className="text-xs text-surface-400">
                  {cleanMode === 'all-data' ? 'Factory reset — everything is removed' : 'Remove operational records only'}
                </p>
              </div>
            </div>

            {cleanResult ? (
              <div className="py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-5 h-5 text-success-500" />
                </div>
                <p className="text-sm font-semibold text-surface-800">Done</p>
                <p className="text-xs text-surface-400 mt-1">
{cleanMode === 'all-data'
                     ? 'All data cleared. Default admin account (dev@workstation.local / P@ssw0rd) is ready.'
                    : `${cleanResult.total || 0} rows removed. User accounts preserved.`}
                </p>
              </div>
            ) : (
              <div className="py-4 space-y-3">
                <p className="text-sm text-surface-600 leading-relaxed">
{cleanMode === 'all-data'
                     ? 'This will erase all users, profiles, tasks, bulletins, slots, and every record in the database. A default admin account (dev@workstation.local / P@ssw0rd) will be created after cleanup.'
                    : 'This will remove tasks, bulletins, notifications, leaves, stories, ads, activity logs, and reporters. User accounts, profiles, and bulletin slots are kept.'}
                </p>

                {cleanMode === 'user-data' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Export user data as a backup first using the <strong>Local Data Backup</strong> tool in the Developer Zone (Dashboard → Developer → Dev Tools).</p>
                  </div>
                )}

                {cleanMode === 'all-data' && (
                  <div className="bg-danger-50 border border-danger-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-danger-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-danger-700">All accounts including admins will be deleted. You will need to log in again using <strong>dev@workstation.local / P@ssw0rd</strong>.</p>
                  </div>
                )}

                <div className="bg-surface-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-surface-500 mb-2">Confirm by solving:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-surface-800 bg-white border border-surface-200 rounded-lg px-3 py-1.5">{captchaA} + {captchaB} =</span>
                    <input className="flat-input w-16 text-center text-sm font-bold" autoFocus
                      value={captchaAnswer}
                      onChange={(e) => { setCaptchaAnswer(e.target.value); setCaptchaError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCleanData(); }}
                      placeholder="?" disabled={cleaning} />
                    {captchaError && <span className="text-xs text-danger-500">{captchaError}</span>}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-surface-100">
              <button onClick={() => setCleanMode(null)}
                disabled={cleaning} className="flat-btn-surface text-sm">
                {cleanResult ? 'Close' : 'Cancel'}
              </button>
              {!cleanResult && (
                <button onClick={handleCleanData} disabled={cleaning || !captchaAnswer}
                  className={cleanMode === 'all-data' ? 'flat-btn-danger text-sm' : 'flat-btn-surface text-sm'}>
                  {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {cleaning ? 'Cleaning...' : cleanMode === 'all-data' ? 'Delete everything' : 'Delete user data'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* About Section */}
      <div className="flat-card">
        <h3 className="text-sm font-semibold text-surface-700 mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 text-accent-500" /> About
        </h3>

        <div className="space-y-4">
          {/* App Identity */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-50 border border-surface-200">
            <div className="w-14 h-14 bg-accent-100 rounded-2xl flex items-center justify-center shrink-0">
              <Code className="w-7 h-7 text-accent-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-surface-800">{getAppName()}</h4>
              <p className="text-xs text-surface-500">News Production Management System</p>
            </div>
          </div>

          {/* Version Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-surface-200 p-3">
              <p className="text-[11px] text-surface-400 mb-0.5">Version</p>
              <p className="text-sm font-semibold text-surface-800">v{APP_VERSION}</p>
            </div>
            <div className="rounded-xl border border-surface-200 p-3">
              <p className="text-[11px] text-surface-400 mb-0.5">Build Date</p>
              <p className="text-sm font-semibold text-surface-800">{BUILD_DATE}</p>
            </div>
          </div>

          {/* Developer Info */}
          <div className="rounded-xl border border-surface-200 p-4">
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Developer</h4>
            <div className="space-y-2">
              <p className="text-sm font-medium text-surface-800">Workstation Meva Team</p>
              <div className="flex items-center gap-2 text-xs text-surface-500">
                <Globe className="w-3.5 h-3.5" />
                <a href="https://marathimeva.com" target="_blank" rel="noopener noreferrer"
                  className="text-accent-600 hover:text-accent-700 flex items-center gap-1">
                  marathimeva.com <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Contact Us */}
          <div className="rounded-xl border border-surface-200 p-4">
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Contact Us</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-surface-600">
                <Mail className="w-3.5 h-3.5 text-surface-400" />
                <a href="mailto:info@marathimeva.com"
                  className="text-accent-600 hover:text-accent-700">info@marathimeva.com</a>
              </div>
              <div className="flex items-center gap-2 text-xs text-surface-600">
                <Phone className="w-3.5 h-3.5 text-surface-400" />
                <span>+91 86006 33899</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-surface-600">
                <MapPin className="w-3.5 h-3.5 text-surface-400" />
                <span>kuldeep7ke, Maliwada, Ahilyanagar, Maharashtra, India - 414001</span>
              </div>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="rounded-xl border border-surface-200 p-4">
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Technology</h4>
            <div className="flex flex-wrap gap-2">
              {['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Node.js', 'Express', 'PostgreSQL (Supabase)'].map((tech) => (
                <span key={tech} className="flat-badge bg-surface-100 text-surface-600 border border-surface-200">{tech}</span>
              ))}
            </div>
          </div>

          {/* Copyright */}
          <div className="text-center pt-3 border-t border-surface-200">
            <p className="text-xs text-surface-400 flex items-center justify-center gap-1">
              Made with <Heart className="w-3 h-3 text-danger-400" /> by Workstation Meva Team
            </p>
            <p className="text-[11px] text-surface-300 mt-1">
              &copy; {new Date().getFullYear()} Workstation Meva. All rights reserved.
            </p>
            <p className="text-[11px] text-surface-300 mt-0.5">
              Powered by MarathiMevasa News Network
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
