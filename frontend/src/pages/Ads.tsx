import { useState, useEffect, useMemo } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import api from '../utils/api';
import { parseDate } from '../utils/dates';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useUndo } from '../context/UndoContext';
import { Plus, Pencil, Trash2, DollarSign, Calendar, AlertTriangle, Loader2, Megaphone, Layers, MapPin, Tag, User, Building2, Handshake, RefreshCw, TrendingUp, Clock, Shield, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const AD_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'vardhapan_special', label: 'Vardhapan Special' },
  { value: 'diwali_special', label: 'Diwali Special' },
  { value: 'festival_special', label: 'Festival Special' },
  { value: 'event_special', label: 'Event Special' },
  { value: 'other', label: 'Other' },
];

const PARTY_TYPES = [
  { value: 'political', label: 'Political' },
  { value: 'business', label: 'Business' },
  { value: 'govt', label: 'Government' },
  { value: 'ngo', label: 'NGO' },
  { value: 'company', label: 'Company' },
  { value: 'agency', label: 'Agency' },
  { value: 'personal', label: 'Personal' },
];

const BOOKING_SOURCES = [
  { value: 'client', label: 'Client (direct)' },
  { value: 'reporter', label: 'Reporter' },
  { value: 'agency', label: 'Agency' },
];

const RENEWAL_TYPES = [
  { value: 'one_time', label: 'One Time' },
  { value: 'auto_renew', label: 'Auto Renew' },
  { value: 'loop', label: 'Loop (Continuous)' },
  { value: 'seasonal', label: 'Seasonal' },
];

const RENEWAL_PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const AD_PLACES = [
  { value: 'during_news', label: 'During News' },
  { value: 'before_news', label: 'Before News' },
  { value: 'after_news', label: 'After News' },
  { value: 'between_programs', label: 'Between Programs' },
  { value: 'brand', label: 'Brand' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'l_shape', label: 'L-Shape' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'scrolling', label: 'Scrolling' },
  { value: 'single', label: 'Single' },
  { value: 'promo', label: 'Promo' },
  { value: 'in_live', label: 'In-LIVE' },
  { value: 'teaser', label: 'Teaser' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'poster', label: 'Poster' },
  { value: 'other', label: 'Other' },
];

const BRAND_TYPES = [
  { value: 'laptop_branding', label: 'Laptop Branding' },
  { value: 'logo_branding', label: 'Logo Branding' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'special_program', label: 'Special Program' },
  { value: 'other', label: 'Other' },
];

const EMPTY_FORM = {
  title: '', client_name: '', description: '', duration_seconds: 30,
  category: 'general', party_type: '', booked_by: 'client', reporter_id: '', agency_name: '',
  slots_count: 1, ad_place: '', brand_type: '', renewal_type: 'one_time', renewal_period: '',
  start_date: '', end_date: '', status: '',
};

