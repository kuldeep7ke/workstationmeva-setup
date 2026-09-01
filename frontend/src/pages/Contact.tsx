import { Link } from 'react-router-dom';
import { getAppName } from '../utils/appConfig';
import { Mail, Phone, MapPin, Clock, Globe } from 'lucide-react';

const APP = getAppName();

const CONTACT_INFO = {
  email: 'info@marathimeva.com',
  phone: '+91 86006 33899',
  phoneRaw: '+918600633899',
  address: 'kuldeep7ke, Maliwada, Ahilyanagar, Maharashtra, India',
  pin: '414001',
  website: 'marathimeva.com',
};

export default function Contact() {
  return (
    <div className="min-h-screen bg-surface-50">
      <div className="relative bg-gradient-to-br from-surface-800 via-surface-900 to-surface-950 text-white overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top right, rgba(249,115,22,0.15), transparent 50%)' }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">Contact Us</h1>
          <p className="text-surface-300 mt-3 text-sm sm:text-base max-w-2xl mx-auto">
            Get in touch with the {APP} team. We're here to help.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <a
            href={`mailto:${CONTACT_INFO.email}`}
            className="bg-white rounded-2xl border border-surface-200 p-6 hover:border-accent-300 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 bg-accent-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-accent-100 transition-colors">
              <Mail className="w-5 h-5 text-accent-500" />
            </div>
            <h3 className="text-sm font-semibold text-surface-800 mb-1">Email</h3>
            <p className="text-xs text-surface-400 break-all">{CONTACT_INFO.email}</p>
            <p className="text-xs text-accent-500 mt-2 font-medium">Send an email &rarr;</p>
          </a>

          <a
            href={`tel:${CONTACT_INFO.phoneRaw}`}
            className="bg-white rounded-2xl border border-surface-200 p-6 hover:border-accent-300 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 bg-accent-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-accent-100 transition-colors">
              <Phone className="w-5 h-5 text-accent-500" />
            </div>
            <h3 className="text-sm font-semibold text-surface-800 mb-1">Phone</h3>
            <p className="text-xs text-surface-400">{CONTACT_INFO.phone}</p>
            <p className="text-xs text-accent-500 mt-2 font-medium">Call now &rarr;</p>
          </a>

          <a
            href={`https://www.google.com/maps/search/${encodeURIComponent(CONTACT_INFO.address + ' ' + CONTACT_INFO.pin)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white rounded-2xl border border-surface-200 p-6 hover:border-accent-300 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 bg-accent-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-accent-100 transition-colors">
              <MapPin className="w-5 h-5 text-accent-500" />
            </div>
            <h3 className="text-sm font-semibold text-surface-800 mb-1">Address</h3>
            <p className="text-xs text-surface-400 leading-relaxed">{CONTACT_INFO.address}</p>
            <p className="text-xs text-surface-400 mt-1">PIN: {CONTACT_INFO.pin}</p>
            <p className="text-xs text-accent-500 mt-2 font-medium">View on map &rarr;</p>
          </a>
        </div>

        <div className="mt-10 bg-white rounded-2xl border border-surface-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-surface-800 mb-2">Office Hours</h2>
          <div className="flex items-center gap-2 text-sm text-surface-500 mb-4">
            <Clock className="w-4 h-4" />
            <span>Monday – Saturday, 9:00 AM – 6:00 PM IST</span>
          </div>
          <p className="text-xs text-surface-400 leading-relaxed">
            For urgent inquiries outside business hours, please email us and we will respond as soon as possible.
          </p>
        </div>

        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <Globe className="w-4 h-4" />
            <a
              href={`https://${CONTACT_INFO.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-500 hover:text-accent-600 font-medium transition-colors"
            >
              {CONTACT_INFO.website}
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-surface-200 py-6 text-center text-xs text-surface-400">
        <p>{APP} &copy; {new Date().getFullYear()} &mdash; kuldeep7ke</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link to="/about" className="hover:text-surface-600 transition-colors">About</Link>
          <Link to="/faq" className="hover:text-surface-600 transition-colors">FAQ</Link>
          <Link to="/terms" className="hover:text-surface-600 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-surface-600 transition-colors">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
