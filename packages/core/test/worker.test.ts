import { describe, expect, it } from 'vitest';
import type { ExtractedQuoteLine, ExtractionRequest, QuoteExtractionRequest, TextBox } from '@nirman/shared';
import { countTrainingSamples, enqueueJob, exportTrainingData, enqueueQuote, loadSnapshot, retryJob, saveDraftToHistory, updateItem, addItems } from '../src/data/repo.ts';
import { ExtractionError, type Extractor } from '../src/lib/gemini.ts';
import { JobWorker, MAX_TIMEOUTS, NO_KEY_MESSAGE } from '../src/jobs/worker.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings.ts';
import { DRAFT_IDS, freshDb } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500, vendor: '', date: '2026-09-30' };

function setup(
  behaviour: (req: ExtractionRequest) => Promise<typeof cement[]>,
  settings: Settings = { ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test', readingMode: 'gemini' },
  quoteBehaviour: (req: QuoteExtractionRequest) => Promise<ExtractedQuoteLine[]> = async () => [],
  readPhoto: ((image: string) => Promise<TextBox[]>) | null = null,
) {
  return freshDb().then((db) => {
    const calls: ExtractionRequest[] = [];
    const quoteCalls: QuoteExtractionRequest[] = [];
    const keys: string[] = [];
    const extractor: Extractor = {
      extract: (req) => (calls.push(req), behaviour(req)),
      extractQuote: (req) => (quoteCalls.push(req), quoteBehaviour(req)),
    };
    const worker = new JobWorker(db, () => settings, (key) => (keys.push(key), extractor), undefined, readPhoto);
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
    const { db, worker, calls } = await setup(async () => [cement], { ...DEFAULT_SETTINGS, readingMode: 'gemini' });
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

  describe('reading on the phone', () => {
    const bill = ['SHARMA TRADERS', 'Cement  50 Bags  380  19000', 'Sand  2 MT  1500  3000', 'Total  22000'];
    const boxes = (rows: string[]): TextBox[] => rows.map((text, i) => ({ text, left: 0, top: i * 30, right: 300, bottom: i * 30 + 20 }));
    const phoneFirst = { ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test', readingMode: 'auto' as const };

    it('reads a clear printed bill on the phone, without Gemini, and keeps it for training when allowed', async () => {
      const { db, worker, calls } = await setup(async () => [cement], { ...phoneFirst, collectTraining: true }, undefined, async () => boxes(bill));
      worker.status.online = false;
      await enqueueJob(db, { listId: DRAFT_IDS.audit, text: '', images: ['IMG'], category: 'Civil', captureDate: '2026-10-05' });
      await worker.run();
      const snap = await loadSnapshot(db);
      expect(calls).toHaveLength(0);
      expect(snap.jobs).toHaveLength(0);
      expect(snap.items.map((i) => [i.item_name, i.quantity, i.unit_price, i.vendor]).sort()).toEqual([
        ['Cement', 50, 380, 'SHARMA TRADERS'],
        ['Sand', 2, 1500, 'SHARMA TRADERS'],
      ]);
      expect(await countTrainingSamples(db)).toBe(1);
      // The export has the photo, the text read and the lines as corrected later.
      await updateItem(db, snap.items.find((i) => i.item_name === 'Cement')!.id, { item_name: 'OPC Cement' });
      const { jsonl, count } = await exportTrainingData(db);
      expect(count).toBe(1);
      const sample = JSON.parse(jsonl);
      expect(sample).toMatchObject({ read_by: 'phone', images: ['IMG'], category: 'Civil' });
      expect(sample.phone_text).toContain('Cement  50 Bags');
      expect(sample.lines.map((l: { item_name: string }) => l.item_name).sort()).toEqual(['OPC Cement', 'Sand']);
    });

    it('reports where an entry is being read, step by step', async () => {
      const seen: string[] = [];
      const { db, worker } = await setup(async () => [cement], phoneFirst, undefined, async () => boxes(['scribbles']));
      worker.subscribe(() => {
        const c = worker.status.current;
        if (c && seen.at(-1) !== `${c.engine}: ${c.step}`) seen.push(`${c.engine}: ${c.step}`);
      });
      await enqueueJob(db, { listId: DRAFT_IDS.audit, text: '', images: ['A', 'B'], category: '', captureDate: '2026-10-05' });
      await worker.run();
      expect(seen).toEqual([
        'phone: Reading photo 1 of 2 on the phone',
        'phone: Reading photo 2 of 2 on the phone',
        'phone: Checking the reading on the phone',
        'gemini: Phone couldn’t read it, reading with Gemini',
      ]);
      expect(worker.status.current).toBeNull();
    });

    it('asks Gemini when the phone is unsure, and waits for a connection to do so', async () => {
      const { db, worker, calls } = await setup(async () => [cement], phoneFirst, undefined, async () => boxes(['scribbles', 'Cmnt 5O bgs']));
      worker.status.online = false;
      await enqueueJob(db, { listId: DRAFT_IDS.audit, text: '', images: ['IMG'], category: '', captureDate: '2026-10-05' });
      await worker.run();
      expect((await loadSnapshot(db)).jobs).toMatchObject([{ status: 'pending', attempts: 0 }]);
      worker.status.online = true;
      await worker.run();
      expect(calls).toHaveLength(1);
      expect((await loadSnapshot(db)).items.map((i) => i.item_name)).toEqual(['Cement']);
      expect(await countTrainingSamples(db)).toBe(0);
    });

    it('uses what the phone read when there is no key, and says so when it read nothing', async () => {
      const { db, worker, calls } = await setup(async () => [cement], { ...DEFAULT_SETTINGS, readingMode: 'auto' });
      await queue(db, 'cement 50 bags 380');
      await worker.run();
      let snap = await loadSnapshot(db);
      expect(snap.items.map((i) => [i.item_name, i.quantity, i.unit, i.unit_price])).toEqual([['Cement', 50, 'Bag', 380]]);
      expect(calls).toHaveLength(0);
      await enqueueJob(db, { listId: DRAFT_IDS.audit, text: 'something unclear', images: [], category: '', captureDate: '2026-10-05' });
      await worker.run();
      snap = await loadSnapshot(db);
      expect(snap.jobs).toMatchObject([{ status: 'failed' }]);
      expect(snap.jobs[0].error).toMatch(/add a Gemini API key/);
    });
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
    const boqId = await saveDraftToHistory(db, DRAFT_IDS.boq, { title: 'Tower A', address: '', category: 'Civil', site_date: '' });
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

  it('reads a typed vendor quote on the phone and matches it to the BOQ without Gemini (offline, no key)', async () => {
    const { db, worker, quoteCalls } = await setup(async () => [], { ...DEFAULT_SETTINGS, readingMode: 'auto' });
    await addItems(db, DRAFT_IDS.boq, [{ ...cement, item_name: 'River sand', original_term: '', unit: 'MT', unit_price: 0 }, { ...cement, item_name: 'OPC Cement', original_term: '', unit_price: 0 }]);
    const boqId = await saveDraftToHistory(db, DRAFT_IDS.boq, { title: 'Tower A', address: '', category: 'Civil', site_date: '' });
    await enqueueQuote(db, { boqId, vendor: 'Sharma', quoteDate: '2026-10-03', text: 'OPC cement 15 bag 380 5700\nRiver sand 15 MT 1200 18000\nBinding wire 10 kg 90 900', images: [] });

    await worker.run();
    const snap = await loadSnapshot(db);
    const boqItems = snap.items.filter((i) => i.list_id === boqId);
    expect(quoteCalls).toHaveLength(0);
    expect(snap.jobs).toHaveLength(0);
    expect(snap.quotes).toMatchObject([{ status: 'review' }]);
    const idOf = (name: string) => boqItems.find((i) => i.item_name === name)!.id;
    expect(snap.quoteLines.map((l) => [l.unit_price, l.boq_item_id])).toEqual([
      [380, idOf('OPC Cement')],
      [1200, idOf('River sand')],
      [90, null],
    ]);
  });

  it('marks a quote reading failed when nothing was read', async () => {
    const { db, worker } = await setup(async () => []);
    await addItems(db, DRAFT_IDS.boq, [cement]);
    const boqId = await saveDraftToHistory(db, DRAFT_IDS.boq, { title: 'Tower A', address: '', category: '', site_date: '' });
    await enqueueQuote(db, { boqId, vendor: 'Sharma', quoteDate: '2026-10-03', text: 'blurry', images: [] });
    await worker.run();
    const snap = await loadSnapshot(db);
    expect(snap.jobs).toMatchObject([{ status: 'failed', error: expect.stringMatching(/No quote lines/) }]);
    expect(snap.quoteLines).toHaveLength(0);
  });
});
