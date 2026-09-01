import { Link } from 'react-router-dom';
import { getAppName } from '../utils/appConfig';
import { Home } from 'lucide-react';

const APP = getAppName();

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-7xl font-bold text-surface-200 mb-4">404</div>
        <h1 className="text-xl font-bold text-surface-800 mb-2">Page Not Found</h1>
        <p className="text-sm text-surface-500 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="flat-btn-accent inline-flex items-center gap-2 text-sm">
          <Home className="w-4 h-4" /> Back to {APP}
        </Link>
      </div>
    </div>
  );
}
