import { describe, expect, it } from 'vitest';
import { buildItemDatabase, materialKey } from '@nirman/shared';
import {
  DRAFT_IDS,
  addCategory,
  addItems,
  bulkEditMaterials,
  clearListItems,
  completeJob,
  completeQuoteJob,
  confirmQuote,
  deleteJob,
  deleteLearnedTerm,
  deleteCategory,
  deleteItem,
  deleteList,
  enqueueJob,
  enqueueQuote,
  getJobImages,
  hideMaterial,
  indexRates,
  learningMap,
  loadSnapshot,
  renameMaterial,
  restoreToDraft,
  saveDraftToHistory,
  setListNotes,
  setDelivered,
  setPrice,
  unhideMaterial,
  updateItem,
  updateLearnedTerm,
  updateQuoteLine,
} from '../src/data/repo.ts';
import { migrateLocal } from '../src/data/schema.ts';
import { freshDb } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 0, vendor: 'Sharma', date: '2026-09-30' };
const sand = { item_name: 'Sand', original_term: 'reti', quantity: 2, unit: 'MT', unit_price: 1500, total_amount: 3000, vendor: '', date: '' };
const meta = { title: 'Morning audit', address: 'Sector 44', category: 'Civil', site_date: '2026-09-30' };

describe('local repository', () => {
  it('reads rows written without brand / model / spec / colour as blank', async () => {
    const db = await freshDb();
    await db.run(
      `INSERT INTO items (id, list_id, item_name, original_term, quantity, unit, unit_price, total_amount, vendor, date, created_at, updated_at)
       VALUES ('old', ?, 'Cement', '', 1, 'Bag', 400, 400, '', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      [DRAFT_IDS.audit],
    );
    expect((await loadSnapshot(db)).items.find((i) => i.id === 'old')).toMatchObject({ brand: '', model: '', spec: '', color: '' });
  });

  it('seeds categories and drafts, and migrations are idempotent', async () => {
    const db = await freshDb();
    await migrateLocal(db);
    const snap = await loadSnapshot(db);
    expect(snap.categories.map((c) => c.name)).toEqual(['Civil', 'Electrical', 'Plumbing', 'Carpenter', 'Hvac', 'Tile', 'Stone', 'Other']);
    expect(snap.lists.map((l) => l.id).sort()).toEqual([DRAFT_IDS.audit, DRAFT_IDS.boq]);
  });

  it('adds items newest-first and computes totals', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement, sand]);
    await addItems(db, DRAFT_IDS.audit, [{ ...sand, item_name: 'Bricks' }]);
    const snap = await loadSnapshot(db);
    expect(snap.items.map((i) => i.item_name)).toEqual(['Bricks', 'Cement', 'Sand']);
    expect(snap.items.find((i) => i.item_name === 'Cement')?.total_amount).toBe(7500);
  });

  it('learns corrections when name or unit changes', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement]);
    const [item] = (await loadSnapshot(db)).items;
    await updateItem(db, item.id, { quantity: 10, unit_price: 450 });
    expect((await loadSnapshot(db)).learned).toHaveLength(0);
    await updateItem(db, item.id, { item_name: 'OPC Cement 53 Grade' });
    const snap = await loadSnapshot(db);
    expect(snap.items[0].total_amount).toBe(4500);
    expect(learningMap(snap.learned)).toEqual({ bori: { item_name: 'OPC Cement 53 Grade', unit: 'Bag' } });
  });

  it('marks purchase lines delivered and keeps the date through saving and reopening', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement, sand]);
    const draft = (await loadSnapshot(db)).items.filter((i) => i.list_id === DRAFT_IDS.audit);
    const byName = (n: string) => draft.find((i) => i.item_name === n)!;
    expect(byName('Sand').delivered_at).toBe('');
    await setDelivered(db, [byName('Sand').id], '2026-10-03');
    const id = await saveDraftToHistory(db, 'audit', meta);
    // Ticked on the draft after saving: reopening the saved copy brings back what was saved.
    await setDelivered(db, [byName('Cement').id], '2026-10-04');
    await restoreToDraft(db, id);
    const reopened = (await loadSnapshot(db)).items.filter((i) => i.list_id === DRAFT_IDS.audit);
    expect(reopened.map((i) => [i.item_name, i.delivered_at]).sort()).toEqual([['Cement', ''], ['Sand', '2026-10-03']].sort());
    await setDelivered(db, reopened.map((i) => i.id), '');
    expect((await loadSnapshot(db)).items.filter((i) => i.list_id === DRAFT_IDS.audit).every((i) => i.delivered_at === '')).toBe(true);
  });

  it('edits and forgets single learned corrections', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement, sand]);
    const items = (await loadSnapshot(db)).items;
    await updateItem(db, items.find((i) => i.item_name === 'Cement')!.id, { item_name: 'OPC Cement' });
    await updateItem(db, items.find((i) => i.item_name === 'Sand')!.id, { unit: 'Brass' });
    await updateLearnedTerm(db, 'bori', { item_name: ' PPC Cement ', unit: 'Bag' });
    await updateLearnedTerm(db, 'missing', { item_name: 'X', unit: 'Y' });
    await deleteLearnedTerm(db, 'reti');
    expect(learningMap((await loadSnapshot(db)).learned)).toEqual({ bori: { item_name: 'PPC Cement', unit: 'Bag' } });
  });

  it('saves drafts to history, updates records in place and restores them', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.boq, [cement, sand]);
    await setListNotes(db, DRAFT_IDS.boq, 'Glossy finish');
    const id = await saveDraftToHistory(db, 'boq', meta);

    let snap = await loadSnapshot(db);
    const record = snap.lists.find((l) => l.id === id)!;
    expect(record).toMatchObject({ status: 'saved', kind: 'boq', title: 'Morning audit', notes: 'Glossy finish' });
    expect(snap.items.filter((i) => i.list_id === id).map((i) => i.item_name)).toEqual(['Cement', 'Sand']);

    // Update in place: record keeps its id, items are replaced.
    const [first] = snap.items.filter((i) => i.list_id === DRAFT_IDS.boq);
    await deleteItem(db, first.id);
    await saveDraftToHistory(db, 'boq', { ...meta, title: 'Updated' }, id);
    snap = await loadSnapshot(db);
    expect(snap.lists.filter((l) => l.status === 'saved')).toHaveLength(1);
    expect(snap.items.filter((i) => i.list_id === id)).toHaveLength(1);

    // Restore into the draft.
    await clearListItems(db, DRAFT_IDS.boq);
    await setListNotes(db, DRAFT_IDS.boq, '');
    await restoreToDraft(db, id);
    snap = await loadSnapshot(db);
    expect(snap.items.filter((i) => i.list_id === DRAFT_IDS.boq)).toHaveLength(1);
    expect(snap.lists.find((l) => l.id === DRAFT_IDS.boq)?.notes).toBe('Glossy finish');

    await deleteList(db, id);
    snap = await loadSnapshot(db);
    expect(snap.lists.find((l) => l.id === id)).toBeUndefined();
    expect(snap.items.filter((i) => i.list_id === id)).toHaveLength(0);
  });

  it('indexes rates, replacing identical ones, and bulk-edits materials without losing old prices', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement]);
    await saveDraftToHistory(db, 'audit', meta);
    await indexRates(db, [cement]);
    await indexRates(db, [cement]);
    let snap = await loadSnapshot(db);
    expect(snap.rates).toHaveLength(1);

    const ref = { key: materialKey('Cement', 'Bag'), name: 'Cement', unit: 'Bag' };
    await bulkEditMaterials(db, [ref], { vendor: 'Gupta', price: 520 });
    snap = await loadSnapshot(db);
    expect(snap.items.every((i) => i.unit_price === 500 && i.vendor === 'Sharma')).toBe(true);
    let [entry] = buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned));
    // The indexed 500 is the saved line's own price, so it counts once.
    expect(entry.priceHistory.map((p) => p.price).sort()).toEqual([500, 520]);
    expect(entry.vendors.sort()).toEqual(['Gupta', 'Sharma']);

    await bulkEditMaterials(db, [ref], { unit: 'Bori' });
    snap = await loadSnapshot(db);
    [entry] = buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned));
    expect(entry.unit).toBe('Bori');
    expect(entry.priceHistory).toHaveLength(2);
  });

  it('renames a material everywhere, merging duplicates and remembering the old words', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement, { ...cement, item_name: 'OPC Cement', original_term: 'cement bag', unit_price: 510 }]);
    await saveDraftToHistory(db, 'audit', meta);
    await indexRates(db, [{ ...cement, unit_price: 505 }]);
    let snap = await loadSnapshot(db);
    expect(buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned))).toHaveLength(2);

    await renameMaterial(db, materialKey('Cement', 'Bag'), { item_name: 'OPC Cement', unit: 'Bag' });
    snap = await loadSnapshot(db);
    const db2 = buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned));
    expect(db2.map((e) => e.name)).toEqual(['OPC Cement']);
    expect(db2[0].priceHistory.map((p) => p.price).sort()).toEqual([500, 505, 510]);
    // The vendor's word "bori" now reads as OPC Cement in future extractions too.
    expect(learningMap(snap.learned).bori).toEqual({ item_name: 'OPC Cement', unit: 'Bag' });
  });

  it('does not pull in other materials read from the same word when renaming', async () => {
    const db = await freshDb();
    const bagCement = { ...cement, original_term: 'cement' };
    await addItems(db, DRAFT_IDS.audit, [bagCement]);
    await saveDraftToHistory(db, 'audit', meta);
    await addItems(db, DRAFT_IDS.boq, [{ ...bagCement, unit: 'kg', unit_price: 9 }]);
    await saveDraftToHistory(db, 'boq', { ...meta, title: 'Loose cement' });

    await renameMaterial(db, materialKey('Cement', 'Bag'), { item_name: 'OPC Cement', unit: 'ton' });
    const snap = await loadSnapshot(db);
    const names = buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned)).map((e) => `${e.name}/${e.unit}`);
    expect(names.sort()).toEqual(['Cement/kg', 'OPC Cement/ton']);
    // "cement" is also used per kg, so it is not remembered as OPC Cement per ton.
    expect(learningMap(snap.learned).cement).toBeUndefined();
  });

  it('corrects one price in a saved list or an added rate, and hides materials', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement]);
    const listId = await saveDraftToHistory(db, 'audit', meta);
    await indexRates(db, [{ ...cement, unit_price: 505 }]);
    let snap = await loadSnapshot(db);
    const saved = snap.items.find((i) => i.list_id === listId)!;
    await setPrice(db, { itemId: saved.id }, 480);
    await setPrice(db, { rateId: snap.rates[0].id }, 490);
    snap = await loadSnapshot(db);
    expect(snap.items.find((i) => i.id === saved.id)).toMatchObject({ unit_price: 480, total_amount: 480 * 15 });
    expect(snap.items.find((i) => i.list_id === DRAFT_IDS.audit)?.unit_price).toBe(500);
    expect(snap.rates[0].price).toBe(490);

    const ref = { key: materialKey('Cement', 'Bag'), name: 'Cement', unit: 'Bag' };
    await hideMaterial(db, ref);
    await hideMaterial(db, ref);
    snap = await loadSnapshot(db);
    expect(snap.hidden.map((h) => h.id)).toEqual([ref.key]);
    expect(snap.items.find((i) => i.id === saved.id)).toBeDefined();
    await unhideMaterial(db, ref.key);
    expect((await loadSnapshot(db)).hidden).toHaveLength(0);

    // Renaming another material onto a hidden one shows it again instead of hiding these prices too.
    await addItems(db, DRAFT_IDS.audit, [{ ...cement, item_name: 'Cement 53', original_term: 'pp bag' }]);
    await saveDraftToHistory(db, 'audit', meta);
    await hideMaterial(db, ref);
    await renameMaterial(db, materialKey('Cement 53', 'Bag'), { item_name: 'Cement', unit: 'Bag' });
    expect((await loadSnapshot(db)).hidden).toHaveLength(0);
  });

  it('manages categories by name', async () => {
    const db = await freshDb();
    await addCategory(db, 'Earthwork');
    await addCategory(db, 'earthwork');
    await deleteCategory(db, 'hvac');
    const names = (await loadSnapshot(db)).categories.map((c) => c.name);
    expect(names).toContain('Earthwork');
    expect(names.filter((n) => n.toLowerCase() === 'earthwork')).toHaveLength(1);
    expect(names).not.toContain('Hvac');
  });

  it('queues jobs with images and completes them atomically', async () => {
    const db = await freshDb();
    const jobId = await enqueueJob(db, { listId: DRAFT_IDS.audit, text: '15 bori', images: ['AAA', 'BBB'], category: 'Civil', captureDate: '2026-09-30' });
    let snap = await loadSnapshot(db);
    expect(snap.jobs).toMatchObject([{ id: jobId, status: 'pending', image_count: 2 }]);
    expect(await getJobImages(db, jobId)).toEqual(['AAA', 'BBB']);

    await completeJob(db, jobId, [cement]);
    snap = await loadSnapshot(db);
    expect(snap.jobs).toHaveLength(0);
    expect(snap.items.map((i) => i.list_id)).toEqual([DRAFT_IDS.audit]);
    expect(await getJobImages(db, jobId)).toEqual([]);
  });

  describe('vendor quotes', () => {
    const boqMeta = { title: 'Tower A', address: 'Sector 44', category: 'Civil', site_date: '2026-10-01' };
    const line = (over: object) => ({ boq_sr: null, original_term: '', item_name: '', quantity: 0, unit: 'Bag', unit_price: 0, total_amount: 0, note: '', ...over });

    /** A saved BOQ (Sand, Cement) with one quote read: Cement matched, a wire line unmatched. */
    async function quoted() {
      const db = await freshDb();
      await addItems(db, DRAFT_IDS.boq, [{ ...sand, unit_price: 0 }, { ...cement, unit_price: 0 }]);
      const boqId = await saveDraftToHistory(db, 'boq', boqMeta);
      const quoteId = await enqueueQuote(db, { boqId, vendor: 'Gupta', quoteDate: '2026-10-03', text: '', images: ['IMG'] });
      const snap = await loadSnapshot(db);
      const boqItems = snap.items.filter((i) => i.list_id === boqId);
      await completeQuoteJob(db, snap.jobs[0].id, [
        line({ boq_sr: 2, original_term: 'ACC bori', item_name: 'ACC Cement', quantity: 15, unit_price: 380 }),
        line({ original_term: 'bandhai taar', item_name: 'Binding wire', unit: 'kg', unit_price: 90 }),
      ], boqItems.map((i) => i.id));
      return { db, boqId, quoteId, boqItems };
    }

    it('confirming indexes prices under the BOQ names and learns the vendor wording', async () => {
      const { db, quoteId } = await quoted();
      await confirmQuote(db, quoteId);
      const snap = await loadSnapshot(db);
      expect(snap.quotes[0].status).toBe('confirmed');
      expect(snap.rates.map((r) => [r.item_name, r.unit, r.price, r.vendor, r.date]).sort()).toEqual([
        ['Binding wire', 'kg', 90, 'Gupta', '2026-10-03'],
        ['Cement', 'Bag', 380, 'Gupta', '2026-10-03'],
      ]);
      expect(learningMap(snap.learned)['acc bori']).toEqual({ item_name: 'Cement', unit: 'Bag' });
      // Filed under the BOQ's work type and site, so the Data tab's filters find them.
      expect(snap.rates.map((r) => [r.category, r.address])).toEqual([['Civil', 'Sector 44'], ['Civil', 'Sector 44']]);
      const entry = buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned)).find((e) => e.key === materialKey('Cement', 'Bag'));
      expect(entry?.latestPrice).toBe(380);
    });

    it('fills in the work type and site of rates confirmed before they were recorded', async () => {
      const { db, quoteId } = await quoted();
      await confirmQuote(db, quoteId);
      // Back to how a phone stored them before migration 5.
      await db.run('ALTER TABLE indexed_rates DROP COLUMN category');
      await db.run('ALTER TABLE indexed_rates DROP COLUMN address');
      await db.run('ALTER TABLE items DROP COLUMN delivered_at');
      await db.run('ALTER TABLE items DROP COLUMN ordered_as');
      await db.run('UPDATE schema_version SET version = 4');
      await migrateLocal(db);
      const rates = (await loadSnapshot(db)).rates.map((r) => [r.item_name, r.category, r.address]).sort();
      expect(rates).toEqual([
        ['Binding wire', 'Civil', 'Sector 44'],
        ['Cement', 'Civil', 'Sector 44'],
      ]);
    });

    it('records what the vendor priced: their brand where written, else what the BOQ asked for', async () => {
      const db = await freshDb();
      await addItems(db, DRAFT_IDS.boq, [
        { ...cement, unit_price: 0, brand: 'UltraTech', spec: '53 grade' },
        { ...sand, unit_price: 0, brand: 'Any' },
      ]);
      const boqId = await saveDraftToHistory(db, 'boq', boqMeta);
      const quoteId = await enqueueQuote(db, { boqId, vendor: 'Gupta', quoteDate: '2026-10-03', text: '', images: ['IMG'] });
      let snap = await loadSnapshot(db);
      const boqItems = snap.items.filter((i) => i.list_id === boqId);
      const sr = (name: string) => boqItems.findIndex((i) => i.item_name === name) + 1;
      await completeQuoteJob(db, snap.jobs[0].id, [
        line({ boq_sr: sr('Cement'), item_name: 'Cement', quantity: 15, unit_price: 380 }),
        line({ boq_sr: sr('Sand'), item_name: 'Sand', unit: 'MT', unit_price: 1400, brand: 'Local' }),
      ], boqItems.map((i) => i.id));
      await confirmQuote(db, quoteId);
      snap = await loadSnapshot(db);
      expect(snap.rates.map((r) => [r.item_name, r.brand, r.spec]).sort()).toEqual([
        ['Cement', 'UltraTech', '53 grade'],
        ['Sand', 'Local', ''],
      ]);
    });

    it('keeps the vendor unit when it differs from the BOQ, and does not learn it', async () => {
      const { db, quoteId } = await quoted();
      const cementLine = (await loadSnapshot(db)).quoteLines[0];
      await updateQuoteLine(db, cementLine.id, { unit: 'kg', unit_price: 8 });
      await confirmQuote(db, quoteId);
      const snap = await loadSnapshot(db);
      expect(snap.rates.find((r) => r.item_name === 'Cement')).toMatchObject({ unit: 'kg', price: 8 });
      expect(snap.learned).toHaveLength(0);
    });

    it('re-saving the BOQ keeps matches; deleting it removes its quotes', async () => {
      const { db, boqId } = await quoted();
      await restoreToDraft(db, boqId);
      await saveDraftToHistory(db, 'boq', boqMeta, boqId);
      let snap = await loadSnapshot(db);
      const cementId = snap.items.find((i) => i.list_id === boqId && i.item_name === 'Cement')!.id;
      expect(snap.quoteLines[0].boq_item_id).toBe(cementId);

      await deleteList(db, boqId);
      snap = await loadSnapshot(db);
      expect(snap.quotes).toHaveLength(0);
      expect(snap.quoteLines).toHaveLength(0);
    });

    it('removing a quote reading from the queue removes the empty quote', async () => {
      const db = await freshDb();
      await addItems(db, DRAFT_IDS.boq, [cement]);
      const boqId = await saveDraftToHistory(db, 'boq', boqMeta);
      await enqueueQuote(db, { boqId, vendor: 'Gupta', quoteDate: '2026-10-03', text: 'x', images: ['IMG'] });
      const [job] = (await loadSnapshot(db)).jobs;
      expect(job.quote_id).toBeTruthy();
      await deleteJob(db, job.id);
      const snap = await loadSnapshot(db);
      expect(snap.quotes).toHaveLength(0);
      expect(await getJobImages(db, job.id)).toEqual([]);
    });
  });
});

describe('typed vendor quotes', () => {
  it('records a rate against each BOQ line for review, skipping blanks', async () => {
    const { createManualQuote } = await import('../src/data/repo.ts');
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.boq, [{ ...sand, unit_price: 0 }, { ...cement, unit_price: 0, brand: 'UltraTech' }]);
    const boqId = await saveDraftToHistory(db, 'boq', { title: 'Tower A', address: 'Sector 44', category: 'Civil', site_date: '2026-10-01' });
    const boqItems = (await loadSnapshot(db)).items.filter((i) => i.list_id === boqId);
    const id = await createManualQuote(db, {
      boqId, vendor: ' Gupta ', quoteDate: '2026-10-05',
      rates: boqItems.map((i) => ({ boqItemId: i.id, unitPrice: i.item_name === 'Cement' ? 385 : 0 })),
    });
    const snap = await loadSnapshot(db);
    expect(snap.quotes.find((q) => q.id === id)).toMatchObject({ vendor: 'Gupta', status: 'review' });
    expect(snap.quoteLines.map((l) => [l.item_name, l.quantity, l.unit_price, l.total_amount, l.brand])).toEqual([['Cement', 15, 385, 5775, 'UltraTech']]);
    await confirmQuote(db, id);
    expect((await loadSnapshot(db)).rates.map((r) => [r.item_name, r.price, r.vendor])).toEqual([['Cement', 385, 'Gupta']]);
  });
});
