import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildItemDatabase,
  type ExtractedMaterial,
  type ItemRow,
  type ListRow,
  type MaterialEntry,
  type QuoteLineRow,
  type QuoteRow,
} from '@nirman/shared';
import { exportBackup, parseBackup, restoreBackup } from '../data/backup.ts';
import * as repo from '../data/repo.ts';
import { DRAFT_IDS, type Job, type ListKind, type Snapshot } from '../data/repo.ts';
import type { Db } from '../data/sql.ts';
import type { JobWorker, WorkerStatus } from '../jobs/worker.ts';
import { settingsStore, type Settings } from '../lib/settings.ts';

/** How long a deleted row can be undone. */
export const UNDO_MS = 10_000;

export interface HistoryRecord extends ListRow {
  items: ItemRow[];
}

export interface Services {
  db: Db;
  worker: JobWorker;
  /** Current settings; the worker reads the key from here. */
  settings: { current: Settings };
  /** Fires when the worker changed stored data (queue or items). */
  onDataChanged(fn: () => void): () => void;
}

function useAppStateValue({ db, worker, settings: settingsRef, onDataChanged }: Services, initial: Snapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [status, setStatus] = useState<WorkerStatus>(worker.status);
  const [settings, setSettings] = useState<Settings>(settingsRef.current);

  const refresh = useCallback(async () => setSnapshot(await repo.loadSnapshot(db)), [db]);

  // Deletes wait UNDO_MS so they can be undone; meanwhile the row shows struck through.
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> }>());
  const [pendingDeletes, setPendingDeletes] = useState<ReadonlySet<string>>(new Set());
  const syncPending = useCallback(() => setPendingDeletes(new Set(pending.current.keys())), []);
  const finishDelete = useCallback(
    async (id: string) => {
      const entry = pending.current.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.current.delete(id);
      syncPending();
      await entry.commit();
      await refresh();
    },
    [refresh, syncPending],
  );
  const deleteLater = useCallback(
    (commit: (db: Db, id: string) => Promise<void>) => (id: string) => {
      if (pending.current.has(id)) return;
      const timer = setTimeout(() => void finishDelete(id), UNDO_MS);
      pending.current.set(id, { timer, commit: () => commit(db, id) });
      syncPending();
    },
    [db, finishDelete, syncPending],
  );

  useEffect(() => onDataChanged(() => void refresh()), [onDataChanged, refresh]);
  useEffect(
    () =>
      worker.subscribe(() => {
        setStatus(worker.status);
        // The worker may have switched to a replacement model during a run.
        setSettings((prev) => (prev === settingsRef.current ? prev : settingsRef.current));
      }),
    [worker, settingsRef],
  );

  /** Wrap a repository write so the UI refreshes afterwards. */
  const write = useCallback(
    <A extends unknown[], R>(fn: (db: Db, ...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        const result = await fn(db, ...args);
        await refresh();
        return result;
      },
    [db, refresh],
  );

  const actions = useMemo(
    () => ({
      addItems: write(repo.addItems),
      createManualQuote: write(repo.createManualQuote),
      updateItem: write(repo.updateItem),
      setDelivered: write(repo.setDelivered),
      deleteItem: write(repo.deleteItem),
      clearListItems: write(repo.clearListItems),
      setListNotes: write(repo.setListNotes),
      saveDraftToHistory: write(repo.saveDraftToHistory),
      updateListMeta: write(repo.updateListMeta),
      renameList: write(repo.renameList),
      deleteList: write(repo.deleteList),
      deleteAllHistory: write(repo.deleteAllHistory),
      restoreToDraft: write(repo.restoreToDraft),
      bulkEditMaterials: write(repo.bulkEditMaterials),
      renameMaterial: write(repo.renameMaterial),
      hideMaterial: write(repo.hideMaterial),
      hideMaterials: write(repo.hideMaterials),
      /** Delete from Data after the undo window; the card shows struck through until then. */
      deleteMaterialLater: (m: repo.MaterialRef) => deleteLater((d) => repo.hideMaterial(d, m))(m.key),
      unhideMaterial: write(repo.unhideMaterial),
      setPrice: write(repo.setPrice),
      clearLearning: write(repo.clearLearning),
      updateLearnedTerm: write(repo.updateLearnedTerm),
      deleteLearnedTerm: write(repo.deleteLearnedTerm),
      indexRates: write(repo.indexRates),
      deleteIndexedRate: write(repo.deleteIndexedRate),
      addCategory: write(repo.addCategory),
      deleteCategory: write(repo.deleteCategory),
      deleteJob: write(repo.deleteJob),
      /** Strike through now, delete after UNDO_MS unless undone (or sooner via flushDeletes). */
      deleteItemLater: deleteLater(repo.deleteItem),
      deleteQuoteLineLater: deleteLater(repo.deleteQuoteLine),
      deleteIndexedRateLater: deleteLater(repo.deleteIndexedRate),
      undoDelete(id: string) {
        const entry = pending.current.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.current.delete(id);
        syncPending();
      },
      /** Carry out waiting deletes now, e.g. before saving, exporting or leaving a screen. */
      flushDeletes: () => Promise.all([...pending.current.keys()].map(finishDelete)).then(() => undefined),
      updateQuote: write(repo.updateQuote),
      updateQuoteLine: write(repo.updateQuoteLine),
      deleteQuoteLine: write(repo.deleteQuoteLine),
      deleteQuote: write(repo.deleteQuote),
      confirmQuote: write(repo.confirmQuote),
      /** Queue a vendor quote for reading against its BOQ and try right away. */
      async enqueueQuote(quote: repo.NewQuote) {
        const id = await repo.enqueueQuote(db, quote);
        await refresh();
        worker.schedule();
        return id;
      },
      /** Queue text/photos for AI extraction and try to process right away. */
      async enqueueJob(job: repo.NewJob) {
        await repo.enqueueJob(db, job);
        await refresh();
        worker.schedule();
      },
      async retryJob(job: Job) {
        await repo.setJobStatus(db, job.id, 'pending');
        await refresh();
        worker.schedule();
      },
      processQueue: () => worker.schedule(),
      async saveSettings(next: Settings) {
        await settingsStore.save(next);
        settingsRef.current = next;
        setSettings(next);
        worker.schedule();
      },
      exportBackup: () => exportBackup(db),
      parseBackup,
      async restoreBackup(backup: Parameters<typeof restoreBackup>[1]) {
        await restoreBackup(db, backup);
        await refresh();
      },
    }),
    [db, worker, settingsRef, refresh, write, deleteLater, finishDelete, syncPending],
  );

  const derived = useMemo(() => {
    const byList = new Map<string, ItemRow[]>();
    for (const item of snapshot.items) {
      const list = byList.get(item.list_id);
      if (list) list.push(item);
      else byList.set(item.list_id, [item]);
    }
    const draftList = (kind: ListKind) => snapshot.lists.find((l) => l.id === DRAFT_IDS[kind]);
    const history: HistoryRecord[] = snapshot.lists
      .filter((l) => l.status === 'saved')
      .map((l) => ({ ...l, items: byList.get(l.id) ?? [] }));
    const learning = repo.learningMap(snapshot.learned);
    // Materials deleted from Data leave out everything recorded up to then, in the Data tab and in every price check.
    const deleted = Object.fromEntries(snapshot.hidden.map((h) => [h.id, h.hidden_at]));
    const itemDatabase: MaterialEntry[] = buildItemDatabase(snapshot.lists, snapshot.items, snapshot.rates, learning, deleted);
    const linesByQuote = new Map<string, QuoteLineRow[]>();
    for (const line of snapshot.quoteLines) {
      const list = linesByQuote.get(line.quote_id);
      if (list) list.push(line);
      else linesByQuote.set(line.quote_id, [line]);
    }
    return {
      itemsFor: (kind: ListKind) => byList.get(DRAFT_IDS[kind]) ?? [],
      learning,
      savedBoqs: history.filter((h) => h.kind === 'boq'),
      quotesFor: (boqId: string): QuoteRow[] => snapshot.quotes.filter((q) => q.boq_id === boqId),
      linesFor: (quoteId: string): QuoteLineRow[] => linesByQuote.get(quoteId) ?? [],
      jobForQuote: (quoteId: string): Job | undefined => snapshot.jobs.find((j) => j.quote_id === quoteId),
      knownVendors: [...new Set([...snapshot.quotes.map((q) => q.vendor), ...itemDatabase.flatMap((e) => e.vendors)].filter(Boolean))].sort(),
      boqNotes: draftList('boq')?.notes ?? '',
      history,
      itemDatabase,
      learningCount: snapshot.learned.length,
      hiddenMaterials: snapshot.hidden,
      categoryNames: snapshot.categories.map((c) => c.name),
      uniqueAddresses: [...new Set(history.map((h) => h.address).filter(Boolean))],
      jobsFor: (kind: ListKind) => snapshot.jobs.filter((j) => j.list_id === DRAFT_IDS[kind]),
    };
  }, [snapshot]);

  return { snapshot, status, settings, actions, pendingDeletes, ...derived };
}

export type AppState = ReturnType<typeof useAppStateValue>;
export type Actions = AppState['actions'];
export type { ExtractedMaterial };

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ services, initial, children }: { services: Services; initial: Snapshot; children: React.ReactNode }) {
  const value = useAppStateValue(services, initial);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState outside AppStateProvider');
  return ctx;
}
