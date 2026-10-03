import {
  applyLearning,
  materialKey,
  normalizeTerm,
  dataTables,
  tableColumns,
  todayISO,
  type CategoryRow,
  type ExtractedMaterial,
  type ExtractedQuoteLine,
  type IndexedRateRow,
  type ItemRow,
  type LearnedTermRow,
  type LearningMap,
  type ListRow,
  type QuoteLineRow,
  type QuoteRow,
  type DataTable,
  type HiddenMaterialRow,
  type RowTypes,
} from '@nirman/shared';
import { seedCategories } from './schema.ts';
import type { Db, SqlExecutor, SqlValue } from './sql.ts';

export type ListKind = ListRow['kind'];
export const DRAFT_IDS: Record<ListKind, string> = { audit: 'draft-audit', boq: 'draft-boq' };

export type JobStatus = 'pending' | 'processing' | 'failed';
export interface Job {
  id: string;
  list_id: string;
  text: string;
  category: string;
  capture_date: string;
  status: JobStatus;
  error: string | null;
  attempts: number;
  created_at: string;
  image_count: number;
  /** Set when the job reads a vendor quote for a saved BOQ (list_id is then the BOQ). */
  quote_id: string | null;
}

export interface Snapshot {
  lists: ListRow[];
  items: ItemRow[];
  rates: IndexedRateRow[];
  learned: LearnedTermRow[];
  categories: CategoryRow[];
  jobs: Job[];
  quotes: QuoteRow[];
  quoteLines: QuoteLineRow[];
  hidden: HiddenMaterialRow[];
}

export interface ListMeta {
  title: string;
  address: string;
  category: string;
  site_date: string;
}

export const newId = () => crypto.randomUUID();

let lastNowMs = 0;
/** Strictly increasing timestamps, so rows written back to back keep their order. */
function nowISO(): string {
  lastNowMs = Math.max(Date.now(), lastNowMs + 1);
  return new Date(lastNowMs).toISOString();
}

// ---------------------------------------------------------------------------
// Generic row helpers
// ---------------------------------------------------------------------------

export async function writeRow<T extends DataTable>(tx: SqlExecutor, table: T, row: RowTypes[T]) {
  const cols = tableColumns[table];
  const values = cols.map((c) => (row as Record<string, SqlValue>)[c] ?? null);
  await tx.run(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, values);
}

async function getRow<T extends DataTable>(tx: SqlExecutor, table: T, id: string): Promise<RowTypes[T] | undefined> {
  const [row] = await tx.all<RowTypes[T]>(`SELECT ${tableColumns[table].join(', ')} FROM ${table} WHERE id = ?`, [id]);
  return row;
}

/** Save an edited row with a fresh updated_at. */
async function touch<T extends 'lists' | 'items' | 'learned_terms'>(tx: SqlExecutor, table: T, row: RowTypes[T]) {
  await writeRow(tx, table, { ...row, updated_at: nowISO() });
}

export const selectAll = <T extends DataTable>(table: T, order: string) =>
  `SELECT ${tableColumns[table].join(', ')} FROM ${table} ORDER BY ${order}`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadSnapshot(db: Db): Promise<Snapshot> {
  return db.transaction(async (tx) => {
    const lists = await tx.all<ListRow>(selectAll('lists', 'created_at DESC'));
    const items = await tx.all<ItemRow>(selectAll('items', 'created_at DESC, id'));
    const rates = await tx.all<IndexedRateRow>(selectAll('indexed_rates', 'indexed_at DESC'));
    const learned = await tx.all<LearnedTermRow>(selectAll('learned_terms', 'id'));
    const categories = await tx.all<CategoryRow>(selectAll('categories', 'created_at, id'));
    const jobs = await tx.all<Job>(
      `SELECT j.*, (SELECT COUNT(*) FROM job_images i WHERE i.job_id = j.id) AS image_count FROM jobs j ORDER BY created_at`,
    );
    const quotes = await tx.all<QuoteRow>(selectAll('quotes', 'created_at'));
    const quoteLines = await tx.all<QuoteLineRow>(selectAll('quote_lines', 'quote_id, position'));
    const hidden = await tx.all<HiddenMaterialRow>(selectAll('hidden_materials', 'hidden_at'));
    return { lists, items, rates, learned, categories, jobs, quotes, quoteLines, hidden };
  });
}