export default function Ads() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { showUndo } = useUndo();
  const [ads, setAds] = useState<any[]>([]);
  const [reporters, setReporters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; title: string } | null>(null);

  const canCreate = (user?.access_level || 3) <= 3;
  const canManage = (user?.access_level || 3) <= 2;

  // Summary stats
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const stats = useMemo(() => {
    const total = ads.length;
    const active = ads.filter(a => a.status === 'active').length;
    const inactive = ads.filter(a => a.status === 'inactive').length;
    // 'expired' is derived from end_date — the schema CHECK doesn't allow storing it.
    const isExpired = (a: any) => a.status === 'active' && a.end_date && new Date(a.end_date).getTime() < now.getTime();
    const expired = ads.filter(isExpired).length;
    const expiringSoon = ads.filter(a => {
      if (!a.end_date || a.status !== 'active') return false;
      const end = new Date(a.end_date);
      return end >= now && end <= sevenDaysFromNow;
    }).length;
    const autoRenew = ads.filter(a => a.renewal_type === 'auto_renew' || a.renewal_type === 'loop').length;
    const seasonal = ads.filter(a => a.renewal_type === 'seasonal').length;

    // Last month stats - just count and status breakdown
    const lastMonthAds = ads.filter(a => {
      const created = parseDate(a.created_at);
      return !!created && created >= lastMonthStart && created <= lastMonthEnd;
    });
    const lastMonthCount = lastMonthAds.length;
    const lastMonthActive = lastMonthAds.filter(a => a.status === 'active').length;
    const lastMonthInactive = lastMonthAds.filter(a => a.status === 'inactive').length;
    const lastMonthExpired = lastMonthAds.filter(isExpired).length;

    return {
      total,
      active,
      inactive,
      expired,
      expiringSoon,
      autoRenew,
      seasonal,
      lastMonthCount,
      lastMonthActive,
      lastMonthInactive,
      lastMonthExpired,
    };
  }, [ads, now]);

  const fetch = () => {
    setLoading(true);
    setErr('');
    api.get('/ads').then((res) => setAds(res.data)).catch(() => setErr('Failed to load ads')).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);
  useEffect(() => { if (showCreate) api.get('/reporters').then((res) => setReporters(res.data)).catch(() => {}); }, [showCreate]);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowCreate(true);
  };

  const startEdit = (ad: any) => {
    setForm({
      title: ad.title || '', client_name: ad.client_name || '', description: ad.description || '',
      duration_seconds: ad.duration_seconds || 30,
      category: ad.ad_type || 'general', party_type: ad.party_type || '',
      booked_by: ad.booked_by || 'client', reporter_id: ad.reporter_id ? String(ad.reporter_id) : '', agency_name: ad.agency_name || '',
      slots_count: ad.slots_count || 1, ad_place: ad.ad_place || '', brand_type: ad.brand_type || '',
      renewal_type: ad.renewal_type || 'one_time', renewal_period: ad.renewal_period || '',
      start_date: ad.start_date || '', end_date: ad.end_date || '', status: ad.status || '',
    });
    setEditingId(ad.id);
    setShowCreate(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.booked_by === 'reporter' && !form.reporter_id) {
      toast('Select a reporter for this ad booking', 'error');
      return;
    }
    if (form.booked_by === 'agency' && !form.agency_name.trim()) {
      toast('Enter the agency name for this ad booking', 'error');
      return;
    }
    if ((form.renewal_type === 'auto_renew' || form.renewal_type === 'loop') && !form.renewal_period) {
      toast('Select a renewal period for this cycle', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        ad_type: form.category,
        reporter_id: form.booked_by === 'reporter' ? Number(form.reporter_id) : null,
        agency_name: form.booked_by === 'agency' ? form.agency_name.trim() : null,
        renewal_period: (form.renewal_type === 'auto_renew' || form.renewal_type === 'loop') ? form.renewal_period : null,
      };
      if (editingId) {
        await api.put(`/ads/${editingId}`, payload);
        toast('Advertisement updated', 'success');
      } else {
        const res = await api.post('/ads', payload);
        toast('Advertisement created', 'success');
        showUndo('Advertisement created', async () => {
          await api.delete(`/ads/${res.data.id}`);
          fetch();
        });
      }
      setShowCreate(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetch();
    } catch { toast(editingId ? 'Failed to update ad' : 'Failed to create ad', 'error'); } finally { setSaving(false); }
  };

  const deleteAd = async () => {
    if (!deleteConfirm) return;
    const ad = ads.find((a: any) => a.id === deleteConfirm.id);
    try {
      await api.delete(`/ads/${deleteConfirm.id}`);
      toast('Advertisement deleted', 'success');
      if (ad) {
        showUndo('Advertisement deleted', async () => {
          await api.post('/ads', {
            title: ad.title, client_name: ad.client_name, description: ad.description,
            duration_seconds: ad.duration_seconds, rate: ad.rate, ad_type: ad.ad_type,
            party_type: ad.party_type, booked_by: ad.booked_by || 'client',
            reporter_id: ad.reporter_id, agency_name: ad.agency_name,
            slots_count: ad.slots_count, ad_place: ad.ad_place, brand_type: ad.brand_type,
            renewal_type: ad.renewal_type, renewal_period: ad.renewal_period,
            start_date: ad.start_date, end_date: ad.end_date,
          });
          fetch();
        });
      }
      setDeleteConfirm(null);
      fetch();
    } catch { toast('Failed to delete ad', 'error'); }
  };

  const typeLabel = (ad: any) => {
    const cat = AD_CATEGORIES.find(c => c.value === ad.ad_type || c.value === ad.category);
    if (cat) return cat.label;
    return ad.ad_type || ad.category || '';
  };

  const partyLabel = (t: string) => PARTY_TYPES.find(p => p.value === t)?.label || t || '';
  const placeLabel = (p: string, brandType?: string) => {
    const place = AD_PLACES.find(x => x.value === p)?.label || p || '';
    if (p === 'brand' && brandType) {
      const bt = BRAND_TYPES.find(x => x.value === brandType)?.label || brandType;
      return `Brand — ${bt}`;
    }
    return place;
  };
  const bookedByLabel = (ad: any) => {
    if (ad.booked_by === 'reporter') return ad.reporter_name ? `Reporter: ${ad.reporter_name}` : 'Reporter';
    if (ad.booked_by === 'agency') return ad.agency_name ? `Agency: ${ad.agency_name}` : 'Agency';
    return 'Direct Client';
  };

  const renewalLabel = (ad: any) => {
    const t = RENEWAL_TYPES.find(r => r.value === ad.renewal_type)?.label || ad.renewal_type;
    if ((ad.renewal_type === 'auto_renew' || ad.renewal_type === 'loop') && ad.renewal_period) {
      const p = RENEWAL_PERIODS.find(r => r.value === ad.renewal_period)?.label || ad.renewal_period;
      return `${t} · ${p}`;
    }
    return t;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Advertisements</h1>
          <p className="text-sm text-surface-400 mt-0.5">Ad bookings for clients, reporters & agencies</p>
        </div>
        {canCreate && (
        <button onClick={startCreate} className="flat-btn-brand self-start">
          <Plus className="w-4 h-4 icon-bounce" /> New Ad
          </button>
        )}
      </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <div className="flat-card p-4 border-l-4 border-l-accent-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Total Ads</p>
              <p className="text-2xl font-bold text-surface-800 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-accent-600" />
            </div>
          </div>
        </div>

        <div className="flat-card p-4 border-l-4 border-l-success-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Running Now</p>
              <p className="text-2xl font-bold text-success-700 mt-1">{stats.active}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-success-600" />
            </div>
          </div>
        </div>

        <div className="flat-card p-4 border-l-4 border-l-warning-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Expiring Soon</p>
              <p className="text-2xl font-bold text-warning-700 mt-1">{stats.expiringSoon}</p>
              <p className="text-xs text-warning-600 mt-0.5">Within 7 days</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning-600" />
            </div>
          </div>
        </div>

        <div className="flat-card p-4 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Auto Renew / Loop</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">{stats.autoRenew}</p>
              <p className="text-xs text-purple-600 mt-0.5">{stats.seasonal} seasonal</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="flat-card p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Last Month</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{stats.lastMonthCount}</p>
              <p className="text-xs text-blue-600 mt-0.5">{stats.lastMonthActive} active · {stats.lastMonthInactive} inactive · {stats.lastMonthExpired} expired</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="flat-card p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Inactive / Expired</p>
              <p className="text-2xl font-bold text-surface-600 mt-1">{stats.inactive + stats.expired}</p>
              <p className="text-xs text-surface-500 mt-0.5">{stats.inactive} inactive · {stats.expired} expired</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-surface-400" />
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-1">
            {editingId ? 'Edit Advertisement' : 'New Advertisement'}
          </h3>
          {editingId && (
            <p className="text-xs text-surface-400 mb-4">Changeable ads can be updated anytime — edits apply immediately.</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-3">Ad Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flat-label">Title *</label>
                  <input className="flat-input" required value={form.title} placeholder="e.g. Vardhapan Special Greetings"
                    onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Client / Party Name *</label>
                  <input className="flat-input" required value={form.client_name} placeholder="e.g. Shinde Construction"
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Category *</label>
                  <select className="flat-select" required value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {AD_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flat-label">Client Type *</label>
                  <select className="flat-select" required value={form.party_type}
                    onChange={(e) => setForm({ ...form, party_type: e.target.value })}>
                    <option value="">Select type...</option>
                    {PARTY_TYPES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-3">Booking</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flat-label">On Behalf Of *</label>
                  <select className="flat-select" required value={form.booked_by}
                    onChange={(e) => setForm({ ...form, booked_by: e.target.value })}>
                    {BOOKING_SOURCES.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
                {form.booked_by === 'reporter' && (
                  <div>
                    <label className="flat-label">Reporter *</label>
                    <select className="flat-select" required value={form.reporter_id}
                      onChange={(e) => setForm({ ...form, reporter_id: e.target.value })}>
                      <option value="">Select reporter...</option>
                      {reporters.filter((r) => r.status !== 'inactive').map((r) => (
                        <option key={r.id} value={r.id}>{r.name}{r.specialization ? ` — ${r.specialization}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                {form.booked_by === 'agency' && (
                  <div>
                    <label className="flat-label">Agency Name *</label>
                    <input className="flat-input" required value={form.agency_name} placeholder="e.g. Media Plus Agency"
                      onChange={(e) => setForm({ ...form, agency_name: e.target.value })} />
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-3">Placement</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flat-label">Place (where & how to place)</label>
                  <select className="flat-select" value={form.ad_place}
                    onChange={(e) => setForm({ ...form, ad_place: e.target.value, brand_type: e.target.value === 'brand' ? form.brand_type : '' })}>
                    <option value="">Select place...</option>
                    {AD_PLACES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                {form.ad_place === 'brand' && (
                  <div>
                    <label className="flat-label">Brand Type *</label>
                    <select className="flat-select" required value={form.brand_type}
                      onChange={(e) => setForm({ ...form, brand_type: e.target.value })}>
                      <option value="">Select brand type...</option>
                      {BRAND_TYPES.map((bt) => (
                        <option key={bt.value} value={bt.value}>{bt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {form.ad_place !== 'brand' && (
                  <>
                    <div>
                      <label className="flat-label">Slots (how many times)</label>
                      <input type="number" min={1} className="flat-input" value={form.slots_count}
                        onChange={(e) => setForm({ ...form, slots_count: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="flat-label">Duration (sec)</label>
                      <input type="number" className="flat-input" value={form.duration_seconds}
                        onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-3">Validity & Renewal</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flat-label">Ad Cycle *</label>
                  <select className="flat-select" required value={form.renewal_type}
                    onChange={(e) => setForm({ ...form, renewal_type: e.target.value, renewal_period: '' })}>
                    {RENEWAL_TYPES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-surface-400 mt-1">
                    {form.renewal_type === 'auto_renew' ? 'Renews automatically until cancelled.' :
                     form.renewal_type === 'loop' ? 'Runs on a repeating cycle.' :
                     form.renewal_type === 'seasonal' ? 'Festival / season based (e.g. Vardhapan, Diwali).' :
                     'Runs once as booked.'}
                  </p>
                </div>
                {(form.renewal_type === 'auto_renew' || form.renewal_type === 'loop') && (
                  <div>
                    <label className="flat-label">Renewal Period *</label>
                    <select className="flat-select" required value={form.renewal_period}
                      onChange={(e) => setForm({ ...form, renewal_period: e.target.value })}>
                      <option value="">Select period...</option>
                      {RENEWAL_PERIODS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="flat-label">Start Date</label>
                  <input type="date" className="flat-input" value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">End Date</label>
                  <input type="date" className="flat-input" value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-3">Notes</h4>
              <div>
                <label className="flat-label">Description</label>
                <textarea className="flat-input" rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>

            {editingId && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-3">Status</h4>
                <select className="flat-select" value={form.status || 'active'}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowCreate(false); setEditingId(null); setForm(EMPTY_FORM); }} className="flat-btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="flat-btn-brand">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Ad'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : err ? (
        <div className="flat-card-static text-center py-12">
          <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
          <p className="text-surface-500">{err}</p>
          <button onClick={fetch} className="flat-btn-brand mt-4">Retry</button>
        </div>
      ) : ads.length === 0 ? (
        <div className="flat-card-static text-center py-12">
          <Megaphone className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-400">No advertisements</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ads.map((ad) => (
            <div key={ad.id} className="flat-card">
              <div className="flex items-center justify-between mb-2">
                <span className={`flat-badge ${
                  ad.status === 'active' ? 'badge-working icon-pulse' :
                  ad.status === 'inactive' ? 'badge-pending' : 'badge-completed'
                }`}>{ad.status}</span>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(ad)}
                      className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors"
                      title="Edit ad">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirm({ id: ad.id, title: ad.title })}
                      className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors"
                      title="Delete ad">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="text-sm font-semibold text-surface-800">{ad.title}</h3>
              <p className="text-sm text-surface-500">{ad.client_name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {typeLabel(ad) && (
                  <span className="flat-badge bg-surface-100 text-surface-600 border border-surface-300 text-[11px]">
                    <Tag className="w-3 h-3 inline mr-1" />{typeLabel(ad)}
                  </span>
                )}
                {partyLabel(ad.party_type) && (
                  <span className="flat-badge bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                    <User className="w-3 h-3 inline mr-1" />{partyLabel(ad.party_type)}
                  </span>
                )}
                <span className="flat-badge bg-success-50 text-success-700 border border-success-200 text-[11px]">
                  {ad.booked_by === 'reporter' ? <User className="w-3 h-3 inline mr-1" /> :
                   ad.booked_by === 'agency' ? <Building2 className="w-3 h-3 inline mr-1" /> :
                   <Handshake className="w-3 h-3 inline mr-1" />}
                  {bookedByLabel(ad)}
                </span>
                {(ad.renewal_type && ad.renewal_type !== 'one_time') && (
                  <span className={`flat-badge text-[11px] ${
                    ad.renewal_type === 'seasonal' ? 'bg-warning-50 text-warning-700 border border-warning-200' :
                    'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}>
                    <RefreshCw className="w-3 h-3 inline mr-1" />{renewalLabel(ad)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-surface-600">
                {ad.ad_place !== 'brand' && Number(ad.slots_count) > 0 && (
                  <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {ad.slots_count} slot{ad.slots_count > 1 ? 's' : ''}</span>
                )}
                {ad.ad_place && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {placeLabel(ad.ad_place, ad.brand_type)}</span>
                )}
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {ad.start_date} - {ad.end_date}</span>
                {ad.ad_place !== 'brand' && <span>{ad.duration_seconds}s</span>}
              </div>
              {Number(ad.rate) > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs font-medium text-success-700">
                  <DollarSign className="w-3 h-3" /> ₹{ad.rate}
                </div>
              )}
              <p className="text-[11px] text-surface-400 mt-1.5">By {ad.created_by_name}</p>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Delete Advertisement</h3>
                <p className="text-xs text-surface-500">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-surface-600 mb-4">Delete "{deleteConfirm.title}"?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flat-btn text-xs px-4 py-2">Cancel</button>
              <button onClick={deleteAd} className="flat-btn-danger text-xs px-4 py-2">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
