import { describe, expect, it } from 'vitest';
import { buildItemDatabase, materialKey } from '@nirman/shared';
import {
  DRAFT_IDS,
  addCategory,
  addItems,
  bulkEditMaterials,
  clearListItems,
  completeJob,
  deleteCategory,
  deleteItem,
  deleteList,
  enqueueJob,
  getJobImages,
  indexRates,
  learningMap,
  loadSnapshot,
  restoreToDraft,
  saveDraftToHistory,
  setListNotes,
  updateItem,
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
});
