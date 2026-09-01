import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { timeAgo } from '../utils/dates';

interface Notification {
  id: number;
  user_id: number;
  from_user_id: number | null;
  type: string;
  entity_type: string | null;
  entity_id: number | null;
  title: string;
  message: string | null;
  is_read: number;
  created_at: string;
  from_name: string | null;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; list: Notification[] }>({ unread: 0, list: [] });
  const [loading, setLoading] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();
  const { user } = useAuth();
  const { toast } = useToast();

  const fetch = () => {
    setLoading(true);
    api.get('/notifications').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); const iv = setInterval(fetch, 30000); return () => clearInterval(iv); }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (data: any) => {
      fetch();
      if (data?.user_id === user?.profile_id) toast('You have a new notification', 'info');
    };
    socket.on('notification:new', handler);
    return () => { socket.off('notification:new', handler); };
  }, [socket]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id: number) => {
    await api.post(`/notifications/read/${id}`);
    setData(prev => ({
      unread: prev.unread - 1,
      list: prev.list.map(n => n.id === id ? { ...n, is_read: 1 } : n),
    }));
  };

  const markAllRead = async () => {
    await api.post('/notifications/read-all');
    setData(prev => ({ unread: 0, list: prev.list.map(n => ({ ...n, is_read: 1 })) }));
  };

  const entityLink = (n: Notification) => {
    if (n.entity_type === 'tasks') return `/dashboard/tasks/${n.entity_id}`;
    if (n.entity_type === 'leaves') return '/dashboard/profile';
    if (n.entity_type === 'profiles') return '/dashboard/users';
    return '#';
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen(!open); setHighlightIndex(-1); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) { setOpen(true); setHighlightIndex(0); return; }
            const count = data.list.length;
            setHighlightIndex((prev) => {
              if (prev < 0) return 0;
              if (e.key === 'ArrowDown') return (prev + 1) % count;
              return (prev > 0 ? prev - 1 : count - 1);
            });
          }
          if (e.key === 'Escape' && open) { setOpen(false); }
        }}
        className="relative p-2 rounded-xl hover:bg-surface-100 transition-colors"
        aria-label="Notifications" aria-expanded={open}>
        <Bell className="w-5 h-5 text-surface-500" />
        {data.unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-danger-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] sm:w-96 bg-white rounded-2xl border border-surface-200 shadow-lg z-[60] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
              <h3 className="text-sm font-semibold text-surface-800">Notifications</h3>
              {data.unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && data.list.length === 0 ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-surface-400 animate-spin" /></div>
              ) : data.list.length === 0 ? (
                <p className="text-sm text-surface-400 py-8 text-center">No notifications yet.</p>
              ) : (
                data.list.map((n, i) => (
                  <Link key={n.id} to={entityLink(n)} onClick={() => { if (!n.is_read) markRead(n.id); setOpen(false); }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={`block px-4 py-3 border-b border-surface-50 transition-colors ${!n.is_read ? 'bg-accent-50/40' : ''} ${highlightIndex === i ? 'bg-surface-100' : 'hover:bg-surface-50'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${!n.is_read ? 'bg-accent-100' : 'bg-surface-100'}`}>
                        <span className="text-[10px] font-bold text-surface-500">{n.from_name?.charAt(0) || '?'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.is_read ? 'font-semibold text-surface-800' : 'text-surface-600'}`}>{n.title}</p>
                        {n.message && n.message !== n.title && (
                          <p className="text-[11px] text-surface-400 mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                        <p className="text-[10px] text-surface-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.is_read && <div className="w-2 h-2 rounded-full bg-accent-500 mt-2 flex-shrink-0" />}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


