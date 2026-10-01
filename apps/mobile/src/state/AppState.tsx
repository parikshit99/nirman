import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildItemDatabase, type ExtractedMaterial, type ItemRow, type ListRow, type MaterialEntry } from '@nirman/shared';
import { exportBackup, parseBackup, restoreBackup } from '../data/backup.ts';
import * as repo from '../data/repo.ts';
import { DRAFT_IDS, type Job, type ListKind, type Snapshot } from '../data/repo.ts';
import type { Db } from '../data/sql.ts';
import type { JobWorker, WorkerStatus } from '../jobs/worker.ts';
import { settingsStore, type Settings } from '../lib/settings.ts';

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

  useEffect(() => onDataChanged(() => void refresh()), [onDataChanged, refresh]);
  useEffect(() => worker.subscribe(() => setStatus(worker.status)), [worker]);

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
      updateItem: write(repo.updateItem),
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
      clearLearning: write(repo.clearLearning),
      indexRates: write(repo.indexRates),
      deleteIndexedRate: write(repo.deleteIndexedRate),
      addCategory: write(repo.addCategory),
      deleteCategory: write(repo.deleteCategory),
      deleteJob: write(repo.deleteJob),
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
    [db, worker, settingsRef, refresh, write],
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
    const itemDatabase: MaterialEntry[] = buildItemDatabase(snapshot.lists, snapshot.items, snapshot.rates, learning);
    return {
      itemsFor: (kind: ListKind) => byList.get(DRAFT_IDS[kind]) ?? [],
      boqNotes: draftList('boq')?.notes ?? '',
      history,
      itemDatabase,
      learningCount: snapshot.learned.length,
      categoryNames: snapshot.categories.map((c) => c.name),
      uniqueAddresses: [...new Set(history.map((h) => h.address).filter(Boolean))],
      jobsFor: (kind: ListKind) => snapshot.jobs.filter((j) => j.list_id === DRAFT_IDS[kind]),
    };
  }, [snapshot]);

  return { snapshot, status, settings, actions, ...derived };
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
