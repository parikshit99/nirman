import { logError } from '../lib/diagnostics.ts';

/**
 * Deletes that wait so they can be undone: `add` runs `commit` after `delayMs` unless `undo` comes first. A waiting
 * delete holds only an id, so it must not outlive the data it was made for: `flush` carries them out now (before a
 * backup, or when the app may be closed), `cancelAll` forgets them (a restore replaced the data they were for).
 */
export function createPendingDeletes(delayMs: number, onChange: (ids: ReadonlySet<string>) => void) {
  const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> }>();
  const changed = () => onChange(new Set(waiting.keys()));

  /** Take one out of the queue; returns its commit, if it was waiting. */
  const take = (id: string) => {
    const entry = waiting.get(id);
    if (!entry) return null;
    clearTimeout(entry.timer);
    waiting.delete(id);
    changed();
    return entry.commit;
  };

  const finish = async (id: string) => {
    const commit = take(id);
    if (commit) await commit();
  };

  return {
    add(id: string, commit: () => Promise<void>) {
      if (waiting.has(id)) return;
      waiting.set(id, { timer: setTimeout(() => void finish(id).catch((err) => logError(err, 'delete after undo')), delayMs), commit });
      changed();
    },
    undo(id: string) {
      take(id);
    },
    /** Carry out every waiting delete now. */
    flush: (): Promise<void> => Promise.all([...waiting.keys()].map(finish)).then(() => undefined),
    cancelAll() {
      if (!waiting.size) return;
      for (const { timer } of waiting.values()) clearTimeout(timer);
      waiting.clear();
      changed();
    },
  };
}
