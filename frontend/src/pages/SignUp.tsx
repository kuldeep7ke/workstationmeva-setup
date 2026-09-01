import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { Eye, EyeOff, UserPlus, Loader2, Info } from 'lucide-react';
import { saveLogin } from '../utils/quickLogin';
import { getAppName } from '../utils/appConfig';

const ROLES = [
  { id: 'anchor', label: 'Anchor', desc: 'Script writing, recording, live broadcast' },
  { id: 'video_editor', label: 'Video Editor', desc: 'Video editing, thumbnails, motion graphics' },
  { id: 'reporter', label: 'Reporter', desc: 'Field reports, footage collection, interviews' },
  { id: 'social_media', label: 'Social Media Handler', desc: 'Social posts, graphic design, content creation' },
  { id: 'input_desk', label: 'Input Desk', desc: 'Source monitoring, story pitches, lead tracking' },
  { id: 'output_desk', label: 'Output Desk', desc: 'Scheduling, playlist management, broadcast coordination' },
  { id: 'advertise', label: 'Advertise', desc: 'Ad creation, client meetings, campaign management' },
  { id: 'editorial', label: 'Editorial', desc: 'Content review, script approval, fact check' },
];

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', full_name: '', password: '', confirm: '', role: 'editorial' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.username || !form.password || !form.full_name) return setError('Username, password, and full name are required.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        username: form.username,
        email: form.email || undefined,
        full_name: form.full_name,
        password: form.password,
        role: form.role,
      });
      if (res.data.pending) {
        setPending(true);
        return;
      }
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      if (res.data.user.access_level !== 1) {
        saveLogin(res.data.user.email, res.data.user.full_name, form.password);
      }
      navigate('/onboarding');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-5">
            <img src="/favicon.svg" alt={getAppName()} className="w-16 h-16 drop-shadow-lg" />
          </div>
          <h1 className="text-2xl font-bold text-surface-800">{getAppName()}</h1>
            <p className="text-surface-400 mt-1">Join the news team</p>
            <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-warning-500/15 text-warning-600 text-[11px] font-semibold border border-warning-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-warning-500 animate-pulse" />
              Beta Release &middot; Testing Mode
            </span>
          </div>

          {pending ? (
            <div className="bg-white rounded-2xl border border-surface-200 p-8 shadow-sm text-center">
              <div className="w-14 h-14 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Info className="w-7 h-7 text-accent-600" />
              </div>
              <h2 className="text-lg font-semibold text-surface-800 mb-2">Request Submitted</h2>
              <p className="text-sm text-surface-500 mb-6">
                Your signup request is pending admin approval. You will be able to log in once an admin approves your account. Please try again later.
              </p>
              <Link to="/" className="flat-btn-brand inline-flex">
                Back to Landing
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-surface-200 p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-surface-800 mb-6">Create your account</h2>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="flat-label">Username</label>
                  <input type="text" className="flat-input" placeholder="letters only, lowercase"
                    value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z]/g, '') })} required />
                </div>
                <div>
                  <label className="flat-label">Full Name</label>
                  <input type="text" className="flat-input" placeholder="Your full name"
                    value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
                </div>
                <div>
                  <label className="flat-label">Email (optional — attached to profile)</label>
                  <input type="email" className="flat-input" placeholder="you@example.com"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="flat-label">Role</label>
                  <select className="flat-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ROLES.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flat-label">Password</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} className="flat-input pr-10" placeholder="Min 6 characters"
                      value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="flat-label">Confirm password</label>
                  <input type={showPw ? 'text' : 'password'} className="flat-input pr-10" placeholder="Repeat password"
                    value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
                </div>

                <button type="submit" disabled={loading} className="flat-btn-brand w-full py-3 disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {loading ? 'Creating account...' : 'Create account'}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-surface-100 space-y-2 text-center">
                <p className="text-sm text-surface-500">
                  Already have an account?{' '}
                  <Link to="/login" className="text-accent-600 font-medium hover:text-accent-700">Sign in</Link>
                </p>
                <Link to="/" className="text-xs text-surface-400 hover:text-surface-600 transition-colors inline-flex items-center gap-1">
                  &larr; Back to landing
                </Link>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
