import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const SOCKET_URL = window.location.origin;

export interface OnlineUser {
  profile_id: number;
  full_name: string;
  access_level: number;
  role: string;
  status: 'online' | 'in_task' | 'logging_in';
}

export interface LoginApprovalRequest {
  profile_id: number;
  full_name: string;
}

export interface AutoApproveCountdown {
  task_id: number;
  seconds: number;
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: OnlineUser[];
  loginApprovalRequest: LoginApprovalRequest | null;
  loginApproved: { request_profile_id: number; approved_by: number } | null;
  loginRejected: { request_profile_id: number } | null;
  pendingApprovalTasks: any[];
  autoApproveCountdown: AutoApproveCountdown | null;
  taskApproved: { task_id: number; approved_by: number } | null;
  urgentPendingTasks: any[];
  clearLoginApproval: () => void;
  clearTaskEvents: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null, connected: false, onlineUsers: [],
  loginApprovalRequest: null, loginApproved: null, loginRejected: null,
  pendingApprovalTasks: [], autoApproveCountdown: null,
  taskApproved: null, urgentPendingTasks: [],
  clearLoginApproval: () => {}, clearTaskEvents: () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [loginApprovalRequest, setLoginApprovalRequest] = useState<LoginApprovalRequest | null>(null);
  const [loginApproved, setLoginApproved] = useState<{ request_profile_id: number; approved_by: number } | null>(null);
  const [loginRejected, setLoginRejected] = useState<{ request_profile_id: number } | null>(null);
  const [pendingApprovalTasks, setPendingApprovalTasks] = useState<any[]>([]);
  const [autoApproveCountdown, setAutoApproveCountdown] = useState<AutoApproveCountdown | null>(null);
  const [taskApproved, setTaskApproved] = useState<{ task_id: number; approved_by: number } | null>(null);
  const [urgentPendingTasks, setUrgentPendingTasks] = useState<any[]>([]);
  const loginApprovalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    const s = io(SOCKET_URL, { auth: { token } });

    s.on('connect', () => {
      setConnected(true);
      // Level-3 quick-login notification (authenticated server-side by the JWT)
      if (user.access_level === 3 && localStorage.getItem('login_request_pending') === '1') {
        localStorage.removeItem('login_request_pending');
        s.emit('login:request', { profile_id: user.profile_id, full_name: user.full_name });
      }
    });
    s.on('disconnect', () => setConnected(false));

    s.on('users:online', (users: OnlineUser[]) => setOnlineUsers(users));

    s.on('login:approval-request', (data: LoginApprovalRequest) => {
      // Any manager/admin (level <= 2) may approve — the server socket gate
      // matches (socket.ts login:approve). Previously this required a level-2
      // video_editor, which the default role config never produces.
      if (user.access_level <= 2) {
        setLoginApprovalRequest(data);
        toast(`${data.full_name} is requesting login approval`, 'info');
        if (loginApprovalTimeoutRef.current) clearTimeout(loginApprovalTimeoutRef.current);
        loginApprovalTimeoutRef.current = setTimeout(() => setLoginApprovalRequest(null), 30000);
      }
    });

    s.on('login:approved', (data: { request_profile_id: number; approved_by: number }) => {
      setLoginApproved(data);
      setTimeout(() => setLoginApproved(null), 5000);
    });

    s.on('login:rejected', (data: { request_profile_id: number }) => {
      setLoginRejected(data);
      setTimeout(() => setLoginRejected(null), 5000);
    });

    s.on('tasks:pending-approval', (data: { tasks: any[] }) => {
      setPendingApprovalTasks(data.tasks || []);
    });

    s.on('task:auto-approve-countdown', (data: AutoApproveCountdown) => {
      setAutoApproveCountdown(data);
      setTimeout(() => setAutoApproveCountdown(null), 65000);
    });

    s.on('task:approved', (data: { task_id: number; approved_by: number }) => {
      setTaskApproved(data);
      setTimeout(() => setTaskApproved(null), 5000);
    });

    s.on('tasks:urgent-pending', (data: { tasks: any[] }) => {
      setUrgentPendingTasks(data.tasks || []);
    });

    s.on('force:logout', (data: { profile_id: number; reason: string }) => {
      toast(data.reason || 'You have been signed out by an administrator.', 'error');
      logout();
      navigate('/login');
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, [user?.profile_id]);

  const clearLoginApproval = useCallback(() => setLoginApprovalRequest(null), []);
  const clearTaskEvents = useCallback(() => {
    setPendingApprovalTasks([]);
    setAutoApproveCountdown(null);
    setUrgentPendingTasks([]);
  }, []);

  return (
    <SocketContext.Provider value={{
      socket, connected, onlineUsers,
      loginApprovalRequest, loginApproved, loginRejected,
      pendingApprovalTasks, autoApproveCountdown, taskApproved, urgentPendingTasks,
      clearLoginApproval, clearTaskEvents,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
