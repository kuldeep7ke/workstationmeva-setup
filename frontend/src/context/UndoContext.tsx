import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';

interface UndoItem {
  id: number;
  message: string;
  undo: () => void;
  remaining: number;
  total: number;
}

interface UndoContextType {
  showUndo: (message: string, undoFn: () => void, timeoutMs?: number) => void;
}

const UndoContext = createContext<UndoContextType | undefined>(undefined);

let nextId = 0;

export function UndoProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UndoItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearInterval(timer); timersRef.current.delete(id); }
  }, []);

  const showUndo = useCallback((message: string, undoFn: () => void, timeoutMs = 7000) => {
    const id = ++nextId;
    const step = 100;
    const total = timeoutMs;
    let elapsed = 0;

    setItems((prev) => [...prev, { id, message, undo: undoFn, remaining: total, total }]);

    const timer = setInterval(() => {
      elapsed += step;
      const remaining = Math.max(0, total - elapsed);
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, remaining } : i));
      if (remaining <= 0) {
        clearInterval(timer);
        timersRef.current.delete(id);
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    }, step);
    timersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearInterval(timer));
      timersRef.current.clear();
    };
  }, []);

  return (
    <UndoContext.Provider value={{ showUndo }}>
      {children}
      {items.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 max-w-lg w-full px-4">
          {items.map((item) => (
            <div key={item.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-surface-200 bg-white shadow-lg animate-slide-up">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-800">{item.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-500 rounded-full transition-all duration-100"
                      style={{ width: `${(item.remaining / item.total) * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-surface-400 tabular-nums">{(item.remaining / 1000).toFixed(1)}s</span>
                </div>
              </div>
              <button onClick={() => { item.undo(); removeItem(item.id); }}
                className="flat-btn-accent text-xs shrink-0 px-3 py-1.5">
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
              <button onClick={() => removeItem(item.id)} className="p-1 text-surface-400 hover:text-surface-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo must be used within UndoProvider');
  return ctx;
}
