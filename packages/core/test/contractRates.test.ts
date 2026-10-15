import { describe, expect, it } from 'vitest';
import { buildLabourReport, contractStatement, contractTotals, withRates } from '@nirman/shared';
import { exportBackup, parseBackup, restoreBackup } from '../src/data/backup.ts';
import {
  deleteContract,
  deleteContractRate,
  deleteProject,
  listContractRates,
  loadSnapshot,
  saveContract,
  saveContractEntry,
  saveContractRate,
} from '../src/data/repo.ts';
import { migrateLocal } from '../src/data/schema.ts';
import { contractStatementSheet, siteReportSheet } from '../src/lib/exports.ts';
import { buildContractStatementPdf } from '../src/lib/pdf.ts';
import { freshDb, projectOf } from './helpers.ts';

/* Rate changes on labour contracts (7.15): stored, deleted with their contract or project, backed up and restored. */

type Db = Awaited<ReturnType<typeof freshDb>>;

const terms = { contractor: 'Ramesh', phone: '', address: 'Sector 44', category: 'Civil', work: 'Plaster', kind: 'rate' as const, rate: 18, unit: 'sqft', est_quantity: 4000, amount: 0, retention_pct: 0, start_date: '', notes: '' };

/** A ₹18 plaster contract with 100 sqft on 30 Sep and 100 sqft on 2 Oct. */
async function plaster(db: Db) {
  const id = await saveContract(db, { ...terms, project_id: await projectOf(db) });
  await saveContractEntry(db, { contract_id: id, kind: 'work', date: '2026-09-30', quantity: 100, amount: 0, mode: '', note: '' });
  await saveContractEntry(db, { contract_id: id, kind: 'work', date: '2026-10-02', quantity: 100, amount: 0, mode: '', note: '' });
  return id;
}

/** The contracts as the app shows them: with their rate changes. */
const contractsOf = async (db: Db) => {
  const snap = await loadSnapshot(db);
  return { snap, contracts: withRates(snap.contracts, snap.contractRates) };
};

