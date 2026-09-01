import { useState, useEffect } from 'react';
import { SkeletonTable } from '../components/PageSkeletons';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { Trash2, RotateCcw, Loader2, AlertTriangle, Ban, Radio } from 'lucide-react';
import { formatLabel } from '../utils/roles';

type Tab = 'tasks' | 'programs' | 'ads' | 'locations' | 'reporters';

const ENTITY: Record<Tab, {
  singular: string; plural: string;
  list: string; restore: (id: number) => string;
  permanent: (id: number) => string; bulk: string; empty: string;
}> = {
  tasks: {
    singular: 'task', plural: 'tasks',
    list: '/tasks/trashed', restore: (id) => `/tasks/${id}/restore`,
    permanent: (id) => `/tasks/${id}/permanent`, bulk: '/tasks/permanent-bulk', empty: '/tasks/empty-trash',
  },
  programs: {
    singular: 'program', plural: 'programs',
    list: '/programs/trashed', restore: (id) => `/programs/${id}/restore`,
    permanent: (id) => `/programs/${id}/permanent`, bulk: '/programs/permanent-bulk', empty: '/programs/empty-trash',
  },
  ads: {
    singular: 'ad', plural: 'ads',
    list: '/ads/trashed', restore: (id) => `/ads/${id}/restore`,
    permanent: (id) => `/ads/${id}/permanent`, bulk: '/ads/permanent-bulk', empty: '/ads/empty-trash',
  },
  locations: {
    singular: 'location', plural: 'locations',
    list: '/locations/trashed', restore: (id) => `/locations/${id}/restore`,
    permanent: (id) => `/locations/${id}/permanent`, bulk: '/locations/permanent-bulk', empty: '/locations/empty-trash',
  },
  reporters: {
    singular: 'reporter', plural: 'reporters',
    list: '/reporters/trashed', restore: (id) => `/reporters/${id}/restore`,
    permanent: (id) => `/reporters/${id}/permanent`, bulk: '/reporters/permanent-bulk', empty: '/reporters/empty-trash',
  },
};

