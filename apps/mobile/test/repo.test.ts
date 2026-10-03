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
  deleteCategory,
  deleteItem,
  deleteList,
  enqueueJob,
  enqueueQuote,
  getJobImages,
  indexRates,
  learningMap,
  loadSnapshot,
  restoreToDraft,
  saveDraftToHistory,
  setListNotes,
  updateItem,
  updateQuoteLine,
} from '../src/data/repo.ts';
import { migrateLocal } from '../src/data/schema.ts';
import { freshDb } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 0, vendor: 'Sharma', date: '2026-09-30' };
const sand = { item_name: 'Sand', original_term: 'reti', quantity: 2, unit: 'MT', unit_price: 1500, total_amount: 3000, vendor: '', date: '' };
const meta = { title: 'Morning audit', address: 'Sector 44', category: 'Civil', site_date: '2026-09-30' };

describe('local repository', () => {
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

  it('indexes rates, replacing identical ones, and bulk-edits materials', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [cement]);
    await saveDraftToHistory(db, 'audit', meta);
    await indexRates(db, [cement]);
    await indexRates(db, [cement]);
    let snap = await loadSnapshot(db);
    expect(snap.rates).toHaveLength(1);

    await bulkEditMaterials(db, new Set([materialKey('Cement', 'Bag')]), { vendor: 'Gupta', price: 520 });
    snap = await loadSnapshot(db);
    expect(snap.items.every((i) => i.vendor === 'Gupta' && i.unit_price === 520 && i.total_amount === 520 * 15)).toBe(true);
    const [entry] = buildItemDatabase(snap.lists, snap.items, snap.rates, {});
    expect(entry.priceHistory.map((p) => p.price).sort()).toEqual([500, 520]);
    expect(entry.vendors.sort()).toEqual(['Gupta', 'Sharma']);
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
      const entry = buildItemDatabase(snap.lists, snap.items, snap.rates, learningMap(snap.learned)).find((e) => e.key === materialKey('Cement', 'Bag'));
      expect(entry?.latestPrice).toBe(380);
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
