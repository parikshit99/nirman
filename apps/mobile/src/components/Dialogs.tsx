import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from './ui/Button.tsx';
import { Sheet } from './ui/Sheet.tsx';
import { haptic } from '../lib/haptics.ts';

interface DialogRequest {
  kind: 'alert' | 'confirm' | 'prompt';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  defaultValue?: string;
  resolve: (value: boolean | string | null) => void;
}

export interface Dialogs {
  alert(title: string, message?: string): Promise<void>;
  confirm(title: string, opts?: { message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>;
  prompt(title: string, defaultValue?: string): Promise<string | null>;
  /** A short note that something worked, which fades by itself (nothing to choose). */
  toast(message: string): void;
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
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);
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
    toast: (message) => {
      haptic('confirm');
      setToast({ id: Date.now(), message });
    },
  }).current;

  const close = (value: boolean | string | null) => {
    current?.resolve(value);
    setQueue((q) => q.slice(1));
  };
  // Back and tapping outside cancel the dialog.
  const dismiss = () => current && close(current.kind === 'alert' ? true : current.kind === 'confirm' ? false : null);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {current && (
          <Sheet key="dialog" kind="dialog" size="sm" layer="top" closeOnBackdrop onClose={dismiss} labelledBy="dialog-title" className="p-6 space-y-4">
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
                <Button variant="secondary" className="flex-1" onClick={dismiss}>
                  {current.cancelLabel ?? 'Cancel'}
                </Button>
              )}
              <Button
                autoFocus={current.kind !== 'prompt'}
                variant={current.danger ? 'danger' : 'primary'}
                className="flex-1"
                onClick={() => close(current.kind === 'prompt' ? input : true)}
              >
                {current.confirmLabel ?? 'OK'}
              </Button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
      {/* Above the phone's bottom tab bar; polite, so a screen reader reads it without interrupting. */}
      <div aria-live="polite" className="fixed inset-x-0 z-[110] flex justify-center px-4 pointer-events-none bottom-[calc(5.5rem+var(--inset-bottom))] lg:bottom-6">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-sm px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold shadow-lg"
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DialogContext.Provider>
  );
}
