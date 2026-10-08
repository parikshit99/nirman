import { createContext, useContext, useState, type ReactNode } from 'react';
import { hasUnseenNotes, markNotesSeen, prefs } from '@nirman/core';
import { FROM_6X_PREF } from '../data/startup';
import { latestNotes } from '../lib/changelog';
import { useAppState } from '../state/AppState';
import { SettingsSheet } from './SettingsSheet';
import { WhatsNewSheet } from './WhatsNewSheet';

const ONBOARDED_PREF = 'nirmaan_onboarded';

const SettingsContext = createContext<{ open(): void } | null>(null);

/**
 * Settings for every tab (`useSettings().open()`, from the ⋮ menu and the status chip), and what shows once at start:
 * the welcome on a new install, the key screen after the update from 6.x, and What's new after an update.
 */
export function SettingsHost({ children }: { children: ReactNode }) {
  const { settings, snapshot } = useAppState();
  const [firstRun, setFirstRun] = useState<'welcome' | 'key-again' | undefined>(() => {
    if (settings.geminiApiKey || prefs.get(ONBOARDED_PREF, false)) return undefined;
    if (prefs.get(FROM_6X_PREF, false)) return 'key-again';
    // A phone with data has used the app before: no welcome (the old app's preferences don't carry over).
    return snapshot.items.length || snapshot.lists.some((l) => l.status === 'saved') || snapshot.contracts.length ? undefined : 'welcome';
  });
  const [open, setOpen] = useState(!!firstRun);
  // After an update, show what's new once (after the key screen); a new install has nothing to compare with.
  const [whatsNew, setWhatsNew] = useState(() => {
    if (firstRun === 'welcome') {
      markNotesSeen(latestNotes);
      return false;
    }
    return hasUnseenNotes(latestNotes);
  });
  const close = () => {
    if (firstRun) prefs.set(ONBOARDED_PREF, true);
    setFirstRun(undefined);
    setOpen(false);
  };
  const closeWhatsNew = () => {
    markNotesSeen(latestNotes);
    setWhatsNew(false);
  };
  return (
    <SettingsContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {open && <SettingsSheet firstRun={firstRun} onClose={close} onWhatsNew={() => setWhatsNew(true)} />}
      {whatsNew && !firstRun && latestNotes && <WhatsNewSheet notes={latestNotes} onClose={closeWhatsNew} />}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsHost');
  return ctx;
}
