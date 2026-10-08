import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildItemDatabase,
  unusedHiddenMaterials,
  type ContractEntryRow,
  type ExtractedMaterial,
  type ItemRow,
  type ListRow,
  type MaterialEntry,
  type QuoteLineRow,
  type QuoteRow,
} from '@nirman/shared';
import {
  exportBackupZip,
  parseBackupFile,
  restoreBackup,
  type BackupFile,
  findDraft,
  type Job,
  type ListKind,
  type Snapshot,
  type Db,
  type JobWorker,
  type WorkerStatus,
  describe,
  logError,
  logPerf,
  logStep,
  timed,
  prefs,
  settingsStore,
  type Settings,
} from '@nirman/core';
import * as repo from '@nirman/core';

/**
 * Log each action for the diagnostic log: its name, time taken and what it
 * was given (photos left out), and any error it throws.
 */
function instrument<T extends Record<string, unknown>>(actions: T, skip: string[]): T {
  const out: Record<string, unknown> = { ...actions };
  for (const [name, fn] of Object.entries(actions)) {
    if (typeof fn !== 'function' || skip.includes(name)) continue;
    out[name] = (...args: unknown[]) => {
      const start = performance.now();
      const detail = args.length ? describe(args) : undefined;
      const done = () => {
        const ms = performance.now() - start;
        logStep(name, ms >= 50 ? { ms: Math.round(ms) } : undefined, detail);
        if (ms >= 800) logPerf(name, ms);
      };
      try {
        const result = (fn as (...a: unknown[]) => unknown)(...args);
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              done();
              return value;
            },
            (err) => {
              logError(err, name, detail);
              throw err;
            },
          );
        }
        done();
        return result;
      } catch (err) {
        logError(err, name, detail);
        throw err;
      }
    };
  }
  return out as T;
}

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

const PROJECT_PREF = 'nirmaan_project';
const EDITING_PREF = 'nirmaan_editing_by_project';

/** The project to open: the one last open, else the ongoing one used most recently. */
function pickProject(snapshot: Snapshot, wanted: string | null): string {
  if (wanted && snapshot.projects.some((p) => p.id === wanted)) return wanted;
  const lastUsed = new Map<string, string>();
  for (const row of [...snapshot.lists, ...snapshot.contracts]) {
    if (row.updated_at > (lastUsed.get(row.project_id) ?? '')) lastUsed.set(row.project_id, row.updated_at);
  }
  const byUse = [...snapshot.projects].sort((a, b) => (lastUsed.get(b.id) ?? b.updated_at).localeCompare(lastUsed.get(a.id) ?? a.updated_at));
  return (byUse.find((p) => p.status === 'active') ?? byUse[0])?.id ?? '';
}

