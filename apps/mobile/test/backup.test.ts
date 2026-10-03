import { describe, expect, it } from 'vitest';
import { BackupError, exportBackup, parseBackup, restoreBackup } from '../src/data/backup.ts';
import {
  DRAFT_IDS,
  addCategory,
  addItems,
  completeQuoteJob,
  enqueueJob,
  enqueueQuote,
  indexRates,
  loadSnapshot,
  saveDraftToHistory,
  setListNotes,
  updateItem,
} from '../src/data/repo.ts';
import { freshDb } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500, vendor: 'Sharma', date: '2026-09-30' };

async function populated() {
  const db = await freshDb();
  await addItems(db, DRAFT_IDS.audit, [cement, { ...cement, item_name: 'Sand', original_term: 'reti' }]);
  const [item] = (await loadSnapshot(db)).items;
  await updateItem(db, item.id, { item_name: 'OPC Cement' });
  await saveDraftToHistory(db, 'audit', { title: 'Day 1', address: 'Sector 44', category: 'Civil', site_date: '2026-09-30' });
  await setListNotes(db, DRAFT_IDS.boq, 'Glossy');
  await indexRates(db, [cement]);
  await addCategory(db, 'Earthwork');
  // A BOQ with one read vendor quote, and one quote still waiting to be read.
  await addItems(db, DRAFT_IDS.boq, [{ ...cement, unit_price: 0 }]);
  const boqId = await saveDraftToHistory(db, 'boq', { title: 'Tower A', address: '', category: 'Civil', site_date: '' });
  await enqueueQuote(db, { boqId, vendor: 'Gupta', quoteDate: '2026-10-03', text: '', images: ['IMG'] });
  const snap = await loadSnapshot(db);
  const boqItemIds = snap.items.filter((i) => i.list_id === boqId).map((i) => i.id);
  await completeQuoteJob(db, snap.jobs[0].id, [
    { boq_sr: 1, original_term: 'bori', item_name: 'Cement', quantity: 15, unit: 'Bag', unit_price: 380, total_amount: 0, note: '' },
  ], boqItemIds);
  await enqueueQuote(db, { boqId, vendor: 'Unread', quoteDate: '2026-10-03', text: '', images: ['IMG'] });
  return db;
}

const strip = (s: Awaited<ReturnType<typeof loadSnapshot>>) => ({ ...s, jobs: [] });

describe('backup', () => {
  it('round-trips every record through a backup file', async () => {
    const source = await populated();
    const text = JSON.stringify(await exportBackup(source));

    const target = await freshDb();
    await addItems(target, DRAFT_IDS.audit, [{ ...cement, item_name: 'Old data' }]);
    await enqueueJob(target, { listId: DRAFT_IDS.audit, text: 'queued', images: [], category: '', captureDate: '2026-09-30' });
    await restoreBackup(target, parseBackup(text));

    const restored = await loadSnapshot(target);
    const original = await loadSnapshot(source);
    // The quote still waiting to be read is not a record yet.
    expect(strip(restored)).toEqual(strip({ ...original, quotes: original.quotes.filter((q) => q.vendor !== 'Unread') }));
    expect(restored.quoteLines).toHaveLength(1);
    expect(restored.jobs).toHaveLength(0);
    expect(restored.items.some((i) => i.item_name === 'Old data')).toBe(false);
  });

  it('rejects other files without touching the data', async () => {
    const db = await populated();
    const before = await loadSnapshot(db);
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"something-else"}')).toThrow(/not a Nirmaan backup/);
    const good = await exportBackup(db);
    expect(() => parseBackup(JSON.stringify({ ...good, version: 99 }))).toThrow(/newer version/);
    const damaged = { ...good, items: [{ ...good.items[0], quantity: 'lots' }] };
    expect(() => parseBackup(JSON.stringify(damaged))).toThrow(/damaged/);
    expect(await loadSnapshot(db)).toEqual(before);
  });

  it('restores drafts even if the backup has none', async () => {
    const db = await populated();
    const backup = await exportBackup(db);
    await restoreBackup(db, { ...backup, lists: backup.lists.filter((l) => l.status === 'saved') });
    const ids = (await loadSnapshot(db)).lists.map((l) => l.id);
    expect(ids).toContain(DRAFT_IDS.audit);
    expect(ids).toContain(DRAFT_IDS.boq);
  });

  it('still restores backups made before vendor quotes existed (version 1)', async () => {
    const db = await populated();
    const { quotes: _q, quote_lines: _l, ...v1 } = await exportBackup(db);
    const parsed = parseBackup(JSON.stringify({ ...v1, version: 1 }));
    expect(parsed.quotes).toEqual([]);
    const target = await freshDb();
    await restoreBackup(target, parsed);
    const snap = await loadSnapshot(target);
    expect(snap.quotes).toHaveLength(0);
    expect(snap.items.length).toBe((await loadSnapshot(db)).items.length);
  });
});
