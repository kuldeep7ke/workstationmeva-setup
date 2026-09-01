import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: ReactNode | string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface AlertOptions {
  title: string;
  message: ReactNode | string;
  okLabel?: string;
}

interface ChooseOption {
  key: string;
  label: string;
  danger?: boolean;
}

interface ChooseOptions {
  title: string;
  message: ReactNode | string;
  options: ChooseOption[];
  cancelLabel?: string;
}

interface DialogContextType {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
  choose: (opts: ChooseOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

interface DialogState {
  type: 'confirm' | 'alert' | 'choose';
  opts: {
    title: string;
    message: ReactNode | string;
    confirmLabel?: string;
    cancelLabel?: string;
    okLabel?: string;
    danger?: boolean;
    options?: ChooseOption[];
  };
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolverQueueRef = useRef<Array<(value: boolean | string | null) => void>>([]);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverQueueRef.current.push((value) => resolve(typeof value === 'boolean' ? value : false));
      setState({ type: 'confirm', opts });
    });
  }, []);

  const alert = useCallback((opts: AlertOptions) => {
    return new Promise<void>((resolve) => {
      resolverQueueRef.current.push(() => resolve());
      setState({ type: 'alert', opts });
    });
  }, []);

  const choose = useCallback((opts: ChooseOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverQueueRef.current.push((value) => resolve(typeof value === 'string' ? value : null));
      setState({ type: 'choose', opts });
    });
  }, []);

  const close = (result: boolean | string | null) => {
    setState(null);
    const r = resolverQueueRef.current.shift();
    if (r) r(result);
  };

  const isDanger = state
    ? (state.type === 'confirm' && state.opts.danger) ||
      (state.type === 'choose' && state.opts.options?.some((o) => o.danger))
    : false;

  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleIdRef = useRef('dialog-title');
  useEffect(() => {
    if (!state) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <DialogContext.Provider value={{ confirm, alert, choose }}>
      {children}
      {state && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => close(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-labelledby={titleIdRef.current}
              className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-sm shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDanger ? 'bg-danger-100' : 'bg-accent-100'}`}>
                  {isDanger
                    ? <AlertTriangle className="w-5 h-5 text-danger-600" />
                    : <Info className="w-5 h-5 text-accent-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id={titleIdRef.current} className="text-sm font-semibold text-surface-800">{state.opts.title}</h3>
                  <div className="text-xs text-surface-500 mt-1 leading-relaxed">{state.opts.message}</div>
                </div>
                <button onClick={() => close(false)} aria-label="Close dialog" className="p-1 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {state.type === 'choose' && (
                <div className="flex flex-col gap-2 mt-5">
                  {(state.opts.options || []).map((opt, i) => (
                    <button key={opt.key} ref={i === 0 ? primaryRef : undefined} onClick={() => close(opt.key)}
                      className={`text-sm w-full ${opt.danger ? 'flat-btn-danger' : 'flat-btn-accent'}`}>
                      {opt.label}
                    </button>
                  ))}
                  <button onClick={() => close(null)} className="flat-btn-surface text-sm w-full mt-1">
                    {state.opts.cancelLabel || 'Cancel'}
                  </button>
                </div>
              )}
              {state.type !== 'choose' && (
                <div className="flex gap-3 justify-end mt-5">
                  {state.type === 'confirm' && (
                    <button onClick={() => close(false)} className="flat-btn-surface text-sm">
                      {state.opts.cancelLabel || 'Cancel'}
                    </button>
                  )}
                  <button ref={primaryRef} onClick={() => close(true)} className={`text-sm ${state.opts.danger ? 'flat-btn-danger' : 'flat-btn-accent'}`}>
                    {state.type === 'confirm' ? (state.opts.confirmLabel || 'Confirm') : (state.opts.okLabel || 'OK')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
