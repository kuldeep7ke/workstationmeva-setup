import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../utils/api';
import { addSessionHistory } from '../utils/quickLogin';

interface User {
  id: number;
  username: string;
  profile_id: number;
  full_name: string;
  access_level: number;
  email: string;
  role: string;
  is_dev?: boolean;
  dev_default_password?: boolean;
  dev_username?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isNewUser: boolean;
  login: (email: string, password: string) => Promise<any>;
  signup: (data: { username: string; email: string; full_name: string; password: string }) => Promise<any>;
  logout: () => void;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionStart] = useState(() => Date.now());

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then((res) => {
          setUser(res.data);
          setIsNewUser(false);
        })
        .catch(() => { localStorage.removeItem('token'); setToken(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (loginId: string, password: string) => {
    const res = await api.post('/auth/login', { loginId, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    sessionStorage.setItem('welcome_pending', '1');
    setToken(res.data.token);
    setUser(res.data.user);
    setIsNewUser(res.data.isNewUser);
    return res.data;
  };

  const signup = async (data: { username: string; email: string; full_name: string; password: string }) => {
    const res = await api.post('/auth/signup', data);
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setToken(res.data.token);
    setUser(res.data.user);
    setIsNewUser(true);
    return res.data;
  };

  const logout = () => {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u.access_level !== 1) {
          addSessionHistory({ email: u.email, full_name: u.full_name, duration, durationSec: elapsed, timestamp: new Date().toISOString() });
        }
      } catch {}
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setIsNewUser(false);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch {
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isNewUser, login, signup, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
