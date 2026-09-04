import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getRoleLabel } from '../utils/roles';
import { getAppName, onAppNameChange, onChannelDisplayChange, getChannelDisplayName, setChannelDisplayCache } from '../utils/appConfig';
import NotificationBell from './NotificationBell';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import {
  LayoutDashboard, ListTodo, Newspaper, TrendingUp,
  Users, Megaphone, Radio, LogOut, Menu, X, ChevronDown, User, Settings,
  Sun, Moon, BookOpen, FileText, Activity, CalendarClock, Loader2, Archive, Trash2, DatabaseBackup, Code, FolderArchive,
  Timer, RefreshCw, ScrollText,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  minLevel: number;
  countKey: string | null;
  devOnly?: boolean;
  showFor?: (user: { access_level: number; role: string }) => boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, minLevel: 3, countKey: null },
  { label: 'Published', path: '/dashboard/published', icon: Archive, minLevel: 3, countKey: null },
  { label: 'Tasks', path: '/dashboard/tasks', icon: ListTodo, minLevel: 3, countKey: 'pending_approval_tasks' },
  { label: 'Bulletins', path: '/dashboard/bulletins', icon: Newspaper, minLevel: 3, countKey: 'bulletin_updates' },
  { label: 'Stories', path: '/dashboard/stories', icon: FileText, minLevel: 3, countKey: null },
  { label: 'Programs', path: '/dashboard/programs', icon: Radio, minLevel: 3, countKey: null },
  { label: 'Ads', path: '/dashboard/ads', icon: Megaphone, minLevel: 3, countKey: null },
  { label: 'Analytics', path: '/dashboard/analytics', icon: TrendingUp, minLevel: 3, countKey: null },
  { label: 'Reporters', path: '/dashboard/reporters', icon: BookOpen, minLevel: 3, countKey: null },
  { label: 'Archive', path: '/dashboard/archives', icon: FolderArchive, minLevel: 3, countKey: null },
  { label: 'Teleprompter', path: '/teleprompter', icon: ScrollText, minLevel: 3, countKey: null,
    showFor: (u) => u.access_level === 1 || u.role === 'video_editor' || u.role === 'anchor' },
  { label: 'Users', path: '/dashboard/users', icon: Users, minLevel: 1, countKey: 'users_pending' },
  { label: 'Activity', path: '/dashboard/activity', icon: Activity, minLevel: 2, countKey: null },
  { label: 'Backups', path: '/dashboard/backups', icon: DatabaseBackup, minLevel: 1, devOnly: true, countKey: null },
  { label: 'Recycle Bin', path: '/dashboard/recycle-bin', icon: Trash2, minLevel: 2, countKey: null },
  { label: 'Settings', path: '/dashboard/settings', icon: Settings, minLevel: 1, devOnly: true, countKey: null },
  { label: 'Developer', path: '/dashboard/developer', icon: Code, minLevel: 1, devOnly: true, countKey: null },
];