export function learningMap(learned: LearnedTermRow[]): LearningMap {
  return Object.fromEntries(learned.map((l) => [l.id, { item_name: l.item_name, unit: l.unit }]));
}

// ---------------------------------------------------------------------------
// Lists and items
// ---------------------------------------------------------------------------

/** Make sure both working drafts (current audit and BOQ lists) exist. */
export async function ensureDrafts(db: Db) {
  await db.transaction(ensureDraftRows);
}

async function ensureDraftRows(tx: SqlExecutor) {
  for (const kind of ['audit', 'boq'] as const) {
    if (await getRow(tx, 'lists', DRAFT_IDS[kind])) continue;
    const ts = nowISO();
    await writeRow(tx, 'lists', {
      id: DRAFT_IDS[kind], kind, status: 'draft', title: '', address: '', category: '', site_date: null, notes: '',
      created_at: ts, updated_at: ts,
    });
  }
}

/**
 * Insert materials at the top of a list, keeping their given order
 * (lists are shown newest first).
 */
let lastInsertMs = 0;
async function insertMaterials(tx: SqlExecutor, listId: string, materials: ExtractedMaterial[]) {
  const n = materials.length;
  // Strictly increasing so a batch added right after another still sorts above it.
  const base = Math.max(Date.now(), lastInsertMs + 1);
  lastInsertMs = base + n;
  for (const [i, m] of materials.entries()) {
    const ts = new Date(base + (n - i)).toISOString();
    const quantity = Number(m.quantity) || 0;
    const unitPrice = Number(m.unit_price) || 0;
    await writeRow(tx, 'items', {
      id: newId(),
      list_id: listId,
      item_name: m.item_name,
      original_term: m.original_term || '',
      quantity,
      unit: m.unit || 'unit',
      unit_price: unitPrice,
      total_amount: Number(m.total_amount) || quantity * unitPrice,
      vendor: m.vendor || '',
      date: m.date || '',
      created_at: ts,
      updated_at: ts,
    });
  }
}

export async function addItems(db: Db, listId: string, materials: ExtractedMaterial[]) {
  await db.transaction((tx) => insertMaterials(tx, listId, materials));
}

export type ItemPatch = Partial<Pick<ItemRow, 'item_name' | 'quantity' | 'unit' | 'unit_price' | 'vendor' | 'date'>>;

/**
 * Save an edited item. When the name or unit changed, remember the correction
 * for its original term so future extractions and the database use it.
 */
export async function updateItem(db: Db, id: string, patch: ItemPatch) {
  await db.transaction(async (tx) => {
    const item = await getRow(tx, 'items', id);
    if (!item) return;
    const next = { ...item, ...patch };
    next.quantity = Number(next.quantity) || 0;
    next.unit_price = Number(next.unit_price) || 0;
    next.total_amount = next.quantity * next.unit_price;
    await touch(tx, 'items', next);

    const term = normalizeTerm(item.original_term || item.item_name);
    if (term && (next.item_name !== item.item_name || next.unit !== item.unit)) {
      await touch(tx, 'learned_terms', { id: term, item_name: next.item_name, unit: next.unit, updated_at: '' });
    }
  });
}

export async function deleteItem(db: Db, id: string) {
  await db.run('DELETE FROM items WHERE id = ?', [id]);
}

export async function clearListItems(db: Db, listId: string) {
  await db.run('DELETE FROM items WHERE list_id = ?', [listId]);
}

export async function setListNotes(db: Db, listId: string, notes: string) {
  await db.transaction(async (tx) => {
    const list = await getRow(tx, 'lists', listId);
    if (list && list.notes !== notes) await touch(tx, 'lists', { ...list, notes });
  });
}

