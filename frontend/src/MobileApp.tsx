import React, { useState, useEffect, useCallback } from 'react';
import './mobile.css';

const API = '';  // same origin

interface DashboardData {
  users: number;
  tasks: number;
  bulletins: number;
  programs: number;
  stories: number;
  ads: number;
}

type Tab = 'home' | 'tasks' | 'bulletins' | 'settings';

export default function MobileApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [serverOnline, setServerOnline] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [refreshing, setRefreshing] = useState(false);

  // Health check
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/health`);
        setServerOnline(r.ok);
      } catch { setServerOnline(false); }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [users, tasks, bulletins, programs, stories, ads] = await Promise.allSettled([
        fetch(`${API}/api/users/assignable`, { headers }).then(r => r.json()),
        fetch(`${API}/api/tasks`, { headers }).then(r => r.json()),
        fetch(`${API}/api/bulletin-templates`, { headers }).then(r => r.json()),
        fetch(`${API}/api/programs`, { headers }).then(r => r.json()),
        fetch(`${API}/api/stories`, { headers }).then(r => r.json()),
        fetch(`${API}/api/ads`, { headers }).then(r => r.json()),
      ]);
      setDashboard({
        users: users.status === 'fulfilled' ? (Array.isArray(users.value) ? users.value.length : 0) : 0,
        tasks: tasks.status === 'fulfilled' ? (Array.isArray(tasks.value) ? tasks.value.length : 0) : 0,
        bulletins: bulletins.status === 'fulfilled' ? (Array.isArray(bulletins.value) ? bulletins.value.length : 0) : 0,
        programs: programs.status === 'fulfilled' ? (Array.isArray(programs.value) ? programs.value.length : 0) : 0,
        stories: stories.status === 'fulfilled' ? (Array.isArray(stories.value) ? stories.value.length : 0) : 0,
        ads: ads.status === 'fulfilled' ? (Array.isArray(ads.value) ? ads.value.length : 0) : 0,
      });
    } catch {}
  }, [token]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Pull to refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json();
      if (data.token) {
        setToken(data.token);
        localStorage.setItem('token', data.token);
      } else {
        setLoginError(data.error || 'Login failed. Check your credentials.');
      }
    } catch {
      setLoginError('Could not reach the server. Try again.');
    }
  };

  // Not logged in — show login screen
  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-logo">W</div>
        <div className="login-title">Workstation Meva</div>
        <div className="login-sub">Sign in to your office dashboard</div>
        <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 320 }}>
          <input
            className="login-input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button className="login-btn" type="submit">Sign In</button>
          {loginError && <p style={{ color: '#e5484d', fontSize: 13, textAlign: 'center', marginTop: 10 }}>{loginError}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="mobile-app">
      {/* Header */}
      <div className="mobile-header">
        <h1>Workstation Meva</h1>
        <div className={`status-badge ${serverOnline ? 'online' : 'offline'}`}>
          <span className={`status-dot ${serverOnline ? 'online' : 'offline'}`} />
          {serverOnline ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Content */}
      <div className="mobile-content">
        {tab === 'home' && (
          <>
            {refreshing && <div className="pull-indicator">Refreshing...</div>}

            {/* Stats */}
            <div className="stat-grid">
              <div className="stat-card">
                <div className="label">Tasks</div>
                <div className="value accent">{dashboard?.tasks ?? '—'}</div>
              </div>
              <div className="stat-card">
                <div className="label">Bulletins</div>
                <div className="value success">{dashboard?.bulletins ?? '—'}</div>
              </div>
              <div className="stat-card">
                <div className="label">Programs</div>
                <div className="value warning">{dashboard?.programs ?? '—'}</div>
              </div>
              <div className="stat-card">
                <div className="label">Stories</div>
                <div className="value" style={{color: '#7c3aed'}}>{dashboard?.stories ?? '—'}</div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="section-header">Quick Actions</div>
            <div className="action-grid">
              <div className="action-btn" onClick={() => setTab('tasks')}>
                <span className="icon">📋</span>
                Tasks
              </div>
              <div className="action-btn" onClick={() => setTab('bulletins')}>
                <span className="icon">📺</span>
                Bulletins
              </div>
              <div className="action-btn" onClick={handleRefresh}>
                <span className="icon">🔄</span>
                Refresh
              </div>
              <div className="action-btn danger" onClick={() => { setToken(null); localStorage.removeItem('token'); }}>
                <span className="icon">🚪</span>
                Sign Out
              </div>
            </div>
          </>
        )}

        {tab === 'tasks' && (
          <>
            <div className="section-header">Recent Tasks</div>
            <div className="mobile-list">
              <div className="mobile-list-item" onClick={() => setTab('home')}>
                <div className="item-icon blue">📋</div>
                <div className="item-text">
                  <div className="item-title">View all tasks</div>
                  <div className="item-sub">{dashboard?.tasks ?? 0} tasks in database</div>
                </div>
                <div className="item-arrow">›</div>
              </div>
            </div>
          </>
        )}

        {tab === 'bulletins' && (
          <>
            <div className="section-header">Bulletin Board</div>
            <div className="mobile-list">
              <div className="mobile-list-item" onClick={() => setTab('home')}>
                <div className="item-icon green">📺</div>
                <div className="item-text">
                  <div className="item-title">View all bulletins</div>
                  <div className="item-sub">{dashboard?.bulletins ?? 0} bulletin slots</div>
                </div>
                <div className="item-arrow">›</div>
              </div>
            </div>
          </>
        )}

        {tab === 'settings' && (
          <>
            <div className="section-header">Settings</div>
            <div className="mobile-list">
              <div className="mobile-list-item">
                <div className="item-icon purple">⚙️</div>
                <div className="item-text">
                  <div className="item-title">Server Status</div>
                  <div className="item-sub">{serverOnline ? 'Running on port 3002' : 'Offline'}</div>
                </div>
              </div>
              <div className="mobile-list-item" onClick={handleRefresh}>
                <div className="item-icon blue">🔄</div>
                <div className="item-text">
                  <div className="item-title">Refresh Data</div>
                  <div className="item-sub">Pull to update dashboard</div>
                </div>
              </div>
              <div className="mobile-list-item danger" onClick={() => { setToken(null); localStorage.removeItem('token'); }}>
                <div className="item-icon" style={{background: 'rgba(255,82,82,0.15)'}}>🚪</div>
                <div className="item-text">
                  <div className="item-title" style={{color: 'var(--danger)'}}>Sign Out</div>
                  <div className="item-sub">Clear session</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className={`nav-item ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
          <span className="nav-icon">🏠</span>
          Home
        </button>
        <button className={`nav-item ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
          <span className="nav-icon">📋</span>
          Tasks
        </button>
        <button className={`nav-item ${tab === 'bulletins' ? 'active' : ''}`} onClick={() => setTab('bulletins')}>
          <span className="nav-icon">📺</span>
          News
        </button>
        <button className={`nav-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          <span className="nav-icon">⚙️</span>
          Settings
        </button>
      </div>
    </div>
  );
}
