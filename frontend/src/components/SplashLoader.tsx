import AnimatedLogo from './AnimatedLogo';
import { getAppName } from '../utils/appConfig';

export default function SplashLoader() {
  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center gap-6 px-4">
      <AnimatedLogo size={72} />
      <div className="flex flex-col items-center gap-3">
        <p className="text-lg font-bold text-surface-800">{getAppName()}</p>
        <div className="w-48 h-1.5 bg-surface-200 rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-accent-500 rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );
}