/** A list's items in display order (newest first), which is also the BOQ's printed Sr. order. */
export function listItems(tx: SqlExecutor, listId: string): Promise<ItemRow[]> {
  return tx.all<ItemRow>(`SELECT ${tableColumns.items.join(', ')} FROM items WHERE list_id = ? ORDER BY created_at DESC, id`, [listId]);
}

async function copyItems(tx: SqlExecutor, fromListId: string, toListId: string) {
  const items = await listItems(tx, fromListId);
  for (const item of items) {
    const ts = nowISO();
    await writeRow(tx, 'items', { ...item, id: newId(), list_id: toListId, updated_at: ts });
  }
}

/**
 * Save a draft as a history record. With `targetId`, the existing record's
 * metadata and items are replaced; otherwise a new record is created.
 */
export async function saveDraftToHistory(db: Db, kind: ListKind, meta: ListMeta, targetId?: string): Promise<string> {
  return db.transaction(async (tx) => {
    const draft = await getRow(tx, 'lists', DRAFT_IDS[kind]);
    const notes = kind === 'boq' ? draft?.notes ?? '' : undefined;
    const existing = targetId ? await getRow(tx, 'lists', targetId) : undefined;
    const ts = nowISO();
    const id = existing?.id ?? newId();

    await writeRow(tx, 'lists', {
      id,
      kind: existing?.kind ?? kind,
      status: 'saved',
      title: meta.title,
      address: meta.address,
      category: meta.category,
      site_date: meta.site_date || null,
      notes: notes ?? existing?.notes ?? '',
      created_at: existing?.created_at ?? ts,
      updated_at: ts,
    });
    const oldItems = existing ? await listItems(tx, id) : [];
    if (existing) await tx.run('DELETE FROM items WHERE list_id = ?', [id]);
    await copyItems(tx, DRAFT_IDS[kind], id);
    if (existing) await rematchQuoteLines(tx, id, oldItems);
    return id;
  });
}

export async function updateListMeta(db: Db, id: string, meta: ListMeta) {
  await db.transaction(async (tx) => {
    const list = await getRow(tx, 'lists', id);
    if (list) await touch(tx, 'lists', { ...list, ...meta, site_date: meta.site_date || null });
  });
}

export async function renameList(db: Db, id: string, title: string) {
  await db.transaction(async (tx) => {
    const list = await getRow(tx, 'lists', id);
    if (list) await touch(tx, 'lists', { ...list, title });
  });
}

export async function deleteList(db: Db, id: string) {
  await db.transaction(async (tx) => {
    await deleteQuotesWhere(tx, 'boq_id = ?', [id]);
    await tx.run('DELETE FROM items WHERE list_id = ?', [id]);
    await tx.run('DELETE FROM lists WHERE id = ?', [id]);
  });
}

export async function deleteAllHistory(db: Db) {
  await db.transaction(async (tx) => {
    await deleteQuotesWhere(tx, `boq_id IN (SELECT id FROM lists WHERE status = 'saved')`);
    await tx.run(`DELETE FROM items WHERE list_id IN (SELECT id FROM lists WHERE status = 'saved')`);
    await tx.run(`DELETE FROM lists WHERE status = 'saved'`);
  });
}

/** Replace the matching draft (audit or BOQ) with a copy of a history record. */
export async function restoreToDraft(db: Db, historyId: string): Promise<ListKind | undefined> {
  return db.transaction(async (tx) => {
    const record = await getRow(tx, 'lists', historyId);
    if (!record) return undefined;
    const draftId = DRAFT_IDS[record.kind];
    const draft = await getRow(tx, 'lists', draftId);
    if (!draft) return undefined;
    await tx.run('DELETE FROM items WHERE list_id = ?', [draftId]);
    await copyItems(tx, historyId, draftId);
    if (record.kind === 'boq') await touch(tx, 'lists', { ...draft, notes: record.notes });
    return record.kind;
  });
}

// ---------------------------------------------------------------------------
// Materials (the Data tab groups items and added rates by name + unit)
// ---------------------------------------------------------------------------

export interface MaterialRef {
  key: string;
  name: string;
  unit: string;
}

