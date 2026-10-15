import { describe, expect, it } from 'vitest';
import { buildItemDatabase, materialKey, type ExtractionRequest } from '@nirman/shared';
import { addItems, addTypedItems, enqueueJob, indexRates, knownMaterials, learningMap, loadSnapshot, renameMaterial, undoMatch } from '../src/data/repo.ts';
import type { Extractor } from '../src/lib/gemini.ts';
import { JobWorker } from '../src/jobs/worker.ts';
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts';
import { DRAFT_IDS, freshDb } from './helpers.ts';

const line = (item_name: string, unit: string, quantity: number, unit_price: number) => ({ item_name, original_term: '', quantity, unit, unit_price, total_amount: quantity * unit_price, vendor: '', date: '2026-10-01' });

async function readWith(lines: ReturnType<typeof line>[]) {
  const db = await freshDb();
  const calls: ExtractionRequest[] = [];
  const extractor: Extractor = { extract: async (req) => (calls.push(req), lines), extractQuote: async () => [] };
  const worker = new JobWorker(db, () => ({ ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test', readingMode: 'gemini' }), () => extractor);
  const read = async () => {
    await enqueueJob(db, { listId: DRAFT_IDS.audit, text: 'bill', images: [], category: 'Civil', captureDate: '2026-10-01' });
    await worker.run();
  };
  return { db, calls, read };
}

describe('matching lines as they are read (#89)', () => {
  it('gives a reading the name already in Rates, and Undo puts it back', async () => {
    const { db, calls, read } = await readWith([line('Mount air', 'pcs', 3, 250)]);
    await addItems(db, DRAFT_IDS.audit, [line('Mountair', 'piece', 2, 240)]);
    await read();
    expect(calls[0].materials?.[0]).toEqual({ name: 'Mountair', unit: 'piece' });
    const snap = await loadSnapshot(db);
    const matched = snap.items.find((i) => i.read_as)!;
    expect(matched).toMatchObject({ item_name: 'Mountair', unit: 'piece', original_term: 'Mount air' });
    // One material in Rates with both prices.
    const rates = buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned));
    expect(rates.map((e) => [e.name, e.priceHistory.length])).toEqual([['Mountair', 2]]);

    await undoMatch(db, matched.id);
    const undone = (await loadSnapshot(db)).items.find((i) => i.id === matched.id)!;
    expect(undone).toMatchObject({ item_name: 'Mount air', unit: 'pcs', quantity: 3, unit_price: 250, read_as: '' });
  });

  it('saves a matched line read too long to keep as it was read, without the Undo (never cut JSON)', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [line('Mountair', 'piece', 2, 240)]);
    const long = { ...line('mount-air', 'Pcs', 1, 245), brand: 'b'.repeat(900), spec: 's'.repeat(900), ordered_as: 'o'.repeat(900) };
    const [stored] = await addTypedItems(db, DRAFT_IDS.audit, [long]);
    expect(String(stored.read_as).length).toBeGreaterThan(2000);
    const typed = (await loadSnapshot(db)).items.find((i) => i.original_term === 'mount-air')!;
    expect(typed).toMatchObject({ item_name: 'Mountair', read_as: '' });
    await undoMatch(db, typed.id);
    expect((await loadSnapshot(db)).items.find((i) => i.id === typed.id)?.item_name).toBe('Mountair');
  });

  it('matches lines typed by hand the same way', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [line('Mountair', 'piece', 2, 240)]);
    const [stored] = await addTypedItems(db, DRAFT_IDS.audit, [line('mount-air', 'Pcs', 1, 245)]);
    expect(stored).toMatchObject({ item_name: 'Mountair', unit: 'piece' });
    const typed = (await loadSnapshot(db)).items.find((i) => i.read_as)!;
    expect(typed).toMatchObject({ item_name: 'Mountair', original_term: 'mount-air' });
  });

  it('converts a reading in MT to the kg its material is priced in', async () => {
    const { db, read } = await readWith([line('TMT bar 12mm', 'MT', 2, 56000)]);
    await addItems(db, DRAFT_IDS.audit, [line('TMT bar', 'kg', 500, 57)]);
    await read();
    const matched = (await loadSnapshot(db)).items.find((i) => i.read_as)!;
    expect(matched).toMatchObject({ item_name: 'TMT bar', unit: 'kg', quantity: 2000, unit_price: 56, total_amount: 112000, ordered_as: '2 MT' });
  });

  it('knows materials by their learned names, leaving out deleted ones and BOQs', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [line('Cement', 'Bag', 1, 380), line('Cement', 'Bag', 2, 385)]);
    await addItems(db, DRAFT_IDS.boq, [line('Door closer', 'nos', 1, 0)]);
    await indexRates(db, [{ item_name: 'Sand', unit: 'brass', unit_price: 5200, vendor: '', date: '2026-10-01' }]);
    expect((await knownMaterials(db)).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'Cement', unit: 'Bag', uses: 2 },
      { name: 'Sand', unit: 'brass', uses: 1 },
    ]);
  });
});

describe('merging materials in different units', () => {
  it('converts quantities and rates when asked, keeping totals', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [line('Sariya', 'MT', 2, 56000), line('TMT bar', 'kg', 100, 57)]);
    await indexRates(db, [{ item_name: 'Sariya', unit: 'MT', unit_price: 55000, vendor: '', date: '2026-10-02' }]);
    await renameMaterial(db, materialKey('Sariya', 'MT'), { item_name: 'TMT bar', unit: 'kg' }, true);
    const snap = await loadSnapshot(db);
    expect(snap.items.find((i) => i.ordered_as)).toMatchObject({ item_name: 'TMT bar', unit: 'kg', quantity: 2000, unit_price: 56, total_amount: 112000, ordered_as: '2 MT' });
    expect(snap.rates[0]).toMatchObject({ item_name: 'TMT bar', unit: 'kg', price: 55 });
  });

  it('keeps the numbers when only the unit is corrected', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [line('Sand', 'MT', 2, 1500)]);
    await renameMaterial(db, materialKey('Sand', 'MT'), { item_name: 'Sand', unit: 'kg' });
    expect((await loadSnapshot(db)).items[0]).toMatchObject({ unit: 'kg', quantity: 2, unit_price: 1500 });
  });
});
