import { describe, expect, it } from 'vitest';
import { BackupError, exportBackup, exportBackupZip, writeBackupZip, parseBackup, parseBackupFile, restoreBackup } from '../src/data/backup.ts';
import { getBillPhotos } from '../src/data/repo.ts';
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

  it('keeps bill photos in a .zip backup, and still reads an old .json one', async () => {
    const source = await populated();
    const [line] = (await loadSnapshot(source)).items;
    const jpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3));
    await source.run("INSERT INTO bill_photos (id, created_at, images) VALUES ('ph1', '2026-09-30T10:00:00.000Z', ?)", [JSON.stringify([jpeg, jpeg])]);
    await source.run("UPDATE items SET photo_id = 'ph1' WHERE id = ?", [line.id]);

    const { bytes, photos } = await exportBackupZip(source);
    expect(photos).toBe(1);
    const file = parseBackupFile(bytes);
    expect(file.backup.bill_photos).toEqual([{ id: 'ph1', created_at: '2026-09-30T10:00:00.000Z', files: ['photos/ph1-1.jpg', 'photos/ph1-2.jpg'] }]);

    const target = await freshDb();
    await restoreBackup(target, file.backup, file.photos);
    expect(await getBillPhotos(target, 'ph1')).toEqual([jpeg, jpeg]);
    expect((await loadSnapshot(target)).items.find((i) => i.id === line.id)?.photo_id).toBe('ph1');

    const old = parseBackupFile(new TextEncoder().encode(JSON.stringify(await exportBackup(source))));
    expect([old.backup.items.length, old.photos.size]).toEqual([file.backup.items.length, 0]);
    expect(() => parseBackupFile(new Uint8Array([0x50, 0x4b, 1, 2]))).toThrow(/damaged/);
  });

  it('writes the .zip piece by piece, one bill at a time, and restores every photo', async () => {
    const source = await populated();
    const page = (n: number) => btoa(String.fromCharCode(0xff, 0xd8, n, n, n));
    for (let n = 0; n < 5; n++) {
      await source.run('INSERT INTO bill_photos (id, created_at, images) VALUES (?, ?, ?)', [`ph${n}`, `2026-09-30T10:00:0${n}.000Z`, JSON.stringify([page(n), page(n + 10)])]);
      await source.run(
        `INSERT INTO items (id, list_id, item_name, original_term, quantity, unit, unit_price, total_amount, vendor, date, delivered_at, ordered_as, photo_id, created_at, updated_at)
         VALUES (?, 'draft-audit', 'Sand', '', 1, 'Bag', 1, 1, '', '', '', '', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
        [`line${n}`, `ph${n}`],
      );
    }
    const chunks: Uint8Array[] = [];
    // Each photo is read on its own, never all in one query.
    const read: string[] = [];
    const all = source.all.bind(source);
    source.all = ((sql: string, params?: (string | number | null)[]) => (read.push(sql), all(sql, params))) as typeof source.all;
    expect(await writeBackupZip(source, (c) => chunks.push(c))).toEqual({ photos: 5 });
    expect(read.filter((q) => /SELECT .*images/.test(q))).toEqual(Array(5).fill('SELECT images FROM bill_photos WHERE id = ?'));
    expect(chunks.length).toBeGreaterThan(5);

    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    chunks.reduce((at, c) => (bytes.set(c, at), at + c.length), 0);
    const file = parseBackupFile(bytes);
    const target = await freshDb();
    await restoreBackup(target, file.backup, file.photos);
    for (let n = 0; n < 5; n++) expect(await getBillPhotos(target, `ph${n}`)).toEqual([page(n), page(n + 10)]);
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
    // The BOQ's notes went with it when it was saved.
    expect(snap.lists.find((l) => l.title === 'Tower A')?.notes).toBe('Glossy');
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

  it('still restores version 13 backups, whose lines have no read_as, and keeps it from version 14', async () => {
    const db = await populated();
    const backup = await exportBackup(db);
    expect(backup.version).toBe(14);
    const v13 = { ...backup, version: 13, items: backup.items.map(({ read_as: _r, ...rest }) => rest) };
    const parsed = parseBackup(JSON.stringify(v13));
    expect(parsed.items.every((i) => i.read_as === '')).toBe(true);
    const target = await freshDb();
    await restoreBackup(target, parseBackup(JSON.stringify({ ...backup, items: backup.items.map((i) => ({ ...i, read_as: '{"item_name":"Cemnt"}' })) })));
    expect((await loadSnapshot(target)).items.every((i) => i.read_as === '{"item_name":"Cemnt"}')).toBe(true);
  });

  it('still restores version 2 backups, which have no hidden materials', async () => {
    const db = await populated();
    const { hidden_materials: _h, ...v2 } = await exportBackup(db);
    const parsed = parseBackup(JSON.stringify({ ...v2, version: 2 }));
    expect(parsed.hidden_materials).toEqual([]);
    expect(parsed.quotes).toHaveLength(1);
  });
});