/** Saved-list items (and the open purchase list) and added rates that make up the given materials. */
async function materialRowsTx(tx: SqlExecutor, keys: Set<string>) {
  const learning = learningMap(await tx.all<LearnedTermRow>(selectAll('learned_terms', 'id')));
  const keyOf = (row: { item_name: string; unit: string; original_term?: string }) => {
    const { item_name, unit } = applyLearning(learning, row);
    return materialKey(item_name, unit);
  };
  const items = await tx.all<ItemRow>(
    `SELECT ${tableColumns.items.join(', ')} FROM items
     WHERE list_id IN (SELECT id FROM lists WHERE status = 'saved' OR id = ?)`,
    [DRAFT_IDS.audit],
  );
  const rates = await tx.all<IndexedRateRow>(selectAll('indexed_rates', 'indexed_at'));
  return { items: items.filter((i) => keys.has(keyOf(i))), rates: rates.filter((r) => keys.has(keyOf(r))) };
}

async function renameMaterialTx(tx: SqlExecutor, keys: Set<string>, to: { item_name: string; unit: string }) {
  const item_name = to.item_name.trim();
  const unit = to.unit.trim() || 'unit';
  if (!item_name) return;
  const { items, rates } = await materialRowsTx(tx, keys);
  const remember = async (term: string) => {
    if (term) await touch(tx, 'learned_terms', { id: term, item_name, unit, updated_at: '' });
  };
  for (const item of items) {
    await touch(tx, 'items', { ...item, item_name, unit });
    await remember(normalizeTerm(item.original_term || item.item_name));
  }
  for (const rate of rates) {
    await writeRow(tx, 'indexed_rates', { ...rate, item_name, unit });
    await remember(normalizeTerm(rate.item_name));
  }
}

/**
 * Rename a material or change its unit everywhere it is used. Renaming to an
 * existing material merges the two. The old names are remembered, so future
 * readings of the same words get the new name too.
 */
export async function renameMaterial(db: Db, key: string, to: { item_name: string; unit: string }) {
  await db.transaction((tx) => renameMaterialTx(tx, new Set([key]), to));
}

/**
 * Several materials at once: change their unit, and/or record a new price dated
 * today (with an optional vendor). Earlier prices are kept.
 */
export async function bulkEditMaterials(db: Db, materials: MaterialRef[], patch: { unit?: string; vendor?: string; price?: number }) {
  await db.transaction(async (tx) => {
    const unit = patch.unit?.trim();
    if (unit) for (const m of materials) await renameMaterialTx(tx, new Set([m.key]), { item_name: m.name, unit });
    if (patch.price !== undefined && patch.price > 0) {
      await indexRatesTx(
        tx,
        materials.map((m) => ({ item_name: m.name, unit: unit || m.unit, unit_price: patch.price!, vendor: patch.vendor?.trim() || '', date: todayISO() })),
      );
    }
  });
}

/** Hide a material from the Data tab and price checks; saved lists are not changed. */
export async function hideMaterial(db: Db, m: MaterialRef) {
  await db.transaction((tx) => writeRow(tx, 'hidden_materials', { id: m.key, name: m.name, unit: m.unit, hidden_at: nowISO() }));
}

export async function unhideMaterial(db: Db, key: string) {
  await db.run('DELETE FROM hidden_materials WHERE id = ?', [key]);
}

/** Correct one recorded price: a line in a saved list (its total follows) or an added rate. */
export async function setPrice(db: Db, ref: { itemId?: string; rateId?: string }, price: number) {
  await db.transaction(async (tx) => {
    if (ref.itemId) {
      const item = await getRow(tx, 'items', ref.itemId);
      if (item) await touch(tx, 'items', { ...item, unit_price: price, total_amount: price * item.quantity });
    } else if (ref.rateId) {
      const rate = await getRow(tx, 'indexed_rates', ref.rateId);
      if (rate) await writeRow(tx, 'indexed_rates', { ...rate, price });
    }
  });
}

// ---------------------------------------------------------------------------
// Learned terms, indexed rates, categories
// ---------------------------------------------------------------------------

