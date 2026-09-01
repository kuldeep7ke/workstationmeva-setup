import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAppName } from '../utils/appConfig';
import { ChevronDown, Search } from 'lucide-react';

const APP = getAppName();

const faqs = [
  {
    q: 'Is Workstation Meva free?',
    a: 'Yes, completely. The application is free and its source code is released to the public domain (Unlicense) — use, modify, and distribute it for any purpose, including commercial use. No paid tiers, no license keys.',
  },
  {
    q: 'What is its current release status?',
    a: 'The application is a pre-release beta running in testing mode. Features are validated with real workflows and may change between releases. Feedback and bug reports are welcome on the project page.',
  },
  {
    q: 'What is Workstation Meva?',
    a: `${APP} is an open-source tool for managing the lifecycle of news production — from task assignment and script writing to bulletin scheduling, video editing, and teleprompter delivery. Initiated and maintained by kuldeep7ke.`,
  },
  {
    q: 'Is there a desktop Control Panel?',
    a: 'Yes — on Windows, the Control Panel (windows\\Control Panel.bat, or the Start Menu/desktop shortcut after an .exe install) is the launch pad: start/stop the server with live status, paste your database URL and test it, toggle autostart-at-login and the Caddy proxy, copy LAN addresses, and run repairs. Read the same state files as the .bat launchers.',
  },
  {
    q: 'Does the installer include my data?',
    a: 'No. The Windows installer always deploys a fresh copy with no user data and no database — it only ships the application code and bundled runtime. Your data lives on the server where you run the app (or your Supabase project).',
  },
  {
    q: 'Who can create a task?',
    a: 'Users with Admin, Executive Editor, or Manager roles can create tasks. Staff-level users can only view and update tasks assigned to them.',
  },
  {
    q: 'What are the different task statuses?',
    a: 'Tasks progress through: draft → script_writing → footage_collection → waiting_confirmation → approved → editor_assigned → teleprompter_ready → prompting → recording_done → editing → uploading → published → under_review → completed. Each transition triggers a notification to the relevant user.',
  },
  {
    q: 'How do bulletins work?',
    a: 'Bulletins are daily time slots (07:00–16:00) with configurable templates. Tasks can be assigned to bulletin slots during creation or later via the task detail page.',
  },
  {
    q: 'How does the teleprompter work?',
    a: 'Once an anchor marks a script as ready, the script can be sent to the teleprompter. Anyone with the teleprompter URL can view the auto-scrolling full-screen display. Speed and font size are configurable.',
  },
  {
    q: 'What is the role of a Video Editor?',
    a: 'Video editors receive tasks with anchor recordings. They upload edited videos, thumbnails, and mark tasks as verified for publishing.',
  },
  {
    q: 'How do I reset my password?',
    a: 'Contact your system administrator to reset your password. Password reset is handled at the admin level for security.',
  },
  {
    q: 'What access levels are there?',
    a: 'Three levels: Admin (1), Manager (2), and Staff (3). Each role has a default access level, and some features are restricted based on your level.',
  },
  {
    q: 'How do notifications work?',
    a: 'You receive notifications when a task is assigned to you, when a task you created is updated, or when a script is sent to teleprompter. The bell icon in the header shows unread notifications.',
  },
  {
    q: 'Does the app work offline?',
    a: 'Yes. The app is designed as offline-first. Data is cached locally and syncs automatically when you are back online.',
  },
  {
    q: 'Can I change the app name?',
    a: 'Admins can change the app name via the Developer Zone (Dashboard → Developer → Dev Tools → App Name). This updates the name across the entire UI.',
  },
  {
    q: 'How do I contact support?',
    a: 'Email us at info@marathimeva.com or call +91 86006 33899. Visit our Contact page, or open an issue on the project page: https://github.com/kuldeep7ke/workstationmeva-setup',
  },
];

export default function FAQ() {
  const [search, setSearch] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const filtered = faqs.filter(f =>
    f.q.toLowerCase().includes(search.toLowerCase()) ||
    f.a.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="relative bg-gradient-to-br from-surface-800 via-surface-900 to-surface-950 text-white overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top right, rgba(249,115,22,0.15), transparent 50%)' }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">Frequently Asked Questions</h1>
          <p className="text-surface-300 mt-3 text-sm sm:text-base max-w-2xl mx-auto">
            Common questions about using {APP}.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="relative mb-8">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input type="text" placeholder="Search FAQs..."
            className="flat-input pl-10 text-sm"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="space-y-2">
          {filtered.length > 0 ? (
            filtered.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-surface-200 overflow-hidden">
                <button onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-surface-800 hover:bg-surface-50 transition-colors">
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-surface-400 transition-transform ${
                    openIndex === i ? 'rotate-180' : ''
                  }`} />
                </button>
                {openIndex === i && (
                  <div className="px-5 pb-4 text-sm text-surface-600 leading-relaxed border-t border-surface-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-surface-400 text-center py-8">No FAQs match your search.</p>
          )}
        </div>
      </div>

      <div className="border-t border-surface-200 py-6 text-center text-xs text-surface-400">
        <p>{APP} &copy; {new Date().getFullYear()} &mdash; Free &amp; public domain (Unlicense)</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link to="/about" className="hover:text-surface-600 transition-colors">About</Link>
          <Link to="/contact" className="hover:text-surface-600 transition-colors">Contact</Link>
          <Link to="/terms" className="hover:text-surface-600 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-surface-600 transition-colors">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
