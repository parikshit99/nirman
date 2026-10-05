import { todayISO, variantLabel, type LearnedTermRow } from '@nirman/shared';
import { completeJob, completeQuoteJob, getJobImages, learningMap, listItems, setJobStatus, type Job } from '../data/repo.ts';
import type { Db } from '../data/sql.ts';
import { classifyError, createGeminiExtractor, type Extractor } from '../lib/gemini.ts';
import { log, scrub } from '../lib/diagnostics.ts';
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

/** Readings that time out this many times in a row stop retrying, so the queue can finish. */
export const MAX_TIMEOUTS = 3;

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
    private makeExtractor: (apiKey: string, model: string, onModelReplaced?: (model: string) => void) => Extractor = createGeminiExtractor,
    /** Called when Gemini no longer knew the configured model and another was used. */
    private onModelReplaced?: (model: string) => void,
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
    const extractor = this.makeExtractor(geminiApiKey, geminiModel, this.onModelReplaced);
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
    // For the diagnostic log: what kind of reading, how big, how long, how it ended, the text given and what came back.
    const started = performance.now();
    const facts: Record<string, string | number | boolean> = { kind: job.quote_id ? 'quote' : 'entry', textChars: job.text.length };
    const input = job.text.trim() ? `in: ${job.text.trim().slice(0, 300)}` : '';
    const logReading = (outcome: string, extra: Record<string, string | number | boolean> = {}, out = '') =>
      log('ai', `reading ${outcome}`, { ...facts, ms: Math.round(performance.now() - started), model: this.getSettings().geminiModel, ...extra }, [input, out].filter(Boolean).join('\n    '));
    try {
      const images = await getJobImages(this.db, job.id);
      facts.photos = images.length;
      const learning = learningMap(await this.db.all<LearnedTermRow>('SELECT * FROM learned_terms'));
      if (job.quote_id) {
        // Sr. numbers are the BOQ's printed order; remember which item each one was.
        const boq = await listItems(this.db, job.list_id);
        const lines = await extractor.extractQuote({
          boq: boq.map((b, i) => ({ sr: i + 1, item_name: b.item_name, quantity: b.quantity, unit: b.unit, variant: variantLabel(b) })),
          text: job.text,
          images,
          learning,
        });
        if (lines.length === 0) {
          await setJobStatus(this.db, job.id, 'failed', 'No quote lines detected. Make sure the photo or text is clear, then retry.');
          logReading('empty');
        } else {
          await completeQuoteJob(this.db, job.id, lines, boq.map((b) => b.id));
          logReading(
            'ok',
            { lines: lines.length, matched: lines.filter((l) => l.boq_sr).length, boqItems: boq.length },
            `out: ${lines.map((l) => `#${l.boq_sr ?? '-'} ${l.item_name} ${l.quantity ?? ''} ${l.unit ?? ''} @${l.unit_price}`).join('; ')}`,
          );
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
        logReading('empty');
      } else {
        await completeJob(this.db, job.id, items);
        logReading(
          'ok',
          { lines: items.length, converted: items.filter((i) => i.ordered_as).length },
          `out: ${items.map((i) => `${i.item_name} ${i.quantity} ${i.unit} @${i.unit_price}${i.vendor ? ` ${i.vendor}` : ''}${i.ordered_as ? ` (${i.ordered_as})` : ''}`).join('; ')}`,
        );
      }
    } catch (err) {
      const e = classifyError(err);
      logReading('failed', { error: e.kind, message: scrub(e.message).slice(0, 120) });
      if (e.kind === 'invalid') {
        await setJobStatus(this.db, job.id, 'failed', e.message);
      } else if (e.timedOut && job.attempts + 1 >= MAX_TIMEOUTS) {
        // The photo itself may be the problem: stop here and let the next entries run.
        await setJobStatus(
          this.db,
          job.id,
          'failed',
          `Gemini timed out ${MAX_TIMEOUTS} times on this entry. Tap Retry, or try a clearer photo, fewer photos, or another model in Settings.`,
        );
      } else {
        await setJobStatus(this.db, job.id, 'pending');
        throw e;
      }
    } finally {
      this.onDataChanged();
    }
  }
}
