import { useState, useEffect } from 'react';
import { SkeletonList } from '../components/PageSkeletons';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Loader2, Pencil, Trash2, AlertTriangle, X, Archive, MapPin, Layers, Clock, RefreshCw, CalendarClock, FolderSearch, FolderOpen, HardDrive } from 'lucide-react';

const CATEGORIES = ['footage', 'stock', 'photo', 'audio', 'graphics'];

const STOCK_STATUSES = ['online', 'offline'];
const STOCK_AVAILABILITY = ['available', 'not_available'];

const STOCK_REMINDER_DAYS = 30;

const categoryConfig: Record<string, { label: string; color: string }> = {
  footage: { label: 'Footage', color: 'bg-accent-100 text-accent-700' },
  stock: { label: 'Stock', color: 'bg-blue-100 text-blue-700' },
  photo: { label: 'Photo', color: 'bg-success-100 text-success-700' },
  audio: { label: 'Audio', color: 'bg-warning-100 text-warning-700' },
  graphics: { label: 'Graphics', color: 'bg-danger-100 text-danger-700' },
};

const stockAgeDays = (a: any): number | null => {
  const base = a?.stock_updated_at || a?.created_at;
  if (!base) return null;
  const days = Math.floor((Date.now() - new Date(base).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

const formatAge = (base?: string | null): string => {
  if (!base) return '—';
  const days = Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86400000));
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'}`;
};

export default function ArchivePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = (user?.access_level || 3) <= 2;
  const [archives, setArchives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', details: '', location: '', category: 'footage', status: 'online', availability: 'available' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [stockUpdatingId, setStockUpdatingId] = useState<number | null>(null);
  const [stockForm, setStockForm] = useState({ status: 'online', availability: 'available' });
  const [stockSaving, setStockSaving] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [scanPath, setScanPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState<{ folder: string; total: number; recognized: number; files: any[] } | null>(null);
  const [scanSelected, setScanSelected] = useState<Set<number>>(new Set());
  const [categoryOverrides, setCategoryOverrides] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);

  const fetchArchives = () => {
    setLoading(true);
    api.get('/archives')
      .then((r) => setArchives(Array.isArray(r.data) ? r.data : []))
      .catch(() => toast('Failed to load archives', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchArchives(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', details: '', location: '', category: 'footage', status: 'online', availability: 'available' });
    setShowForm(true);
  };

  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({ name: a.name || '', details: a.details || '', location: a.location || '', category: a.category || 'footage', status: a.status || 'online', availability: a.availability || 'available' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast('Archive footage name is required', 'error'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/archives/${editingId}`, form);
        toast('Archive entry updated', 'success');
      } else {
        await api.post('/archives', form);
        toast('Archive entry created', 'success');
      }
      setShowForm(false);
      fetchArchives();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (deleteConfirmId === null) return;
    try {
      await api.delete(`/archives/${deleteConfirmId}`);
      toast('Archive entry deleted', 'success');
      setDeleteConfirmId(null);
      fetchArchives();
    } catch { toast('Failed to delete', 'error'); }
  };

  const openStockUpdate = (a: any) => {
    setStockUpdatingId(a.id);
    setStockForm({ status: a.status || 'online', availability: a.availability || 'available' });
  };

  const handleStockUpdate = async () => {
    if (stockUpdatingId === null) return;
    setStockSaving(true);
    try {
      await api.put(`/archives/${stockUpdatingId}/stock`, stockForm);
      toast('Stock updated', 'success');
      setStockUpdatingId(null);
      fetchArchives();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to update stock', 'error');
    } finally { setStockSaving(false); }
  };

  const filtered = archives.filter((a) =>
    !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.details?.toLowerCase().includes(search.toLowerCase()) || a.location?.toLowerCase().includes(search.toLowerCase())
  );

  const dueCount = filtered.filter((a) => (stockAgeDays(a) ?? 999) >= STOCK_REMINDER_DAYS).length;

  const formatSize = (bytes: number) => {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
  };

  const handleScan = async () => {
    const p = scanPath.trim();
    if (!p) { setScanError('Enter a folder path first.'); return; }
    setScanning(true);
    setScanError('');
    setScanResult(null);
    setScanSelected(new Set());
    setCategoryOverrides({});
    try {
      const res = await api.post('/archives/scan-folder', { path: p });
      setScanResult(res.data);
      if (res.data.recognized === 0) setScanError('No supported media files found in this folder.');
    } catch (err: any) {
      setScanError(err.response?.data?.error || 'Failed to scan folder');
    } finally { setScanning(false); }
  };

  const toggleScanFile = (idx: number) => {
    setScanSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleImportSelected = async () => {
    if (!scanResult) return;
    const items = scanResult.files
      .map((f, idx) => ({ f, idx }))
      .filter(({ f, idx }) => !f.exists && scanSelected.has(idx))
      .map(({ f, idx }) => ({ name: f.name, category: categoryOverrides[idx] || f.category, location: f.location, details: f.rel_path }));
    if (items.length === 0) { setScanError('Select at least one new file to import.'); return; }
    setImporting(true);
    setScanError('');
    try {
      const res = await api.post('/archives/import-selected', { items });
      toast(`${res.data.created} archive entr${res.data.created === 1 ? 'y' : 'ies'} imported`, 'success');
      setShowScan(false);
      setScanResult(null);
      setScanSelected(new Set());
      fetchArchives();
    } catch (err: any) {
      setScanError(err.response?.data?.error || 'Failed to import selected files');
    } finally { setImporting(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-surface-800">Archive</h1>
            <p className="text-sm text-surface-400">Central library of archive/stock footage — used in tasks, stories, ads, programs and more.</p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <button onClick={() => { setShowScan(true); setScanError(''); }} className="flat-btn-surface text-sm">
                <FolderSearch className="w-4 h-4" /> Import from Folder
              </button>
            )}
            <button onClick={openCreate} className="flat-btn-brand text-sm self-start">
              <Plus className="w-4 h-4" /> New Archive Entry
            </button>
          </div>
        </div>

      {canManage && dueCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-3">
          <CalendarClock className="w-4 h-4 text-warning-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-warning-800">Monthly stock update due</p>
            <p className="text-warning-700 text-xs mt-0.5">{dueCount} stock item{dueCount === 1 ? '' : 's'} {dueCount === 1 ? 'has' : 'have'} not been updated in {STOCK_REMINDER_DAYS}+ days. Please confirm status & availability.</p>
          </div>
        </div>
      )}

      <div className="flat-card p-0">
        <div className="p-3 border-b border-surface-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input className="flat-input w-full pl-9 text-sm" placeholder="Search archive footage (e.g. Shahar Police Shrigonda)..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <SkeletonList rows={6} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Archive className="w-10 h-10 text-surface-300 mx-auto mb-2" />
            <p className="text-sm text-surface-400">{search ? 'No archive entries match your search.' : 'No archive entries yet. Add your first archive/stock footage.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 hover:bg-surface-50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-accent-100 flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 text-accent-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-surface-800 truncate">{a.name}</p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${categoryConfig[a.category]?.color || 'bg-surface-100 text-surface-500'}`}>
                    {categoryConfig[a.category]?.label || a.category}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${a.status === 'online' ? 'bg-success-100 text-success-700' : 'bg-surface-100 text-surface-500'}`}>
                    {a.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${a.availability === 'available' ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}>
                    {a.availability === 'available' ? 'Available' : 'Not Available'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-surface-400">
                  {(() => {
                    const days = stockAgeDays(a);
                    return days !== null ? (
                      <span className={`inline-flex items-center gap-1 ${days >= STOCK_REMINDER_DAYS ? 'text-warning-600 font-medium' : ''}`}>
                        <Clock className="w-3 h-3" />{formatAge(a.stock_updated_at || a.created_at)} old
                      </span>
                    ) : null;
                  })()}
                  {a.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.location}</span>}
                  {a.details && <span className="flex items-center gap-1 truncate max-w-xs"><Layers className="w-3 h-3" />{a.details}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-surface-400 mt-0.5">
                  <span>{a.usage_count || 0} use{a.usage_count === 1 ? '' : 's'}</span>
                  {a.last_used_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last used {new Date(a.last_used_at).toLocaleDateString()}</span>}
                  {a.created_by_name && <span>Added by {a.created_by_name}</span>}
                </div>
              </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canManage && (
                    <button onClick={() => openStockUpdate(a)} className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50" title="Update Stock (monthly)">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {canManage && (
                    <button onClick={() => setDeleteConfirmId(a.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-800">{editingId ? 'Edit Archive Entry' : 'New Archive Entry'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-surface-400 hover:text-surface-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="flat-label">Name *</label>
                <input className="flat-input text-sm" placeholder="e.g. Shahar Police Shrigonda" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Details</label>
                <textarea className="flat-input text-sm" rows={3} placeholder="What's in this footage? e.g. police station exterior, press conference, stock visuals" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Location</label>
                <input className="flat-input text-sm" placeholder="e.g. Shrigonda, Ahmednagar" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Category</label>
                <select className="flat-select text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{categoryConfig[c]?.label || c}</option>)}
                </select>
              </div>
              <div>
                <label className="flat-label">Status</label>
                <select className="flat-select text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STOCK_STATUSES.map((s) => <option key={s} value={s}>{s === 'online' ? 'Online' : 'Offline'}</option>)}
                </select>
              </div>
              <div>
                <label className="flat-label">Availability</label>
                <select className="flat-select text-sm" value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })}>
                  {STOCK_AVAILABILITY.map((s) => <option key={s} value={s}>{s === 'available' ? 'Available' : 'Not Available'}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="flat-btn-secondary text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flat-btn-brand text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowScan(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center"><FolderOpen className="w-5 h-5 text-accent-600" /></div>
                <div>
                  <h3 className="text-sm font-semibold text-surface-800">Import from Folder</h3>
                  <p className="text-xs text-surface-400">Scan a folder on this machine and pick files to add to the archive.</p>
                </div>
              </div>
              <button onClick={() => setShowScan(false)} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex gap-2 mb-1">
              <input className="flat-input text-sm flex-1" placeholder="e.g. D:\StockFootage or /home/user/stock" value={scanPath} onChange={(e) => setScanPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleScan()} />
              <button onClick={handleScan} disabled={scanning} className="flat-btn-brand text-sm shrink-0">
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
                {scanning ? 'Scanning...' : 'Scan Folder'}
              </button>
            </div>
            {scanError && <p className="text-xs text-danger-600 mb-2">{scanError}</p>}

            {scanResult && (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-surface-500 my-3">
                  <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" />{scanResult.folder}</span>
                  <span>{scanResult.total} files found</span>
                  <span>{scanResult.recognized} media files indexed</span>
                  <span>{scanResult.files.filter((f) => f.exists).length} already in archive</span>
                </div>
                {scanResult.files.length > 0 ? (
                  <div className="border border-surface-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-surface-50">
                          <tr className="border-b border-surface-200">
                            <th className="w-10 px-3 py-2">
                              <input type="checkbox" className="w-4 h-4 accent-accent-600 cursor-pointer"
                                checked={scanResult.files.length > 0 && scanResult.files.every((f) => f.exists || scanSelected.has(scanResult.files.indexOf(f)))}
                                onChange={() => setScanSelected((prev) => {
                                  const fresh = scanResult.files.filter((f) => !f.exists).map((f) => scanResult.files.indexOf(f));
                                  const next = new Set(prev);
                                  if (fresh.length > 0 && fresh.every((i) => next.has(i))) { fresh.forEach((i) => next.delete(i)); } else { fresh.forEach((i) => next.add(i)); }
                                  return next;
                                })} />
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-surface-500">Name</th>
                            <th className="text-left px-3 py-2 font-medium text-surface-500">Type</th>
                            <th className="text-left px-3 py-2 font-medium text-surface-500">Age</th>
                            <th className="text-left px-3 py-2 font-medium text-surface-500">Size</th>
                            <th className="text-left px-3 py-2 font-medium text-surface-500">Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scanResult.files.map((f, idx) => (
                            <tr key={idx} className={`border-b border-surface-100 ${f.exists ? 'opacity-50' : 'hover:bg-surface-50'}`}>
                              <td className="px-3 py-2">
                                {f.exists ? (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-100 text-surface-500">Added</span>
                                ) : (
                                  <input type="checkbox" className="w-4 h-4 accent-accent-600 cursor-pointer" checked={scanSelected.has(idx)} onChange={() => toggleScanFile(idx)} />
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-surface-700">{f.name}</td>
                              <td className="px-3 py-2">
                                {f.exists ? (
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${categoryConfig[f.category]?.color || 'bg-surface-100 text-surface-500'}`}>{categoryConfig[f.category]?.label || f.category}</span>
                                ) : (
                                  <select className="flat-select text-xs py-1" value={categoryOverrides[idx] || f.category} onChange={(e) => setCategoryOverrides((prev) => ({ ...prev, [idx]: e.target.value }))}>
                                    {CATEGORIES.map((c) => <option key={c} value={c}>{categoryConfig[c]?.label || c}</option>)}
                                  </select>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-surface-500">{formatAge(f.modified_at)}</td>
                              <td className="px-3 py-2 text-xs text-surface-500">{formatSize(f.size)}</td>
                              <td className="px-3 py-2 text-xs text-surface-500 truncate max-w-[160px]" title={f.rel_path}>{f.location}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Archive className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                    <p className="text-sm text-surface-400">No supported media files found.</p>
                  </div>
                )}
                <div className="flex justify-between items-center mt-4">
                  <p className="text-xs text-surface-400">Files are imported by name only — nothing is copied or moved.</p>
                  <button onClick={handleImportSelected} disabled={importing || scanSelected.size === 0} className="flat-btn-brand text-sm">
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {importing ? 'Importing...' : `Add Selected (${scanSelected.size})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {stockUpdatingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setStockUpdatingId(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center"><RefreshCw className="w-5 h-5 text-accent-600" /></div>
              <div><h3 className="text-sm font-semibold text-surface-800">Update Stock</h3><p className="text-xs text-surface-400">Confirm this stock monthly to keep it current.</p></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flat-label">Status</label>
                <select className="flat-select text-sm" value={stockForm.status} onChange={(e) => setStockForm({ ...stockForm, status: e.target.value })}>
                  {STOCK_STATUSES.map((s) => <option key={s} value={s}>{s === 'online' ? 'Online' : 'Offline'}</option>)}
                </select>
              </div>
              <div>
                <label className="flat-label">Availability</label>
                <select className="flat-select text-sm" value={stockForm.availability} onChange={(e) => setStockForm({ ...stockForm, availability: e.target.value })}>
                  {STOCK_AVAILABILITY.map((s) => <option key={s} value={s}>{s === 'available' ? 'Available' : 'Not Available'}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-surface-400 mt-3">Saving resets the stock age — you will be reminded again in 30 days.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setStockUpdatingId(null)} className="flat-btn-secondary text-sm">Cancel</button>
              <button onClick={handleStockUpdate} disabled={stockSaving} className="flat-btn-brand text-sm">
                {stockSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {stockSaving ? 'Saving...' : 'Confirm Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-danger-600" /></div>
              <div><h3 className="text-sm font-semibold text-surface-800">Delete Archive Entry</h3><p className="text-xs text-surface-400">Tasks using it will lose the link.</p></div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete this archive entry from the library?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flat-btn-secondary">Cancel</button>
              <button onClick={handleDelete} className="flat-btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
