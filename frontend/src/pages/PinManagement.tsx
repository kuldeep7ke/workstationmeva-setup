import { useState, useEffect } from 'react';
import { SkeletonList } from '../components/PageSkeletons';
import { KeyRound, Loader2, CheckCircle2, X, Search } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import api from '../utils/api';

export default function PinManagement() {
  const { toast } = useToast();
  const dialog = useDialog();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pinTarget, setPinTarget] = useState<any | null>(null);
  const [newPin, setNewPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const fetchProfiles = async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await api.get('/profiles/level3');
      setProfiles(Array.isArray(r.data) ? r.data : []);
    } catch { setErr('Failed to load profiles'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchProfiles(); }, []);

  const handleSetPin = async (id: number) => {
    if (!newPin || newPin.length !== 4) { toast('PIN must be exactly 4 digits', 'error'); return; }
    setSaving(true);
    try {
      await api.put(`/profiles/${id}/pin`, { pin: newPin });
      toast('PIN set successfully', 'success');
      setPinTarget(null);
      setNewPin('');
      fetchProfiles();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to set PIN', 'error');
    } finally { setSaving(false); }
  };

  const handleRemovePin = async (id: number) => {
    if (!(await dialog.confirm({ title: 'Remove PIN', message: 'Remove PIN for this user?', danger: true, confirmLabel: 'Remove PIN' }))) return;
    try {
      await api.delete(`/profiles/${id}/pin`);
      toast('PIN removed', 'success');
      fetchProfiles();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to remove PIN', 'error');
    }
  };

  const filtered = search.trim()
    ? profiles.filter((p: any) => p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase()))
    : profiles;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-accent-500" /> PIN Management
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">Set or remove quick-login PINs for staff</p>
        </div>
        <button onClick={fetchProfiles} disabled={loading} className="flat-btn-surface text-xs self-start">
          <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
          className="flat-input pl-9" />
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : err ? (
        <div className="text-center py-12 text-surface-400">
          <Loader2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{err}</p>
          <button onClick={fetchProfiles} className="flat-btn-surface text-xs mt-3">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-surface-400"><KeyRound className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{search.trim() ? 'No profiles match your search.' : 'No profiles found.'}</p></div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p: any) => (
            <div key={p.id} className="bg-white rounded-xl border border-surface-200 p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-surface-600">{p.full_name?.charAt(0) || '?'}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-700 truncate">{p.full_name}</p>
                  {p.email && <p className="text-[11px] text-surface-400 truncate">{p.email}</p>}
                </div>
              </div>
              {p.has_pin ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-success-700 bg-success-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Set
                  </span>
                  <button onClick={() => handleRemovePin(p.id)} className="text-xs text-danger-600 hover:text-danger-700 font-medium px-2 py-1.5 rounded-lg hover:bg-danger-50 transition-colors">Remove</button>
                </div>
              ) : (
                <button onClick={() => { setPinTarget(p); setNewPin(''); }}
                  className="flat-btn-sm">Set PIN</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Set PIN Modal */}
      {pinTarget && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { setPinTarget(null); setNewPin(''); }}>
          <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-xs shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-800">Set PIN for {pinTarget.full_name}</h3>
              <button onClick={() => { setPinTarget(null); setNewPin(''); }} aria-label="Close" className="p-1.5 rounded-lg text-surface-300 hover:text-surface-500 hover:bg-surface-100 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-surface-400 mb-3">Enter a 4-digit PIN for quick login.</p>
            <input type="text" inputMode="numeric" maxLength={4} autoFocus
              className="flat-input text-center text-lg tracking-[0.3em]"
              placeholder="• • • •" value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => { if (e.key === 'Enter') handleSetPin(pinTarget.id); }} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setPinTarget(null); setNewPin(''); }} className="flat-btn-surface flex-1 justify-center">Cancel</button>
              <button onClick={() => handleSetPin(pinTarget.id)} disabled={newPin.length !== 4 || saving}
                className="flat-btn-accent flex-1 justify-center disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
