import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { logStep, type ListKind } from '@nirman/core';
import Nirman, { type Launch } from '../../modules/nirman-native';
import { anySheetShown } from '../components/ui/Sheet';
import { goToTab, type TabName } from '../navigation';

/** Where each way of opening the app from outside goes: the tab, and the list whose entry form opens on it. */
const TARGETS: Record<Launch, { tab: TabName; add?: ListKind }> = {
  bill: { tab: 'Purchases', add: 'audit' },
  boq: { tab: 'BOQ', add: 'boq' },
  purchases: { tab: 'Purchases' },
};

const LaunchContext = createContext<{ addFor: { kind: ListKind; id: number } | null; used(): void } | null>(null);

let nextId = 1;

/**
 * The app opened from outside it, e.g. the app shortcuts "New bill" and "New BOQ" (long press on the app icon) or the
 * home screen widget: goes to that tab of the open project and opens its entry form (`useLaunchAdd`) if it asked for one. If a sheet, dialog or screen is showing
 * (one being filled in, the welcome), the app only comes to the front and it stays as it is.
 */
export function LaunchHost({ children }: { children: ReactNode }) {
  const [addFor, setAddFor] = useState<{ kind: ListKind; id: number } | null>(null);

  useEffect(() => {
    const take = () => {
      const launch = Nirman.takeLaunch();
      const target = launch && TARGETS[launch];
      if (!target) return;
      const shown = anySheetShown();
      logStep('opened from outside', { to: launch, sheetShown: shown });
      if (shown) return;
      goToTab(target.tab);
      if (target.add) setAddFor({ kind: target.add, id: nextId++ });
    };
    // The shortcut that started the app, then any used while it is open.
    take();
    const sub = Nirman.addListener('launch', take);
    return () => sub.remove();
  }, []);

  const used = useCallback(() => setAddFor(null), []);
  return <LaunchContext.Provider value={{ addFor, used }}>{children}</LaunchContext.Provider>;
}

/** A request to open this tab's entry form (a number, new each time), if any, and a call to say it has opened. */
export function useLaunchAdd(kind: ListKind): { request: number | null; used(): void } {
  const ctx = useContext(LaunchContext);
  return { request: ctx?.addFor?.kind === kind ? ctx.addFor.id : null, used: ctx?.used ?? (() => {}) };
}

/** While the app can't start (StartProblem), a shortcut only brings it to the front: what it asked for is dropped. */
export function useDropLaunches(active: boolean) {
  useEffect(() => {
    if (!active) return;
    Nirman.takeLaunch();
    const sub = Nirman.addListener('launch', () => Nirman.takeLaunch());
    return () => sub.remove();
  }, [active]);
}
