import { todayISO, type LearnedTermRow } from '@nirman/shared';
import { completeJob, completeQuoteJob, getJobImages, learningMap, listItems, setJobStatus, type Job } from '../data/repo.ts';
import type { Db } from '../data/sql.ts';
import { classifyError, createGeminiExtractor, type Extractor } from '../lib/gemini.ts';
import type { Settings } from '../lib/settings.ts';

export interface WorkerStatus {
  online: boolean;
  processing: boolean;
  /** Why queued entries aren't being processed right now, if anything is wrong. */
  lastError: string | null;
}

export interface Connectivity {
  isOnline(): Promise<boolean>;
  onChange(fn: (online: boolean) => void): void;
  onResume(fn: () => void): void;
}

const MIN_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 10 * 60_000;

export const NO_KEY_MESSAGE = 'Add your Gemini API key in Settings to read queued entries.';

/**
 * Sends queued AI entries (text/photos saved while offline) to Gemini once the
 * phone is online and a key is set, and stores the items it returns. Runs on
 * start, resume, reconnect and after each new entry; runs never overlap;
 * temporary failures retry with exponential back-off.
 */
export class JobWorker {
  status: WorkerStatus = { online: true, processing: false, lastError: null };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private backoff = 0;

  constructor(
    private db: Db,
    private getSettings: () => Settings,
    /** Called whenever the queue or stored items changed. */
    private onDataChanged: () => void,
    private makeExtractor: (apiKey: string, model: string) => Extractor = createGeminiExtractor,
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setStatus(patch: Partial<WorkerStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn();
  }

  async start(connectivity: Connectivity) {
    this.setStatus({ online: await connectivity.isOnline() });
    connectivity.onChange((online) => {
      this.setStatus({ online });
      if (online) this.schedule();
    });
    connectivity.onResume(() => this.schedule());
    this.schedule();
  }

  /** Process the queue after `delayMs` (debounced). */
  schedule(delayMs = 0) {
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
        this.schedule();
      }
    });
    return this.running;
  }

  private async runOnce() {
    const pending = await this.db.all<Job>(`SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at`);
    if (pending.length === 0) {
      this.setStatus({ lastError: null });
      return;
    }
    const { geminiApiKey, geminiModel } = this.getSettings();
    if (!geminiApiKey) {
      this.setStatus({ lastError: NO_KEY_MESSAGE });
      return;
    }
    if (!this.status.online) return;

    this.setStatus({ processing: true });
    const extractor = this.makeExtractor(geminiApiKey, geminiModel);
    try {
      for (const job of pending) await this.process(job, extractor);
      this.backoff = 0;
      this.setStatus({ processing: false, lastError: null });
    } catch (err) {
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff ? this.backoff * 2 : MIN_BACKOFF_MS);
      this.setStatus({ processing: false, lastError: (err as Error).message });
      this.schedule(this.backoff);
    }
  }

  /** Throws only for temporary failures, which stop the run and retry later. */
  private async process(job: Job, extractor: Extractor) {
    await setJobStatus(this.db, job.id, 'processing');
    this.onDataChanged();
    try {
      const images = await getJobImages(this.db, job.id);
      const learning = learningMap(await this.db.all<LearnedTermRow>('SELECT * FROM learned_terms'));
      if (job.quote_id) {
        // Sr. numbers are the BOQ's printed order; remember which item each one was.
        const boq = await listItems(this.db, job.list_id);
        const lines = await extractor.extractQuote({
          boq: boq.map((b, i) => ({ sr: i + 1, item_name: b.item_name, quantity: b.quantity, unit: b.unit })),
          text: job.text,
          images,
          learning,
        });
        if (lines.length === 0) {
          await setJobStatus(this.db, job.id, 'failed', 'No quote lines detected. Make sure the photo or text is clear, then retry.');
        } else {
          await completeQuoteJob(this.db, job.id, lines, boq.map((b) => b.id));
        }
        return;
      }
      const items = await extractor.extract({
        text: job.text,
        images,
        category: job.category || undefined,
        capture_date: job.capture_date || todayISO(),
        learning,
      });
      if (items.length === 0) {
        await setJobStatus(this.db, job.id, 'failed', 'No items detected. Make sure the photo or text is clear, then retry.');
      } else {
        await completeJob(this.db, job.id, items);
      }
    } catch (err) {
      const e = classifyError(err);
      if (e.kind === 'invalid') {
        await setJobStatus(this.db, job.id, 'failed', e.message);
      } else {
        await setJobStatus(this.db, job.id, 'pending');
        throw e;
      }
    } finally {
      this.onDataChanged();
    }
  }
}