export async function clearLearning(db: Db) {
  await db.run('DELETE FROM learned_terms');
}

/** Index item rates; an identical rate (same material, date and price) is replaced. */
type RateInput = Pick<ItemRow, 'item_name' | 'unit' | 'unit_price' | 'vendor' | 'date'>;

export async function indexRates(db: Db, items: RateInput[]) {
  await db.transaction((tx) => indexRatesTx(tx, items));
}

async function indexRatesTx(tx: SqlExecutor, items: RateInput[]) {
  const indexedAt = nowISO();
  let existing = await tx.all<IndexedRateRow>(selectAll('indexed_rates', 'indexed_at'));
  for (const item of items) {
    if (!item.item_name) continue;
    const date = item.date || todayISO();
    const key = materialKey(item.item_name, item.unit);
    const same = (r: IndexedRateRow) => materialKey(r.item_name, r.unit) === key && r.date === date && r.price === item.unit_price;
    for (const r of existing.filter(same)) await tx.run('DELETE FROM indexed_rates WHERE id = ?', [r.id]);
    existing = existing.filter((r) => !same(r));
    await writeRow(tx, 'indexed_rates', {
      id: newId(),
      item_name: item.item_name,
      unit: item.unit || 'unit',
      date,
      price: item.unit_price || 0,
      vendor: item.vendor || 'Unknown',
      indexed_at: indexedAt,
    });
  }
}

export async function deleteIndexedRate(db: Db, id: string) {
  await db.run('DELETE FROM indexed_rates WHERE id = ?', [id]);
}

export async function addCategory(db: Db, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.transaction(async (tx) => {
    const id = trimmed.toLowerCase();
    if (await getRow(tx, 'categories', id)) return;
    await writeRow(tx, 'categories', { id, name: trimmed, created_at: nowISO() });
  });
}

export async function deleteCategory(db: Db, id: string) {
  await db.run('DELETE FROM categories WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Queued AI extraction jobs (local only)
// ---------------------------------------------------------------------------

export interface NewJob {
  listId: string;
  text: string;
  /** Base64 JPEG data without the data: prefix. */
  images: string[];
  category: string;
  captureDate: string;
}

export async function enqueueJob(db: Db, job: NewJob): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await insertJob(tx, id, job, null);
  });
  return id;
}

