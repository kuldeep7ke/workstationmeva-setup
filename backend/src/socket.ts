import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prepare, mirrorRun } from './database/schema';
import { getJwtSecret } from './middleware/auth';

let io: Server | null = null;

interface OnlineProfile {
  profile_id: number;
  full_name: string;
  access_level: number;
  role: string;
  status: 'online' | 'in_task' | 'logging_in';
}

const onlineProfiles = new Map<number, OnlineProfile>();
const profileSockets = new Map<number, Set<string>>();

async function authenticateSocket(socket: Socket): Promise<OnlineProfile | null> {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    const profile = await prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1').get(decoded.profile_id) as any;
    if (!profile) return null;
    return {
      profile_id: profile.id,
      full_name: profile.full_name,
      access_level: profile.access_level,
      role: profile.role,
      status: 'online',
    };
  } catch {
    return null;
  }
}

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  });

  io.on('connection', async (socket: Socket) => {
    const profile = await authenticateSocket(socket);
    const isGuest = !profile;

    if (isGuest) {
      socket.emit('users:online', Array.from(onlineProfiles.values()));
    } else {
      onlineProfiles.set(profile!.profile_id, profile!);
      if (!profileSockets.has(profile!.profile_id)) profileSockets.set(profile!.profile_id, new Set());
      profileSockets.get(profile!.profile_id)!.add(socket.id);
      io?.emit('users:online', Array.from(onlineProfiles.values()));
    }

    socket.on('status:update', (data: { status: 'online' | 'in_task' | 'logging_in' }) => {
      if (isGuest || !onlineProfiles.has(profile!.profile_id)) return;
      const p = onlineProfiles.get(profile!.profile_id)!;
      p.status = data.status || 'online';
      io?.emit('users:online', Array.from(onlineProfiles.values()));
    });

    // Level 3 requests quick-login approval from higher-ups.
    // Also allowed from guest sockets (landing page, not yet logged in);
    // the claimed profile is validated against the database so a spoofed
    // full_name cannot be broadcast.
    socket.on('login:request', (data: { profile_id: number; full_name: string }) => {
      if (isGuest) {
        if (!data?.profile_id) return;
        // get() is synchronous on the SQLite mirror but async on PostgreSQL —
        // normalize so both modes resolve through the same promise path.
        Promise.resolve(prepare('SELECT id, full_name, access_level FROM profiles WHERE id = ? AND is_active = 1 AND is_archived = 0')
          .get(data.profile_id))
          .then((p: any) => {
            if (p && p.access_level === 3) {
              emitEvent('login:approval-request', { profile_id: p.id, full_name: p.full_name });
            }
          })
          .catch(() => {});
        return;
      }
      if (profile!.access_level !== 3) return;
      emitEvent('login:approval-request', { profile_id: profile!.profile_id, full_name: profile!.full_name });
    });

    // Higher-up approves level 3 quick login (verified server-side)
    socket.on('login:approve', (data: { request_profile_id: number; approved_by: number }) => {
      if (isGuest || profile!.access_level > 2) return;
      io?.emit('login:approved', { request_profile_id: data.request_profile_id, approved_by: profile!.profile_id });
    });

    // Higher-up rejects level 3 quick login
    socket.on('login:reject', (data: { request_profile_id: number }) => {
      if (isGuest || profile!.access_level > 2) return;
      io?.emit('login:rejected', { request_profile_id: data.request_profile_id });
    });

    // Pending tasks requesting auto-approval countdown (higher-ups only)
    socket.on('tasks:pending-approval', (data: { tasks: any[] }) => {
      if (isGuest || profile!.access_level > 2) return;
      io?.emit('tasks:pending-approval', data);
    });

    // Higher-up approves a task (verified server-side)
    socket.on('task:approve', (data: { task_id: number; approved_by: number }) => {
      if (isGuest || profile!.access_level > 2) return;
      io?.emit('task:approved', { task_id: data.task_id, approved_by: profile!.profile_id });
    });

    // Auto-approval countdown tick
    socket.on('task:auto-approve-countdown', (data: { task_id: number; seconds: number }) => {
      if (isGuest) return;
      io?.emit('task:auto-approve-countdown', data);
    });

    // Notify higher-ups of urgent pending tasks when they come online
    socket.on('tasks:urgent-request', (data: { tasks: any[] }) => {
      if (isGuest || profile!.access_level > 2) return;
      io?.emit('tasks:urgent-pending', data);
    });

    socket.on('disconnect', () => {
      if (!isGuest) {
        profileSockets.get(profile!.profile_id)?.delete(socket.id);
        if (profileSockets.get(profile!.profile_id)?.size === 0) {
          profileSockets.delete(profile!.profile_id);
          onlineProfiles.delete(profile!.profile_id);
        }
        io?.emit('users:online', Array.from(onlineProfiles.values()));
      }
    });
  });

  console.log('WebSocket server initialized');
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// Events that produce a toast on some device in the LAN. Presence/sync state
// (users:online, db:*), transient UI state (countdowns, pending lists) and
// per-connection approval responses (login:approved/rejected, task:approved)
// are excluded - the toast history would be noise without these.
const TOASTED_EVENTS = new Set([
  'user:login', 'user:logout',
  'user:signup-pending', 'user:signup-approved', 'user:signup-rejected',
  'user:pin-requested', 'user:changed',
  'slot:changed',
  'tasks:approved-batch',
  'task:created', 'task:updated', 'task:deleted', 'task:deadline-extended', 'task:auto-approved',
  'bulletin:created', 'bulletin:updated', 'bulletin:deleted',
  'story:created', 'story:updated', 'story:deleted',
  'program:created', 'program:updated', 'program:deleted',
  'ad:updated', 'ad:deleted',
  'leave:created', 'leave:updated',
  'news:updated', 'channel:updated',
  'location:changed', 'reporter:changed', 'archive:changed',
  'notification:new',
  'login:approval-request', 'force:logout', 'db:synced',
]);

const TOAST_LOG_LIMIT = 500;

function logToastEvent(event: string, data: any) {
  if (!TOASTED_EVENTS.has(event)) return;
  try {
    const r: any = mirrorRun(
      'INSERT INTO toast_logs (event_name, payload) VALUES (?,?)',
      [event, JSON.stringify(data || {})]
    );
    if (r && typeof r.catch === 'function') r.catch(() => {});
    mirrorRun('DELETE FROM toast_logs WHERE id NOT IN (SELECT id FROM toast_logs ORDER BY id DESC LIMIT ?)', [TOAST_LOG_LIMIT]);
  } catch {}
}

export function emitEvent(event: string, data: any) {
  if (io) io.emit(event, data);
  logToastEvent(event, data);
}

export function getOnlineProfiles(): OnlineProfile[] {
  return Array.from(onlineProfiles.values());
}

export function forceLogout(profileId: number, reason: string) {
  const sockets = profileSockets.get(profileId);
  if (sockets && sockets.size > 0) {
    io?.to(Array.from(sockets)).emit('force:logout', { profile_id: profileId, reason });
    logToastEvent('force:logout', { profile_id: profileId, reason });
    setTimeout(() => {
      profileSockets.get(profileId)?.forEach((sid) => {
        io?.sockets.sockets.get(sid)?.disconnect(true);
      });
    }, 500);
  }
  onlineProfiles.delete(profileId);
}

export function isHigherLevelOnline(): boolean {
  for (const p of onlineProfiles.values()) {
    if (p.access_level <= 2) return true;
  }
  return false;
}