function useAppStateValue({ db, worker, settings: settingsRef, onDataChanged }: Services, initial: Snapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [wantedProject, setWantedProject] = useState<string | null>(() => prefs.get<string | null>(PROJECT_PREF, null));
  /** The open project: Purchases, BOQ, Labour and Saved show only its lists and contracts. */
  const projectId = useMemo(() => pickProject(snapshot, wantedProject), [snapshot, wantedProject]);
  const openProject = useCallback((id: string) => {
    prefs.set(PROJECT_PREF, id);
    setWantedProject(id);
  }, []);
  /** Per project, the saved list each tab is editing in place (none: the open list for the next bill). */
  const [editingByProject, setEditingByProject] = useState<Record<string, Partial<Record<ListKind, string | null>>>>(() => prefs.get(EDITING_PREF, {}));
  const setEditing = useCallback(
    (kind: ListKind, id: string | null) =>
      setEditingByProject((prev) => {
        const next = { ...prev, [projectId]: { ...prev[projectId], [kind]: id } };
        prefs.set(EDITING_PREF, next);
        return next;
      }),
    [projectId],
  );
  const [status, setStatus] = useState<WorkerStatus>(worker.status);
  const [settings, setSettings] = useState<Settings>(settingsRef.current);

  const refresh = useCallback(async () => setSnapshot(await timed('loadSnapshot', () => repo.loadSnapshot(db))), [db]);

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
    () => instrument({
      openProject,
      saveProject: write(repo.saveProject),
      setProjectStatus: write(repo.setProjectStatus),
      deleteProject: write(repo.deleteProject),
      moveList: write(repo.moveList),
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
      bulkEditMaterials: write(repo.bulkEditMaterials),
      renameMaterial: write(repo.renameMaterial),
      undoMatch: write(repo.undoMatch),
      hideMaterial: write(repo.hideMaterial),
      hideMaterials: write(repo.hideMaterials),
      /** Delete from Data after the undo window; the card shows struck through until then. */
      deleteMaterialLater: (m: repo.MaterialRef) => deleteLater((d) => repo.hideMaterial(d, m))(m.key),
      unhideMaterial: write(repo.unhideMaterial),
      unhideMaterials: write(repo.unhideMaterials),
      clearHiddenMaterials: write(repo.clearHiddenMaterials),
      updateRate: write(repo.updateRate),
      setListVendor: write(repo.setListVendor),
      getBillPhotos: (photoId: string) => repo.getBillPhotos(db, photoId),
      countBillPhotos: () => repo.countBillPhotos(db),
      clearBillPhotos: write(repo.clearBillPhotos),
      setPrice: write(repo.setPrice),
      clearLearning: write(repo.clearLearning),
      updateLearnedTerm: write(repo.updateLearnedTerm),
      deleteLearnedTerm: write(repo.deleteLearnedTerm),
      indexRates: write(repo.indexRates),
      deleteIndexedRate: write(repo.deleteIndexedRate),
      addCategory: write(repo.addCategory),
      deleteCategory: write(repo.deleteCategory),
      deleteJob: write(repo.deleteJob),
      saveContract: write(repo.saveContract),
      setContractStatus: write(repo.setContractStatus),
      setRetentionReleased: write(repo.setRetentionReleased),
      saveContractEntry: write(repo.saveContractEntry),
      deleteContractLater: deleteLater(repo.deleteContract),
      deleteContractEntryLater: deleteLater(repo.deleteContractEntry),
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
        await repo.retryJob(db, job.id);
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
      exportBackup: () => exportBackupZip(db),
      countTrainingSamples: () => repo.countTrainingSamples(db),
      exportTrainingData: () => repo.exportTrainingData(db),
      clearTrainingSamples: () => repo.clearTrainingSamples(db),
      parseBackup: parseBackupFile,
      async restoreBackup({ backup, photos }: BackupFile) {
        await restoreBackup(db, backup, photos);
        await refresh();
      },
    }, ['flushDeletes', 'processQueue', 'parseBackup', 'getBillPhotos']),
    [db, worker, settingsRef, refresh, write, deleteLater, finishDelete, syncPending, openProject],
  );

  const derived = useMemo(() => {
    const byList = new Map<string, ItemRow[]>();
    for (const item of snapshot.items) {
      const list = byList.get(item.list_id);
      if (list) list.push(item);
      else byList.set(item.list_id, [item]);
    }
    const project = snapshot.projects.find((p) => p.id === projectId);
    const draftIds: Record<ListKind, string> = {
      audit: findDraft(snapshot.lists, projectId, 'audit')?.id ?? '',
      boq: findDraft(snapshot.lists, projectId, 'boq')?.id ?? '',
    };
    const draftList = (kind: ListKind) => snapshot.lists.find((l) => l.id === draftIds[kind]);
    const allHistory: HistoryRecord[] = snapshot.lists
      .filter((l) => l.status === 'saved')
      .map((l) => ({ ...l, items: byList.get(l.id) ?? [] }));
    const history = allHistory.filter((l) => l.project_id === projectId);
    // A tab shows the saved list being edited, if it still exists here, else the open list for the next bill.
    const editingOf = (kind: ListKind) => history.find((h) => h.id === editingByProject[projectId]?.[kind] && h.kind === kind) ?? null;
    const editing: Record<ListKind, HistoryRecord | null> = { audit: editingOf('audit'), boq: editingOf('boq') };
    const openIds: Record<ListKind, string> = { audit: editing.audit?.id ?? draftIds.audit, boq: editing.boq?.id ?? draftIds.boq };
    const contracts = snapshot.contracts.filter((c) => c.project_id === projectId);
    /** Saved lists, contracts and the money spent, per project, for the project list. */
    const projectSummary = (id: string) => {
      const saved = allHistory.filter((h) => h.project_id === id);
      return {
        lists: saved.length,
        contracts: snapshot.contracts.filter((c) => c.project_id === id).length,
        spent: saved.filter((h) => h.kind === 'audit').reduce((n, h) => n + h.items.reduce((m, i) => m + (i.total_amount || 0), 0), 0),
      };
    };
    const learning = repo.learningMap(snapshot.learned);
    // Materials deleted from Data leave out everything recorded up to then, in the Data tab and in every price check.
    const deleted = Object.fromEntries(snapshot.hidden.map((h) => [h.id, h.hidden_at]));
    const ratesStart = performance.now();
    const itemDatabase: MaterialEntry[] = buildItemDatabase(snapshot.lists, snapshot.items, snapshot.rates, learning, deleted);
    // Worked out again after every change: note it in the log when it gets slow, with how much data there is.
    const ratesMs = performance.now() - ratesStart;
    if (ratesMs >= 300) logPerf('rates', ratesMs, { lines: snapshot.items.length, rates: snapshot.rates.length, materials: itemDatabase.length });
    const linesByQuote = new Map<string, QuoteLineRow[]>();
    for (const line of snapshot.quoteLines) {
      const list = linesByQuote.get(line.quote_id);
      if (list) list.push(line);
      else linesByQuote.set(line.quote_id, [line]);
    }
    const entriesByContract = new Map<string, ContractEntryRow[]>();
    for (const e of snapshot.contractEntries) {
      const list = entriesByContract.get(e.contract_id);
      if (list) list.push(e);
      else entriesByContract.set(e.contract_id, [e]);
    }
    return {
      projectId,
      project,
      projects: snapshot.projects,
      projectSummary,
      /** The open project's Purchases list and BOQ draft (for the next bill). */
      draftIds,
      /** The list each tab shows and adds to: a saved list being edited in place, or the draft. */
      openIds,
      /** The saved list each tab is editing, if any. */
      editing,
      allHistory,
      contracts,
      entriesFor: (contractId: string): ContractEntryRow[] => entriesByContract.get(contractId) ?? [],
      /** Sites from saved lists and contracts, for address suggestions. */
      allAddresses: [...new Set([project?.address ?? '', ...allHistory.map((h) => h.address), ...snapshot.contracts.map((c) => c.address), ...snapshot.projects.map((p) => p.address)].filter(Boolean))],
      itemsFor: (kind: ListKind) => byList.get(openIds[kind]) ?? [],
      learning,
      savedBoqs: history.filter((h) => h.kind === 'boq'),
      quotesFor: (boqId: string): QuoteRow[] => snapshot.quotes.filter((q) => q.boq_id === boqId),
      linesFor: (quoteId: string): QuoteLineRow[] => linesByQuote.get(quoteId) ?? [],
      jobForQuote: (quoteId: string): Job | undefined => snapshot.jobs.find((j) => j.quote_id === quoteId),
      knownVendors: [...new Set([...snapshot.quotes.map((q) => q.vendor), ...itemDatabase.flatMap((e) => e.vendors)].filter(Boolean))].sort(),
      boqNotes: (editing.boq ?? draftList('boq'))?.notes ?? '',
      history,
      itemDatabase,
      learningCount: snapshot.learned.length,
      hiddenMaterials: snapshot.hidden,
      categoryNames: snapshot.categories.map((c) => c.name),
      /** Site addresses of saved lists in every project, for suggestions. */
      uniqueAddresses: [...new Set([project?.address ?? '', ...allHistory.map((h) => h.address)].filter(Boolean))],
      jobsFor: (kind: ListKind) => snapshot.jobs.filter((j) => j.list_id === openIds[kind]),
    };
  }, [snapshot, projectId, editingByProject]);

  // A material deleted from Rates stays listed in Settings only while it still hides an old price.
  const unusedHidden = useMemo(
    () => unusedHiddenMaterials(snapshot.hidden, snapshot.lists, snapshot.items, snapshot.rates, derived.learning),
    [snapshot, derived.learning],
  );
  useEffect(() => {
    if (unusedHidden.length) void actions.unhideMaterials(unusedHidden);
  }, [unusedHidden, actions]);

  return { snapshot, status, settings, actions, pendingDeletes, setEditing, ...derived };
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
