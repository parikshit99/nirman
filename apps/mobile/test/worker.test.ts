import { describe, expect, it } from 'vitest';
import type { ExtractionRequest } from '@nirman/shared';
import { DRAFT_IDS, enqueueJob, loadSnapshot, updateItem, addItems } from '../src/data/repo.ts';
import { ExtractionError, type Extractor } from '../src/lib/gemini.ts';
import { JobWorker, NO_KEY_MESSAGE } from '../src/jobs/worker.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings.ts';
import { freshDb } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500, vendor: '', date: '2026-09-30' };

function setup(behaviour: (req: ExtractionRequest) => Promise<typeof cement[]>, settings: Settings = { ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test' }) {
  return freshDb().then((db) => {
    const calls: ExtractionRequest[] = [];
    const keys: string[] = [];
    const extractor: Extractor = { extract: (req) => (calls.push(req), behaviour(req)) };
    const worker = new JobWorker(db, () => settings, () => {}, (key) => (keys.push(key), extractor));
    return { db, worker, calls, keys, settings };
  });
}

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
});
