export interface TpCustomScript {
  id: string;
  title: string;
  text: string;
  created_at: string;
}

const KEY = 'tp_custom_scripts';

export function listCustomScripts(): TpCustomScript[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function getCustomScript(id: string): TpCustomScript | undefined {
  return listCustomScripts().find((s) => s.id === id);
}

export function saveCustomScript(title: string, text: string): TpCustomScript {
  const script: TpCustomScript = {
    id: `custom-${Date.now()}`,
    title: title.trim() || 'Custom Script',
    text,
    created_at: new Date().toISOString(),
  };
  const all = listCustomScripts();
  all.unshift(script);
  // Keep the most recent 50; custom scripts are device-local by design.
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
  return script;
}

export function deleteCustomScript(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(listCustomScripts().filter((s) => s.id !== id)));
}
