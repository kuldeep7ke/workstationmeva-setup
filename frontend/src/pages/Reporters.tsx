import { useState, useEffect } from 'react';
import { SkeletonList } from '../components/PageSkeletons';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatDate } from '../utils/dates';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Loader2, Pencil, Trash2, User, MapPin, Phone, Mail, Globe, Newspaper, BookOpen, Radio, Megaphone, AlertTriangle, X, Eye, Archive, Clock } from 'lucide-react';
import { formatLabel } from '../utils/roles';

const REGIONS = ['local', 'taluka', 'state', 'district'];
const SPECIALIZATIONS = ['General', 'Politics', 'Crime', 'Sports', 'Entertainment', 'Business', 'Technology', 'Health', 'Education', 'Environment'];

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-success-100 text-success-700' },
  inactive: { label: 'Inactive', color: 'bg-surface-100 text-surface-500' },
};

export default function Reporters() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = (user?.access_level || 3) <= 2;
  const [reporters, setReporters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', location: '', region: 'local', specialization: '', bio: '', photo_url: '', status: 'active' });
  const [selectedReporter, setSelectedReporter] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'reporters' | 'locations'>('reporters');
  const [locations, setLocations] = useState<any[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [locationForm, setLocationForm] = useState({ name: '', region: 'local', details: '' });
  const [savingLocation, setSavingLocation] = useState(false);
  const [deleteLocationId, setDeleteLocationId] = useState<number | null>(null);

  const fetchReporters = () => {
    setLoading(true);
    api.get('/reporters').then((r) => setReporters(Array.isArray(r.data) ? r.data : [])).catch(() => toast('Failed to load reporters', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchReporters(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', email: '', phone: '', location: '', region: 'local', specialization: '', bio: '', photo_url: '', status: 'active' });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({ name: r.name || '', email: r.email || '', phone: r.phone || '', location: r.location || '', region: r.region || 'local', specialization: r.specialization || '', bio: r.bio || '', photo_url: r.photo_url || '', status: r.status || 'active' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/reporters/${editingId}`, form);
        toast('Reporter updated', 'success');
      } else {
        await api.post('/reporters', form);
        toast('Reporter created', 'success');
      }
      setShowForm(false);
      fetchReporters();
    } catch { toast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (deleteConfirmId === null) return;
    try {
      await api.delete(`/reporters/${deleteConfirmId}`);
      toast('Reporter deleted', 'success');
      setDeleteConfirmId(null);
      fetchReporters();
      if (selectedReporter?.id === deleteConfirmId) { setSelectedReporter(null); setStats(null); }
    } catch { toast('Failed to delete', 'error'); }
  };

  const fetchLocations = () => {
    setLocationsLoading(true);
    api.get('/locations').then((r) => setLocations(Array.isArray(r.data) ? r.data : [])).catch(() => toast('Failed to load locations', 'error')).finally(() => setLocationsLoading(false));
  };

  useEffect(() => { if (activeTab === 'locations') fetchLocations(); }, [activeTab]);

  const openCreateLocation = () => {
    setEditingLocationId(null);
    setLocationForm({ name: '', region: 'local', details: '' });
    setShowLocationForm(true);
  };

  const openEditLocation = (l: any) => {
    setEditingLocationId(l.id);
    setLocationForm({ name: l.name || '', region: l.region || 'local', details: l.details || '' });
    setShowLocationForm(true);
  };

  const handleSaveLocation = async () => {
    if (!locationForm.name?.trim()) { toast('Location name is required', 'error'); return; }
    setSavingLocation(true);
    try {
      if (editingLocationId) {
        await api.put(`/locations/${editingLocationId}`, locationForm);
        toast('Location updated', 'success');
      } else {
        await api.post('/locations', locationForm);
        toast('Location created', 'success');
      }
      setShowLocationForm(false);
      fetchLocations();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    }
    finally { setSavingLocation(false); }
  };

  const handleDeleteLocation = async () => {
    if (deleteLocationId === null) return;
    try {
      await api.delete(`/locations/${deleteLocationId}`);
      toast('Location deleted', 'success');
      setDeleteLocationId(null);
      fetchLocations();
    } catch { toast('Failed to delete', 'error'); }
  };

  const filteredLocations = locations.filter((l) =>
    !locationSearch || l.name?.toLowerCase().includes(locationSearch.toLowerCase()) || l.details?.toLowerCase().includes(locationSearch.toLowerCase())
  );

  const viewStats = async (r: any) => {
    setSelectedReporter(r);
    setLoadingStats(true);
    setStats(null);
    try {
      const res = await api.get(`/reporters/${r.id}/stats`);
      setStats(res.data);
    } catch { toast('Failed to load stats', 'error'); }
    finally { setLoadingStats(false); }
  };

  const filtered = reporters.filter((r) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.location?.toLowerCase().includes(search.toLowerCase()) || r.specialization?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-surface-800">Reporters</h1>
          <p className="text-sm text-surface-400">Manage reporter profiles and their locations.</p>
        </div>
        {activeTab === 'reporters' ? (
          <button onClick={openCreate} className="flat-btn-brand text-sm self-start">
            <Plus className="w-4 h-4" /> New Reporter
          </button>
        ) : (
          <button onClick={openCreateLocation} className="flat-btn-brand text-sm self-start">
            <Plus className="w-4 h-4" /> New Location
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-200">
        <button onClick={() => setActiveTab('reporters')} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'reporters' ? 'border-accent-600 text-accent-700' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
          Reporters
        </button>
        <button onClick={() => setActiveTab('locations')} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'locations' ? 'border-accent-600 text-accent-700' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
          Locations
        </button>
      </div>

      {activeTab === 'reporters' ? (
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Reporter List */}
        <div className="flex-1 min-w-0">
          <div className="flat-card p-0">
            <div className="p-3 border-b border-surface-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input className="flat-input w-full pl-9 text-sm" placeholder="Search reporters..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {loading ? (
              <SkeletonList rows={6} />
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                <p className="text-sm text-surface-400">{search ? 'No reporters match your search.' : 'No reporters yet. Create your first reporter.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-100">
                {filtered.map((r) => (
                  <div key={r.id} className={`flex items-center gap-3 p-3 hover:bg-surface-50 transition-colors cursor-pointer ${selectedReporter?.id === r.id ? 'bg-accent-50' : ''}`}
                    onClick={() => viewStats(r)}>
                    <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center shrink-0">
                      {r.photo_url ? <img src={r.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" /> : <span className="text-sm font-semibold text-accent-700">{r.name?.charAt(0)?.toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-surface-800 truncate">{r.name}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusConfig[r.status]?.color || 'bg-surface-100 text-surface-500'}`}>
                          {statusConfig[r.status]?.label || r.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-surface-400">
                        {r.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.location}</span>}
                        {r.region && <span className="capitalize">{r.region}</span>}
                        {r.specialization && <span>{r.specialization}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button onClick={() => setDeleteConfirmId(r.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reporter Detail / Stats */}
        <div className="w-full lg:w-96 shrink-0">
          {!selectedReporter ? (
            <div className="flat-card flex flex-col items-center justify-center py-12 text-center">
              <Eye className="w-10 h-10 text-surface-300 mb-3" />
              <p className="text-sm text-surface-400">Select a reporter to view their work history and stats.</p>
            </div>
          ) : loadingStats ? (
            <div className="flat-card flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-accent-500 animate-spin" /></div>
          ) : stats ? (
            <div className="space-y-3">
              {/* Reporter Profile Card */}
              <div className="flat-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center">
                      {selectedReporter.photo_url ? <img src={selectedReporter.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" /> : <span className="text-lg font-bold text-accent-700">{selectedReporter.name?.charAt(0)?.toUpperCase()}</span>}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-surface-800">{selectedReporter.name}</h3>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusConfig[selectedReporter.status]?.color || ''}`}>
                        {statusConfig[selectedReporter.status]?.label || selectedReporter.status}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => openEdit(selectedReporter)} className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 text-xs text-surface-500">
                  {selectedReporter.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{selectedReporter.email}</p>}
                  {selectedReporter.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{selectedReporter.phone}</p>}
                  {selectedReporter.location && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{selectedReporter.location}{selectedReporter.region ? ` (${selectedReporter.region})` : ''}</p>}
                  {selectedReporter.specialization && <p className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{selectedReporter.specialization}</p>}
                  {selectedReporter.bio && <p className="mt-2 text-surface-400 leading-relaxed">{selectedReporter.bio}</p>}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flat-card !p-4 text-center">
                  <Newspaper className="w-5 h-5 text-accent-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-800">{stats.counts.news}</p>
                  <p className="text-[11px] text-surface-400">News Items</p>
                </div>
                <div className="flat-card !p-4 text-center">
                  <BookOpen className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-800">{stats.counts.stories}</p>
                  <p className="text-[11px] text-surface-400">Stories</p>
                </div>
                <div className="flat-card !p-4 text-center">
                  <Megaphone className="w-5 h-5 text-warning-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-800">{stats.counts.ads}</p>
                  <p className="text-[11px] text-surface-400">Ads</p>
                </div>
                <div className="flat-card !p-4 text-center">
                  <Radio className="w-5 h-5 text-danger-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-800">{stats.counts.programs}</p>
                  <p className="text-[11px] text-surface-400">Programs</p>
                </div>
              </div>

              {/* Recent Work */}
              {stats.newsItems.length > 0 && (
                <div className="flat-card">
                  <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Recent News Items</h4>
                  <div className="space-y-1.5">
                    {stats.newsItems.slice(0, 5).map((n: any) => (
                      <div key={n.id} className="text-xs text-surface-600 flex justify-between">
                        <span className="truncate">{n.slug || n.task_title || `News #${n.id}`}</span>
                        <span className="text-surface-400 shrink-0 ml-2">{n.created_at ? formatDate(n.created_at) : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.stories.length > 0 && (
                <div className="flat-card">
                  <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Recent Stories</h4>
                  <div className="space-y-1.5">
                    {stats.stories.slice(0, 5).map((s: any) => (
                      <div key={s.id} className="text-xs text-surface-600 flex justify-between">
                        <span className="truncate">{s.title}</span>
                        <span className="text-surface-400 shrink-0 ml-2">{formatLabel(s.story_type)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.ads.length > 0 && (
                <div className="flat-card">
                  <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Recent Ads</h4>
                  <div className="space-y-1.5">
                    {stats.ads.slice(0, 5).map((a: any) => (
                      <div key={a.id} className="text-xs text-surface-600 flex justify-between">
                        <span className="truncate">{a.title}</span>
                        <span className="text-surface-400 shrink-0 ml-2">{a.client_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.programs.length > 0 && (
                <div className="flat-card">
                  <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Recent Programs</h4>
                  <div className="space-y-1.5">
                    {stats.programs.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="text-xs text-surface-600 flex justify-between">
                        <span className="truncate">{p.title}</span>
                        <span className="text-surface-400 shrink-0 ml-2">{formatLabel(p.program_type)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      ) : (
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        <div className="flex-1 min-w-0">
          <div className="flat-card p-0">
            <div className="p-3 border-b border-surface-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input className="flat-input w-full pl-9 text-sm" placeholder="Search locations (e.g. Shrigonda, Pune)..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} />
              </div>
            </div>
            {locationsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-accent-500 animate-spin" /></div>
            ) : filteredLocations.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                <p className="text-sm text-surface-400">{locationSearch ? 'No locations match your search.' : 'No locations yet. Add one or create a reporter with a location.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-100">
                {filteredLocations.map((l) => (
                  <div key={l.id} className="flex items-start gap-3 p-3 hover:bg-surface-50 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-accent-100 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-accent-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-surface-800 truncate">{l.name}</p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-100 text-surface-500 capitalize">{l.region}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-surface-400 mt-0.5">
                        <span>{l.usage_count || 0} use{l.usage_count === 1 ? '' : 's'}</span>
                        {l.last_used_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last used {new Date(l.last_used_at).toLocaleDateString()}</span>}
                        {l.details && <span className="truncate max-w-xs">{l.details}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditLocation(l)} className="p-1.5 rounded-lg text-surface-400 hover:text-accent-600 hover:bg-accent-50" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button onClick={() => setDeleteLocationId(l.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="w-full lg:w-96 shrink-0">
          <div className="flat-card">
            <Archive className="w-8 h-8 text-surface-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-surface-800 text-center">Location Library</h3>
            <p className="text-sm text-surface-400 mt-1 text-center leading-relaxed">Every reporter location is added here automatically. Locations work on their own too — a task can use a location with or without a reporter. The task form fetches recent and past-used locations from here.</p>
          </div>
        </div>
      </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-800">{editingId ? 'Edit Reporter' : 'New Reporter'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-surface-400 hover:text-surface-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="flat-label">Name *</label>
                <input className="flat-input text-sm" placeholder="Reporter full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Email</label>
                <input className="flat-input text-sm" placeholder="email@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Phone</label>
                <input className="flat-input text-sm" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Location</label>
                <input className="flat-input text-sm" placeholder="e.g. Pune, Maharashtra" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Region</label>
                <select className="flat-select text-sm" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                  {REGIONS.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
                </select>
              </div>
              <div>
                <label className="flat-label">Specialization</label>
                <select className="flat-select text-sm" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })}>
                  <option value="">Select...</option>
                  {SPECIALIZATIONS.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="flat-label">Status</label>
                <select className="flat-select text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Photo URL</label>
                <input className="flat-input text-sm" placeholder="https://..." value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Bio</label>
                <textarea className="flat-input text-sm" rows={3} placeholder="About the reporter..." value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
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

      {/* Delete Confirmation */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-danger-600" /></div>
              <div><h3 className="text-sm font-semibold text-surface-800">Delete Reporter</h3><p className="text-xs text-surface-400">Moves to recycle bin.</p></div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete this reporter profile? You can restore it from the recycle bin later.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flat-btn-secondary">Cancel</button>
              <button onClick={handleDelete} className="flat-btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Location Create/Edit Modal */}
      {showLocationForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowLocationForm(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-800">{editingLocationId ? 'Edit Location' : 'New Location'}</h3>
              <button onClick={() => setShowLocationForm(false)} className="p-1 rounded text-surface-400 hover:text-surface-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="flat-label">Location Name *</label>
                <input className="flat-input text-sm" placeholder="e.g. Shrigonda, Ahmednagar" value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} />
              </div>
              <div>
                <label className="flat-label">Region</label>
                <select className="flat-select text-sm" value={locationForm.region} onChange={(e) => setLocationForm({ ...locationForm, region: e.target.value })}>
                  {REGIONS.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="flat-label">Details</label>
                <textarea className="flat-input text-sm" rows={3} placeholder="Optional notes about this location..." value={locationForm.details} onChange={(e) => setLocationForm({ ...locationForm, details: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowLocationForm(false)} className="flat-btn-secondary text-sm">Cancel</button>
              <button onClick={handleSaveLocation} disabled={savingLocation} className="flat-btn-brand text-sm">
                {savingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {savingLocation ? 'Saving...' : editingLocationId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Delete Confirmation */}
      {deleteLocationId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDeleteLocationId(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-danger-600" /></div>
              <div><h3 className="text-sm font-semibold text-surface-800">Delete Location</h3><p className="text-xs text-surface-400">Moves to recycle bin.</p></div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete this location from the library?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteLocationId(null)} className="flat-btn-secondary">Cancel</button>
              <button onClick={handleDeleteLocation} className="flat-btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
