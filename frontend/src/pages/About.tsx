import { Link } from 'react-router-dom';
import { getAppName } from '../utils/appConfig';
import { getAppVersionLabel } from '../utils/appMeta';
import { Newspaper, Users, Radio, Shield, Wifi, MonitorSmartphone, Sparkles } from 'lucide-react';

const APP = getAppName();

export default function About() {
  return (
    <div className="min-h-screen bg-surface-50">
      <div className="relative bg-gradient-to-br from-surface-800 via-surface-900 to-surface-950 text-white overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top right, rgba(249,115,22,0.15), transparent 50%)' }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">About {APP}</h1>
          <p className="text-surface-300 mt-3 text-sm sm:text-base max-w-2xl mx-auto">
            A free, public-domain news production management platform — currently in pre-release beta.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning-500/15 text-warning-400 text-xs font-semibold border border-warning-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-warning-400 animate-pulse" />
              Beta Release &middot; Testing Mode
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 text-surface-300 text-xs font-medium border border-white/10">
              {getAppVersionLabel()}
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 text-surface-300 text-xs font-medium border border-white/10">
              Free &amp; Public Domain (Unlicense)
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <section>
          <h2 className="text-lg font-bold text-surface-800 mb-4">Our Mission</h2>
          <p className="text-surface-600 leading-relaxed">
            {APP} is a news production tracking system designed to help newsrooms manage
            the entire lifecycle of a news story &mdash; from assignment and scripting to anchoring,
            video editing, bulletin scheduling, and teleprompter delivery. The application is
            <strong> free to use and released to the public domain</strong> (Unlicense) &mdash;
            anyone can deploy, modify, and distribute it. It is initiated and maintained by
            <strong> kuldeep7ke</strong>, empowering editors, reporters, anchors, and video editors
            to collaborate seamlessly in real time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-surface-800 mb-4">Release Status</h2>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-warning-600 mt-0.5 shrink-0" />
              <div className="text-sm text-surface-600 leading-relaxed">
                <p className="font-semibold text-surface-800 mb-1">Pre-release beta ({getAppVersionLabel()}) — testing mode</p>
                <p>
                  The app currently runs in <strong>testing mode</strong>: features are being validated
                  with real live workflows, and things may change or break between releases. Data you
                  enter is stored on <strong>your own server</strong> — the installer and source ship
                  with <strong>no user data and no database</strong>. Please report issues on the
                  project page so they can be fixed before the stable release.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-surface-800 mb-4">Free &amp; Open</h2>
          <p className="text-surface-600 leading-relaxed">
            Source code is released under the <strong>Unlicense</strong> (public domain) —
            free for any use, commercial or personal, without restriction. No paid tiers, no
            subscriptions, no license keys. Your data belongs to you and stays on your machines.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-surface-800 mb-4">Key Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Newspaper, title: 'Task Management', desc: 'Create, assign, and track news tasks with priorities, deadlines, and role-specific workflows.' },
              { icon: Radio, title: 'Bulletin Scheduling', desc: 'Plan and manage daily bulletin slots with template-based publishing times.' },
              { icon: MonitorSmartphone, title: 'Teleprompter', desc: 'Push scripts directly to a full-screen teleprompter view for anchors.' },
              { icon: Users, title: 'Role-Based Access', desc: 'Fine-grained permissions across admin, editorial, anchor, reporter, and more roles.' },
              { icon: Wifi, title: 'Offline-First', desc: 'Full offline support with automatic sync when connectivity is restored.' },
              { icon: Shield, title: 'Secure & Private', desc: 'End-to-end data protection with role-based access control and secure authentication.' },
            ].map(f => (
              <div key={f.title} className="bg-white rounded-xl border border-surface-200 p-4">
                <f.icon className="w-5 h-5 text-accent-500 mb-3" />
                <h3 className="text-sm font-semibold text-surface-800 mb-1">{f.title}</h3>
                <p className="text-xs text-surface-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-surface-800 mb-4">Who It's For</h2>
          <p className="text-surface-600 leading-relaxed">
            {APP} is built for news organizations of all sizes. Whether you run a 24/7 broadcast
            channel or a digital-first newsroom, the platform adapts to your workflow with
            customizable roles, task types, and priority options.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-surface-800 mb-4">About the Author</h2>
          <p className="text-surface-600 leading-relaxed">
            {APP} is authored and maintained by <strong>kuldeep7ke</strong> (Kuldeep Kamble),
            based in Ahilyanagar, Maharashtra, India. It started as a tool for building digital
            media and news-production workflow software, focusing on streamlining production
            workflows and improving team collaboration.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-surface-200 p-4">
              <h3 className="text-sm font-semibold text-surface-800 mb-2">Contact / Project</h3>
              <div className="space-y-1 text-xs text-surface-500">
                <p>Project: <a href="https://github.com/kuldeep7ke/workstationmeva-setup" className="text-accent-500 hover:text-accent-600">github.com/kuldeep7ke/workstationmeva-setup</a></p>
                <p>Email: <a href="mailto:info@marathimeva.com" className="text-accent-500 hover:text-accent-600">info@marathimeva.com</a></p>
                <p>Phone: <a href="tel:+918600633899" className="text-accent-500 hover:text-accent-600">+91 86006 33899</a></p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4">
              <h3 className="text-sm font-semibold text-surface-800 mb-2">Location</h3>
              <p className="text-xs text-surface-500 leading-relaxed">
                Maliwada,<br />
                Ahilyanagar, Maharashtra,<br />
                India &mdash; PIN 414001
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-surface-200 py-6 text-center text-xs text-surface-400">
        <p>{APP} &copy; {new Date().getFullYear()} &mdash; Free &amp; public domain (Unlicense) &middot; {getAppVersionLabel()}</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link to="/faq" className="hover:text-surface-600 transition-colors">FAQ</Link>
          <Link to="/contact" className="hover:text-surface-600 transition-colors">Contact</Link>
          <Link to="/terms" className="hover:text-surface-600 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-surface-600 transition-colors">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
