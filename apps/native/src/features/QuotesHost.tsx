import { createContext, useContext, useState, type ReactNode } from 'react';
import { BoqPicker } from './BoqPicker';
import type { IncomingShare } from './CapturePanel';
import { QuotesView } from './QuotesView';

const QuotesContext = createContext<{ pick(share?: IncomingShare): void; open(boqId: string): void } | null>(null);

/** The vendor quotes screens for every tab: `useQuotes().pick()` to choose the BOQ first, `open(id)` for one BOQ. */
export function QuotesHost({ children }: { children: ReactNode }) {
  /** A saved BOQ's id, or 'pick' to choose the BOQ first. */
  const [target, setTarget] = useState<string | null>(null);
  const [share, setShare] = useState<IncomingShare | undefined>(undefined);
  const close = () => {
    setTarget(null);
    setShare(undefined);
  };
  return (
    <QuotesContext.Provider
      value={{
        pick: (s) => {
          setShare(s);
          setTarget('pick');
        },
        open: setTarget,
      }}
    >
      {children}
      {target === 'pick' && <BoqPicker onPick={setTarget} onClose={close} />}
      {target && target !== 'pick' && <QuotesView boqId={target} initial={share} onClose={close} />}
    </QuotesContext.Provider>
  );
}

export function useQuotes() {
  const ctx = useContext(QuotesContext);
  if (!ctx) throw new Error('useQuotes outside QuotesHost');
  return ctx;
}
