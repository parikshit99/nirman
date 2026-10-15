import { describe, expect, it } from 'vitest';
import { EXPENSES_FILTERED_NOTE, NO_EXPENSES_MATCH, buildExpenseReport, buildLabourReport, buildSiteReport, fieldLimits } from '@nirman/shared';
import sampleV14 from './samples/backup-v14.json?raw';
import { exportBackup, parseBackup, parseBackupFile, restoreBackup, writeBackupZip } from '../src/data/backup.ts';
import { createPendingDeletes } from '../src/data/pendingDeletes.ts';
import { addItems, deleteExpense, deleteProject, listExpenses, loadSnapshot, saveDraftToHistory, saveExpense, saveProject, type ExpenseInput } from '../src/data/repo.ts';
import { migrateLocal } from '../src/data/schema.ts';
import { siteReportSheet } from '../src/lib/exports.ts';
import { buildSiteReportPdf } from '../src/lib/pdf.ts';
import { DRAFT_IDS, freshDb, projectOf } from './helpers.ts';

const rent = (projectId: string, over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  project_id: projectId, date: '2026-10-01', kind: 'rent', amount: 12000, paid_to: 'Landlord', mode: 'bank', note: 'October room rent', ...over,
});

describe('site expenses', () => {
  it('migration adds the expenses table to an existing database without touching its data', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, [{ item_name: 'Cement', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500 }]);
    // A phone on 7.5: every migration but the newest.
    await db.run('DROP TABLE expenses');
    const [{ version }] = await db.all<{ version: number }>('SELECT version FROM schema_version');
    await db.run('UPDATE schema_version SET version = ?', [version - 1]);
    await migrateLocal(db);
    expect((await db.all<{ version: number }>('SELECT version FROM schema_version'))[0].version).toBe(version);
    expect((await loadSnapshot(db)).items).toHaveLength(1);
    const project = await projectOf(db);
    await saveExpense(db, rent(project));
    expect(await listExpenses(db, project)).toHaveLength(1);
  });

  it('adds, edits and lists a project\'s expenses newest first, and deletes one after the undo window', async () => {
    const db = await freshDb();
    const project = await projectOf(db);
    const id = await saveExpense(db, rent(project, { paid_to: '  Landlord  ', note: ' advance ' }));
    await saveExpense(db, rent(project, { date: '2026-10-05', kind: 'food', amount: 450, paid_to: 'Tea stall', mode: 'cash', note: '' }));
    let rows = await listExpenses(db, project);
    expect(rows.map((e) => e.kind)).toEqual(['food', 'rent']);
    expect(rows[1]).toMatchObject({ id, paid_to: 'Landlord', note: 'advance', amount: 12000, mode: 'bank' });

    const before = rows[1];
    await saveExpense(db, rent(project, { amount: 13000, mode: '' }), id);
    rows = await listExpenses(db, project);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ id, amount: 13000, mode: '', created_at: before.created_at });
    expect(rows[1].updated_at > before.updated_at).toBe(true);
    expect((await loadSnapshot(db)).expenses).toHaveLength(2);

    // Delete with Undo, as the app does it (deleteLater): undone, it stays; flushed, it goes.
    const pending = createPendingDeletes(60_000, () => {});
    pending.add(id, () => deleteExpense(db, id));
    pending.undo(id);
    await pending.flush();
    expect(await listExpenses(db, project)).toHaveLength(2);
    pending.add(id, () => deleteExpense(db, id));
    await pending.flush();
    expect((await listExpenses(db, project)).map((e) => e.kind)).toEqual(['food']);
  });

  it('refuses an amount of 0 or less, a bad date or an unknown payment mode', async () => {
    const db = await freshDb();
    const project = await projectOf(db);
    await expect(saveExpense(db, rent(project, { amount: 0 }))).rejects.toThrow('Enter an amount above ₹0.');
    await expect(saveExpense(db, rent(project, { amount: -5 }))).rejects.toThrow('Enter an amount above ₹0.');
    await expect(saveExpense(db, rent(project, { amount: Number.NaN }))).rejects.toThrow('Enter an amount above ₹0.');
    await expect(saveExpense(db, rent(project, { date: '1 Oct' }))).rejects.toThrow();
    await expect(saveExpense(db, rent(project, { mode: 'barter' }))).rejects.toThrow();
    expect(await listExpenses(db, project)).toHaveLength(0);
  });

  it('has the limits the form needs, and fits longer text so the backup restores', async () => {
    expect(fieldLimits('expenses')).toEqual({ id: 200, project_id: 200, paid_to: 200, mode: 40, note: 500 });
    const db = await freshDb();
    const project = await projectOf(db);
    await saveExpense(db, rent(project, { paid_to: 'p'.repeat(250), note: 'n'.repeat(600) }));
    const [row] = await listExpenses(db, project);
    expect([row.paid_to.length, row.note.length]).toEqual([200, 500]);
    await writeBackupZip(db, () => {});
  });

  it('deleting a project deletes its expenses and keeps the other project\'s', async () => {
    const db = await freshDb();
    const first = await projectOf(db);
    const second = await saveProject(db, { name: 'Tower B', address: 'Sector 50' });
    await saveExpense(db, rent(first));
    await saveExpense(db, rent(second, { kind: 'transport', amount: 800 }));
    await deleteProject(db, first);
    expect(await listExpenses(db, first)).toHaveLength(0);
    expect((await loadSnapshot(db)).expenses.map((e) => e.project_id)).toEqual([second]);
  });

  it('round-trips expenses through a backup', async () => {
    const db = await freshDb();
    const project = await projectOf(db);
    await saveExpense(db, rent(project));
    await saveExpense(db, rent(project, { kind: 'permits', amount: 2500, paid_to: 'Municipal office', mode: '', note: 'Water connection' }));
    const backup = await exportBackup(db);
    expect(backup.version).toBe(15);
    expect(backup.expenses).toHaveLength(2);

    const target = await freshDb();
    await saveExpense(target, rent(await projectOf(target), { kind: 'other', amount: 1 }));
    await restoreBackup(target, parseBackup(JSON.stringify(backup)));
    expect((await loadSnapshot(target)).expenses).toEqual((await loadSnapshot(db)).expenses);
  });

  it('restores a backup from 7.5 (version 14, the sample file) with no expenses and everything else', async () => {
    const file = parseBackupFile(new TextEncoder().encode(sampleV14));
    expect(file.backup.version).toBe(14);
    expect(file.backup.expenses).toEqual([]);
    const db = await freshDb();
    await saveExpense(db, rent(await projectOf(db)));
    await restoreBackup(db, file.backup, file.photos);
    const snap = await loadSnapshot(db);
    expect(snap.expenses).toEqual([]);
    expect(snap.projects.map((p) => p.id)).toEqual(['p-sector44']);
    expect(snap.items.map((i) => i.item_name)).toEqual(['Cement']);
    expect(snap.contractEntries.map((e) => e.kind)).toEqual(['advance']);
    // Expenses added after the restore go into the backup.
    await saveExpense(db, rent('p-sector44'));
    expect((await exportBackup(db)).expenses).toHaveLength(1);
  });
});

