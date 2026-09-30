import { SYNC_PUSH_BATCH, syncTables } from '@nirman/shared';
import { ApiError, NetworkError, SessionExpiredError, type ApiClient } from '../lib/api.ts';
import {
  applyRemoteChanges,
  completeJob,
  getDirtyRows,
  getJobImages,
  getMeta,
  learningMap,
  markPushed,
  setJobStatus,
  type Job,
} from '../data/repo.ts';
import type { Db } from '../data/sql.ts';
import type { LearnedTermRow } from '@nirman/shared';

export interface SyncStatus {
  online: boolean;
  signedIn: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface Connectivity {
  isOnline(): Promise<boolean>;
  onChange(fn: (online: boolean) => void): void;
  onResume(fn: () => void): void;
}

const MAX_PUSH_ROUNDS = 50;
const PERIODIC_MS = 5 * 60_000;
const MIN_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Keeps the local database and the server in step. Each run:
 *  1. sends queued AI extraction jobs and stores their items,
 *  2. pushes rows edited on this device,
 *  3. pulls rows changed elsewhere since the last cursor.
 * Runs never overlap; failures retry with exponential back-off.
 */
export class SyncEngine {
  status: SyncStatus = { online: true, signedIn: false, syncing: false, lastSyncAt: null, lastError: null };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private backoff = 0;

  constructor(
    private db: Db,
    private api: ApiClient,
    /** Called whenever local data changed because of sync. */
    private onDataChanged: () => void,
  ) {
    this.status.signedIn = !!api.current;
    api.onSessionChange((s) => {
      this.setStatus({ signedIn: !!s });
      if (s) this.requestSync();
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn();
  }

  async start(connectivity: Connectivity) {
    this.status.lastSyncAt = (await getMeta(this.db, 'last_sync_at')) ?? null;
    this.setStatus({ online: await connectivity.isOnline() });
    connectivity.onChange((online) => {
      this.setStatus({ online });
      if (online) this.requestSync();
    });
    connectivity.onResume(() => this.requestSync());
    setInterval(() => this.requestSync(), PERIODIC_MS);
    this.requestSync();
  }

  /** Schedule a sync run after `delayMs` (debounced). */
  requestSync(delayMs = 0) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delayMs);
  }

  run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.runOnce().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.requestSync();
      }
    });
    return this.running;
  }

  private async runOnce() {
    if (!this.status.online || !this.api.current) return;
    this.setStatus({ syncing: true });
    try {
      await this.processJobs();
      await this.push();
      await this.pull();
      const now = new Date().toISOString();
      await this.db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['last_sync_at', now]);
      this.backoff = 0;
      this.setStatus({ syncing: false, lastSyncAt: now, lastError: null });
    } catch (err) {
      const message = describe(err);
      this.setStatus({ syncing: false, lastError: message });
      if (!(err instanceof SessionExpiredError)) {
        this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff ? this.backoff * 2 : MIN_BACKOFF_MS);
        this.requestSync(this.backoff);
      }
    } finally {
      this.onDataChanged();
    }
  }

  private async processJobs() {
    const jobs = await this.db.all<Job>(`SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at`);
    for (const job of jobs) {
      await setJobStatus(this.db, job.id, 'processing');
      this.onDataChanged();
      try {
        const images = await getJobImages(this.db, job.id);
        const learned = await this.db.all<LearnedTermRow>('SELECT * FROM learned_terms WHERE deleted_at IS NULL');
        const { items } = await this.api.extract({
          job_id: job.id,
          text: job.text,
          images,
          category: job.category || undefined,
          capture_date: job.capture_date,
          learning: learningMap(learned),
        });
        if (items.length === 0) {
          await setJobStatus(this.db, job.id, 'failed', 'No items detected. Make sure the photo or text is clear, then retry.');
        } else {
          await completeJob(this.db, job.id, items);
        }
      } catch (err) {
        const permanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);
        await setJobStatus(this.db, job.id, permanent ? 'failed' : 'pending', permanent ? err.message : null);
        if (!permanent) throw err;
      } finally {
        this.onDataChanged();
      }
    }
  }

  private async push() {
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      let pushed = 0;
      for (const table of syncTables) {
        const rows = await getDirtyRows(this.db, table, SYNC_PUSH_BATCH);
        if (rows.length === 0) continue;
        await this.api.push({ [table]: rows });
        await markPushed(this.db, table, rows);
        pushed += rows.length;
      }
      if (pushed === 0) return;
    }
  }

  private async pull() {
    let cursor = (await getMeta(this.db, 'sync_cursor')) ?? '0';
    for (;;) {
      const res = await this.api.pull(cursor);
      await applyRemoteChanges(this.db, res.changes, res.cursor);
      cursor = res.cursor;
      if (!res.has_more) return;
    }
  }
}

function describe(err: unknown): string {
  if (err instanceof NetworkError) return 'Server unreachable';
  if (err instanceof SessionExpiredError) return 'Signed out: please sign in again';
  if (err instanceof ApiError) return err.message;
  return (err as Error)?.message ?? 'Sync failed';
}
