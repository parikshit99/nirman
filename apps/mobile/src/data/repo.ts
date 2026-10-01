import {
  materialKey,
  normalizeTerm,
  dataTables,
  tableColumns,
  todayISO,
  type CategoryRow,
  type ExtractedMaterial,
  type IndexedRateRow,
  type ItemRow,
  type LearnedTermRow,
  type LearningMap,
  type ListRow,
  type DataTable,
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
}

export interface Snapshot {
  lists: ListRow[];
  items: ItemRow[];
  rates: IndexedRateRow[];
  learned: LearnedTermRow[];
  categories: CategoryRow[];
  jobs: Job[];
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
    return { lists, items, rates, learned, categories, jobs };
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

async function copyItems(tx: SqlExecutor, fromListId: string, toListId: string) {
  const items = await tx.all<ItemRow>(
    `SELECT ${tableColumns.items.join(', ')} FROM items WHERE list_id = ?`,
    [fromListId],
  );
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
    if (existing) await tx.run('DELETE FROM items WHERE list_id = ?', [id]);
    await copyItems(tx, DRAFT_IDS[kind], id);
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
    await tx.run('DELETE FROM items WHERE list_id = ?', [id]);
    await tx.run('DELETE FROM lists WHERE id = ?', [id]);
  });
}

export async function deleteAllHistory(db: Db) {
  await db.transaction(async (tx) => {
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

/**
 * Apply unit / vendor / price to every saved or audit-draft item whose
 * material key is selected (the database is derived from these items).
 */
export async function bulkEditMaterials(db: Db, keys: Set<string>, patch: { unit?: string; vendor?: string; price?: number }) {
  await db.transaction(async (tx) => {
    const items = await tx.all<ItemRow>(
      `SELECT ${tableColumns.items.join(', ')} FROM items
       WHERE list_id IN (SELECT id FROM lists WHERE status = 'saved' OR id = ?)`,
      [DRAFT_IDS.audit],
    );
    for (const item of items) {
      if (!keys.has(materialKey(item.item_name, item.unit))) continue;
      const unitPrice = patch.price ?? item.unit_price;
      await touch(tx, 'items', {
        ...item,
        unit: patch.unit || item.unit,
        vendor: patch.vendor || item.vendor,
        unit_price: unitPrice,
        total_amount: patch.price !== undefined ? unitPrice * item.quantity : item.total_amount,
      });
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
export async function indexRates(db: Db, items: Pick<ItemRow, 'item_name' | 'unit' | 'unit_price' | 'vendor' | 'date'>[]) {
  await db.transaction(async (tx) => {
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
  });
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
    await tx.run(
      `INSERT INTO jobs (id, list_id, text, category, capture_date, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`,
      [id, job.listId, job.text, job.category, job.captureDate, nowISO()],
    );
    for (const [idx, data] of job.images.entries()) {
      await tx.run('INSERT INTO job_images (job_id, idx, data) VALUES (?, ?, ?)', [id, idx, data]);
    }
  });
  return id;
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

export async function deleteJob(db: Db, jobId: string) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM job_images WHERE job_id = ?', [jobId]);
    await tx.run('DELETE FROM jobs WHERE id = ?', [jobId]);
  });
}

/** Jobs left "processing" by an app that was killed mid-request go back to the queue. */
export async function resetStuckJobs(db: Db) {
  await db.run(`UPDATE jobs SET status = 'pending' WHERE status = 'processing'`);
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