describe('site report with expenses', () => {
  async function site() {
    const db = await freshDb();
    const project = await projectOf(db);
    await addItems(db, DRAFT_IDS.audit, [{ item_name: 'Cement', quantity: 10, unit: 'Bag', unit_price: 400, total_amount: 4000, date: '2026-10-02' }]);
    await saveDraftToHistory(db, DRAFT_IDS.audit, { title: 'Day 1', address: 'Sector 44', category: 'Civil', site_date: '2026-10-02' });
    await saveExpense(db, rent(project, { amount: 12000, date: '2026-10-01' }));
    await saveExpense(db, rent(project, { kind: 'food', amount: 300, date: '2026-10-03', paid_to: 'Tea stall', mode: 'cash', note: '' }));
    await saveExpense(db, rent(project, { kind: 'food', amount: 200, date: '2026-10-04', paid_to: 'Tea stall', mode: 'cash', note: '' }));
    const snap = await loadSnapshot(db);
    const build = (opts: { from?: string; to?: string; categories?: string[] }) => ({
      report: buildSiteReport(snap.lists, snap.items, {}, { ...opts, deliveredOnly: false }),
      labour: buildLabourReport(snap.contracts, snap.contractEntries, opts),
      expenses: buildExpenseReport(snap.expenses, { ...opts, projectId: project }),
    });
    return build;
  }
  const values = (rows: ReturnType<typeof siteReportSheet>) => rows.map((r) => r.map((c) => (c && typeof c === 'object' && 'value' in c ? c.value : c)));

  it('adds an Expenses part with subtotals per kind, its total and materials + expenses as the grand total', async () => {
    const { report, labour, expenses } = (await site())({});
    const rows = values(siteReportSheet('Sector 44', 'All time', report, labour, expenses));
    expect(rows).toContainEqual(['MATERIALS TOTAL', null, null, null, null, 4000, null, null]);
    expect(rows).toContainEqual(['Expenses']);
    expect(rows).toContainEqual(['Food and tea total', null, null, null, null, 500]);
    expect(rows).toContainEqual(['Expenses total', null, null, null, null, 12500]);
    expect(rows).toContainEqual(['GRAND TOTAL (materials + expenses)', null, null, null, null, 16500]);
    const pdf = buildSiteReportPdf('Sector 44', 'All time', report, labour, expenses).output();
    for (const text of ['Expenses total', 'Food and tea total', 'GRAND TOTAL']) expect(pdf).toContain(text);
  });

  it('says so when the dates leave no expenses, and leaves them out with a note when work types are picked', async () => {
    const build = await site();
    const late = build({ from: '2026-10-10' });
    const rows = values(siteReportSheet('Sector 44', 'From 10 Oct', late.report, late.labour, late.expenses));
    expect(rows).toContainEqual([NO_EXPENSES_MATCH]);
    expect(rows).toContainEqual(['Expenses total', null, null, null, null, 0]);
    expect(buildSiteReportPdf('Sector 44', 'From 10 Oct', late.report, late.labour, late.expenses).output()).toContain(NO_EXPENSES_MATCH);

    const civil = build({ categories: ['Civil'] });
    const civilRows = values(siteReportSheet('Sector 44', 'Civil', civil.report, civil.labour, civil.expenses));
    expect(civilRows).toContainEqual([EXPENSES_FILTERED_NOTE]);
    expect(civilRows).toContainEqual(['GRAND TOTAL', null, null, null, null, 4000, null, null]);
    expect(civilRows).not.toContainEqual(['Expenses total', null, null, null, null, 12500]);
    expect(buildSiteReportPdf('Sector 44', 'Civil', civil.report, civil.labour, civil.expenses).output()).toContain(EXPENSES_FILTERED_NOTE);
  });
});
