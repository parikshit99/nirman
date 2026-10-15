import { describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildItemDatabase, dataTables, fieldLimits, fitRow, materialKey, normalizeTerm, variantLabel, type ContractRow, type DataTable } from '@nirman/shared';
import { exportBackup, exportBackupZip, parseBackupFile, restoreBackup } from '../src/data/backup.ts';
import { clearLog, issueUrl, log, logAsText, logError, logStep } from '../src/lib/diagnostics.ts';
import {
  addCategory,
  addItems,
  addTypedItems,
  completeQuoteJob,
  confirmQuote,
  deleteProject,
  draftIdFor,
  enqueueQuote,
  hideMaterial,
  indexRates,
  learningMap,
  loadSnapshot,
  renameList,
  renameMaterial,
  saveContract,
  saveContractEntry,
  saveDraftToHistory,
  saveProject,
  setListNotes,
  setListVendor,
  updateItem,
  updateLearnedTerm,
  updateQuoteLine,
  type Snapshot,
} from '../src/data/repo.ts';
import type { Db } from '../src/data/sql.ts';
import { DRAFT_IDS, freshDb, projectOf } from './helpers.ts';

/*
 * Acceptance tests for the three bugs found by the repo audit of 14 Oct 2026:
 *   A. a backup the app writes must always restore (one over-long value made Restore refuse the whole file);
 *   B. a problem report (a public GitHub issue) must carry no business data;
 *   C. a line's total must stay as billed until its quantity or rate changes, and deleting a project keeps its purchase prices in Rates.
 * Tests marked "(edge)" go beyond the agreed criteria, to cases people meet on site.
 */

/** The limit of one text column, from the app's own rules. */
function limitOf(table: DataTable, column: string): number {
  const max = (fieldLimits(table) as unknown as Record<string, number | undefined>)[column];
  if (max === undefined) throw new Error(`fieldLimits('${table}') has no limit for ${column}`);
  return max;
}

/** Stored values over their limit, e.g. "items.vendor (300 > 200)": the app should have shortened them when saving. */
async function overLimit(db: Db): Promise<string[]> {
  const backup = await exportBackup(db);
  return dataTables.flatMap((table) => {
    const limits = Object.entries(fieldLimits(table) as unknown as Record<string, number>);
    return (backup[table] as Record<string, unknown>[]).flatMap((row) =>
      limits.flatMap(([column, max]) => {
        const value = row[column];
        return typeof value === 'string' && value.length > max ? [`${table}.${column} (${value.length} > ${max})`] : [];
      }),
    );
  });
}

/** Everything a restore should give back (entries still waiting to be read are not records, and are not in backups). */
const records = (s: Snapshot) => ({ ...s, jobs: [] });

/** Repeat a phrase to an exact length. */
const fill = (phrase: string, length: number) => phrase.repeat(Math.ceil(length / phrase.length)).slice(0, length);

const isHighSurrogate = (s: string, at: number) => s.charCodeAt(at) >= 0xd800 && s.charCodeAt(at) <= 0xdbff;
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