const dotKeyMap: Record<string, string> = {
  Tasks: 'pending_approval_tasks',
  Bulletins: 'bulletin_updates',
  Stories: 'stories',
  Users: 'users_pending',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', script_writing: 'Write Script', footage_collection: 'Gather Footage',
  waiting_confirmation: 'Confirmation', correction_required: 'Correction Required',
  approved: 'Approved', editor_assigned: 'Editor Assigned', teleprompter_ready: 'Teleprompter', prompting: 'Prompting',
  recording_done: 'Recording Done', editing: 'Editing', uploading: 'Uploading',
  published: 'Published', under_review: 'Under Review', completed: 'Completed', cancelled: 'Cancelled',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [profileHighlightIndex, setProfileHighlightIndex] = useState(-1);
  const profileRef = useRef<HTMLDivElement>(null);

  // Developer auto-redirect timer (moved from Developer page to header)
  const [devTimeLeft, setDevTimeLeft] = useState(180);
  const isDeveloperRoute = location.pathname.includes('/developer');

  const [activityDots, setActivityDots] = useState<Record<string, boolean>>({});
  const activityTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!user || user.access_level > 2) return;
    const fetchCounts = () => {
      api.get('/pending-requests/summary')
        .then((r) => {
          const d = r.data;
          setPendingCounts({
            ...d,
            users_pending: (d.pending_signups || 0) + (d.pending_leaves || 0) + (d.pin_requests || 0),
          });
        })
        .catch(() => {});
    };
    fetchCounts();
    const iv = setInterval(fetchCounts, 30000);
    return () => clearInterval(iv);
  }, [user]);

  // Developer Zone auto-redirect timer
  useEffect(() => {
    if (!isDeveloperRoute) {
      setDevTimeLeft(180);
      return;
    }
    const interval = setInterval(() => {
      setDevTimeLeft((prev) => {
        if (prev <= 1) {
          navigate('/dashboard');
          return 180;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isDeveloperRoute, navigate]);

  const formatDevTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const resetDevTimer = () => setDevTimeLeft(180);

  const { socket } = useSocket();
  const { toast } = useToast();
  const lastReminderRef = useRef<{ due: number; expiring: number } | null>(null);

  useEffect(() => {
    if (!socket || !user) return;

    // Welcome toast on a fresh login (flag set by AuthContext.login / Landing
    // PIN login; consumed here so a plain page refresh doesn't re-toast).
    if (sessionStorage.getItem('welcome_pending') === '1') {
      sessionStorage.removeItem('welcome_pending');
      toast(`Welcome back, ${user.full_name}!`, 'success');
    }

    const dotTimer = (key: string) => {
      setActivityDots((prev) => ({ ...prev, [key]: true }));
      if (activityTimers.current[key]) clearTimeout(activityTimers.current[key]);
      activityTimers.current[key] = setTimeout(() => {
        setActivityDots((prev) => ({ ...prev, [key]: false }));
      }, 15000);
    };

    const isLevel2 = (user.access_level ?? 3) <= 2;

    socket.on('user:login', (data: any) => {
      if (!data || data.profile_id === user.profile_id) return;
      toast(`${data.full_name || 'Someone'} logged in`, 'info');
    });
    socket.on('user:logout', (data: any) => {
      if (!data || data.profile_id === user.profile_id) return;
      toast(`${data.full_name || 'Someone'} logged out`, 'info');
    });
    socket.on('user:signup-pending', (data: any) => {
      dotTimer('users_pending');
      if (!data) return;
      toast(`New signup request: ${data.full_name || 'Someone'} (pending approval)`, 'info');
    });
    socket.on('user:signup-approved', (data: any) => {
      if (!data) return;
      toast(`Signup approved: ${data.full_name || ''}`.trim(), 'success');
    });
    socket.on('user:signup-rejected', (data: any) => {
      if (!data) return;
      toast(`Signup rejected: ${data.full_name || ''}`.trim(), 'error');
    });
    socket.on('user:pin-requested', (data: any) => {
      dotTimer('users_pending');
      if (!data) return;
      toast(`PIN reset requested: ${data.full_name || 'Someone'}`, 'info');
    });
    socket.on('user:changed', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      const name = data.full_name || 'Someone';
      const messages: Record<string, string> = {
        created: `New user created: ${name}`,
        updated: `Profile updated: ${name}`,
        activated: `Profile activated: ${name}`,
        offlined: `${name} taken offline`,
        brought_online: `${name} brought back online`,
        archived: `${name} archived`,
        terminated: `${name} terminated`,
        reactivated: `${name} reactivated`,
        deactivated: `${name} deactivated`,
        restored: `${name} restored`,
        role_updated: `Role updated for ${name}`,
        pin_set: `PIN set for ${name}`,
        pin_removed: `PIN removed for ${name}`,
      };
      const msg = messages[data.action] || `User changed: ${name}`;
      toast(msg, ['terminated', 'deactivated', 'archived'].includes(data.action) ? 'error' : 'info');
    });
    socket.on('slot:changed', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      const name = data.name ? `: ${data.name}` : '';
      const messages: Record<string, string> = {
        assigned: `Bulletin slot assigned${name}`,
        updated: `Bulletin slot updated${name}`,
        skipped: `Bulletin slot skipped${name}`,
        deleted: `Bulletin slot deleted${name}`,
        restored: 'Bulletin slots restored to defaults',
      };
      toast(messages[data.action] || `Bulletin slot changed${name}`, 'info');
    });
    socket.on('tasks:approved-batch', (data: any) => {
      if (!data || data.approved_by === user.profile_id) return;
      const count = Array.isArray(data.task_ids) ? data.task_ids.length : 0;
      toast(`${count} task(s) auto-approved`, 'success');
    });
    socket.on('news:updated', (data: any) => {
      dotTimer('pending_approval_tasks');
      if (!data || data.actor === user.profile_id) return;
      toast(data.has_correction
        ? `Correction flagged on '${data.task_title || 'task'}'`
        : `News item updated: '${data.task_title || 'task'}'`, 'info');
    });
    socket.on('channel:updated', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      toast(`Channel settings updated${data.channel_name ? `: ${data.channel_name}` : ''}`, 'info');
    });
    socket.on('location:changed', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      const name = data.name || '';
      const messages: Record<string, string> = {
        created: `Location added: ${name}`,
        updated: `Location updated: ${name}`,
        trashed: `Location moved to recycle bin: ${name}`,
        restored: `Location restored: ${name}`,
      };
      toast(messages[data.action] || `Location changed: ${name}`, 'info');
    });
    socket.on('reporter:changed', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      const name = data.name || '';
      const messages: Record<string, string> = {
        created: `Reporter added: ${name}`,
        updated: `Reporter updated: ${name}`,
        trashed: `Reporter moved to recycle bin: ${name}`,
        restored: `Reporter restored: ${name}`,
      };
      toast(messages[data.action] || `Reporter changed: ${name}`, 'info');
    });
    socket.on('archive:changed', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      const name = data.name || '';
      const messages: Record<string, string> = {
        created: `Archive item added: ${name}`,
        updated: `Archive item updated: ${name}`,
        stock_updated: `Archive stock updated: ${name}`,
        deleted: `Archive item deleted: ${name}`,
      };
      toast(messages[data.action] || `Archive changed: ${name}`, 'info');
    });

    socket.on('task:created', (data: any) => {
      if (data.assigned_to === user.profile_id || isLevel2) dotTimer('pending_approval_tasks');
      if (data.assigned_to === user.profile_id && data.created_by !== user.profile_id) {
        toast(`New task assigned: ${data.title || 'Task'}`, 'success');
      } else if (data.created_by !== user.profile_id) {
        toast(`New task: ${data.title || 'Task'}`, 'info');
      }
    });
    socket.on('task:updated', (data: any) => {
      if (data.assigned_to === user.profile_id || isLevel2) dotTimer('pending_approval_tasks');
      if (!data.status || data.updated_by === user.profile_id) return;
      const label = TASK_STATUS_LABELS[data.status] || data.status;
      if (data.status === 'completed') {
        toast(`'${data.title || 'Task'}' completed`, 'success');
      } else if (data.assigned_to === user.profile_id) {
        toast(`'${data.title || 'Task'}' is now ${label}`, 'info');
      } else {
        toast(`${data.updated_by_name || 'Someone'} updated '${data.title || 'task'}': ${label}`, 'info');
      }
    });
    socket.on('task:deleted', (data: any) => {
      dotTimer('pending_approval_tasks');
      if (!data || data.actor === user.profile_id) return;
      toast(data.bulk ? `${data.count} task(s) deleted` : `Task deleted: ${data.title || 'Task'}`, 'info');
    });
    socket.on('task:deadline-extended', (data: any) => {
      dotTimer('pending_approval_tasks');
      if (data.updated_by !== user.profile_id) {
        toast(`Deadline extended for '${data.title || 'task'}'`, 'info');
      }
    });
    socket.on('task:auto-approved', (data: any) => {
      dotTimer('pending_approval_tasks');
      if (!data || data.actor === user.profile_id) return;
      toast(`'${data.title || 'Task'}' auto-approved`, 'success');
    });

    socket.on('bulletin:created', (data: any) => {
      dotTimer('bulletin_updates');
      if (!data || data.actor === user.profile_id) return;
      toast(`Bulletin created: ${data.title || '#' + data.id}`, 'success');
    });
    socket.on('bulletin:updated', (data: any) => {
      dotTimer('bulletin_updates');
      if (!data || data.actor === user.profile_id) return;
      toast('Bulletin updated', 'info');
    });
    socket.on('bulletin:deleted', (data: any) => {
      dotTimer('bulletin_updates');
      if (!data || data.actor === user.profile_id) return;
      toast(`Bulletin deleted: ${data.title || ''}`.trim(), 'info');
    });

    socket.on('story:created', (data: any) => {
      dotTimer('stories');
      if (!data || data.actor === user.profile_id) return;
      toast(`New story: ${data.title || 'Story'}`, 'success');
    });
    socket.on('story:updated', (data: any) => {
      dotTimer('stories');
      if (!data || data.actor === user.profile_id) return;
      toast(`Story updated: ${data.title || ''}`.trim(), 'info');
    });
    socket.on('story:deleted', (data: any) => {
      dotTimer('stories');
      if (!data || data.actor === user.profile_id) return;
      toast(`Story deleted: ${data.title || ''}`.trim(), 'info');
    });

    socket.on('program:created', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      toast(`New program: ${data.title || ''}`, 'success');
    });
    socket.on('program:updated', (data: any) => {
      if (!data || data.updated_by === user.profile_id) return;
      toast(`${data.updated_by_name || 'Someone'} updated program: ${data.title || ''}${data.status ? ` (${data.status})` : ''}`, 'info');
    });
    socket.on('program:deleted', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      toast(data.bulk ? `${data.count} program(s) deleted` : `Program deleted: ${data.title || ''}`, 'info');
    });

    socket.on('ad:updated', (data: any) => {
      if (!data || data.updated_by === user.profile_id) return;
      toast(`${data.updated_by_name || 'Someone'} updated ad: ${data.title || ''}${data.status ? ` (${data.status})` : ''}`, 'info');
    });
    socket.on('ad:deleted', (data: any) => {
      if (!data || data.actor === user.profile_id) return;
      toast(data.bulk ? `${data.count} ad(s) deleted` : `Ad deleted: ${data.title || ''}`, 'info');
    });

    socket.on('leave:created', (data: any) => {
      if (!data) return;
      if (data.profile_id === user.profile_id || isLevel2) dotTimer('users_pending');
      if (isLevel2 && data.profile_id !== user.profile_id) {
        toast(`New leave request from ${data.profile_name || 'staff'}`, 'info');
      }
    });
    socket.on('leave:updated', (data: any) => {
      if (!data) return;
      if (isLevel2) dotTimer('users_pending');
      if (data.profile_id === user.profile_id) {
        toast(`Your leave request was ${data.status || 'updated'}`, data.status === 'approved' ? 'success' : data.status === 'rejected' ? 'error' : 'info');
      } else {
        toast(`Leave ${data.status || 'updated'}: ${data.profile_name || 'staff'}`, 'info');
      }
    });

    return () => {
      socket.off('user:login');
      socket.off('user:logout');
      socket.off('user:signup-pending');
      socket.off('user:signup-approved');
      socket.off('user:signup-rejected');
      socket.off('user:pin-requested');
      socket.off('user:changed');
      socket.off('slot:changed');
      socket.off('tasks:approved-batch');
      socket.off('news:updated');
      socket.off('channel:updated');
      socket.off('location:changed');
      socket.off('reporter:changed');
      socket.off('archive:changed');
      socket.off('task:created');
      socket.off('task:updated');
      socket.off('task:deleted');
      socket.off('task:deadline-extended');
      socket.off('task:auto-approved');
      socket.off('bulletin:created');
      socket.off('bulletin:updated');
      socket.off('bulletin:deleted');
      socket.off('story:created');
      socket.off('story:updated');
      socket.off('story:deleted');
      socket.off('leave:created');
      socket.off('leave:updated');
      socket.off('program:created');
      socket.off('program:updated');
      socket.off('program:deleted');
      socket.off('ad:updated');
      socket.off('ad:deleted');
    };
  }, [socket, user]);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/dashboard/tasks')) setActivityDots((p) => ({ ...p, pending_approval_tasks: false }));
    if (path.startsWith('/dashboard/bulletins')) setActivityDots((p) => ({ ...p, bulletin_updates: false }));
    if (path.startsWith('/dashboard/stories')) setActivityDots((p) => ({ ...p, stories: false }));
    if (path.startsWith('/dashboard/users')) setActivityDots((p) => ({ ...p, users_pending: false }));
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await api.get('/analytics/reminders');
        const due = (r.data?.dueToday || []).length;
        const expiring = (r.data?.expiringSoon || []).length;
        if (cancelled) return;
        const prev = lastReminderRef.current;
        if (!prev) {
          if (due > 0) toast(`Reminder: ${due} task${due === 1 ? '' : 's'} due today`, 'info');
          if (expiring > 0) toast(`Reminder: ${expiring} task${expiring === 1 ? '' : 's'} expiring within 2 hours`, 'info');
        } else {
          if (due > prev.due) toast(`Reminder: ${due - prev.due} new task${due - prev.due === 1 ? '' : 's'} due today`, 'info');
          if (expiring > prev.expiring) toast(`Reminder: ${expiring - prev.expiring} new task${expiring - prev.expiring === 1 ? '' : 's'} expiring soon`, 'info');
        }
        lastReminderRef.current = { due, expiring };
      } catch {}
    };
    const t = setTimeout(check, 4000);
    const iv = setInterval(check, 600000);
    return () => { cancelled = true; clearTimeout(t); clearInterval(iv); };
  }, [user]);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [appName, setAppNameState] = useState(getAppName());
  const [channelDisplay, setChannelDisplay] = useState(getChannelDisplayName());

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    return onAppNameChange((name) => setAppNameState(name));
  }, []);

  useEffect(() => {
    api.get('/channel-metadata').then((res) => {
      const m = res.data || {};
      const name = m.channel_display_name || '';
      setChannelDisplay(name);
      setChannelDisplayCache(name);
    }).catch(() => {});
    return onChannelDisplayChange((name) => setChannelDisplay(name));
  }, []);

  const [leaveForm, setLeaveForm] = useState({ reason: '', start_date: '', end_date: '', arrangement_profile_id: '' });
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [savingLeave, setSavingLeave] = useState(false);
  const [sameRoleProfiles, setSameRoleProfiles] = useState<any[]>([]);

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.reason || !leaveForm.start_date || !leaveForm.end_date) {
      toast('All fields are required', 'error'); return;
    }
    if (new Date(leaveForm.end_date) < new Date(leaveForm.start_date)) {
      toast('End date must be after start date', 'error'); return;
    }
    setSavingLeave(true);
    try {
      await api.post('/leaves', { ...leaveForm, arrangement_profile_id: leaveForm.arrangement_profile_id || undefined });
      toast('Leave request submitted', 'success');
      setShowLeaveModal(false);
      setLeaveForm({ reason: '', start_date: '', end_date: '', arrangement_profile_id: '' });
    } catch (err: any) {
      toast(err.response?.data?.error || 'Failed to submit leave', 'error');
    } finally { setSavingLeave(false); }
  };

  useEffect(() => {
    if (showLeaveModal && user?.role) {
      api.get(`/users/available?role=${user.role}`).then((res) => {
        setSameRoleProfiles((res.data || []).filter((p: any) => p.profile_id !== user.profile_id));
      }).catch(() => {});
    }
  }, [showLeaveModal, user?.role, user?.profile_id]);

  const handleLogout = () => {
    toast('Logged out successfully', 'info');
    api.post('/auth/logout').catch(() => {});
    logout();
    navigate('/');
  };

   const filteredNav = navItems.filter(
     (item) => !user || (item.devOnly
       ? !!(user.is_dev || user.access_level <= 1)
       : item.showFor ? item.showFor(user) : user.access_level <= item.minLevel)
   );

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        sidebar-bar fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-30 w-64 bg-white border-r border-surface-200
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-surface-200 shrink-0">
          <img src="/logo.svg" alt={appName} className="logo-light h-10 w-auto" />
          <img src="/logo-dark.svg" alt={appName} className="logo-dark h-10 w-auto" />
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden ml-auto p-1 rounded hover:bg-surface-100">
            <X className="w-5 h-5 text-surface-400" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredNav.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-accent-50 text-accent-700'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-800'
                }`}
              >
                <span className="relative inline-flex">
                  <item.icon className={`w-5 h-5 ${item.label === 'Bulletins' ? 'icon-pulse' : item.label === 'Programs' ? 'icon-live' : ''}`} />
                  {activityDots[dotKeyMap[item.label] || ''] && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-danger-500 rounded-full animate-ping" />
                  )}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.countKey && pendingCounts[item.countKey] > 0 && (
                  <span className="bg-danger-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                    {pendingCounts[item.countKey] > 9 ? '9+' : pendingCounts[item.countKey]}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0 lg:min-h-screen">
        <header className="header-bar h-16 bg-white/80 backdrop-blur-sm border-b border-surface-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
          <button onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="lg:hidden p-2 rounded-xl text-surface-500 hover:bg-surface-100">
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden lg:flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-accent-500 icon-live" />
            <span className="text-sm font-medium text-surface-800 dark:text-white">{channelDisplay || appName}</span>
            <span className="text-surface-300 dark:text-surface-600">|</span>
            <span className="text-surface-500 dark:text-surface-400">{getRoleLabel(user?.role || '')}</span>
            <span className="inline-flex items-center gap-1.5 ml-1 px-1.5 py-0.5 rounded-md bg-warning-500/15 text-warning-600 dark:text-warning-400 text-[10px] font-bold uppercase tracking-wide border border-warning-500/25">
              Beta &middot; Testing
            </span>
          </div>

           <div className="relative ml-auto flex items-center gap-1">
             {isDeveloperRoute && (
               <div className="flex items-center gap-2 text-xs text-surface-500 mr-2">
                 <span className={`flex items-center gap-1 ${devTimeLeft < 30 ? 'text-danger-600 animate-pulse' : ''}`}>
                   <Timer className="w-3.5 h-3.5" />
                   Auto-redirect in {formatDevTime(devTimeLeft)}
                 </span>
                 <button onClick={resetDevTimer} className="text-accent-600 hover:text-accent-700 flex items-center gap-1">
                   <RefreshCw className="w-3 h-3" /> Reset
                 </button>
                 <button onClick={() => navigate('/dashboard')} className="text-surface-400 hover:text-surface-600">
                   Exit
                 </button>
               </div>
             )}
             <button onClick={() => setDarkMode(!darkMode)}
               aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
               aria-pressed={darkMode}
               className="p-2 rounded-xl text-surface-500 hover:bg-surface-100 transition-colors"
               title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
               {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>
             <NotificationBell />
            <button onClick={() => { setProfileOpen(!profileOpen); setProfileHighlightIndex(-1); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (!profileOpen) { setProfileOpen(true); setProfileHighlightIndex(0); return; }
                  const count = 2 + (user?.access_level === 1 ? 1 : 0);
                  setProfileHighlightIndex((prev) => {
                    if (prev < 0) return 0;
                    if (e.key === 'ArrowDown') return (prev + 1) % count;
                    return (prev > 0 ? prev - 1 : count - 1);
                  });
                }
                if (e.key === 'Escape' && profileOpen) { setProfileOpen(false); }
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-100 transition-colors"
              aria-haspopup="menu" aria-expanded={profileOpen}>
              <div className="w-8 h-8 bg-accent-100 rounded-xl flex items-center justify-center">
                <span className="text-sm font-semibold text-accent-700">
                  {user?.full_name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-surface-800 leading-tight">{user?.full_name}</p>
                <p className="text-[11px] text-surface-400 leading-tight">{getRoleLabel(user?.role || '')}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-surface-400" />
            </button>

            {profileOpen && (
                <div ref={profileRef} className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-2xl border border-surface-200 shadow-lg z-50 py-1.5">
                  <Link to="/dashboard/profile" onClick={() => setProfileOpen(false)}
                    onMouseEnter={() => setProfileHighlightIndex(0)}
                    className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors ${profileHighlightIndex === 0 ? 'bg-accent-50 text-accent-700' : 'text-surface-700 hover:bg-surface-50'}`}>
                    <User className="w-4 h-4 text-surface-400" /> Profile
                  </Link>
                  <button onClick={() => { setProfileOpen(false); setShowLeaveModal(true); }}
                    onMouseEnter={() => setProfileHighlightIndex(-1)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50 transition-colors">
                    <CalendarClock className="w-4 h-4 text-surface-400" /> Request Leave
                  </button>
                   { (user?.is_dev === true || (user?.access_level ?? 999) <= 1) && (
                     <Link to="/dashboard/settings" onClick={() => setProfileOpen(false)}
                       onMouseEnter={() => setProfileHighlightIndex(1)}
                       className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors ${profileHighlightIndex === 1 ? 'bg-accent-50 text-accent-700' : 'text-surface-700 hover:bg-surface-50'}`}>
                       <Settings className="w-4 h-4 text-surface-400" /> Settings
                     </Link>
                   )}
                  <div className="mx-3 my-1 border-t border-surface-100" />
                  <button onClick={handleLogout}
                     onMouseEnter={() => setProfileHighlightIndex((user?.is_dev === true || (user?.access_level ?? 999) <= 1) ? 2 : 1)}
                     className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors ${profileHighlightIndex === ((user?.is_dev === true || (user?.access_level ?? 999) <= 1) ? 2 : 1) ? 'bg-danger-50 text-danger-700' : 'text-danger-600 hover:bg-danger-50'}`}>
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>

        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-surface-200 flex items-center justify-around px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] overflow-x-auto">
          {filteredNav.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link key={item.path} to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 relative ${
                  active ? 'text-accent-600' : 'text-surface-400 hover:text-surface-600'
                }`}>
                <item.icon className={`w-5 h-5 ${item.label === 'Bulletins' ? 'icon-pulse' : item.label === 'Programs' ? 'icon-live' : ''}`} />
                <span>{item.label}</span>
                {item.countKey && pendingCounts[item.countKey] > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-danger-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                    {pendingCounts[item.countKey] > 9 ? '9+' : pendingCounts[item.countKey]}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => { if (!savingLeave) setShowLeaveModal(false); }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center">
                <CalendarClock className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Request Leave</h3>
                <p className="text-xs text-surface-400">Submit a leave request for admin approval</p>
              </div>
            </div>
            <form onSubmit={handleLeaveSubmit} className="space-y-3">
              <div>
                <label className="flat-label">Reason *</label>
                <textarea className="flat-input" rows={2} placeholder="e.g. Sick leave, personal work..."
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="flat-label">Start Date *</label>
                  <input type="date" className="flat-input" value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">End Date *</label>
                  <input type="date" className="flat-input" value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="flat-label">Arrangement (cover)</label>
                <select className="flat-select" value={leaveForm.arrangement_profile_id}
                  onChange={(e) => setLeaveForm({ ...leaveForm, arrangement_profile_id: e.target.value })}>
                  <option value="">No arrangement</option>
                  {sameRoleProfiles.map((p: any) => (
                    <option key={p.profile_id} value={p.profile_id}>{p.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowLeaveModal(false)} disabled={savingLeave}
                  className="flat-btn-surface text-xs">Cancel</button>
                <button type="submit" disabled={savingLeave}
                  className="flat-btn-accent text-xs">
                  {savingLeave ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />}
                  {savingLeave ? 'Submitting...' : 'Submit Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
