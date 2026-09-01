import { Link } from 'react-router-dom';
import { getAppName } from '../utils/appConfig';
import { getAppVersionLabel } from '../utils/appMeta';

const APP = getAppName();

export default function Terms() {
  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-extrabold text-surface-800 tracking-tight mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-surface-400 mb-8">Last updated: August 2026 &middot; {APP} {getAppVersionLabel()}</p>

        <div className="space-y-8 text-surface-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using the {APP} application ("the Application"), you agree to be bound by these Terms and Conditions. If you do not agree, do not use the Application.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">2. Purpose</h2>
            <p> The Application is an open-source tool designed to manage daily news production workflows, including task assignments, bulletins, advertisements, special programs, teleprompter scripts, and staff coordination. It is initiated and maintained by kuldeep7ke.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">3. User Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
              <li>You agree to use the Application only for its intended purpose — news production management.</li>
              <li>You must not share your account, access data beyond your role, or misuse the system.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">4. Content Ownership</h2>
            <p>All content created within the Application — including tasks, bulletins, scripts, recordings, and analytics — remains the property of your organization / the users who created it. Data stays on your own server; the Application team does not collect or store your content.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">5. Free &amp; Public Domain License</h2>
            <p>The Application's source code is released to the <strong>public domain</strong> under the <strong>Unlicense</strong>. It is completely free — you may use, copy, modify, merge, publish, distribute, and sublicense it for any purpose, including commercial use, without permission or payment. This grant applies to the software itself only; your organization's content and branding remain yours.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">6. Beta / Testing Mode</h2>
            <p>The Application is currently a <strong>pre-release beta</strong> running in <strong>testing mode</strong>. Features are actively validated with live workflows and may change, be removed, or behave unexpectedly between releases. Use it with the understanding that this is not yet a stable, production release.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">7. Limitation of Liability</h2>
            <p>The Application is provided "as is" and "as available" — under the Unlicense the original authors provide <strong>no warranty, express or implied</strong>, including merchantability or fitness for a particular purpose. In no event shall kuldeep7ke or the contributors be liable for any damages arising from the use or inability to use the Application, including but not limited to data loss, service interruptions, or unauthorized access. Back up your data regularly.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">8. Modifications</h2>
            <p>These Terms may be updated as the Application evolves. Continued use of the Application after changes constitutes acceptance of the modified Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-surface-800 mb-3">9. Contact</h2>
            <p>For questions regarding these Terms, contact us at <a href="mailto:info@marathimeva.com" className="text-accent-500 hover:text-accent-600">info@marathimeva.com</a> or call <a href="tel:+918600633899" className="text-accent-500 hover:text-accent-600">+91 86006 33899</a>.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-surface-200 text-center">
           <p className="text-xs text-surface-400">These Terms &amp; Conditions are effective as of the date listed above and apply to all users of the {APP}.</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Link to="/about" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">About</Link>
            <Link to="/contact" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">Contact</Link>
            <Link to="/faq" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">FAQ</Link>
            <Link to="/privacy" className="text-xs text-surface-400 hover:text-surface-600 transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
