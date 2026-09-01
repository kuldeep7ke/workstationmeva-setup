import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { saveLogin } from '../utils/quickLogin';
import { getAppName } from '../utils/appConfig';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginId, setLoginId] = useState(searchParams.get('loginId') || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Landing quick-login links use ?loginId or ?email; profiles without an
    // email link to /login?name=<full_name> — prefill from that too.
    const lid = searchParams.get('loginId') || searchParams.get('email') || searchParams.get('name') || '';
    if (lid) setLoginId(lid);
  }, [searchParams]);

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  setError('');
  setLoading(true);
  try {
    const data = await login(loginId, password);
    // Only save to quick access for staff level users (access_level = 3), not admin (access_level = 1)
    if (data.user.access_level === 3) {
      // Profiles without an email can't quick-login via email — fall back to the
      // username they logged in with so the saved entry still works.
      saveLogin(data.user.email || loginId, data.user.full_name, password, undefined, data.user.access_level, data.user.role);
    }
    navigate(data.isNewUser ? '/onboarding' : '/dashboard');
    toast('Welcome back!', 'success');
  } catch (err: any) {
    const msg = err.response?.data?.error || 'Login failed. Please try again.';
    setError(msg);
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
          <p className="text-surface-400 mt-1">Workstation Tracker</p>
          <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-warning-500/15 text-warning-600 text-[11px] font-semibold border border-warning-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-warning-500 animate-pulse" />
            Beta Release &middot; Testing Mode
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-surface-200 p-8" style={{ boxShadow: '0 18px 45px rgba(67,48,33,0.12)' }}>
          <h2 className="text-lg font-extrabold text-surface-800 tracking-tight mb-6">Sign in to your account</h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700">
              {error}
            </div>
          )}

<form onSubmit={handleSubmit} className="space-y-5">
             <div>
               <label className="flat-label">Username or Email</label>
               <input
                 type="text"
                 className="flat-input"
                  placeholder="yourusername"
                 value={loginId}
                 onChange={(e) => setLoginId(e.target.value)}
                 required
               />
             </div>

            <div>
              <label className="flat-label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="flat-input pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flat-btn-accent w-full py-3 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-surface-200 space-y-2 text-center">
            <p className="text-sm text-surface-500">
              Don't have an account?{' '}
              <Link to="/signup" className="text-accent-600 font-medium hover:text-accent-700">Sign up</Link>
            </p>
            <Link to="/" className="text-xs text-surface-400 hover:text-surface-600 transition-colors inline-flex items-center gap-1">
              &larr; Back to landing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
