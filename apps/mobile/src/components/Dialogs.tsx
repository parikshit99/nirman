import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Info } from 'lucide-react';
import { useBackHandler } from '../lib/backButton.ts';

interface DialogRequest {
  kind: 'alert' | 'confirm' | 'prompt';
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  defaultValue?: string;
  resolve: (value: boolean | string | null) => void;
}

export interface Dialogs {
  alert(title: string, message?: string): Promise<void>;
  confirm(title: string, opts?: { message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>;
  prompt(title: string, defaultValue?: string): Promise<string | null>;
}

const DialogContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs outside DialogProvider');
  return ctx;
}

/** In-app replacements for window.alert/confirm/prompt, which don't suit the Android WebView. */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [input, setInput] = useState('');
  const current = queue[0];

  useEffect(() => setInput(current?.defaultValue ?? ''), [current]);

  const open = useCallback((req: Omit<DialogRequest, 'resolve'>) => {
    return new Promise<boolean | string | null>((resolve) => {
      setQueue((q) => [...q, { ...req, resolve }]);
    });
  }, []);

  const api = useRef<Dialogs>({
    alert: async (title, message) => {
      await open({ kind: 'alert', title, message });
    },
    confirm: async (title, opts = {}) => (await open({ kind: 'confirm', title, ...opts })) === true,
    prompt: async (title, defaultValue = '') => (await open({ kind: 'prompt', title, defaultValue })) as string | null,
  }).current;

  const close = (value: boolean | string | null) => {
    current?.resolve(value);
    setQueue((q) => q.slice(1));
  };
  // Back cancels the dialog, like tapping outside it.
  useBackHandler(() => current && close(current.kind === 'alert' ? true : current.kind === 'confirm' ? false : null), !!current);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {current && (
          <motion.div
            key="dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => close(current.kind === 'alert' ? true : current.kind === 'confirm' ? false : null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dialog-title"
              className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className={`shrink-0 mt-0.5 ${current.danger ? 'text-red-500' : 'text-orange-500'}`}>
                  {current.danger ? <AlertTriangle size={20} /> : <Info size={20} />}
                </div>
                <div className="min-w-0">
                  <h3 id="dialog-title" className="font-bold text-sm text-gray-900">{current.title}</h3>
                  {current.message && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line leading-relaxed">{current.message}</p>}
                </div>
              </div>
              {current.kind === 'prompt' && (
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && close(input)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                />
              )}
              <div className="flex gap-3 pt-2">
                {current.kind !== 'alert' && (
                  <button
                    onClick={() => close(current.kind === 'confirm' ? false : null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[11px] hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                )}
                <button
                  autoFocus={current.kind !== 'prompt'}
                  onClick={() => close(current.kind === 'prompt' ? input : true)}
                  className={`flex-1 py-3 text-white font-bold rounded-xl uppercase tracking-widest text-[11px] ${current.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-gray-800'}`}
                >
                  {current.confirmLabel ?? 'OK'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}
