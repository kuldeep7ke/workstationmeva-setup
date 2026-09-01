const APP_NAME_KEY = 'app_name';
const DEFAULT_NAME = 'Workstation Meva';
const APP_NAME_EVENT = 'app-name-changed';

export function getAppName(): string {
  try {
    const saved = localStorage.getItem(APP_NAME_KEY);
    if (!saved || saved === 'Workstation Meva' || saved === 'Workstation Tracker') {
      if (saved) localStorage.setItem(APP_NAME_KEY, DEFAULT_NAME);
      return DEFAULT_NAME;
    }
    return saved;
  } catch { return DEFAULT_NAME; }
}

export function setAppName(name: string): void {
  localStorage.setItem(APP_NAME_KEY, name);
  document.title = name;
  window.dispatchEvent(new CustomEvent(APP_NAME_EVENT, { detail: { name } }));
}

export function onAppNameChange(callback: (name: string) => void): () => void {
  const handler = (e: Event) => callback((e as CustomEvent).detail.name);
  window.addEventListener(APP_NAME_EVENT, handler);
  return () => window.removeEventListener(APP_NAME_EVENT, handler);
}

const CHANNEL_DISPLAY_EVENT = 'channel-display-changed';
const CHANNEL_DISPLAY_KEY = 'channel_display_name';

export function getChannelDisplayName(): string {
  try { return localStorage.getItem(CHANNEL_DISPLAY_KEY) || ''; } catch { return ''; }
}

export function setChannelDisplayCache(name: string): void {
  try {
    if (name) localStorage.setItem(CHANNEL_DISPLAY_KEY, name);
    else localStorage.removeItem(CHANNEL_DISPLAY_KEY);
  } catch {}
}

export function dispatchChannelDisplay(name: string): void {
  setChannelDisplayCache(name);
  window.dispatchEvent(new CustomEvent(CHANNEL_DISPLAY_EVENT, { detail: { name } }));
}

export function onChannelDisplayChange(callback: (name: string) => void): () => void {
  const handler = (e: Event) => callback((e as CustomEvent).detail.name);
  window.addEventListener(CHANNEL_DISPLAY_EVENT, handler);
  return () => window.removeEventListener(CHANNEL_DISPLAY_EVENT, handler);
}