describe('contract rate changes', () => {
  it('saves a change for a date, replaces one on the same date, and values work by its date', async () => {
    const db = await freshDb();
    const id = await plaster(db);
    const first = await saveContractRate(db, id, 21, '2026-10-01');
    const again = await saveContractRate(db, id, 20, '2026-10-01');
    expect(again).toBe(first);
    expect((await listContractRates(db, id)).map((r) => [r.from_date, r.rate])).toEqual([['2026-10-01', 20]]);
    const { snap, contracts } = await contractsOf(db);
    expect(contractTotals(contracts[0], snap.contractEntries)).toMatchObject({ workDone: 1800 + 2000, value: 80000 });
  });

  it('refuses a rate not above 0, a bad date, a lump sum or a deleted contract, saving nothing', async () => {
    const db = await freshDb();
    const id = await plaster(db);
    await expect(saveContractRate(db, id, 0, '2026-10-01')).rejects.toThrow('Enter a rate above ₹0.');
    await expect(saveContractRate(db, id, Number.NaN, '2026-10-01')).rejects.toThrow('Enter a rate above ₹0.');
    await expect(saveContractRate(db, id, 20, '1 Oct')).rejects.toThrow('Pick the date');
    const lump = await saveContract(db, { ...terms, kind: 'lump_sum', rate: 0, amount: 50000, project_id: await projectOf(db) });
    await expect(saveContractRate(db, lump, 20, '2026-10-01')).rejects.toThrow('Only a rate contract');
    await expect(saveContractRate(db, 'gone', 20, '2026-10-01')).rejects.toThrow('deleted');
    expect((await loadSnapshot(db)).contractRates).toEqual([]);
  });

  it('deleting a change takes its work back to the earlier rate', async () => {
    const db = await freshDb();
    const id = await plaster(db);
    const change = await saveContractRate(db, id, 20, '2026-10-01');
    await saveContractRate(db, id, 22, '2026-10-02');
    await deleteContractRate(db, (await listContractRates(db, id))[1].id);
    let { snap, contracts } = await contractsOf(db);
    expect(contractTotals(contracts[0], snap.contractEntries).workDone).toBe(3800);
    await deleteContractRate(db, change);
    ({ snap, contracts } = await contractsOf(db));
    expect(contractTotals(contracts[0], snap.contractEntries).workDone).toBe(3600);
  });

  it('deletes the changes with their contract, or with their project', async () => {
    const db = await freshDb();
    const one = await plaster(db);
    const two = await plaster(db);
    await saveContractRate(db, one, 20, '2026-10-01');
    await saveContractRate(db, two, 20, '2026-10-01');
    await deleteContract(db, one);
    expect((await loadSnapshot(db)).contractRates.map((r) => r.contract_id)).toEqual([two]);
    await deleteProject(db, await projectOf(db));
    expect((await loadSnapshot(db)).contractRates).toEqual([]);
  });

  it('drops the changes of a rate contract made a lump sum (it has no work yet)', async () => {
    const db = await freshDb();
    const id = await saveContract(db, { ...terms, project_id: await projectOf(db) });
    await saveContractRate(db, id, 20, '2026-10-01');
    await saveContract(db, { ...terms, rate: 25, project_id: await projectOf(db) }, id);
    expect(await listContractRates(db, id)).toHaveLength(1);
    await saveContract(db, { ...terms, kind: 'lump_sum', rate: 0, amount: 50000, project_id: await projectOf(db) }, id);
    expect(await listContractRates(db, id)).toEqual([]);
  });

  it('adds the table to a phone on the last version, keeping its contracts as they were', async () => {
    const db = await freshDb();
    const id = await plaster(db);
    const [{ version }] = await db.all<{ version: number }>('SELECT version FROM schema_version');
    await db.run('DROP TABLE contract_rates');
    await db.run('UPDATE schema_version SET version = ?', [version - 1]);
    await migrateLocal(db);
    const { snap, contracts } = await contractsOf(db);
    expect(snap.contractRates).toEqual([]);
    expect(contractTotals(contracts[0], snap.contractEntries).workDone).toBe(3600);
    await saveContractRate(db, id, 20, '2026-10-01');
  });

  it('round-trips the changes through a backup, and restores a version 14 backup with none', async () => {
    const source = await freshDb();
    const id = await plaster(source);
    await saveContractRate(source, id, 20, '2026-10-01');
    const backup = await exportBackup(source);
    expect(backup.version).toBe(15);
    expect(backup.contract_rates).toHaveLength(1);
    const target = await freshDb();
    await restoreBackup(target, parseBackup(JSON.stringify(backup)));
    expect((await loadSnapshot(target)).contractRates).toEqual((await loadSnapshot(source)).contractRates);

    // A version 14 file, as 7.14 wrote it: no contract_rates at all.
    const { contract_rates: _none, ...rest } = backup;
    const v14 = parseBackup(JSON.stringify({ ...rest, version: 14 }));
    expect(v14.contract_rates).toEqual([]);
    await saveContractRate(target, id, 25, '2026-09-01');
    await restoreBackup(target, v14);
    const { snap, contracts } = await contractsOf(target);
    expect(snap.contractRates).toEqual([]);
    expect(contractTotals(contracts[0], snap.contractEntries).workDone).toBe(3600);
  });

  it('restores a hand-made version 14 sample file with a rate contract', async () => {
    const sample = {
      app: 'nirmaan-auditor', version: 14, exported_at: '2026-10-10T05:30:00.000Z',
      projects: [{ id: 'p1', name: 'My site', address: '', status: 'active', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
      lists: [], items: [], indexed_rates: [], learned_terms: [], categories: [], quotes: [], quote_lines: [], hidden_materials: [],
      contracts: [{ id: 'c1', project_id: 'p1', contractor: 'Ramesh', phone: '', address: '', category: 'Civil', work: 'Plaster', kind: 'rate', rate: 18, unit: 'sqft', est_quantity: 0, amount: 0, retention_pct: 0, start_date: '', status: 'active', retention_released_at: '', notes: '', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' }],
      contract_entries: [{ id: 'e1', contract_id: 'c1', kind: 'work', date: '2026-10-02', quantity: 100, amount: 0, mode: '', note: '', created_at: '2026-10-02T00:00:00.000Z' }],
      bill_photos: [],
    };
    const db = await freshDb();
    await restoreBackup(db, parseBackup(JSON.stringify(sample)));
    const { snap, contracts } = await contractsOf(db);
    expect(snap.contractRates).toEqual([]);
    expect(contractTotals(contracts[0], snap.contractEntries).workDone).toBe(1800);
  });

  it('restores a backup with a rate of 0, and the rate is ignored', async () => {
    const source = await freshDb();
    const id = await plaster(source);
    const backup = await exportBackup(source);
    const zero = { id: 'r0', contract_id: id, rate: 0, from_date: '2026-10-01', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' };
    const db = await freshDb();
    await restoreBackup(db, parseBackup(JSON.stringify({ ...backup, contract_rates: [zero] })));
    const { snap, contracts } = await contractsOf(db);
    expect(snap.contractRates).toHaveLength(1);
    expect(contracts[0].rates).toEqual([]);
    expect(contractTotals(contracts[0], snap.contractEntries).workDone).toBe(3600);
  });

  it('prints the statement and site report at the dated rates', async () => {
    const db = await freshDb();
    const id = await plaster(db);
    await saveContractRate(db, id, 20, '2026-10-01');
    const { snap, contracts } = await contractsOf(db);
    const c = contracts[0];
    const st = contractStatement(c, snap.contractEntries);
    const cells = (rows: ReturnType<typeof contractStatementSheet>) => rows.map((r) => r.map((x) => (x && typeof x === 'object' && 'value' in x ? x.value : x)));
    const sheet = cells(contractStatementSheet(c, st, ''));
    expect(sheet).toContainEqual(['2026-09-30', 'Work: 100 sqft @ 18', 1800, null, null, 1800]);
    expect(sheet).toContainEqual(['2026-10-02', 'Work: 100 sqft @ 20', 2000, null, null, 3800]);
    expect(sheet.some((r) => typeof r[1] === 'string' && /^Rs\. 18 per sqft, Rs\. 20 from 1 Oct/.test(r[1]))).toBe(true);
    expect(buildContractStatementPdf(c, st, '').getNumberOfPages()).toBe(1);
    const labour = buildLabourReport(contracts, snap.contractEntries, { from: '2026-10-01' });
    expect(labour.workDone).toBe(2000);
    const report = cells(siteReportSheet('Sector 44', '', { categories: [], total: 0, lineCount: 0 }, labour));
    expect(report).toContainEqual(['Ramesh', 'Plaster', 'Civil', 2000, 0, 3800]);
  });
});
