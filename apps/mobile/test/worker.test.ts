import { describe, expect, it } from 'vitest';
import type { ExtractedQuoteLine, ExtractionRequest, QuoteExtractionRequest } from '@nirman/shared';
import { DRAFT_IDS, enqueueJob, enqueueQuote, loadSnapshot, retryJob, saveDraftToHistory, updateItem, addItems } from '../src/data/repo.ts';
import { ExtractionError, type Extractor } from '../src/lib/gemini.ts';
import { JobWorker, MAX_TIMEOUTS, NO_KEY_MESSAGE } from '../src/jobs/worker.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings.ts';
import { freshDb } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500, vendor: '', date: '2026-09-30' };

function setup(
  behaviour: (req: ExtractionRequest) => Promise<typeof cement[]>,
  settings: Settings = { ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test' },
  quoteBehaviour: (req: QuoteExtractionRequest) => Promise<ExtractedQuoteLine[]> = async () => [],
) {
  return freshDb().then((db) => {
    const calls: ExtractionRequest[] = [];
    const quoteCalls: QuoteExtractionRequest[] = [];
    const keys: string[] = [];
    const extractor: Extractor = {
      extract: (req) => (calls.push(req), behaviour(req)),
      extractQuote: (req) => (quoteCalls.push(req), quoteBehaviour(req)),
    };
    const worker = new JobWorker(db, () => settings, () => {}, (key) => (keys.push(key), extractor));
    return { db, worker, calls, quoteCalls, keys, settings };
  });
}

const quoteLine = (over: Partial<ExtractedQuoteLine>): ExtractedQuoteLine => ({
  boq_sr: null, original_term: '', item_name: '', quantity: 0, unit: 'Bag', unit_price: 0, total_amount: 0, note: '', brand: '', model: '', spec: '', color: '', ...over,
});

const queue = (db: Awaited<ReturnType<typeof freshDb>>, text = '15 bori cement') =>
  enqueueJob(db, { listId: DRAFT_IDS.audit, text, images: ['IMG'], category: 'Civil', captureDate: '2026-09-30' });

describe('JobWorker', () => {
  it('reads queued entries with the saved key and stores the items', async () => {
    const { db, worker, calls, keys } = await setup(async () => [cement]);
    // A learned correction is passed to the model.
    await addItems(db, DRAFT_IDS.boq, [{ ...cement, original_term: 'bori' }]);
    const [boqItem] = (await loadSnapshot(db)).items;
    await updateItem(db, boqItem.id, { item_name: 'OPC Cement' });

    await queue(db);
    await worker.run();
    const snap = await loadSnapshot(db);
    expect(snap.jobs).toHaveLength(0);
    expect(snap.items.filter((i) => i.list_id === DRAFT_IDS.audit).map((i) => i.item_name)).toEqual(['Cement']);
    expect(keys).toEqual(['AIza-test']);
    expect(calls[0]).toMatchObject({ text: '15 bori cement', images: ['IMG'], category: 'Civil', capture_date: '2026-09-30' });
    expect(calls[0].learning.bori.item_name).toBe('OPC Cement');
    expect(worker.status.lastError).toBeNull();
  });

  it('waits without a key and does not call Gemini', async () => {
    const { db, worker, calls } = await setup(async () => [cement], DEFAULT_SETTINGS);
    await queue(db);
    await worker.run();
    expect(calls).toHaveLength(0);
    expect((await loadSnapshot(db)).jobs).toMatchObject([{ status: 'pending' }]);
    expect(worker.status.lastError).toBe(NO_KEY_MESSAGE);
  });

  it('waits while offline', async () => {
    const { db, worker, calls } = await setup(async () => [cement]);
    worker.status.online = false;
    await queue(db);
    await worker.run();
    expect(calls).toHaveLength(0);
    expect((await loadSnapshot(db)).jobs).toMatchObject([{ status: 'pending', attempts: 0 }]);
  });

  it('keeps entries queued on temporary failures and stops the run', async () => {
    const { db, worker, calls } = await setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    await queue(db, 'one');
    await queue(db, 'two');
    await worker.run();
    expect(calls).toHaveLength(1);
    const snap = await loadSnapshot(db);
    expect(snap.jobs.map((j) => [j.status, j.attempts])).toEqual([['pending', 1], ['pending', 0]]);
    expect(worker.status.lastError).toMatch(/Could not reach Gemini/);
  });

  it('stops retrying an entry that keeps timing out, so the rest of the queue runs', async () => {
    const { db, worker, calls } = await setup(async (req) => {
      if (req.text === 'slow') throw new ExtractionError('Gemini timed out; will retry.', 'retry', true);
      return [cement];
    });
    await queue(db, 'slow');
    await queue(db, 'next');
    for (let i = 1; i < MAX_TIMEOUTS; i++) await worker.run();
    expect((await loadSnapshot(db)).jobs.map((j) => j.status)).toEqual(['pending', 'pending']);
    await worker.run();
    let snap = await loadSnapshot(db);
    expect(snap.jobs.map((j) => [j.status, j.attempts])).toEqual([['failed', MAX_TIMEOUTS]]);
    expect(snap.jobs[0].error).toMatch(/timed out 3 times/);
    expect(calls.at(-1)!.text).toBe('next');
    // Retry starts the count again.
    await retryJob(db, snap.jobs[0].id);
    snap = await loadSnapshot(db);
    expect(snap.jobs.map((j) => [j.status, j.attempts, j.error])).toEqual([['pending', 0, null]]);
  });

  it('marks entries failed when the key is rejected, and when nothing is found', async () => {
    const { db, worker } = await setup(async (req) => {
      if (req.text === 'bad') throw Object.assign(new Error('API key not valid'), { status: 400 });
      return [];
    });
    await queue(db, 'bad');
    await queue(db, 'empty');
    await worker.run();
    const jobs = (await loadSnapshot(db)).jobs;
    expect(jobs.map((j) => j.status)).toEqual(['failed', 'failed']);
    expect(jobs[0].error).toMatch(/API key/);
    expect(jobs[1].error).toMatch(/No items detected/);
  });

  it('classifies errors', () => {
    expect(new ExtractionError('x', 'invalid').kind).toBe('invalid');
  });

  it('reads a vendor quote against the saved BOQ and maps Sr. numbers to its items', async () => {
    const { db, worker, quoteCalls } = await setup(async () => [], undefined, async () => [
      quoteLine({ boq_sr: 2, original_term: 'ACC bori', item_name: 'Cement', quantity: 15, unit_price: 380 }),
      quoteLine({ boq_sr: null, original_term: 'bandhai taar', item_name: 'Binding wire', unit: 'kg', unit_price: 90 }),
    ]);
    await addItems(db, DRAFT_IDS.boq, [{ ...cement, item_name: 'Sand', unit: 'MT', unit_price: 0 }, { ...cement, unit_price: 0 }]);
    const boqId = await saveDraftToHistory(db, 'boq', { title: 'Tower A', address: '', category: 'Civil', site_date: '' });
    await enqueueQuote(db, { boqId, vendor: 'Sharma', quoteDate: '2026-10-03', text: '', images: ['IMG'] });

    await worker.run();
    const snap = await loadSnapshot(db);
    const boqItems = snap.items.filter((i) => i.list_id === boqId);
    expect(quoteCalls[0].boq).toEqual([
      { sr: 1, item_name: 'Sand', quantity: 15, unit: 'MT', variant: '' },
      { sr: 2, item_name: 'Cement', quantity: 15, unit: 'Bag', variant: '' },
    ]);
    expect(quoteCalls[0].images).toEqual(['IMG']);
    expect(snap.jobs).toHaveLength(0);
    expect(snap.quotes).toMatchObject([{ boq_id: boqId, vendor: 'Sharma', status: 'review' }]);
    expect(snap.quoteLines.map((l) => [l.item_name, l.boq_item_id])).toEqual([
      ['Cement', boqItems.find((i) => i.item_name === 'Cement')!.id],
      ['Binding wire', null],
    ]);
  });

  it('marks a quote reading failed when nothing was read', async () => {
    const { db, worker } = await setup(async () => []);
    await addItems(db, DRAFT_IDS.boq, [cement]);
    const boqId = await saveDraftToHistory(db, 'boq', { title: 'Tower A', address: '', category: '', site_date: '' });
    await enqueueQuote(db, { boqId, vendor: 'Sharma', quoteDate: '2026-10-03', text: 'blurry', images: [] });
    await worker.run();
    const snap = await loadSnapshot(db);
    expect(snap.jobs).toMatchObject([{ status: 'failed', error: expect.stringMatching(/No quote lines/) }]);
    expect(snap.quoteLines).toHaveLength(0);
  });
});
