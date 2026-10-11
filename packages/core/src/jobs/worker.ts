import { boxesToRows, matchQuoteLines, namesForReading, parseBill, todayISO, variantLabel, type BillReading, type LearnedTermRow, type MaterialInput, type TextBox } from '@nirman/shared';
import { completeJob, completeQuoteJob, getJobImages, knownMaterials, learningMap, matchMaterials, listItems, saveTrainingSample, setJobStatus, type Job } from '../data/repo.ts';
import type { Db } from '../data/sql.ts';
import { classifyError, createGeminiExtractor, type Extractor } from '../lib/gemini.ts';
import { log, scrub } from '../lib/diagnostics.ts';
import { loadConversions } from '../lib/conversionSettings.ts';
import type { Settings } from '../lib/settings.ts';

export interface WorkerStatus {
  online: boolean;
  processing: boolean;
  /** Why queued entries aren't being processed right now, if anything is wrong. */
  lastError: string | null;
  /** The entry being read right now, for the progress bar. */
  current: ReadingProgress | null;
}

export interface ReadingProgress {
  jobId: string;
  engine: 'phone' | 'gemini';
  /** What is happening, e.g. "Reading photo 1 of 2 on the phone". */
  step: string;
  /** 0–1 when known; null while waiting on Gemini (the bar then follows the time taken). */
  progress: number | null;
  /** When this step started (ms since epoch). */
  startedAt: number;
  model?: string;
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

/** A phone reading at least this sure is used without asking Gemini. */
export const PHONE_CONFIDENCE = 0.75;

const describeItems = (items: MaterialInput[]) =>
  `out: ${items.map((i) => `${i.item_name} ${i.quantity} ${i.unit} @${i.unit_price}${i.vendor ? ` ${i.vendor}` : ''}${i.ordered_as ? ` (${i.ordered_as})` : ''}`).join('; ')}`;

/**
 * Sends queued AI entries (text/photos saved while offline) to Gemini once the
 * phone is online and a key is set, and stores the items it returns. Runs on
 * start, resume, reconnect and after each new entry; runs never overlap;
 * temporary failures retry with exponential back-off.
 */
export class JobWorker {
  status: WorkerStatus = { online: true, processing: false, lastError: null, current: null };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private backoff = 0;

  constructor(
    private db: Db,
    private getSettings: () => Settings,
    private makeExtractor: (apiKey: string, model: string, onModelReplaced?: (model: string) => void) => Extractor = createGeminiExtractor,
    /** Called when Gemini no longer knew the configured model and another was used. */
    private onModelReplaced?: (model: string) => void,
    /** Reads the text on a photo on the phone; null where that isn't available. */
    private readPhoto: ((image: string) => Promise<TextBox[]>) | null = null,
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
    const { geminiApiKey, geminiModel, readingMode } = this.getSettings();
    const useGemini = readingMode !== 'phone' && !!geminiApiKey;
    if (readingMode === 'gemini' && !geminiApiKey) {
      this.setStatus({ lastError: NO_KEY_MESSAGE });
      return;
    }
    if (readingMode === 'gemini' && !this.status.online) return;

    this.setStatus({ processing: true });
    const extractor = useGemini ? this.makeExtractor(geminiApiKey, geminiModel, this.onModelReplaced) : null;
    try {
      let waiting: string | null = null;
      for (const job of pending) waiting = (await this.process(job, extractor)) ?? waiting;
      this.backoff = 0;
      this.setStatus({ processing: false, lastError: waiting });
    } catch (err) {
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff ? this.backoff * 2 : MIN_BACKOFF_MS);
      this.setStatus({ processing: false, lastError: (err as Error).message });
      this.schedule(this.backoff);
    }
  }

  /** Read an entry on the phone: typed text, and the text on its photos where the phone can read them. */
  private progress(job: Job, engine: ReadingProgress['engine'], step: string, progress: number | null, model?: string) {
    this.setStatus({ current: { jobId: job.id, engine, step, progress, startedAt: Date.now(), model } });
  }

  private async readOnPhone(job: Job, images: string[], learning: ReturnType<typeof learningMap>): Promise<(BillReading & { ocrText: string }) | null> {
    const rows = job.text.split(/\n|;|,(?=\s*[a-z])/i).map((r) => r.trim()).filter(Boolean);
    // Where photos can't be read on the device (the browser), only the typed text is used.
    const photos = this.readPhoto ? images : [];
    for (const [i, image] of photos.entries()) {
      this.progress(job, 'phone', photos.length > 1 ? `Reading photo ${i + 1} of ${photos.length} on the phone` : 'Reading the photo on the phone', i / (photos.length + 1));
      rows.push(...boxesToRows(await this.readPhoto!(image)));
    }
    this.progress(job, 'phone', 'Checking the reading on the phone', photos.length / (photos.length + 1));
    if (!rows.length) return null;
    const reading = parseBill(rows, { learning, captureDate: job.capture_date || todayISO(), conversions: loadConversions() });
    return { ...reading, ocrText: rows.join('\n') };
  }

