import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { getAppName } from './utils/appConfig';
import Layout from './components/Layout';
import OfflineBanner from './components/OfflineBanner';
import SplashLoader from './components/SplashLoader';

const MobileApp = lazy(() => import('./MobileApp'));

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const SignUp = lazy(() => import('./pages/SignUp'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const FAQ = lazy(() => import('./pages/FAQ'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const Bulletins = lazy(() => import('./pages/Bulletins'));
const NewsArticles = lazy(() => import('./pages/NewsArticles'));
const Ads = lazy(() => import('./pages/Ads'));
const Programs = lazy(() => import('./pages/Programs'));
const Users = lazy(() => import('./pages/Users'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Reporters = lazy(() => import('./pages/Reporters'));
const Archive = lazy(() => import('./pages/Archive'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Developer = lazy(() => import('./pages/Developer'));
const Activity = lazy(() => import('./pages/Activity'));
const Teleprompter = lazy(() => import('./pages/Teleprompter'));
const TeleprompterList = lazy(() => import('./pages/TeleprompterList'));
const Published = lazy(() => import('./pages/Published'));
const RecycleBin = lazy(() => import('./pages/RecycleBin'));
const Backups = lazy(() => import('./pages/Backups'));

function PageLoader() {
  return <SplashLoader />;
}

function ProtectedRoute({ children, minLevel }: { children: JSX.Element; minLevel?: number }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/" replace />;
  if (minLevel && user.access_level > minLevel) return <Navigate to="/dashboard" replace />;
  return children;
}

function DevRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/" replace />;
   if (!(user.is_dev || user.access_level <= 1)) return <Navigate to="/dashboard" replace />;
  return children;
}

function GuestRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function isMobileDevice() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mobile') === '1') return true;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export default function App() {
  // The teleprompter is a public studio screen reachable by URL from any LAN
  // device — it must always render the desktop routes, never the mobile app.
  const [isMobile] = useState(
    () => isMobileDevice() && !window.location.pathname.startsWith('/teleprompter')
  );
  useEffect(() => { document.title = getAppName(); }, []);

  if (isMobile) {
    return (
      <Suspense fallback={<PageLoader />}>
        <MobileApp />
      </Suspense>
    );
  }

  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><SignUp /></GuestRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="bulletins" element={<Bulletins />} />
          <Route path="stories" element={<NewsArticles />} />
          <Route path="ads" element={<Ads />} />
          <Route path="programs" element={<Programs />} />
          <Route path="users" element={<ProtectedRoute minLevel={1}><Users /></ProtectedRoute>} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="reporters" element={<Reporters />} />
          <Route path="archives" element={<Archive />} />
          <Route path="profile" element={<Profile />} />
          <Route path="activity" element={<ProtectedRoute minLevel={2}><Activity /></ProtectedRoute>} />
          <Route path="published" element={<ProtectedRoute minLevel={3}><Published /></ProtectedRoute>} />
          <Route path="recycle-bin" element={<ProtectedRoute minLevel={2}><RecycleBin /></ProtectedRoute>} />
          <Route path="backups" element={<DevRoute><Backups /></DevRoute>} />
          <Route path="settings" element={<DevRoute><Settings /></DevRoute>} />
          <Route path="developer" element={<DevRoute><Developer /></DevRoute>} />
        </Route>
        <Route path="teleprompter" element={<TeleprompterList />} />
        <Route path="teleprompter/:id" element={<Teleprompter />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
}
