import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildItemDatabase, type ExtractedMaterial, type ItemRow, type ListRow, type MaterialEntry } from '@nirman/shared';
import * as repo from '../data/repo.ts';
import { DRAFT_IDS, type Job, type ListKind, type ListMeta, type Snapshot } from '../data/repo.ts';
import type { Db } from '../data/sql.ts';
import type { ApiClient } from '../lib/api.ts';
import type { Session } from '../lib/session.ts';
import type { SyncEngine, SyncStatus } from '../sync/engine.ts';

export interface HistoryRecord extends ListRow {
  items: ItemRow[];
}

export interface Services {
  db: Db;
  api: ApiClient;
  engine: SyncEngine;
  /** Fires when sync changed local data. */
  onDataChanged(fn: () => void): () => void;
}

/** Wait this long after a local edit before syncing, so bursts of edits go in one push. */
const SYNC_AFTER_EDIT_MS = 2_000;

function useAppStateValue({ db, api, engine, onDataChanged }: Services, initial: Snapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [sync, setSync] = useState<SyncStatus>(engine.status);
  const [session, setSession] = useState<Session | null>(api.current);

  const refresh = useCallback(async () => setSnapshot(await repo.loadSnapshot(db)), [db]);

  useEffect(() => onDataChanged(() => void refresh()), [onDataChanged, refresh]);
  useEffect(() => engine.subscribe(() => setSync(engine.status)), [engine]);
  useEffect(() => api.onSessionChange(setSession), [api]);

  /** Wrap a repository write: refresh the UI and schedule a sync. */
  const write = useCallback(
    <A extends unknown[], R>(fn: (db: Db, ...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        const result = await fn(db, ...args);
        await refresh();
        engine.requestSync(SYNC_AFTER_EDIT_MS);
        return result;
      },
    [db, engine, refresh],
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
        engine.requestSync();
      },
      async retryJob(job: Job) {
        await repo.setJobStatus(db, job.id, 'pending');
        await refresh();
        engine.requestSync();
      },
      syncNow: () => engine.requestSync(),
    }),
    [db, engine, refresh, write],
  );

  /**
   * Sign in. Data already on the phone is kept and uploaded, unless it belongs
   * to a different account: then `confirmWipe` decides whether to erase it.
   */
  const signIn = useCallback(
    async (
      mode: 'login' | 'register',
      serverUrl: string,
      email: string,
      password: string,
      confirmWipe: (otherEmail: string) => Promise<boolean>,
    ): Promise<boolean> => {
      const next = await api.requestSession(mode, serverUrl, email, password);
      const owner = await repo.getMeta(db, 'owner_user_id');
      if (owner && owner !== next.user.id) {
        const ownerEmail = (await repo.getMeta(db, 'owner_email')) ?? 'another account';
        if (!(await confirmWipe(ownerEmail))) {
          await api.revoke(next);
          return false;
        }
        await repo.wipeLocalData(db);
      }
      await repo.setMeta(db, 'owner_user_id', next.user.id);
      await repo.setMeta(db, 'owner_email', next.user.email);
      await api.adopt(next);
      await refresh();
      return true;
    },
    [api, db, refresh],
  );

  /** Sign out and remove this account's data from the phone. */
  const signOut = useCallback(async () => {
    await api.signOut();
    await repo.wipeLocalData(db);
    await refresh();
  }, [api, db, refresh]);

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

  return { snapshot, sync, session, actions, signIn, signOut, ...derived };
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