  /**
   * Throws only for temporary failures, which stop the run and retry later.
   * Returns a message when the entry has to wait (for a key or a connection).
   */
  private async process(job: Job, extractor: Extractor | null): Promise<string | null> {
    const { readingMode, collectTraining } = this.getSettings();
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
      const known = job.quote_id ? [] : await knownMaterials(this.db);
      const finish = async (read: MaterialInput[], engine: string, ocrText = '') => {
        // One name per material: matched to Rates (or the starter catalog), keeping what was read so it can be undone.
        const items = await matchMaterials(this.db, read);
        facts.matched = items.filter((i) => i.read_as).length;
        const ids = await completeJob(this.db, job.id, items);
        // Nothing stored (the entry or its list was deleted while it was read): no sample either.
        if (collectTraining && images.length && ids.length) await saveTrainingSample(this.db, { engine, ocr_text: ocrText, images, item_ids: ids, category: job.category });
      };

      // A vendor quote: read on the phone and matched to the BOQ there when it can be, so quotes work offline too.
      if (job.quote_id && readingMode !== 'gemini') {
        let read: Awaited<ReturnType<JobWorker['readOnPhone']>> = null;
        try {
          read = await this.readOnPhone(job, images, learning);
        } catch (err) {
          log('error', `phone reading: ${(err as Error).message}`, { where: 'textReader' });
        }
        if (read?.lines.length) {
          const boq = await listItems(this.db, job.list_id);
          const { lines, matched } = matchQuoteLines(
            boq.map((b, i) => ({ sr: i + 1, item_name: b.item_name, original_term: b.original_term })),
            read.lines.map((l) => l.item),
            learning,
          );
          // Sure enough: the phone read the lines cleanly and most of them name a BOQ item.
          const sure = read.confidence >= PHONE_CONFIDENCE && matched >= Math.ceil(lines.length * 0.6);
          const geminiNow = !!extractor && this.status.online && readingMode !== 'phone';
          if (sure || !geminiNow) {
            // Unmatched lines are matched by hand when reviewing the quote.
            await completeQuoteJob(this.db, job.id, lines, boq.map((b) => b.id));
            logReading('ok', { engine: 'phone', lines: lines.length, matched, boqItems: boq.length, confidence: read.confidence });
            return null;
          }
        }
      }

      // Entries are read on the phone first.
      let phone: Awaited<ReturnType<JobWorker['readOnPhone']>> = null;
      if (!job.quote_id && readingMode !== 'gemini') {
        try {
          phone = await this.readOnPhone(job, images, learning);
        } catch (err) {
          log('error', `phone reading: ${(err as Error).message}`, { where: 'textReader' });
        }
        const sure = !!phone?.lines.length && phone.confidence >= PHONE_CONFIDENCE;
        const noGemini = !extractor || !this.status.online;
        if (phone?.lines.length && (sure || readingMode === 'phone' || !extractor)) {
          const items = phone.lines.map((l) => l.item);
          await finish(items, 'phone', phone.ocrText);
          logReading('ok', { engine: 'phone', lines: items.length, confidence: phone.confidence }, describeItems(items));
          return null;
        }
        if (readingMode === 'phone' || !extractor) {
          const why = images.length && !this.readPhoto ? 'Photos can only be read on the phone app or by Gemini.' : 'Could not read this on the phone.';
          const fix = readingMode === 'phone' ? 'Type the items, or allow Gemini in Settings → How bills are read.' : 'Type the items, or add a Gemini API key in Settings.';
          await setJobStatus(this.db, job.id, 'failed', `${why} ${fix}`);
          logReading('empty', { engine: 'phone', confidence: phone?.confidence ?? 0 });
          return null;
        }
        if (noGemini) {
          // Unsure on the phone: wait for a connection to ask Gemini.
          logReading('waiting', { engine: 'phone', confidence: phone?.confidence ?? 0 });
          return null;
        }
      }
      if (job.quote_id && readingMode === 'phone') {
        await setJobStatus(this.db, job.id, 'failed', 'Could not read this quote on the phone. Use “Type rates”, or allow Gemini in Settings → How bills are read.');
        return null;
      }
      if (!extractor) return NO_KEY_MESSAGE;
      if (!this.status.online) return null;
      await setJobStatus(this.db, job.id, 'processing');
      const model = this.getSettings().geminiModel;
      this.progress(job, 'gemini', !phone ? 'Reading with Gemini' : phone.lines.length ? `Phone was unsure (${Math.round(phone.confidence * 100)}% sure), reading with Gemini` : 'Phone couldn’t read it, reading with Gemini', null, model);
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
        return null;
      }
      const items = await extractor.extract({
        text: job.text,
        images,
        category: job.category || undefined,
        capture_date: job.capture_date || todayISO(),
        learning,
        materials: namesForReading(known),
      });
      if (items.length === 0) {
        await setJobStatus(this.db, job.id, 'failed', 'No items detected. Make sure the photo or text is clear, then retry.');
        logReading('empty');
      } else {
        await finish(items, 'gemini', phone?.ocrText);
        logReading('ok', { engine: 'gemini', lines: items.length, converted: items.filter((i) => i.ordered_as).length, phoneConfidence: phone?.confidence ?? -1 }, describeItems(items));
      }
      return null;
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
      return null;
    } finally {
      // Changed data reaches the screens through `db.onWrite`, whichever way the entry ended.
      this.setStatus({ current: null });
    }
  }
}