describe('A. Every backup the app writes must restore', () => {
  // Two numbers in one field, as people write them: 42 characters, over the old limit of 40.
  const PHONE = '98765 43210, 91234 56789 (site supervisor)';
  // Each long value below is cut at its limit between two ordinary letters (not in an emoji, not at a space), so "cut to the limit" is exact.
  const NOTE = fill('Paid Ramesh for plaster of the 2nd floor flats 201 to 204, balance after measurement; ', 800);
  const VENDOR = fill('Shree Ganesh Building Materials & Hardware, Shop 12, Main Market, Sector 15, Faridabad, GSTIN 06ABCDE1234F1Z5, ', 300);
  const DATE = 'Bill date 01/10/2026, 10:30 AM';
  const TERM = fill('ultratech opc 53 grade cement, 50 kg bori, weather proof, for slab casting of tower c; ', 300);
  // Over the 20,000 limit in UTF-16 units (what the backup counts), though under it in characters: emoji count twice.
  const BOQ_NOTE = fill('नोटफ़र्श की टाइल 🧱🚚👷 मैट फ़िनिश ', 21000);
  // Within the limit, though over it in UTF-8 bytes: must be kept whole.
  const HINDI_NOTE = fill('सीमेंट की पचास बोरी, रेत दो ट्रॉली, गिट्टी तीन ट्रॉली — ', 9000);
  const cement = { item_name: 'Cement', original_term: 'bori', quantity: 50, unit: 'Bag', unit_price: 380, total_amount: 19000, vendor: 'Shree Traders', date: '2026-10-01' };

  /** The data of the audit's report, made the way the app makes it. */
  async function siteData() {
    const db = await freshDb();
    const project = await projectOf(db);
    const contract = await saveContract(db, {
      project_id: project, contractor: 'Ramesh', phone: PHONE, address: 'Sector 15', category: 'Civil', work: 'Internal plaster, 2nd floor', kind: 'rate',
      rate: 18, unit: 'sqft', est_quantity: 4000, amount: 0, retention_pct: 5, start_date: '2026-09-01', notes: '',
    });
    await saveContractEntry(db, { contract_id: contract, kind: 'payment', date: '2026-10-02', quantity: 0, amount: 25000, mode: 'cash', note: NOTE });
    await addItems(db, DRAFT_IDS.audit, [
      { ...cement, vendor: VENDOR, date: DATE },
      { ...cement, item_name: 'Cement', original_term: TERM, vendor: 'Shree Traders' },
    ]);
    const termLine = (await loadSnapshot(db)).items.find((i) => i.original_term === TERM)!;
    // Correcting the name remembers it for the word as read: a learned term whose id is the 300-character term.
    await updateItem(db, termLine.id, { item_name: 'OPC Cement 53 Grade' });
    await addItems(db, DRAFT_IDS.boq, [{ ...cement, quantity: 400, unit_price: 0, total_amount: 0, vendor: '', date: '' }]);
    await setListNotes(db, DRAFT_IDS.boq, BOQ_NOTE);
    const boq = await saveDraftToHistory(db, DRAFT_IDS.boq, { title: 'Tower C flooring', address: 'Sector 15', category: 'Tile', site_date: '2026-10-02' });
    await setListNotes(db, DRAFT_IDS.boq, HINDI_NOTE);
    return { db, contract, termLineId: termLine.id, boq };
  }

  it('A1: restores data made the way the app makes it: a long phone, note, vendor, date, learned word, and a Hindi + emoji BOQ note', async () => {
    const { db, contract, termLineId, boq } = await siteData();
    const { bytes } = await exportBackupZip(db);
    const file = parseBackupFile(bytes);

    const target = await freshDb();
    await restoreBackup(target, file.backup, file.photos);
    const restored = await loadSnapshot(target);
    // Restore gives back exactly what the phone had.
    expect(records(restored)).toEqual(records(await loadSnapshot(db)));

    const c = restored.contracts.find((r) => r.id === contract);
    const entry = restored.contractEntries.find((e) => e.contract_id === contract);
    const vendorLine = restored.items.find((i) => i.date.startsWith('Bill date'));
    const termLine = restored.items.find((i) => i.id === termLineId);
    const learned = restored.learned.find((l) => l.id === normalizeTerm(TERM));
    expect([!!c, !!entry, !!vendorLine, !!termLine, !!learned]).toEqual([true, true, true, true, true]);

    // Within their limits: kept exactly as typed.
    expect(PHONE.length).toBeLessThanOrEqual(limitOf('contracts', 'phone'));
    expect(c!.phone).toBe(PHONE);
    expect(TERM.length).toBeLessThanOrEqual(limitOf('items', 'original_term'));
    expect(termLine).toMatchObject({ item_name: 'OPC Cement 53 Grade', original_term: TERM });
    expect(TERM.length).toBeLessThanOrEqual(limitOf('learned_terms', 'id'));
    expect(learned).toMatchObject({ id: TERM, item_name: 'OPC Cement 53 Grade', unit: 'Bag' });
    expect([HINDI_NOTE.length <= limitOf('lists', 'notes'), utf8Bytes(HINDI_NOTE) > limitOf('lists', 'notes')]).toEqual([true, true]);
    expect(restored.lists.find((l) => l.id === DRAFT_IDS.boq)!.notes).toBe(HINDI_NOTE);

    // Over their limits: what was typed, cut at the limit.
    const cut = (typed: string, table: DataTable, column: string) => {
      const max = limitOf(table, column);
      expect(typed.length, `the test's ${table}.${column} must be over its limit`).toBeGreaterThan(max);
      return typed.slice(0, max);
    };
    expect(entry!.note).toBe(cut(NOTE, 'contract_entries', 'note'));
    expect(vendorLine!.vendor).toBe(cut(VENDOR, 'items', 'vendor'));
    expect(vendorLine!.date).toBe(cut(DATE, 'items', 'date'));
    const notesLimit = limitOf('lists', 'notes');
    expect([[...BOQ_NOTE].length <= notesLimit, isHighSurrogate(BOQ_NOTE, notesLimit - 1)]).toEqual([true, false]);
    expect(restored.lists.find((l) => l.id === boq)!.notes).toBe(cut(BOQ_NOTE, 'lists', 'notes'));

    // The phone stored them fitted already, so its own backup needs nothing shortened.
    expect(file.shortened).toBe(0);
  });

  it('A2: restores an older (version 14) backup holding values over the limits, shortening them', async () => {
    const db = await freshDb();
    await saveContract(db, {
      project_id: await projectOf(db), contractor: 'Ramesh', phone: '98765 43210', address: 'Sector 15', category: 'Civil', work: 'Plaster', kind: 'lump_sum',
      rate: 0, unit: '', est_quantity: 0, amount: 90000, retention_pct: 0, start_date: '', notes: '',
    });
    await addItems(db, DRAFT_IDS.audit, [cement]);
    const exported = await exportBackup(db);
    const longPhone = fill('98765 43210 / 91234 56789 (site supervisor Ramesh, call before 9 am) ', 300);
    const longVendor = fill('Shree Ganesh Building Materials & Hardware, Shop 12, Main Market, Sector 15, Faridabad, GSTIN 06ABCDE1234F1Z5, ', 400);
    const longTerm = fill('ultratech opc 53 grade cement, 50 kg bori, weather proof, for slab casting of tower c; ', 300);
    const v14 = {
      ...exported,
      version: 14,
      contracts: [{ ...exported.contracts[0], phone: longPhone }],
      items: [{ ...exported.items[0], vendor: longVendor }],
      learned_terms: [{ id: longTerm, item_name: 'OPC Cement', unit: 'Bag', updated_at: '2026-10-01T10:00:00.000Z' }],
    };
    const json = JSON.stringify(v14);

    // Up to version 11 a backup was the .json alone; since 12 it is a .zip with backup.json inside.
    for (const bytes of [strToU8(json), zipSync({ 'backup.json': strToU8(json) })]) {
      const file = parseBackupFile(bytes);
      expect(file.shortened).toBeGreaterThanOrEqual(2);
      const target = await freshDb();
      await restoreBackup(target, file.backup, file.photos);
      const snap = await loadSnapshot(target);
      expect(snap.contracts[0].phone).toBe(longPhone.slice(0, limitOf('contracts', 'phone')));
      expect(snap.items[0].vendor).toBe(longVendor.slice(0, limitOf('items', 'vendor')));
      // 300 characters fit the learned word's new limit: kept whole, so it still matches the lines read from it.
      expect(snap.learned.map((l) => l.id)).toEqual([longTerm]);
    }
  });

  it('A (edge): shortening never cuts an emoji in half', async () => {
    const max = limitOf('contracts', 'phone');
    // The limit falls between the two UTF-16 halves of the emoji; half an emoji shows as "�" on the phone (and sql.js stores it as three).
    const typed = `${'9'.repeat(max - 1)}📞 (office)`;
    expect(isHighSurrogate(typed, max - 1)).toBe(true);
    const row: ContractRow = {
      id: 'c1', project_id: 'p1', contractor: 'Ramesh', phone: typed, address: '', category: 'Civil', work: 'Plaster', kind: 'rate', rate: 18, unit: 'sqft',
      est_quantity: 0, amount: 0, retention_pct: 5, start_date: '', status: 'active', retention_released_at: '', notes: '', created_at: '2026-10-14T05:00:00.000Z', updated_at: '2026-10-14T05:00:00.000Z',
    };
    expect(fitRow('contracts', { ...row, phone: '98765 43210' })).toEqual({ row: { ...row, phone: '98765 43210' }, shortened: 0 });
    const fitted = fitRow('contracts', row);
    expect(fitted.shortened).toBe(1);
    expect(fitted.row.phone).toBe('9'.repeat(max - 1));

    const db = await freshDb();
    const { id: _id, status: _s, retention_released_at: _r, created_at: _c, updated_at: _u, ...input } = row;
    const id = await saveContract(db, { ...input, project_id: await projectOf(db) });
    expect((await loadSnapshot(db)).contracts.find((c) => c.id === id)!.phone).toBe('9'.repeat(max - 1));
  });

  it('A (edge): long text typed anywhere else (project, list, typed line, rate, quote, category, rename) restores as it was', async () => {
    // A dictated sentence, Hindi and English, about 3,000 characters (no emoji, so this test is only about which ways in are covered).
    const long = fill('सेक्टर 15 टावर सी, दूसरी मंज़िल: OPC 53 grade cement 50 kg bags "UltraTech", delivery by Gupta & Sons; ', 3000);
    const db = await freshDb();
    const project = await saveProject(db, { name: long, address: long });
    const purchases = draftIdFor(project, 'audit');
    const boqDraft = draftIdFor(project, 'boq');
    // Add item manually: matched to Rates first, which keeps the line as typed in read_as.
    await addTypedItems(db, purchases, [{ item_name: long, original_term: '', quantity: 2, unit: long, unit_price: 380, total_amount: 0, vendor: long, date: '', brand: long, spec: long, ordered_as: long }]);
    await setListVendor(db, purchases, long);
    const list = await saveDraftToHistory(db, purchases, { title: long, address: long, category: long, site_date: '' });
    await renameList(db, list, `${long} (2)`);
    // Another site: a rate with the project's own address is given that project only on the next start or restore (ensureProjects), not here.
    await indexRates(db, [{ item_name: long, unit: long, unit_price: 400, vendor: long, date: '', brand: long, category: long, address: `DLF Phase 3 godown: ${long}` }]);
    await addCategory(db, long);
    // A BOQ, a vendor's quote read for it with long words, then confirmed (its word is learned, its prices go to Rates).
    await addItems(db, boqDraft, [{ ...cement, unit_price: 0, total_amount: 0 }]);
    const boq = await saveDraftToHistory(db, boqDraft, { title: long, address: long, category: 'Civil', site_date: '2026-10-02' });
    const quote = await enqueueQuote(db, { boqId: boq, vendor: long, quoteDate: '2026-10-03', text: '', images: [] });
    let snap = await loadSnapshot(db);
    const boqItemIds = snap.items.filter((i) => i.list_id === boq).map((i) => i.id);
    await completeQuoteJob(db, snap.jobs[0].id, [{ boq_sr: 1, original_term: long, item_name: long, quantity: 50, unit: 'Bag', unit_price: 380, total_amount: 0, note: long, brand: long }], boqItemIds);
    await confirmQuote(db, quote);
    // Rates: rename a material to a long name, delete another from Rates, and correct a learned word.
    snap = await loadSnapshot(db);
    const typedLine = snap.items.find((i) => i.list_id === list)!;
    await renameMaterial(db, materialKey(typedLine.item_name, typedLine.unit), { item_name: `${long} renamed`, unit: long });
    snap = await loadSnapshot(db);
    const rate = snap.rates.find((r) => r.price === 400)!;
    await hideMaterial(db, { key: materialKey(rate.item_name, rate.unit), name: rate.item_name, unit: rate.unit });
    await updateLearnedTerm(db, snap.learned[0].id, { item_name: long, unit: long });

    const file = parseBackupFile((await exportBackupZip(db)).bytes);
    expect(await overLimit(db)).toEqual([]);
    expect(file.shortened).toBe(0);
    const target = await freshDb();
    await restoreBackup(target, file.backup, file.photos);
    expect(records(await loadSnapshot(target))).toEqual(records(await loadSnapshot(db)));
  });

  it('A3: 50 rounds of random text (English, Hindi, emoji, quotes, new lines; 0 to 3,000 characters) in a contract and a line: every export parses and restores', async () => {
    // Repeatable: a failure names its round, and the same seed gives the same text.
    const SEED = 20261014;
    let state = SEED;
    const rand = () => {
      // mulberry32
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), state | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Whole characters only: what a keyboard or dictation types is always valid text (emoji, joined emoji and flags included).
    const PIECES = ['Cement ', 'OPC 53 ', 'bori', '50', ' Bag', ', ', '.', '/', '-', '₹', '"', "'", '`', '\\', '\n', '\r\n', '\t', ' ', 'सीमेंट', 'की', 'बोरी', 'फ़र्श', 'ि', '्', 'ं', '🧱', '🚚', '👷🏽‍♂️', '🇮🇳', '😀', '✅', 'é', ' '];
    const text = () => {
      // A third short (they fit), the rest anything up to 3,000.
      const length = rand() < 0.33 ? Math.floor(rand() * 60) : Math.floor(rand() * 3001);
      let s = '';
      while (s.length < length) s += PIECES[Math.floor(rand() * PIECES.length)];
      return s;
    };

    const failures: string[] = [];
    const target = await freshDb();
    for (let round = 1; round <= 50; round++) {
      const db = await freshDb();
      const contract = await saveContract(db, {
        project_id: await projectOf(db), contractor: text(), phone: text(), address: text(), category: text(), work: text(), kind: rand() < 0.5 ? 'rate' : 'lump_sum',
        rate: 18, unit: text(), est_quantity: 100, amount: 90000, retention_pct: 5, start_date: text(), notes: text(),
      });
      await saveContractEntry(db, { contract_id: contract, kind: 'payment', date: '2026-10-14', quantity: 0, amount: 500, mode: text(), note: text() });
      await addItems(db, DRAFT_IDS.audit, [
        { item_name: text(), original_term: text(), quantity: 2, unit: text(), unit_price: 380, total_amount: 0, vendor: text(), date: text(), brand: text(), model: text(), spec: text(), color: text(), ordered_as: text(), read_as: text() },
      ]);
      const [line] = (await loadSnapshot(db)).items;
      await updateItem(db, line.id, { item_name: text(), unit: text(), vendor: text(), date: text(), ordered_as: text(), brand: text(), model: text(), spec: text(), color: text() });
      await setListVendor(db, DRAFT_IDS.audit, text());

      let file: ReturnType<typeof parseBackupFile>;
      try {
        file = parseBackupFile((await exportBackupZip(db)).bytes);
      } catch (err) {
        failures.push(`round ${round}: ${(err as Error).message}`);
        continue;
      }
      if (file.shortened) failures.push(`round ${round}: stored over the limit: ${(await overLimit(db)).join(', ')}`);
      await restoreBackup(target, file.backup, file.photos);
      const [before, after] = [records(await loadSnapshot(db)), records(await loadSnapshot(target))];
      const changed = (Object.keys(before) as (keyof Snapshot)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      if (changed.length) failures.push(`round ${round}: restored ${changed.join(', ')} differ from the backed-up data`);
    }
    expect(failures, `seed ${SEED}`).toEqual([]);
  });
});

describe('B. Problem reports carry no business data', () => {
  const issueBody = () => decodeURIComponent(issueUrl('parikshit99/nirman', 'It crashed when saving the contract').split('&body=')[1]);

  it('B: the report keeps errors, AI readings and step names, without what they worked on; Share log keeps it all', () => {
    clearLog();
    log('ai', 'reading ok', { lines: 2 }, 'in: 50 bags cement Shree Traders\n    out: Cement 50 Bag @380');
    logStep('saveContract', undefined, '[{"contractor":"Ramesh","phone":"98765 43210","address":"Sector 15"}]');
    logError(new Error('boom'), 'test');

    const body = issueBody();
    for (const kept of ['boom', 'reading ok', 'saveContract', 'It crashed when saving the contract']) expect(body, `the report should still say "${kept}"`).toContain(kept);
    // "Ramesh" (a contractor's name) is not in the agreed list, but it is as private as his phone number.
    for (const secret of ['Shree Traders', '98765 43210', 'Sector 15', '@380', 'Ramesh']) expect(body, `the public report must not contain "${secret}"`).not.toContain(secret);

    const shared = logAsText();
    for (const detail of ['Shree Traders', '98765 43210', 'Sector 15', '@380', 'Ramesh', 'boom']) expect(shared, `Share log should still contain "${detail}"`).toContain(detail);
  });

  it('B (edge): an action that fails logs what it was given with its error; the report leaves that out too', () => {
    clearLog();
    // What the app's instrumented actions log when one throws (apps/native/src/state/AppState.tsx).
    logError(new Error('database is locked'), 'saveContract', '[{"contractor":"Ramesh","phone":"98765 43210","address":"Sector 15"}]');
    const body = issueBody();
    expect(body).toContain('database is locked');
    expect(body).toContain('saveContract');
    for (const secret of ['Ramesh', '98765 43210', 'Sector 15']) expect(body, `the public report must not contain "${secret}"`).not.toContain(secret);
    expect(logAsText()).toContain('98765 43210');
  });
});

describe('C. Totals that match the bill', () => {
  // As billed: 50 Bag × 380 = 19,000, with GST on it 22,420.
  const billed = { item_name: 'Cement', original_term: 'bori', quantity: 50, unit: 'Bag', unit_price: 380, total_amount: 22420, vendor: 'Shree Traders', date: '2026-10-01' };

  it('C1: a purchase line keeps its billed total until its quantity or rate changes', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.audit, ['vendor', 'editor', 'quantity', 'rate'].map((v) => ({ ...billed, vendor: v })));
    const lines = (await loadSnapshot(db)).items;
    const idOf = (vendor: string) => lines.find((i) => i.vendor === vendor)!.id;
    const total = async (id: string) => (await loadSnapshot(db)).items.find((i) => i.id === id)!.total_amount;
    expect(lines.map((i) => i.total_amount)).toEqual([22420, 22420, 22420, 22420]);

    const vendorOnly = idOf('vendor');
    await updateItem(db, vendorOnly, { vendor: 'Shree Traders & Sons' });
    expect(await total(vendorOnly), 'changing only the vendor').toBe(22420);
    await updateItem(db, vendorOnly, { item_name: 'OPC Cement' });
    await updateItem(db, vendorOnly, { date: '2026-10-02' });
    // "Leave out of Rates" on a line whose rate includes transport.
    await updateItem(db, vendorOnly, { rates_excluded: 1 });
    expect(await total(vendorOnly), 'changing its name, date or leaving it out of Rates').toBe(22420);

    // The line editor saves every field, the unchanged quantity and rate too (apps/native/src/components/LineEditor.tsx).
    const editor = lines.find((i) => i.vendor === 'editor')!;
    const { item_name, quantity, unit, unit_price, ordered_as, brand, model, spec, color, rates_excluded } = editor;
    await updateItem(db, editor.id, { item_name, quantity, unit, unit_price, vendor: 'Gupta Traders', ordered_as, brand, model, spec, color, rates_excluded });
    expect(await total(editor.id), 'changing only the vendor in the line editor').toBe(22420);

    await updateItem(db, idOf('quantity'), { quantity: 40 });
    expect(await total(idOf('quantity'))).toBe(40 * 380);
    await updateItem(db, idOf('rate'), { unit_price: 400 });
    expect(await total(idOf('rate'))).toBe(50 * 400);
  });

  it('C1: a quote line keeps the total the vendor wrote when it is matched to another BOQ line', async () => {
    const db = await freshDb();
    await addItems(db, DRAFT_IDS.boq, [
      { ...billed, unit_price: 0, total_amount: 0, vendor: '' },
      { ...billed, item_name: 'PPC Cement', unit_price: 0, total_amount: 0, vendor: '' },
    ]);
    const boq = await saveDraftToHistory(db, DRAFT_IDS.boq, { title: 'Tower C', address: 'Sector 15', category: 'Civil', site_date: '2026-10-01' });
    await enqueueQuote(db, { boqId: boq, vendor: 'Shree Traders', quoteDate: '2026-10-03', text: '', images: ['IMG'] });
    let snap = await loadSnapshot(db);
    const boqItems = snap.items.filter((i) => i.list_id === boq);
    await completeQuoteJob(db, snap.jobs[0].id, [{ boq_sr: 1, original_term: 'bori', item_name: 'Cement', quantity: 50, unit: 'Bag', unit_price: 380, total_amount: 22420, note: 'incl. GST' }], boqItems.map((i) => i.id));
    const [line] = (await loadSnapshot(db)).quoteLines;
    const total = async () => (await loadSnapshot(db)).quoteLines.find((l) => l.id === line.id)!.total_amount;
    expect(line.total_amount).toBe(22420);

    await updateQuoteLine(db, line.id, { boq_item_id: boqItems[1].id });
    expect(await total(), 'matching it to another BOQ line').toBe(22420);
    await updateQuoteLine(db, line.id, { boq_item_id: null });
    // The review screen saves the four variant fields together.
    await updateQuoteLine(db, line.id, { brand: 'UltraTech', model: '', spec: '53 grade', color: '' });
    expect(await total(), 'unmatching it, or setting its brand').toBe(22420);
    await updateQuoteLine(db, line.id, { unit_price: 400 });
    expect(await total()).toBe(50 * 400);
    snap = await loadSnapshot(db);
    expect(snap.quoteLines).toHaveLength(1);
  });

  /** Rates as the app computes them (apps/native/src/state/AppState.tsx), materials deleted from Rates left out. */
  const rates = (s: Snapshot) => buildItemDatabase(s.lists, s.items, s.rates, learningMap(s.learned), Object.fromEntries(s.hidden.map((h) => [h.id, h.hidden_at])));
  /** Every price in Rates, as "Cement / Bag: 380 from Shree Traders on 2026-10-01". */
  const pricesIn = (s: Snapshot) => rates(s).flatMap((m) => m.priceHistory.map((p) => `${m.name} / ${m.unit}: ${p.price} from ${p.vendor} on ${p.date}`)).sort();

  it('C2: deleting a project keeps its purchase prices in Rates, but not its BOQ prices or lines left out of Rates; deleted materials stay deleted', async () => {
    const db = await freshDb();
    const tower = await saveProject(db, { name: 'Tower C', address: 'Sector 15' });
    const purchases = draftIdFor(tower, 'audit');
    await addItems(db, purchases, [
      { ...billed },
      { item_name: 'Sand', original_term: 'reti', quantity: 2, unit: 'Brass', unit_price: 6500, total_amount: 13000, vendor: 'Gupta', date: '2026-10-01' },
      { item_name: 'Binding wire', original_term: 'taar', quantity: 20, unit: 'kg', unit_price: 90, total_amount: 1800, vendor: 'Shree Traders', date: '2026-10-01' },
    ]);
    await saveDraftToHistory(db, purchases, { title: 'Bill 101', address: 'Sector 15', category: 'Civil', site_date: '2026-10-01' });
    // A line still on the project's open purchase list.
    await addItems(db, purchases, [{ item_name: 'TMT bar', original_term: 'sariya', quantity: 500, unit: 'kg', unit_price: 62, total_amount: 31000, vendor: 'Gupta Steel', date: '2026-10-05' }]);
    // A saved BOQ with an estimated price.
    await addItems(db, draftIdFor(tower, 'boq'), [{ item_name: 'Vitrified tile', original_term: '', quantity: 1200, unit: 'sqft', unit_price: 55, total_amount: 66000, vendor: '', date: '' }]);
    await saveDraftToHistory(db, draftIdFor(tower, 'boq'), { title: 'Flooring', address: 'Sector 15', category: 'Tile', site_date: '2026-10-02' });
    // Sand's rate included transport: left out of Rates. Binding wire was deleted from Rates.
    await updateItem(db, (await loadSnapshot(db)).items.find((i) => i.item_name === 'Sand')!.id, { rates_excluded: 1 });
    await hideMaterial(db, { key: materialKey('Binding wire', 'kg'), name: 'Binding wire', unit: 'kg' });
    // Another project's purchase, which stays as it is.
    await addItems(db, DRAFT_IDS.audit, [{ ...billed, unit_price: 390, total_amount: 19500, vendor: 'Sharma', date: '2026-09-20' }]);
    await saveDraftToHistory(db, DRAFT_IDS.audit, { title: 'Home bill', address: '', category: 'Civil', site_date: '2026-09-20' });

    const before = pricesIn(await loadSnapshot(db));
    const isBoq = (p: string) => p.startsWith('Vitrified tile');
    // As set up: the purchases are in Rates, and so is the saved BOQ's price; sand and binding wire are not.
    expect(before.filter((p) => !isBoq(p))).toEqual([
      'Cement / Bag: 380 from Shree Traders on 2026-10-01',
      'Cement / Bag: 390 from Sharma on 2026-09-20',
      'TMT bar / kg: 62 from Gupta Steel on 2026-10-05',
    ]);
    expect(before.filter(isBoq)).toHaveLength(1);

    await deleteProject(db, tower);
    const after = await loadSnapshot(db);
    expect(after.projects.map((p) => p.name)).toEqual(['My site']);
    expect(pricesIn(after), 'the same materials, prices, vendors and dates').toEqual(before.filter((p) => !isBoq(p)));
    const names = rates(after).map((m) => m.name);
    expect(names, "the BOQ's estimate is not a price paid").not.toContain('Vitrified tile');
    expect(names, 'a line left out of Rates stays out').not.toContain('Sand');
    expect(names, 'a material deleted from Rates stays deleted').not.toContain('Binding wire');
  });

  // Last in the file: it moves the clock forward, and the repository's timestamps never go back.
  it('C2 (edge): a kept price keeps what it shows: its learned name, brand and size, site and work type, every vendor, and the day of an undated line', async () => {
    const db = await freshDb();
    // "bori" was corrected to OPC Cement on another project's line: every line read as "bori" shows as OPC Cement.
    await addItems(db, DRAFT_IDS.audit, [{ ...billed, unit_price: 390, total_amount: 19500, vendor: 'Sharma', date: '2026-09-20' }]);
    await saveDraftToHistory(db, DRAFT_IDS.audit, { title: 'Home bill', address: '', category: 'Civil', site_date: '' });
    await updateItem(db, (await loadSnapshot(db)).items[0].id, { item_name: 'OPC Cement' });

    const tower = await saveProject(db, { name: 'Tower C', address: 'Sector 15' });
    const purchases = draftIdFor(tower, 'audit');
    await addItems(db, purchases, [
      { ...billed, total_amount: 19000 },
      // Same cement, same day, same rate, from a second shop.
      { ...billed, quantity: 20, total_amount: 7600, vendor: 'Gupta' },
      { item_name: 'TMT bar', original_term: 'sariya', quantity: 500, unit: 'kg', unit_price: 62, total_amount: 31000, vendor: 'Gupta Steel', date: '2026-10-05', brand: 'Tata Tiscon', spec: '12 mm' },
      // No date on the bill: Rates dates it by the day the list was saved.
      { item_name: 'Aggregate', original_term: 'rodi', quantity: 3, unit: 'Brass', unit_price: 5200, total_amount: 15600, vendor: 'Yadav', date: '' },
    ]);
    await saveDraftToHistory(db, purchases, { title: 'Bill 101', address: 'Sector 15', category: 'Civil', site_date: '' });

    const show = (s: Snapshot) =>
      rates(s)
        .map((m) => ({
          material: `${m.name} / ${m.unit}`,
          prices: m.priceHistory.map((p) => `${p.price} from ${p.vendor} on ${p.date}${variantLabel(p.variant) ? ` (${variantLabel(p.variant)})` : ''}${p.site ? ` at ${p.site}` : ''}`).sort(),
          vendors: [...m.vendors].sort(),
          categories: [...m.categories].sort(),
          sites: [...m.addresses].sort(),
        }))
        .sort((a, b) => a.material.localeCompare(b.material));
    const before = show(await loadSnapshot(db));
    expect(before.map((m) => m.material)).toEqual(['Aggregate / Brass', 'OPC Cement / Bag', 'TMT bar / kg']);

    // The project is deleted weeks later.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T06:30:00.000Z'));
    try {
      await deleteProject(db, tower);
    } finally {
      vi.useRealTimers();
    }
    const after = show(await loadSnapshot(db));
    expect.soft(after.map((m) => m.material), 'materials under the names they show').toEqual(before.map((m) => m.material));
    for (const m of before) {
      const kept = after.find((a) => a.material === m.material);
      expect.soft(kept?.prices, `${m.material}: prices, vendors, days, brand and size, site`).toEqual(m.prices);
      expect.soft(kept?.vendors, `${m.material}: vendors`).toEqual(m.vendors);
      expect.soft(kept?.categories, `${m.material}: work types`).toEqual(m.categories);
      expect.soft(kept?.sites, `${m.material}: sites`).toEqual(m.sites);
    }
  });
});
