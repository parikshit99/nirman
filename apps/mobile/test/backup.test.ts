import { describe, expect, it } from 'vitest';
import { BackupError, exportBackup, parseBackup, restoreBackup } from '../src/data/backup.ts';
import {
  addCategory,
  addItems,
  completeQuoteJob,
  enqueueJob,
  enqueueQuote,
  hideMaterial,
  indexRates,
  saveContract,
  saveContractEntry,
  loadSnapshot,
  saveDraftToHistory,
  setListNotes,
  updateItem,
} from '../src/data/repo.ts';
import { DRAFT_IDS, freshDb, projectOf } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500, vendor: 'Sharma', date: '2026-09-30' };

async function populated() {
  const db = await freshDb();
  await addItems(db, DRAFT_IDS.audit, [cement, { ...cement, item_name: 'Sand', original_term: 'reti', brand: 'Local', spec: 'Fine' }]);
  const [item] = (await loadSnapshot(db)).items;
  await updateItem(db, item.id, { item_name: 'OPC Cement' });
  await saveDraftToHistory(db, DRAFT_IDS.audit, { title: 'Day 1', address: 'Sector 44', category: 'Civil', site_date: '2026-09-30' });
  await setListNotes(db, DRAFT_IDS.boq, 'Glossy');
  await indexRates(db, [cement]);
  await addCategory(db, 'Earthwork');
  await hideMaterial(db, { key: '["sand","bag"]', name: 'Sand', unit: 'Bag' });
  // A BOQ with one read vendor quote, and one quote still waiting to be read.
  await addItems(db, DRAFT_IDS.boq, [{ ...cement, unit_price: 0 }]);
  const boqId = await saveDraftToHistory(db, DRAFT_IDS.boq, { title: 'Tower A', address: '', category: 'Civil', site_date: '' });
  await enqueueQuote(db, { boqId, vendor: 'Gupta', quoteDate: '2026-10-03', text: '', images: ['IMG'] });
  const snap = await loadSnapshot(db);
  const boqItemIds = snap.items.filter((i) => i.list_id === boqId).map((i) => i.id);
  await completeQuoteJob(db, snap.jobs[0].id, [
    { boq_sr: 1, original_term: 'bori', item_name: 'Cement', quantity: 15, unit: 'Bag', unit_price: 380, total_amount: 0, note: '' },
  ], boqItemIds);
  const contract = await saveContract(db, {
    project_id: await projectOf(db),
    contractor: 'Ramesh', phone: '', address: 'Sector 44', category: 'Civil', work: 'Plaster', kind: 'lump_sum', rate: 0, unit: '', est_quantity: 0, amount: 90000, retention_pct: 0, start_date: '', notes: '',
  });
  await saveContractEntry(db, { contract_id: contract, kind: 'payment', date: '2026-10-02', quantity: 0, amount: 5000, mode: 'cash', note: '' });
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
    expect([restored.contracts.length, restored.contractEntries.length]).toEqual([1, 1]);
    expect(restored.jobs).toHaveLength(0);
    expect(restored.items.some((i) => i.item_name === 'Old data')).toBe(false);
  });

  it('rejects other files without touching the data', async () => {
    const db = await populated();
    const before = await loadSnapshot(db);
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"something-else"}')).toThrow(/not a Nirman backup/);
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
    const snap = await loadSnapshot(db);
    for (const p of snap.projects) {
      expect(snap.lists.filter((l) => l.project_id === p.id && l.status === 'draft').map((l) => l.kind).sort()).toEqual(['audit', 'boq']);
    }
  });

  it('sorts lists and contracts of backups made before projects (version 10) into projects by site address', async () => {
    const db = await populated();
    const backup = await exportBackup(db);
    const strip = <T extends object>(rows: T[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'project_id')));
    const { projects: _p, ...rest } = backup;
    const v10 = { ...rest, version: 10, lists: strip(backup.lists), contracts: strip(backup.contracts), indexed_rates: strip(backup.indexed_rates) };
    const target = await freshDb();
    await restoreBackup(target, parseBackup(JSON.stringify(v10)));
    const snap = await loadSnapshot(target);
    const project = (id: string) => snap.projects.find((p) => p.id === id)?.name;
    expect(snap.projects.map((p) => p.name).sort()).toEqual(['My site', 'Sector 44']);
    expect(snap.lists.filter((l) => l.status === 'saved').map((l) => [l.title, project(l.project_id)])).toEqual(
      expect.arrayContaining([['Day 1', 'Sector 44'], ['Tower A', 'My site']]),
    );
    expect(project(snap.contracts[0].project_id)).toBe('Sector 44');
    // The open lists go to the project used last (the contract, in Sector 44); every project has its own pair.
    expect(project(snap.lists.find((l) => l.id === DRAFT_IDS.boq)!.project_id)).toBe('Sector 44');
    expect(snap.lists.find((l) => l.id === DRAFT_IDS.boq)?.notes).toBe('Glossy');
    expect(snap.lists.filter((l) => l.status === 'draft')).toHaveLength(4);
  });

  it('still restores backups made before vendor quotes existed (version 1)', async () => {
    const db = await populated();
    const { quotes: _q, quote_lines: _l, hidden_materials: _h, ...v1 } = await exportBackup(db);
    const parsed = parseBackup(JSON.stringify({ ...v1, version: 1 }));
    expect(parsed.quotes).toEqual([]);
    const target = await freshDb();
    await restoreBackup(target, parsed);
    const snap = await loadSnapshot(target);
    expect(snap.quotes).toHaveLength(0);
    expect(snap.items.length).toBe((await loadSnapshot(db)).items.length);
  });

  it('still restores version 3 backups, whose rows have no brand / model / spec / colour', async () => {
    const db = await populated();
    const backup = await exportBackup(db);
    const strip = (rows: object[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !['brand', 'model', 'spec', 'color'].includes(k))));
    const v3 = { ...backup, version: 3, items: strip(backup.items), indexed_rates: strip(backup.indexed_rates), quote_lines: strip(backup.quote_lines) };
    const parsed = parseBackup(JSON.stringify(v3));
    expect(parsed.items.every((i) => i.brand === '' && i.color === '')).toBe(true);
    const target = await freshDb();
    await restoreBackup(target, parsed);
    expect((await loadSnapshot(target)).items.length).toBe((await loadSnapshot(db)).items.length);
  });

  it('still restores version 2 backups, which have no hidden materials', async () => {
    const db = await populated();
    const { hidden_materials: _h, ...v2 } = await exportBackup(db);
    const parsed = parseBackup(JSON.stringify({ ...v2, version: 2 }));
    expect(parsed.hidden_materials).toEqual([]);
    expect(parsed.quotes).toHaveLength(1);
  });
});
