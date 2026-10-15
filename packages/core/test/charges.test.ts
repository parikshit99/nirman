import { describe, expect, it } from 'vitest';
import { buildItemDatabase, buildSiteReport } from '@nirman/shared';
import { addItems, deleteProject, draftIdFor, knownMaterials, learningMap, loadSnapshot, matchMaterials, saveDraftToHistory, saveProject } from '../src/data/repo.ts';
import { siteReportSheet } from '../src/lib/exports.ts';
import { buildSiteReportPdf } from '../src/lib/pdf.ts';
import { freshDb } from './helpers.ts';

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 50, unit: 'Bag', unit_price: 380, total_amount: 19000, vendor: 'Shree Traders', date: '2026-10-01' };
const freight = { item_name: 'Freight', original_term: 'Freight', quantity: 1, unit: 'unit', unit_price: 1500, total_amount: 1500, vendor: 'Shree Traders', date: '2026-10-01' };

describe('transport and loading lines', () => {
  it('are matched to Transport, never offered as a known material, and leave nothing in Rates when their project is deleted', async () => {
    const db = await freshDb();
    const tower = await saveProject(db, { name: 'Tower C', address: 'Sector 15' });
    const purchases = draftIdFor(tower, 'audit');
    const matched = await matchMaterials(db, [cement, freight]);
    expect(matched[1]).toMatchObject({ item_name: 'Transport', unit: 'trip', unit_price: 1500 });
    await addItems(db, purchases, matched);
    await saveDraftToHistory(db, purchases, { title: 'Bill 101', address: 'Sector 15', category: 'Civil', site_date: '2026-10-01' });
    // An old line typed as "Transport" before this version, on the open list.
    await addItems(db, purchases, [{ ...freight, item_name: 'Transport', unit: 'trip', date: '2026-10-05' }]);
    expect((await knownMaterials(db)).map((k) => k.name)).toEqual(['Cement']);

    // In Spent and the site report, with the summary line in both exports.
    const snap = await loadSnapshot(db);
    const report = buildSiteReport(snap.lists, snap.items, learningMap(snap.learned), { address: 'Sector 15', deliveredOnly: false });
    expect([report.total, report.charges]).toEqual([20500, 1500]);
    expect(siteReportSheet('Sector 15', 'All time', report).some((row) => row[0] === 'Of which transport and loading')).toBe(true);
    expect(buildSiteReportPdf('Sector 15', 'All time', report).output()).toContain('Of which transport and loading');

    await deleteProject(db, tower);
    const after = await loadSnapshot(db);
    expect(after.rates.map((r) => r.item_name)).toEqual(['Cement']);
    expect(buildItemDatabase(after.lists, after.items, after.rates, learningMap(after.learned)).map((e) => e.name)).toEqual(['Cement']);
  });
});
