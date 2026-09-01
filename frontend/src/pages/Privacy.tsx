import { Link } from 'react-router-dom';
import { getAppName } from '../utils/appConfig';
import { getAppVersionLabel } from '../utils/appMeta';

const APP = getAppName();

export default function Privacy() {
  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-extrabold text-surface-800 tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-surface-400 mb-8">Last updated: August 2026 &middot; {APP} {getAppVersionLabel()}</p>

        <div className="space-y-8 text-surface-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">1. Information We Collect</h2>
            <p>This Privacy Policy describes how Marathi Meva ("we", "the Organization") collects, uses, and protects information within the {APP} application ("the Application").</p>
            <p className="mt-2">
              The Application is a <strong>self-hosted, free, public-domain beta</strong>. It is designed to run
              on <strong>your own server</strong> — task data, scripts, bulletins, and analytics live on your
              machine (or your Supabase project), and the Application ships with <strong>no user data</strong>.
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li><strong>Account Information:</strong> Full name, email address, username, and role when you register.</li>
              <li><strong>Usage Data:</strong> Tasks created, bulletins managed, scripts written, and other activities within the Application.</li>
              <li><strong>Research Data:</strong> Anonymous usage/workflow/glitch statistics kept locally on the server for up to 90 days (viewable in Backups → Research Data) — you can delete them anytime.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To manage and assign news production tasks.</li>
              <li>To coordinate bulletins, programs, and advertisements.</li>
              <li>To track staff activity, workload, and performance.</li>
              <li>To maintain security and prevent unauthorized access.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">3. Data Sharing</h2>
            <p>We do not sell, trade, or share your personal information with third parties. Your data is accessible only to authorized personnel within {APP} based on their role and need-to-know, and it remains stored on your own server. Because the Application is open source, you are always free to inspect exactly what it does with data.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">4. Data Retention</h2>
            <p>Your data is retained for as long as your account is active. If your account is deactivated, your data may be retained for archival or audit purposes as required by organizational policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">5. Security</h2>
            <p>We implement appropriate technical and organizational measures — including password hashing, JWT-based authentication, and role-based access control — to protect your data against unauthorized access, alteration, or destruction.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">6. Your Rights</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Access your personal data and update it via your profile.</li>
              <li>Request account deactivation or data deletion from your administrator.</li>
              <li>Opt out of non-essential communications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">7. Contact</h2>
            <p>For privacy-related inquiries, contact us at <a href="mailto:info@marathimeva.com" className="text-accent-500 hover:text-accent-600">info@marathimeva.com</a> or call <a href="tel:+918600633899" className="text-accent-500 hover:text-accent-600">+91 86006 33899</a>.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-surface-200 text-center">
           <p className="text-xs text-surface-400">This Privacy Policy is effective as of the date listed above and applies to all users of the {APP}.</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Link to="/about" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">About</Link>
            <Link to="/contact" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">Contact</Link>
            <Link to="/faq" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">FAQ</Link>
            <Link to="/terms" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