export default function RecycleBin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const dialog = useDialog();
  const [tab, setTab] = useState<Tab>('tasks');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchTrashed = () => {
    setLoading(true);
    api.get(ENTITY[tab].list)
      .then((res) => setItems(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast('Failed to load recycle bin', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTrashed(); }, [tab]);

  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(items.map((t) => t.id));
      return new Set([...prev].filter((id) => valid.has(id)));
    });
  }, [items]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((t) => t.id))));
  };

  const handleRestore = async (id: number) => {
    setActionId(id);
    try {
      await api.post(ENTITY[tab].restore(id));
      toast(`${ENTITY[tab].singular} restored`, 'success');
      setItems(items.filter((t) => t.id !== id));
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to restore', 'error');
    } finally { setActionId(null); }
  };

  const handlePermanentDelete = async (id: number) => {
    if (!(await dialog.confirm({ title: 'Delete permanently', message: `Permanently delete this ${ENTITY[tab].singular}? This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    setActionId(id);
    try {
      await api.delete(ENTITY[tab].permanent(id));
      toast(`${ENTITY[tab].singular} permanently deleted`, 'success');
      setItems(items.filter((t) => t.id !== id));
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to delete', 'error');
    } finally { setActionId(null); }
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!(await dialog.confirm({ title: 'Delete selected items', message: `Permanently delete ${ids.length} selected ${ENTITY[tab].plural}? This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    setBulkBusy(true);
    try {
      await api.post(ENTITY[tab].bulk, { ids });
      toast(`${ids.length} ${ENTITY[tab].plural} permanently deleted`, 'success');
      setItems(items.filter((t) => !selected.has(t.id)));
      setSelected(new Set());
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to delete selected items', 'error');
    } finally { setBulkBusy(false); }
  };

  const handleEmptyAll = async () => {
    if (!(await dialog.confirm({ title: 'Empty recycle bin', message: `Permanently delete all ${items.length} trashed ${ENTITY[tab].plural}? This cannot be undone.`, danger: true, confirmLabel: 'Empty Bin' }))) return;
    setBulkBusy(true);
    try {
      await api.post(ENTITY[tab].empty);
      toast('Recycle bin emptied', 'success');
      setItems([]);
      setSelected(new Set());
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to empty recycle bin', 'error');
    } finally { setBulkBusy(false); }
  };

  const canDelete = (user?.access_level || 3) <= 2;
  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Recycle Bin</h1>
          <p className="text-sm text-surface-400 mt-0.5">Restore or permanently delete trashed items</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['tasks', 'programs', 'ads', 'locations', 'reporters'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t
              ? 'bg-accent-600 text-white'
              : 'bg-surface-50 border border-surface-200 text-surface-500 hover:text-surface-700'}`}>
            {t === 'tasks' ? 'Tasks' : t === 'programs' ? 'Programs' : t === 'ads' ? 'Ads' : t === 'locations' ? 'Locations' : 'Reporters'}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : items.length === 0 ? (
        <div className="flat-card-static text-center py-12">
          {tab === 'tasks' ? <Trash2 className="w-10 h-10 text-surface-300 mx-auto mb-3" /> : <Radio className="w-10 h-10 text-surface-300 mx-auto mb-3" />}
          <p className="text-surface-400">No trashed {ENTITY[tab].plural}</p>
        </div>
      ) : (
        <>
          {canDelete && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => toggleSelectAll()} className="flat-btn-surface text-xs inline-flex items-center gap-1.5">
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${allSelected ? 'bg-accent-500 border-accent-500' : 'border-surface-300'}`}>
                  {allSelected && <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>}
                </span>
                Select All ({items.length})
              </button>
              {selected.size > 0 && (
                <button onClick={handleBulkDelete} disabled={bulkBusy}
                  className="flat-btn-danger text-xs inline-flex items-center gap-1.5">
                  {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete Selected ({selected.size})
                </button>
              )}
              <button onClick={handleEmptyAll} disabled={bulkBusy}
                className="flat-btn-danger text-xs inline-flex items-center gap-1.5">
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                Empty All
              </button>
            </div>
          )}
        <div className="flat-card-static overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  {canDelete && (
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 accent-accent-600 cursor-pointer" />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">{tab === 'tasks' ? 'Priority' : 'Type'}</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Assigned To</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-500">Trashed</th>
                  <th className="text-right px-4 py-3 font-medium text-surface-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className={`border-b border-surface-100 hover:bg-surface-50 transition-colors ${selected.has(t.id) ? 'bg-accent-50/40' : ''}`}>
                    {canDelete && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                          className="w-4 h-4 accent-accent-600 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {tab === 'tasks' ? (
                        <Link to={`/dashboard/tasks/${t.id}`} className="font-medium text-accent-600 hover:underline">
                          {t.title}
                        </Link>
                      ) : tab === 'programs' ? (
                        <Link to="/dashboard/programs" className="font-medium text-accent-600 hover:underline">
                          {t.title}
                        </Link>
                      ) : tab === 'ads' ? (
                        <Link to="/dashboard/ads" className="font-medium text-accent-600 hover:underline">
                          {t.title}
                        </Link>
                      ) : (
                        <Link to="/dashboard/reporters" className="font-medium text-accent-600 hover:underline">
                          {t.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flat-badge text-xs border bg-surface-50 text-surface-600 border-surface-200">
                        {formatLabel(t.priority || t.program_type || t.ad_type || t.region || '—')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-600">{t.assigned_to_name || t.created_by_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-surface-400">{(t.deleted_at || t.updated_at)?.slice(0, 10) || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleRestore(t.id)} disabled={actionId === t.id}
                          className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors" title="Restore">
                          {actionId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                        {canDelete && (
                          <button onClick={() => handlePermanentDelete(t.id)} disabled={actionId === t.id}
                            className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors" title="Permanently Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
