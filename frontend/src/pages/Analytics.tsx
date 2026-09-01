import { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dates';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { TrendingUp, Users, Clock, Award, AlertTriangle, Loader2, Monitor, ListTodo, CheckCircle2 } from 'lucide-react';
import { getRoleLabel, formatLabel } from '../utils/roles';

const COLORS = ['#f97316', '#d97706', '#dc2626', '#8b5cf6', '#16a34a', '#ec4899'];
const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export default function Analytics() {
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState('week');
  const [workload, setWorkload] = useState<any>(null);
  const [err, setErr] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setErr('');
    api.get(`/analytics/dashboard?period=${period}`)
      .then((res) => setData(res.data))
      .catch(() => setErr('Failed to load analytics'));
    api.get('/analytics/workload')
      .then((res) => setWorkload(res.data))
      .catch(() => {});
  }, [period, retryKey]);

  if (!data && !err) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-accent-600 animate-spin" /></div>;
  }

  if (err) {
    return (
      <div className="flat-card-static text-center py-12">
        <AlertTriangle className="w-10 h-10 text-danger-400 mx-auto mb-3" />
        <p className="text-surface-500">{err}</p>
        <button onClick={() => setRetryKey((k) => k + 1)} className="flat-btn-brand mt-4">Retry</button>
      </div>
    );
  }

  const stats = data.taskStats || {};

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-surface-800">Analytics</h1>
          <p className="text-sm text-surface-400 mt-0.5">Performance & activity insights</p>
        </div>
        <div className="flex gap-1 bg-surface-100 rounded-lg p-1 self-start overflow-x-auto">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                period === p.value ? 'bg-accent-500 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-bold text-surface-800 leading-tight">{stats.total_tasks || 0}</p>
            <p className="text-[11px] sm:text-xs text-surface-400">Total Tasks</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-success-50 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-success-600" />
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-bold text-surface-800 leading-tight">{stats.verified || 0}</p>
            <p className="text-[11px] sm:text-xs text-surface-400">Verified</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-bold text-surface-800 leading-tight">{Math.round(data.avgCompletion || 0)}m</p>
            <p className="text-[11px] sm:text-xs text-surface-400">Avg Time</p>
          </div>
        </div>
        <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-surface-50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-surface-600" />
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-bold text-surface-800 leading-tight">
              {data.usersByRole?.reduce((a: any, b: any) => a + b.count, 0) || 0}
            </p>
            <p className="text-[11px] sm:text-xs text-surface-400">Staff</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">Tasks by Day</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.tasksByDay || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5) || ''} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Total" />
              <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Completed" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">Priority Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.priorityDist || []} dataKey="count" nameKey="priority"
                cx="50%" cy="50%" outerRadius={90}
                label={({ priority, count }) => `${priority}: ${count}`}>
                {(data.priorityDist || []).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">News Age</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.newsAgeDist || []} dataKey="count" nameKey="news_age"
                cx="50%" cy="50%" outerRadius={60}
                label={({ news_age, count }: any) => `${({
    urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
  } as Record<string, string>)[news_age] || news_age}: ${count}`}>
                {(data.newsAgeDist || []).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">Anchoring Tone</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.toneDist || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" />
              <YAxis dataKey="anchoring_tone" type="category" tick={{ fontSize: 10 }} width={90} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flat-card">
          <h3 className="text-sm font-semibold text-surface-700 mb-4">Bulletin Types</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.bulletinStats || []} dataKey="count" nameKey="bulletin_type"
                cx="50%" cy="50%" outerRadius={60}
                label={({ bulletin_type, count }) => `${formatLabel(bulletin_type)}: ${count}`}>
                {(data.bulletinStats || []).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flat-card">
        <h3 className="text-sm font-semibold text-surface-700 mb-4">Staff by Role</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(data.usersByRole || []).length === 0 ? (
            <p className="text-sm text-surface-400 py-4 text-center sm:col-span-5">No staff data available yet.</p>
          ) : (data.usersByRole || []).map((r: any, i: number) => (
            <div key={i} className="text-center p-3 sm:p-4 rounded-xl bg-surface-50">
              <p className="text-xl sm:text-2xl font-bold text-surface-800">{r.count}</p>
              <p className="text-[11px] sm:text-xs text-surface-400 mt-1">{getRoleLabel(r.role)}</p>
            </div>
          ))}
        </div>
      </div>

      {workload && (
        <div className="space-y-4">
          <div className="page-header">
            <h2 className="text-lg font-bold text-surface-800">Workload & Time Tracking</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
              <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-surface-800">{workload.teleprompterStats?.sent_count || 0}</p>
                <p className="text-xs text-surface-400">Sent to Teleprompter (30d)</p>
              </div>
            </div>
            <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
              <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-success-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-surface-800">{workload.avgTimes?.avg_script_to_teleprompter_min || '—'}</p>
                <p className="text-xs text-surface-400">Avg Script → Teleprompter (min)</p>
              </div>
            </div>
            <div className="flat-card flex items-center gap-3 p-3 sm:p-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-surface-800">{workload.avgTimes?.avg_anchor_completion_min || '—'}</p>
                <p className="text-xs text-surface-400">Avg Anchor Completion (min)</p>
              </div>
            </div>
          </div>

          <div className="flat-card">
            <h3 className="text-sm font-semibold text-surface-700 mb-4">Staff Workload (30 days)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-surface-400 uppercase border-b border-surface-200">
                    <th className="text-left py-2 pr-4">Staff</th>
                    <th className="text-center px-2">Total</th>
                    <th className="text-center px-2">Done</th>
                    <th className="text-center px-2">In Prog</th>
                    <th className="text-center px-2">Pending</th>
                    <th className="text-right pl-4">Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(workload.userStats || []).map((u: any) => (
                    <tr key={u.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-surface-700">{u.full_name}</span>
                        <span className="text-[11px] text-surface-400 ml-2">{getRoleLabel(u.role)}</span>
                      </td>
                      <td className="text-center px-2 font-medium">{u.total_tasks}</td>
                      <td className="text-center px-2 text-success-600 font-medium">{u.completed + u.verified}</td>
                      <td className="text-center px-2 text-warning-600">{u.in_progress}</td>
                      <td className="text-center px-2 text-surface-400">{u.pending}</td>
                      <td className="text-right pl-4 text-surface-500">{u.avg_completion_min || '—'}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {workload.teleprompterLogs?.length > 0 && (
            <div className="flat-card">
              <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-accent-500" /> Teleprompter Activity
              </h3>
              <div className="space-y-2">
                {workload.teleprompterLogs.map((log: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-surface-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-700">{log.full_name}</span>
                      <span className="text-sm text-surface-500">→ {log.task_title}</span>
                    </div>
                    <span className="text-xs text-surface-400">
                      {log.created_at ? formatDateTime(log.created_at) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
