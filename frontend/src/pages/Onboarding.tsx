import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getRoleLabel } from '../utils/roles';
import { saveLogin, getSavedLogins, removeLogin } from '../utils/quickLogin';
import { getAppName } from '../utils/appConfig';
import { Check, ArrowRight, ArrowLeft, Sparkles, Shield, LayoutDashboard, Loader2, User, Mail } from 'lucide-react';

const accessLabels: Record<number, string> = { 1: 'Admin', 2: 'Manager', 3: 'Staff' };

const steps = [
  {
    title: 'Tell us about yourself',
    icon: User,
    description: 'Please provide your full name and email to complete your profile.',
  },
  {
    title: 'Your access level',
    icon: Shield,
    description: 'Your account access determines what you can do in the app.',
  },
  {
    title: 'Terms & Privacy',
    icon: Shield,
    description: 'Please review and accept our terms before continuing.',
  },
  {
    title: 'You\'re all set!',
    icon: LayoutDashboard,
    description: 'Start tracking news production, managing bulletins, and collaborating with the team.',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [consented, setConsented] = useState({ terms: false, privacy: false });
  const [profile, setProfile] = useState({ full_name: '', email: '' });
  const [profileError, setProfileError] = useState('');

    const canProceedStep2 = consented.terms && consented.privacy;
    const profileValid = profile.full_name.trim().length > 0;

    const handleNextFromStep0 = () => {
      setProfileError('');
      if (!profile.full_name.trim()) { setProfileError('Full name is required.'); return; }
      // Email is optional
      setStep(1);
    };

  const complete = async () => {
    setSaving(true);
    try {
      await api.post('/auth/onboard', profile);
      await refreshUser();
      // Only save to quick access for staff level users (access_level = 3), not admin (access_level = 1)
      if (user?.access_level === 3) {
        const old = getSavedLogins().find(l => l.email === user?.email);
        saveLogin(profile.email, profile.full_name, old?.password || '', '');
        if (old && old.email !== profile.email) removeLogin(old.email);
      }
      toast(`Welcome to ${getAppName()}!`, 'success');
      navigate('/dashboard');
    } catch {
      navigate('/dashboard');
    } finally {
      setSaving(false);
    }
  };

  const s = steps[step];

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden" style={{ boxShadow: '0 18px 45px rgba(67,48,33,0.12)' }}>
          <div className="flex gap-1.5 px-8 pt-8 pb-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-pill transition-all duration-300 ${i <= step ? 'bg-accent-500' : 'bg-surface-200'}`} />
            ))}
          </div>
          <div className="px-8 text-xs font-medium text-surface-400" style={{ letterSpacing: '0.05em' }}>
            STEP {step + 1} OF {steps.length}
          </div>

          <div className="px-8 py-8">
            <div className="w-14 h-14 bg-accent-100 rounded-2xl flex items-center justify-center mb-5 icon-bounce">
              <s.icon className="w-7 h-7 text-accent-600" />
            </div>
            <h2 className="text-xl font-extrabold text-surface-800 tracking-tight mb-2">{s.title}</h2>
            <p className="text-surface-500 leading-relaxed">{s.description}</p>

{step === 0 && (
               <div className="mt-6 space-y-4">
                 {profileError && (
                   <div className="px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700">
                     {profileError}
                   </div>
                 )}
                 <div>
                   <label className="flat-label">Full Name <span className="text-danger-500">*</span></label>
                   <div className="relative">
                     <User className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
                     <input type="text" className="flat-input pl-10" placeholder="Your full name"
                       value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required />
                   </div>
                 </div>
                 <div>
                   <label className="flat-label">Email (optional)</label>
                   <div className="relative">
                     <Mail className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
                     <input type="email" className="flat-input pl-10" placeholder="you@example.com"
                       value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                   </div>
                 </div>
               </div>
             )}

            {step === 1 && user && (
              <div className="mt-6 bg-surface-100 rounded-2xl p-5 border border-surface-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-accent-100 rounded-xl flex items-center justify-center">
                    <span className="text-sm font-bold text-accent-700">{profile.full_name?.charAt(0) || user.full_name?.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">{profile.full_name || user.full_name}</p>
                    <p className="text-xs text-surface-400">{profile.email || user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-surface-200">
                  <Shield className="w-4 h-4 text-accent-500" />
                  <span className="text-sm font-semibold text-surface-800">Access Level {user.access_level}</span>
                  <span className="text-xs text-surface-400">— {getRoleLabel(user.role)}</span>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 space-y-4">
                <label className="flex items-start gap-3 p-4 rounded-xl bg-surface-50 border border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors">
                  <input type="checkbox" checked={consented.terms}
                    onChange={(e) => setConsented({ ...consented, terms: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-surface-300 text-accent-500 focus:ring-accent-500" />
                  <span className="text-sm text-surface-700">
                    I have read and agree to the{' '}
                    <Link to="/terms" target="_blank" className="text-accent-600 font-medium hover:text-accent-700 underline">Terms &amp; Conditions</Link>
                  </span>
                </label>
                <label className="flex items-start gap-3 p-4 rounded-xl bg-surface-50 border border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors">
                  <input type="checkbox" checked={consented.privacy}
                    onChange={(e) => setConsented({ ...consented, privacy: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-surface-300 text-accent-500 focus:ring-accent-500" />
                  <span className="text-sm text-surface-700">
                    I have read and agree to the{' '}
                    <Link to="/privacy" target="_blank" className="text-accent-600 font-medium hover:text-accent-700 underline">Privacy Policy</Link>
                  </span>
                </label>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 bg-accent-50 rounded-2xl p-5 border border-accent-200">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-accent-600 icon-pulse" />
                  <span className="text-sm font-semibold text-surface-800">Ready to go, {profile.full_name || user?.full_name}!</span>
                </div>
                <p className="text-sm text-surface-600">
                  You can always ask your admin to update your access level.
                </p>
              </div>
            )}
          </div>

          <div className="px-8 pb-8 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="text-sm text-surface-400 hover:text-surface-600 transition-colors">Skip</button>
            <div className="flex gap-3">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="flat-btn-surface">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              )}
              {step < steps.length - 1 ? (
                <button onClick={() => step === 0 ? handleNextFromStep0() : setStep(step + 1)}
                  disabled={step === 2 && !canProceedStep2}
                  className="flat-btn-accent disabled:opacity-50">
                  Next <ArrowRight className="w-4 h-4 icon-bounce" />
                </button>
              ) : (
                <button onClick={complete} disabled={saving} className="flat-btn-accent">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? 'Finishing...' : 'Go to Dashboard'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
