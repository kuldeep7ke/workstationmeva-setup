const STORAGE_KEY = 'saved_logins';
const HISTORY_KEY = 'session_history';

export interface SavedLogin {
  email: string;
  full_name: string;
  password: string;
  pin: string;
  lastLogin: string;
  access_level?: number;
  role?: string;
}

export interface SessionRecord {
  email: string;
  full_name: string;
  duration: string;
  durationSec: number;
  timestamp: string;
}

export function getSavedLogins(): SavedLogin[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveLogin(email: string, full_name: string, password: string, pin?: string, accessLevel?: number, role?: string) {
  if (accessLevel === 1) return;
  const list = getSavedLogins().filter(l => l.email !== email);
  const existing = getSavedLogins().find(l => l.email === email);
  list.unshift({ email, full_name, password, pin: pin || existing?.pin || '', lastLogin: new Date().toISOString(), access_level: accessLevel, role: role || existing?.role });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
}

export function updatePin(email: string, pin: string) {
  const list = getSavedLogins();
  const entry = list.find(l => l.email === email);
  if (entry) {
    entry.pin = pin;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

export function updateSavedLogin(email: string, updates: Partial<Pick<SavedLogin, 'password' | 'pin' | 'full_name'>>) {
  const list = getSavedLogins();
  const entry = list.find(l => l.email === email);
  if (entry) {
    Object.assign(entry, updates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

export function removeLogin(email: string) {
  const list = getSavedLogins().filter(l => l.email !== email);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function clearAllLogins() {
  localStorage.removeItem(STORAGE_KEY);
}

export function clearSessionHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function getSessionHistory(): SessionRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

export function addSessionHistory(record: SessionRecord) {
  const list = getSessionHistory();
  list.unshift(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
}