async function insertJob(tx: SqlExecutor, id: string, job: NewJob, quoteId: string | null) {
  await tx.run(
    `INSERT INTO jobs (id, list_id, text, category, capture_date, status, attempts, created_at, quote_id) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [id, job.listId, job.text, job.category, job.captureDate, nowISO(), quoteId],
  );
  for (const [idx, data] of job.images.entries()) {
    await tx.run('INSERT INTO job_images (job_id, idx, data) VALUES (?, ?, ?)', [id, idx, data]);
  }
}

export async function getJobImages(db: Db, jobId: string): Promise<string[]> {
  const rows = await db.all<{ data: string }>('SELECT data FROM job_images WHERE job_id = ? ORDER BY idx', [jobId]);
  return rows.map((r) => r.data);
}

export async function setJobStatus(db: Db, jobId: string, status: JobStatus, error: string | null = null) {
  await db.run(
    `UPDATE jobs SET status = ?, error = ?, attempts = attempts + (CASE WHEN ? = 'processing' THEN 1 ELSE 0 END) WHERE id = ?`,
    [status, error, status, jobId],
  );
}

/** Store the extracted items and drop the job in one step. */
export async function completeJob(db: Db, jobId: string, materials: ExtractedMaterial[]) {
  await db.transaction(async (tx) => {
    const [job] = await tx.all<Job>('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) return;
    await insertMaterials(tx, job.list_id, materials);
    await tx.run('DELETE FROM job_images WHERE job_id = ?', [jobId]);
    await tx.run('DELETE FROM jobs WHERE id = ?', [jobId]);
  });
}

/** Remove a queued entry; for a quote still being read, the empty quote goes too. */
export async function deleteJob(db: Db, jobId: string) {
  await db.transaction(async (tx) => {
    const [job] = await tx.all<Job>('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (job?.quote_id) await deleteQuotesWhere(tx, 'id = ?', [job.quote_id]);
    await tx.run('DELETE FROM job_images WHERE job_id = ?', [jobId]);
    await tx.run('DELETE FROM jobs WHERE id = ?', [jobId]);
  });
}

/** Jobs left "processing" by an app that was killed mid-request go back to the queue. */
export async function resetStuckJobs(db: Db) {
  await db.run(`UPDATE jobs SET status = 'pending' WHERE status = 'processing'`);
}

// ---------------------------------------------------------------------------
// Vendor quotes for saved BOQs
// ---------------------------------------------------------------------------

async function deleteQuotesWhere(tx: SqlExecutor, where: string, params: SqlValue[] = []) {
  const ids = (await tx.all<{ id: string }>(`SELECT id FROM quotes WHERE ${where}`, params)).map((r) => r.id);
  for (const id of ids) {
    await tx.run('DELETE FROM job_images WHERE job_id IN (SELECT id FROM jobs WHERE quote_id = ?)', [id]);
    await tx.run('DELETE FROM jobs WHERE quote_id = ?', [id]);
    await tx.run('DELETE FROM quote_lines WHERE quote_id = ?', [id]);
    await tx.run('DELETE FROM quotes WHERE id = ?', [id]);
  }
}

/** After a BOQ is re-saved its items get new ids; point quote lines at the item with the same material. */
async function rematchQuoteLines(tx: SqlExecutor, boqId: string, oldItems: ItemRow[]) {
  const newItems = await listItems(tx, boqId);
  const oldKey = new Map(oldItems.map((i) => [i.id, materialKey(i.item_name, i.unit)]));
  const newByKey = new Map<string, string>();
  for (const i of newItems) if (!newByKey.has(materialKey(i.item_name, i.unit))) newByKey.set(materialKey(i.item_name, i.unit), i.id);
  const lines = await tx.all<QuoteLineRow>(
    `SELECT ${tableColumns.quote_lines.join(', ')} FROM quote_lines
     WHERE boq_item_id IS NOT NULL AND quote_id IN (SELECT id FROM quotes WHERE boq_id = ?)`,
    [boqId],
  );
  for (const line of lines) {
    const key = oldKey.get(line.boq_item_id!);
    await writeRow(tx, 'quote_lines', { ...line, boq_item_id: (key && newByKey.get(key)) || null });
  }
}

export interface NewQuote {
  boqId: string;
  vendor: string;
  quoteDate: string;
  text: string;
  /** Base64 JPEG data without the data: prefix. */
  images: string[];
}

/** Create a quote awaiting review and queue the AI reading of the vendor's list. */
export async function enqueueQuote(db: Db, quote: NewQuote): Promise<string> {
  const quoteId = newId();
  await db.transaction(async (tx) => {
    const ts = nowISO();
    await writeRow(tx, 'quotes', {
      id: quoteId, boq_id: quote.boqId, vendor: quote.vendor.trim(), quote_date: quote.quoteDate, status: 'review',
      created_at: ts, updated_at: ts,
    });
    await insertJob(tx, newId(), { listId: quote.boqId, text: quote.text, images: quote.images, category: '', captureDate: quote.quoteDate }, quoteId);
  });
  return quoteId;
}

/**
 * Store the lines read from a vendor quote and drop the job. `boqItemIds[i]` is
 * the item printed as Sr. i+1 when the job was read.
 */
export async function completeQuoteJob(db: Db, jobId: string, lines: ExtractedQuoteLine[], boqItemIds: string[]) {
  await db.transaction(async (tx) => {
    const [job] = await tx.all<Job>('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job?.quote_id) return;
    await tx.run('DELETE FROM quote_lines WHERE quote_id = ?', [job.quote_id]);
    for (const [position, l] of lines.entries()) {
      await writeRow(tx, 'quote_lines', {
        id: newId(),
        quote_id: job.quote_id,
        position,
        boq_item_id: l.boq_sr ? boqItemIds[l.boq_sr - 1] ?? null : null,
        original_term: l.original_term,
        item_name: l.item_name,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        total_amount: l.total_amount,
        note: l.note,
      });
    }
    await tx.run('DELETE FROM job_images WHERE job_id = ?', [jobId]);
    await tx.run('DELETE FROM jobs WHERE id = ?', [jobId]);
  });
}

export async function updateQuote(db: Db, id: string, patch: Partial<Pick<QuoteRow, 'vendor' | 'quote_date'>>) {
  await db.transaction(async (tx) => {
    const quote = await getRow(tx, 'quotes', id);
    if (quote) await writeRow(tx, 'quotes', { ...quote, ...patch, updated_at: nowISO() });
  });
}

export type QuoteLinePatch = Partial<Pick<QuoteLineRow, 'boq_item_id' | 'item_name' | 'quantity' | 'unit' | 'unit_price'>>;

export async function updateQuoteLine(db: Db, id: string, patch: QuoteLinePatch) {
  await db.transaction(async (tx) => {
    const line = await getRow(tx, 'quote_lines', id);
    if (!line) return;
    const next = { ...line, ...patch };
    next.quantity = Number(next.quantity) || 0;
    next.unit_price = Number(next.unit_price) || 0;
    next.total_amount = next.quantity * next.unit_price;
    await writeRow(tx, 'quote_lines', next);
  });
}

export async function deleteQuoteLine(db: Db, id: string) {
  await db.run('DELETE FROM quote_lines WHERE id = ?', [id]);
}

export async function deleteQuote(db: Db, id: string) {
  await db.transaction((tx) => deleteQuotesWhere(tx, 'id = ?', [id]));
}

/**
 * Accept a reviewed quote: its prices go into the material database under the
 * BOQ's item names (so they line up with past prices), and the vendor's
 * wording is learned for future readings. Lines without a BOQ match are
 * indexed under their own name.
 */
export async function confirmQuote(db: Db, id: string) {
  await db.transaction(async (tx) => {
    const quote = await getRow(tx, 'quotes', id);
    if (!quote) return;
    const boq = new Map((await listItems(tx, quote.boq_id)).map((i) => [i.id, i]));
    const lines = await tx.all<QuoteLineRow>(`SELECT ${tableColumns.quote_lines.join(', ')} FROM quote_lines WHERE quote_id = ?`, [id]);
    const rates: RateInput[] = [];
    for (const line of lines) {
      if (line.unit_price <= 0) continue;
      const item = line.boq_item_id ? boq.get(line.boq_item_id) : undefined;
      const unitMatches = !!item && normalizeTerm(line.unit) === normalizeTerm(item.unit);
      rates.push({
        item_name: item?.item_name ?? line.item_name,
        // A different unit keeps the BOQ name but its own unit, so it isn't compared with the wrong prices.
        unit: unitMatches ? item.unit : line.unit,
        unit_price: line.unit_price,
        vendor: quote.vendor || 'Unknown',
        date: quote.quote_date,
      });
      const term = normalizeTerm(line.original_term);
      if (item && unitMatches && term && term !== normalizeTerm(item.item_name)) {
        await touch(tx, 'learned_terms', { id: term, item_name: item.item_name, unit: item.unit, updated_at: '' });
      }
    }
    await indexRatesTx(tx, rates);
    await writeRow(tx, 'quotes', { ...quote, status: 'confirmed', updated_at: nowISO() });
  });
}

// ---------------------------------------------------------------------------
// Whole-database operations (backup restore)
// ---------------------------------------------------------------------------

/** Delete all records and queued jobs, then restore the default categories and drafts. */
export async function clearAllData(tx: SqlExecutor, { seedDefaults = true } = {}) {
  for (const t of [...dataTables, 'jobs', 'job_images']) await tx.run(`DELETE FROM ${t}`);
  if (seedDefaults) {
    await seedCategories(tx);
    await ensureDraftRows(tx);
  }
}

/** Make sure drafts exist after rows were replaced wholesale (e.g. by a restore). */
export { ensureDraftRows };
