import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { WifiOff, X } from 'lucide-react';

export default function OfflineBanner() {
  const { socket } = useSocket();
  const { toast } = useToast();
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState(0);
  const lastReloadAt = useRef(0);

  const fetchStatus = useCallback(() => {
    api.get('/sync/status')
      .then((r) => { setOffline(!r.data.online); setQueue(r.data.queuePending || 0); })
      .catch(() => { /* unauthenticated or unreachable — never assume offline from a failed request */ });
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => fetchStatus();
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    const onStatus = (s: any) => { setOffline(!s.online); setQueue(s.queuePending || 0); };
    const onSynced = (r: any) => {
      setOffline(false);
      setQueue(0);
      // Only reload when data was actually synced — never on failure-only events,
      // and never more than once per 10s (avoids reload loops from repeated sync events).
      if (!r || !(r.synced > 0)) return;
      if (Date.now() - lastReloadAt.current < 10000) return;
      lastReloadAt.current = Date.now();
      toast(`Back online — ${r.synced} change${r.synced === 1 ? '' : 's'} synced`, 'success');
      window.location.reload();
    };
    socket.on('connect', onConnect);
    socket.on('db:offline', onOffline);
    socket.on('db:online', onOnline);
    socket.on('db:status', onStatus);
    socket.on('db:synced', onSynced);
    return () => {
      socket.off('connect', onConnect);
      socket.off('db:offline', onOffline);
      socket.off('db:online', onOnline);
      socket.off('db:status', onStatus);
      socket.off('db:synced', onSynced);
    };
  }, [socket, toast, fetchStatus]);

  if (!offline) return null;

  return (
    <div role="status" className="fixed bottom-14 lg:bottom-0 inset-x-0 z-50 bg-amber-500 text-white text-xs sm:text-sm px-3 py-2 flex items-center gap-2 text-center shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        OFFLINE MODE — running on the local database. Changes are saved and will sync automatically when the internet returns.
        {queue > 0 && ` ${queue} change${queue === 1 ? '' : 's'} queued.`}
      </span>
      <button onClick={() => setOffline(false)} aria-label="Dismiss offline banner" className="p-1.5 rounded-lg hover:bg-white/20 shrink-0 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
