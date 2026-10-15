import {
  VARIANT_FIELDS,
  applyLearning,
  buildItemDatabase,
  contractTermsProblem,
  kindLockedNote,
  rateChangesLockedNote,
  fitRow,
  extractedMaterialSchema,
  extractedQuoteLineSchema,
  materialKey,
  variantKey,
  variantOf,
  normalizeTerm,
  dataTables,
  tableColumns,
  todayISO,
  standardizeLine,
  unitFactor,
  unmatchLine,
  type KnownMaterial,
  type ReadAs,
  type CategoryRow,
  type ContractEntryRow,
  type ContractRateRow,
  type ContractRow,
  type MaterialInput,
  type QuoteLineInput,
  type Variant,
  type VariantField,
  type IndexedRateRow,
  type ItemRow,
  type LearnedTermRow,
  type LearningMap,
  type ListRow,
  type ProjectRow,
  type QuoteLineRow,
  type QuoteRow,
  type DataTable,
  type HiddenMaterialRow,
  type RowTypes,
} from '@nirman/shared';
import { platform } from '../platform.ts';
import { seedCategories } from './schema.ts';
import type { Db, SqlExecutor, SqlValue } from './sql.ts';

export type ListKind = ListRow['kind'];

/**
 * Each project has its own open Purchases list and BOQ draft. Drafts made before projects keep their
 * old fixed ids ('draft-audit', 'draft-boq'), so find a draft by its project and kind, never by id.
 */
export const draftIdFor = (projectId: string, kind: ListKind) => `draft-${kind}-${projectId}`;
export const findDraft = (lists: ListRow[], projectId: string, kind: ListKind) =>
  lists.find((l) => l.status === 'draft' && l.kind === kind && l.project_id === projectId);

/** The project made for lists and contracts with no site address, and on a new install. */
export const DEFAULT_PROJECT_NAME = 'My site';

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
  projects: ProjectRow[];
  lists: ListRow[];
  items: ItemRow[];
  rates: IndexedRateRow[];
  learned: LearnedTermRow[];
  categories: CategoryRow[];
  jobs: Job[];
  quotes: QuoteRow[];
  quoteLines: QuoteLineRow[];
  hidden: HiddenMaterialRow[];
  contracts: ContractRow[];
  contractEntries: ContractEntryRow[];
  /** Rate changes on labour contracts, by contract and date (attach them with `withRates`). */
  contractRates: ContractRateRow[];
}

export interface ListMeta {
  title: string;
  address: string;
  category: string;
  site_date: string;
}

export const newId = () => platform.randomUUID();

let lastNowMs = 0;
/** Strictly increasing timestamps, so rows written back to back keep their order. */
function nowISO(): string {
  lastNowMs = Math.max(Date.now(), lastNowMs + 1);
  return new Date(lastNowMs).toISOString();
}

// ---------------------------------------------------------------------------
// Generic row helpers
// ---------------------------------------------------------------------------

/**
 * Insert or replace a row. It is fitted to its table first (fitRow: text cut to its limit, NaN and Infinity as 0),
 * so every backup the app writes restores.
 */
export async function writeRow<T extends DataTable>(tx: SqlExecutor, table: T, row: RowTypes[T]) {
  const cols = tableColumns[table];
  const fitted = fitRow(table, row).row as Record<string, SqlValue>;
  const values = cols.map((c) => fitted[c] ?? null);
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

/** The columns of a table, for a query that adds its own WHERE. */
const selectWhere = (table: DataTable) => `SELECT ${tableColumns[table].join(', ')} FROM ${table}`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadSnapshot(db: Db): Promise<Snapshot> {
  return db.transaction(async (tx) => {
    const projects = await tx.all<ProjectRow>(selectAll('projects', 'created_at'));
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
    const contracts = await tx.all<ContractRow>(selectAll('contracts', 'created_at DESC'));
    const contractEntries = await tx.all<ContractEntryRow>(selectAll('contract_entries', 'date, created_at'));
    const contractRates = await tx.all<ContractRateRow>(selectAll('contract_rates', 'contract_id, from_date'));
    return { projects, lists, items, rates, learned, categories, jobs, quotes, quoteLines, hidden, contracts, contractEntries, contractRates };
  });
}

export function learningMap(learned: LearnedTermRow[]): LearningMap {
  return Object.fromEntries(learned.map((l) => [l.id, { item_name: l.item_name, unit: l.unit }]));
}

// ---------------------------------------------------------------------------
// Lists and items
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** Make sure there is a project, every list and contract is in one, and every project has its two drafts. */
export async function ensureProjects(db: Db) {
  await db.transaction(ensureProjectRows);
}

const siteKey = (address: string) => address.trim().toLowerCase();

/**
 * Lists and contracts from before projects (or from an older backup) have no project: those with a
 * site address go into a project for that address, the rest into "My site". The open Purchases list
 * and BOQ go to the project used most recently. Safe to run again; it only fills in what is missing.
 */
async function ensureProjectRows(tx: SqlExecutor) {
  const projects = await tx.all<ProjectRow>(selectAll('projects', 'created_at'));
  const known = new Set(projects.map((p) => p.id));
  const byAddress = new Map<string, string>();
  for (const p of projects) if (p.address && !byAddress.has(siteKey(p.address))) byAddress.set(siteKey(p.address), p.id);
  let noAddress = projects.find((p) => !p.address && p.name === DEFAULT_PROJECT_NAME)?.id;

  const create = async (name: string, address: string, createdAt?: string) => {
    const ts = nowISO();
    const row: ProjectRow = { id: newId(), name, address, status: 'active', created_at: createdAt ?? ts, updated_at: ts };
    await writeRow(tx, 'projects', row);
    projects.push(row);
    known.add(row.id);
    return row.id;
  };
  const projectFor = async (address: string, createdAt: string) => {
    const key = siteKey(address);
    if (!key) return (noAddress ??= await create(DEFAULT_PROJECT_NAME, '', createdAt));
    let id = byAddress.get(key);
    if (!id) {
      id = await create(address.trim(), address.trim(), createdAt);
      byAddress.set(key, id);
    }
    return id;
  };

  for (const table of ['lists', 'contracts'] as const) {
    const rows = await tx.all<{ id: string; address: string; created_at: string; project_id: string }>(
      `SELECT id, address, created_at, project_id FROM ${table} ${table === 'lists' ? `WHERE status = 'saved'` : ''} ORDER BY created_at`,
    );
    for (const row of rows) {
      if (!known.has(row.project_id)) await tx.run(`UPDATE ${table} SET project_id = ? WHERE id = ?`, [await projectFor(row.address, row.created_at), row.id]);
    }
  }
  // Rates from confirmed quotes: the project of their site, where there is one.
  for (const rate of await tx.all<{ id: string; address: string }>(`SELECT id, address FROM indexed_rates WHERE project_id = '' AND address != ''`)) {
    const id = byAddress.get(siteKey(rate.address));
    if (id) await tx.run('UPDATE indexed_rates SET project_id = ? WHERE id = ?', [id, rate.id]);
  }

  const drafts = await tx.all<ListRow>(`SELECT ${tableColumns.lists.join(', ')} FROM lists WHERE status = 'draft' ORDER BY created_at`);
  const orphans = drafts.filter((d) => !known.has(d.project_id));
  if (orphans.length || projects.length === 0) {
    const [recent] = await tx.all<{ project_id: string }>(
      `SELECT project_id, MAX(updated_at) AS at FROM (
         SELECT project_id, updated_at FROM lists WHERE status = 'saved' UNION ALL SELECT project_id, updated_at FROM contracts
       ) GROUP BY project_id ORDER BY at DESC LIMIT 1`,
    );
    const target = recent && known.has(recent.project_id) ? recent.project_id : (noAddress ??= await create(DEFAULT_PROJECT_NAME, ''));
    for (const orphan of orphans) {
      const existing = drafts.find((d) => d.project_id === target && d.kind === orphan.kind);
      if (existing) {
        // Two open lists of one kind for a project: keep one, with the lines of both.
        await tx.run('UPDATE items SET list_id = ? WHERE list_id = ?', [existing.id, orphan.id]);
        await tx.run('UPDATE jobs SET list_id = ? WHERE list_id = ?', [existing.id, orphan.id]);
        await tx.run('DELETE FROM lists WHERE id = ?', [orphan.id]);
      } else {
        await tx.run('UPDATE lists SET project_id = ? WHERE id = ?', [target, orphan.id]);
        drafts.push({ ...orphan, project_id: target });
      }
    }
  }

  for (const p of projects) {
    for (const kind of ['audit', 'boq'] as const) {
      if (drafts.some((d) => d.project_id === p.id && d.kind === kind && known.has(d.project_id))) continue;
      const ts = nowISO();
      await writeRow(tx, 'lists', {
        id: draftIdFor(p.id, kind), kind, status: 'draft', project_id: p.id, title: '', address: '', category: '', site_date: null, notes: '',
        created_at: ts, updated_at: ts,
      });
    }
  }
}

export type ProjectInput = Pick<ProjectRow, 'name' | 'address'>;

/** Start a project (with its own empty Purchases list and BOQ), or rename one / change its site address. */
export async function saveProject(db: Db, input: ProjectInput, id?: string): Promise<string> {
  return db.transaction(async (tx) => {
    const existing = id ? await getRow(tx, 'projects', id) : undefined;
    const ts = nowISO();
    const row: ProjectRow = {
      status: 'active',
      ...existing,
      name: input.name.trim() || input.address.trim() || DEFAULT_PROJECT_NAME,
      address: input.address.trim(),
      id: existing?.id ?? newId(),
      created_at: existing?.created_at ?? ts,
      updated_at: ts,
    };
    await writeRow(tx, 'projects', row);
    await ensureProjectRows(tx);
    return row.id;
  });
}

/** Close a finished project (it moves under Closed) or reopen it. Nothing in it changes. */
export async function setProjectStatus(db: Db, id: string, status: ProjectRow['status']) {
  await db.transaction(async (tx) => {
    const p = await getRow(tx, 'projects', id);
    if (p) await writeRow(tx, 'projects', { ...p, status, updated_at: nowISO() });
  });
}

/**
 * Delete a project with all its lists, BOQs (and their vendor quotes) and labour contracts. Its prices stay in
 * Rates: the prices of its purchase lines are first kept as added rates (keepProjectRates), and rates it already
 * had stay without a project. A new "My site" is made if it was the last project.
 */
export async function deleteProject(db: Db, id: string) {
  await db.transaction(async (tx) => {
    await keepProjectRates(tx, id);
    const lists = `SELECT id FROM lists WHERE project_id = ?`;
    await deleteQuotesWhere(tx, `boq_id IN (${lists})`, [id]);
    await deleteJobsWhere(tx, `list_id IN (${lists})`, [id]);
    await tx.run(`DELETE FROM items WHERE list_id IN (${lists})`, [id]);
    await tx.run('DELETE FROM lists WHERE project_id = ?', [id]);
    await tx.run('DELETE FROM contract_entries WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)', [id]);
    await tx.run('DELETE FROM contract_rates WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)', [id]);
    await tx.run('DELETE FROM contracts WHERE project_id = ?', [id]);
    await tx.run(`UPDATE indexed_rates SET project_id = '' WHERE project_id = ?`, [id]);
    await tx.run('DELETE FROM projects WHERE id = ?', [id]);
    await pruneBillPhotos(tx);
    await ensureProjectRows(tx);
  });
}

/**
 * Before a project is deleted: each price its purchase lines give Rates (its saved purchase lists and open purchase
 * list, not BOQs) becomes an added rate, so Rates shows the same prices without the lines. A rate takes what Rates
 * used for its line: the material after learned corrections, the date, and when the price was recorded as
 * `indexed_at` (so a material deleted from Rates stays deleted, and comes back with it if restored); the vendor (or
 * Unknown), brand, model, size and colour, and the list's work type and site address, with no project. A price
 * already there as an added rate (same material, variant, date, rate and vendor) is not added again.
 */
async function keepProjectRates(tx: SqlExecutor, projectId: string) {
  const lists = await tx.all<ListRow>(selectAll('lists', 'created_at DESC'));
  const purchases = new Map(lists.filter((l) => l.project_id === projectId && l.kind === 'audit').map((l) => [l.id, l]));
  if (!purchases.size) return;
  const items = await tx.all<ItemRow>(selectAll('items', 'created_at DESC, id'));
  const learning = learningMap(await tx.all<LearnedTermRow>(selectAll('learned_terms', 'id')));
  // A price as Rates tells them apart (a line's own price point is keyed the same way in buildItemDatabase).
  const pointOf = (r: IndexedRateRow) => {
    const { item_name, unit } = applyLearning(learning, r);
    return JSON.stringify([materialKey(item_name, unit), variantKey(r), r.date, r.price, (r.vendor || 'Unknown').trim().toLowerCase()]);
  };
  const existing = new Set((await tx.all<IndexedRateRow>(selectAll('indexed_rates', 'indexed_at'))).map(pointOf));
  const byId = new Map(items.map((i) => [i.id, i]));
  // Rates' own rules pick the lines it counted (priced, named, not left out, not the open list's copy of a saved line),
  // with the date and recorded time it gave each; the lists and items are in the order the app shows them.
  for (const entry of buildItemDatabase(lists, items, [], learning)) {
    for (const point of entry.priceHistory) {
      const item = point.itemId ? byId.get(point.itemId) : undefined;
      const list = item && purchases.get(item.list_id);
      if (!item || !list || !Number.isFinite(point.price)) continue;
      const rate: IndexedRateRow = {
        id: newId(),
        ...applyLearning(learning, item),
        date: point.date,
        price: point.price,
        vendor: item.vendor || 'Unknown',
        ...variantOf(item),
        category: list.category,
        address: list.address,
        project_id: '',
        indexed_at: point.timestamp,
      };
      if (!existing.has(pointOf(rate))) await writeRow(tx, 'indexed_rates', rate);
    }
  }
}

/** Move a saved list or BOQ (with its vendor quotes) to another project. */
export async function moveList(db: Db, id: string, projectId: string) {
  await db.transaction(async (tx) => {
    const list = await getRow(tx, 'lists', id);
    if (list?.status === 'saved' && (await getRow(tx, 'projects', projectId))) await touch(tx, 'lists', { ...list, project_id: projectId });
  });
}

/**
 * Insert materials at the top of a list, keeping their given order
 * (lists are shown newest first).
 */
let lastInsertMs = 0;
async function insertMaterials(tx: SqlExecutor, listId: string, input: MaterialInput[], photoId = ''): Promise<string[]> {
  const materials = input.map((m) => extractedMaterialSchema.parse(m));
  const ids: string[] = [];
  const n = materials.length;
  // Strictly increasing so a batch added right after another still sorts above it.
  const base = Math.max(Date.now(), lastInsertMs + 1);
  lastInsertMs = base + n;
  for (const [i, m] of materials.entries()) {
    const ts = new Date(base + (n - i)).toISOString();
    const quantity = Number(m.quantity) || 0;
    const unitPrice = Number(m.unit_price) || 0;
    const id = newId();
    ids.push(id);
    await writeRow(tx, 'items', {
      id,
      list_id: listId,
      item_name: m.item_name,
      original_term: m.original_term || '',
      quantity,
      unit: m.unit || 'unit',
      unit_price: unitPrice,
      total_amount: Number(m.total_amount) || quantity * unitPrice,
      vendor: m.vendor || '',
      date: m.date || '',
      ...variantOf(m),
      delivered_at: '',
      ordered_as: m.ordered_as,
      photo_id: photoId,
      rates_excluded: 0,
      read_as: m.read_as ?? '',
      created_at: ts,
      updated_at: ts,
    });
  }
  return ids;
}

/** Mark lines delivered on a date (YYYY-MM-DD), or not delivered with ''. */
export async function setDelivered(db: Db, ids: string[], date: string) {
  await db.transaction(async (tx) => {
    for (const id of ids) {
      const item = await getRow(tx, 'items', id);
      if (item) await touch(tx, 'items', { ...item, delivered_at: date });
    }
  });
}

export async function addItems(db: Db, listId: string, materials: MaterialInput[]) {
  await db.transaction((tx) => insertMaterials(tx, listId, materials));
}

/**
 * One name per material for lines just read or typed: each is matched to a material in Rates or the starter catalog
 * (`standardizeLine`), keeping what was written in `read_as` so the match can be undone.
 */
export async function matchMaterials(db: Db, materials: MaterialInput[]): Promise<MaterialInput[]> {
  const known = await knownMaterials(db);
  const learning = learningMap(await db.all<LearnedTermRow>(selectAll('learned_terms', 'id')));
  return materials.map((m) => {
    const { line, readAs } = standardizeLine(extractedMaterialSchema.parse(m), known, learning);
    return readAs ? { ...line, read_as: JSON.stringify(readAs) } : line;
  });
}

/** Add lines typed by hand, matched like read ones ("Mount air" typed today joins "Mountair" in Rates). Returns them as stored. */
export async function addTypedItems(db: Db, listId: string, materials: MaterialInput[]): Promise<MaterialInput[]> {
  const matched = await matchMaterials(db, materials);
  await addItems(db, listId, matched);
  return matched;
}

export type ItemPatch = Partial<Pick<ItemRow, 'item_name' | 'quantity' | 'unit' | 'unit_price' | 'vendor' | 'date' | 'delivered_at' | 'ordered_as' | 'rates_excluded' | VariantField>>;

/**
 * Save an edited item. Its total is worked out again only when the quantity or rate changed, so a billed total (with
 * GST or rounding) survives other corrections. When the name or unit changed, remember the correction for its
 * original term so future extractions and the database use it.
 */
export async function updateItem(db: Db, id: string, patch: ItemPatch) {
  await db.transaction(async (tx) => {
    const item = await getRow(tx, 'items', id);
    if (!item) return;
    const next = { ...item, ...patch };
    next.quantity = Number(next.quantity) || 0;
    next.unit_price = Number(next.unit_price) || 0;
    if (next.quantity !== item.quantity || next.unit_price !== item.unit_price) next.total_amount = next.quantity * next.unit_price;
    await touch(tx, 'items', next);

    const term = termOf(item);
    if (term && (next.item_name !== item.item_name || next.unit !== item.unit)) {
      await touch(tx, 'learned_terms', { id: term, item_name: next.item_name, unit: next.unit, updated_at: '' });
    }
  });
}

export async function deleteItem(db: Db, id: string) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM items WHERE id = ?', [id]);
    await pruneBillPhotos(tx);
  });
}

export async function clearListItems(db: Db, listId: string) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM items WHERE list_id = ?', [listId]);
    await pruneBillPhotos(tx);
  });
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

/**
 * Save a draft (a project's open Purchases list or BOQ) as a saved list in the same project. Its lines
 * move to the saved list (they are not copied: each line exists once), entries still being read follow
 * them, and the draft is left empty for the next bill. With `targetId` (an open list that was a copy of
 * a saved list, from before 6.0), that list's lines are replaced; otherwise a new one is created.
 */
export async function saveDraftToHistory(db: Db, draftId: string, meta: ListMeta, targetId?: string): Promise<string> {
  return db.transaction(async (tx) => {
    const draft = await getRow(tx, 'lists', draftId);
    if (draft?.status !== 'draft') throw new Error('The open list was not found. Close and reopen the app, then try again.');
    const kind = draft.kind;
    const notes = kind === 'boq' ? draft?.notes ?? '' : undefined;
    const existing = targetId ? await getRow(tx, 'lists', targetId) : undefined;
    const ts = nowISO();
    const id = existing?.id ?? newId();

    await writeRow(tx, 'lists', {
      id,
      kind: existing?.kind ?? kind,
      status: 'saved',
      project_id: draft.project_id,
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
    await tx.run('UPDATE items SET list_id = ?, updated_at = ? WHERE list_id = ?', [id, ts, draftId]);
    await tx.run('UPDATE jobs SET list_id = ? WHERE list_id = ? AND quote_id IS NULL', [id, draftId]);
    if (kind === 'boq') await tx.run(`UPDATE lists SET notes = '', updated_at = ? WHERE id = ?`, [ts, draftId]);
    if (existing) {
      await rematchQuoteLines(tx, id, oldItems);
      await pruneBillPhotos(tx);
    }
    if ((existing?.kind ?? kind) === 'audit') await fillRateSites(tx, id, meta);
    return id;
  });
}

/** Put one vendor on every line of a list, e.g. when the bill was read with the buyer's name as vendor. */
export async function setListVendor(db: Db, listId: string, vendor: string) {
  // Written without writeRow, so fitted here the same way.
  const { row } = fitRow('items', { vendor: vendor.trim() });
  await db.run('UPDATE items SET vendor = ?, updated_at = ? WHERE list_id = ?', [row.vendor, nowISO(), listId]);
}

export async function updateListMeta(db: Db, id: string, meta: ListMeta) {
  await db.transaction(async (tx) => {
    const list = await getRow(tx, 'lists', id);
    if (list) await touch(tx, 'lists', { ...list, ...meta, site_date: meta.site_date || null });
    if (list?.kind === 'audit') await fillRateSites(tx, id, meta);
  });
}

/**
 * Rates indexed from a purchase list before it was saved have no site; once
 * the list is saved with one, give it to the matching rates.
 */
async function fillRateSites(tx: SqlExecutor, listId: string, meta: Pick<ListMeta, 'address' | 'category'>) {
  if (!meta.address && !meta.category) return;
  const items = await listItems(tx, listId);
  const rates = await tx.all<IndexedRateRow>(`SELECT * FROM indexed_rates WHERE address = '' OR category = ''`);
  for (const rate of rates) {
    const match = items.some(
      (i) =>
        materialKey(i.item_name, i.unit) === materialKey(rate.item_name, rate.unit) &&
        variantKey(i) === variantKey(rate) &&
        (!i.date || i.date === rate.date) &&
        i.unit_price === rate.price &&
        (i.vendor || 'Unknown').toLowerCase() === rate.vendor.toLowerCase(),
    );
    if (match) await writeRow(tx, 'indexed_rates', { ...rate, address: rate.address || meta.address, category: rate.category || meta.category });
  }
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
    // Entries still waiting to be read into it go too, or their lines would land in a list that is gone.
    await deleteJobsWhere(tx, 'list_id = ?', [id]);
    await tx.run('DELETE FROM items WHERE list_id = ?', [id]);
    await tx.run('DELETE FROM lists WHERE id = ?', [id]);
    await pruneBillPhotos(tx);
  });
}

/** Delete every saved list and BOQ of one project. */
export async function deleteAllHistory(db: Db, projectId: string) {
  await db.transaction(async (tx) => {
    const saved = `SELECT id FROM lists WHERE status = 'saved' AND project_id = ?`;
    await deleteQuotesWhere(tx, `boq_id IN (${saved})`, [projectId]);
    await deleteJobsWhere(tx, `list_id IN (${saved})`, [projectId]);
    await tx.run(`DELETE FROM items WHERE list_id IN (${saved})`, [projectId]);
    await tx.run(`DELETE FROM lists WHERE status = 'saved' AND project_id = ?`, [projectId]);
    await pruneBillPhotos(tx);
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

/**
 * The word a row was read from; learned corrections are keyed by it. Taken from the row as it is saved (fitRow), so the
 * key stays within learned_terms' limit even for a line stored before saving fitted rows.
 */
const termOf = (row: { item_name: string; original_term?: string }) => {
  const saved = fitRow('items', { item_name: row.item_name, original_term: row.original_term ?? '' }).row;
  return normalizeTerm(saved.original_term || saved.item_name);
};

/** Saved-list items (and the open purchase list) and added rates that make up the given materials. */
async function materialRowsTx(tx: SqlExecutor, keys: Set<string>) {
  const learning = learningMap(await tx.all<LearnedTermRow>(selectAll('learned_terms', 'id')));
  const keyOf = (row: { item_name: string; unit: string; original_term?: string }) => {
    const { item_name, unit } = applyLearning(learning, row);
    return materialKey(item_name, unit);
  };
  const items = await tx.all<ItemRow>(
    `SELECT ${tableColumns.items.join(', ')} FROM items
     WHERE list_id IN (SELECT id FROM lists WHERE status = 'saved' OR (status = 'draft' AND kind = 'audit'))`,
  );
  const rates = await tx.all<IndexedRateRow>(selectAll('indexed_rates', 'indexed_at'));
  const inSet = (r: ItemRow | IndexedRateRow) => keys.has(keyOf(r));
  // Words also used by rows outside these materials (any list, including BOQs), e.g. "cement" per kg vs per bag.
  const everyItem = await tx.all<ItemRow>(selectAll('items', 'id'));
  const selected = new Set<string>([...items.filter(inSet), ...rates.filter(inSet)].map((r) => r.id));
  const sharedTerms = new Set(
    [...everyItem, ...rates].filter((r) => !selected.has(r.id)).map(termOf),
  );
  return { items: items.filter(inSet), rates: rates.filter(inSet), learning, sharedTerms };
}

async function renameMaterialTx(tx: SqlExecutor, keys: Set<string>, to: { item_name: string; unit: string }, convert = false) {
  const item_name = to.item_name.trim();
  const unit = to.unit.trim() || 'unit';
  if (!item_name) return;
  const { items, rates, learning, sharedTerms } = await materialRowsTx(tx, keys);
  // Merging per MT into per kg: quantities and rates follow the unit (the total stays as billed). A unit simply
  // corrected (convert false), or one that doesn't convert (Bag → kg), keeps its numbers.
  const factorOf = (row: { item_name: string; unit: string; original_term?: string }) => (convert ? (unitFactor(applyLearning(learning, row).unit, unit) ?? 1) : 1);
  // A learned word already shows all its rows as this material, so it must follow the rename. A new
  // word is remembered only if nothing outside this material uses it; a learned word maps to one
  // name and unit, so it would otherwise pull other lines in.
  const remember = async (term: string) => {
    if (term && (learning[term] || !sharedTerms.has(term))) {
      await touch(tx, 'learned_terms', { id: term, item_name, unit, updated_at: '' });
    }
  };
  for (const item of items) {
    const f = factorOf(item);
    const converted =
      f === 1
        ? {}
        : {
            quantity: Math.round(item.quantity * f * 1000) / 1000,
            unit_price: Math.round((item.unit_price / f) * 100) / 100,
            ordered_as: [item.ordered_as, `${item.quantity} ${applyLearning(learning, item).unit}`].filter(Boolean).join('; '),
          };
    await touch(tx, 'items', { ...item, ...converted, item_name, unit });
    await remember(termOf(item));
  }
  for (const rate of rates) {
    const f = factorOf(rate);
    await writeRow(tx, 'indexed_rates', { ...rate, ...(f === 1 ? {} : { price: Math.round((rate.price / f) * 100) / 100 }), item_name, unit });
    await remember(termOf(rate));
  }
  // Renaming onto a hidden material shows it again rather than making these prices vanish too.
  await tx.run('DELETE FROM hidden_materials WHERE id = ?', [materialKey(item_name, unit)]);
}

/**
 * Rename a material or change its unit everywhere it is used. Renaming to an
 * existing material merges the two. The old names are remembered, so future
 * readings of the same words get the new name too. With `convert`, quantities
 * and rates are converted when the unit changes within a kind (MT → kg, brass → cft).
 */
export async function renameMaterial(db: Db, key: string, to: { item_name: string; unit: string }, convert = false) {
  await db.transaction((tx) => renameMaterialTx(tx, new Set([key]), to, convert));
}

/**
 * Materials in Rates (by their learned names), with how many lines and rates use each: what a new reading is
 * matched to. Lines and materials deleted from Rates are left out.
 */
export async function knownMaterials(db: Db): Promise<KnownMaterial[]> {
  const learning = learningMap(await db.all<LearnedTermRow>(selectAll('learned_terms', 'id')));
  const hidden = new Set((await db.all<{ id: string }>('SELECT id FROM hidden_materials')).map((h) => h.id));
  const rows = [
    ...(await db.all<{ item_name: string; unit: string; original_term: string }>(
      `SELECT item_name, unit, original_term FROM items WHERE rates_excluded = 0
       AND list_id IN (SELECT id FROM lists WHERE status = 'saved' OR (status = 'draft' AND kind = 'audit'))`,
    )),
    ...(await db.all<{ item_name: string; unit: string }>('SELECT item_name, unit FROM indexed_rates')),
  ];
  const byKey = new Map<string, KnownMaterial>();
  for (const row of rows) {
    if (!row.item_name.trim()) continue;
    const { item_name, unit } = applyLearning(learning, row);
    const key = materialKey(item_name, unit);
    if (hidden.has(key)) continue;
    const k = byKey.get(key);
    if (k) k.uses = (k.uses ?? 0) + 1;
    else byKey.set(key, { name: item_name, unit, uses: 1 });
  }
  return [...byKey.values()];
}

/** Put a matched line back as it was read (its own name and unit), and forget the match. */
export async function undoMatch(db: Db, itemId: string) {
  await db.transaction(async (tx) => {
    const item = await getRow(tx, 'items', itemId);
    if (!item?.read_as) return;
    let read: ReadAs;
    try {
      read = JSON.parse(item.read_as) as ReadAs;
    } catch {
      return;
    }
    const line = unmatchLine(item, read);
    await touch(tx, 'items', { ...line, total_amount: item.total_amount, read_as: '' });
  });
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

/**
 * Delete a material from the Data tab and price checks: everything recorded for it up to now is left
 * out, saved lists are not changed, and later purchases show again. Undone by unhideMaterial.
 */
export async function hideMaterial(db: Db, m: MaterialRef) {
  await hideMaterials(db, [m]);
}

export async function hideMaterials(db: Db, materials: MaterialRef[]) {
  await db.transaction(async (tx) => {
    const at = nowISO();
    for (const m of materials) await writeRow(tx, 'hidden_materials', { id: m.key, name: m.name, unit: m.unit, hidden_at: at });
  });
}

export async function unhideMaterial(db: Db, key: string) {
  await db.run('DELETE FROM hidden_materials WHERE id = ?', [key]);
}

/** Forget deletions that no longer hide anything (see unusedHiddenMaterials), or restore several at once. */
export async function unhideMaterials(db: Db, keys: string[]) {
  await db.transaction(async (tx) => {
    for (const key of keys) await tx.run('DELETE FROM hidden_materials WHERE id = ?', [key]);
  });
}

/**
 * Make the deletions in hidden_materials final and empty it: the added rates they hid are
 * deleted, and the saved-list lines they hid stay in their lists but never count in Rates again.
 */
export async function clearHiddenMaterials(db: Db) {
  await db.transaction(async (tx) => {
    const hidden = new Map((await tx.all<HiddenMaterialRow>(selectAll('hidden_materials', 'hidden_at'))).map((h) => [h.id, h.hidden_at]));
    if (!hidden.size) return;
    const learning = learningMap(await tx.all<LearnedTermRow>(selectAll('learned_terms', 'id')));
    const hiddenAt = (row: { item_name: string; unit: string; original_term?: string }) => {
      const { item_name, unit } = applyLearning(learning, row);
      return hidden.get(materialKey(item_name, unit));
    };
    const lists = new Map((await tx.all<ListRow>(selectAll('lists', 'created_at'))).map((l) => [l.id, l]));
    for (const item of await tx.all<ItemRow>(selectAll('items', 'created_at'))) {
      const list = lists.get(item.list_id);
      const at = hiddenAt(item);
      // Saved lines by their list's date; lines on the open purchase list (which count in Rates too) by their own.
      const recordedAt = list?.status === 'saved' ? list.created_at : list?.kind === 'audit' ? item.created_at : '';
      if (recordedAt && at && recordedAt <= at) await tx.run('UPDATE items SET rates_excluded = 1 WHERE id = ?', [item.id]);
    }
    for (const rate of await tx.all<IndexedRateRow>(selectAll('indexed_rates', 'indexed_at'))) {
      const at = hiddenAt(rate);
      if (at && rate.indexed_at <= at) await tx.run('DELETE FROM indexed_rates WHERE id = ?', [rate.id]);
    }
    await tx.run('DELETE FROM hidden_materials');
  });
}

export type RatePatch = Partial<Pick<IndexedRateRow, 'item_name' | 'unit' | 'price' | 'vendor' | 'date' | VariantField>>;

/** Correct an added rate: its name, unit, size, brand, price or vendor. */
export async function updateRate(db: Db, id: string, patch: RatePatch) {
  await db.transaction(async (tx) => {
    const rate = await getRow(tx, 'indexed_rates', id);
    if (rate) await writeRow(tx, 'indexed_rates', { ...rate, ...patch, price: Number(patch.price ?? rate.price) || 0 });
  });
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

/** Change what an original word is read as. */
export async function updateLearnedTerm(db: Db, id: string, next: { item_name: string; unit: string }) {
  const item_name = next.item_name.trim();
  if (!item_name) return;
  await db.transaction(async (tx) => {
    if (!(await getRow(tx, 'learned_terms', id))) return;
    await touch(tx, 'learned_terms', { id, item_name, unit: next.unit.trim() || 'unit', updated_at: '' });
  });
}

/** Forget one correction: the word is read as the AI reads it again. */
export async function deleteLearnedTerm(db: Db, id: string) {
  await db.run('DELETE FROM learned_terms WHERE id = ?', [id]);
}

/** Index item rates; an identical rate (same material, date and price) is replaced. */
type RateInput = Pick<ItemRow, 'item_name' | 'unit' | 'unit_price' | 'vendor' | 'date'> & Partial<Variant> & { category?: string; address?: string; project_id?: string };

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
    const same = (r: IndexedRateRow) =>
      materialKey(r.item_name, r.unit) === key && variantKey(r) === variantKey(item) && r.date === date && r.price === item.unit_price;
    for (const r of existing.filter(same)) await tx.run('DELETE FROM indexed_rates WHERE id = ?', [r.id]);
    existing = existing.filter((r) => !same(r));
    await writeRow(tx, 'indexed_rates', {
      id: newId(),
      item_name: item.item_name,
      unit: item.unit || 'unit',
      date,
      price: item.unit_price || 0,
      vendor: item.vendor || 'Unknown',
      ...variantOf(item),
      category: item.category ?? '',
      address: item.address ?? '',
      project_id: item.project_id ?? '',
      indexed_at: indexedAt,
    });
  }
}

export async function deleteIndexedRate(db: Db, id: string) {
  await db.run('DELETE FROM indexed_rates WHERE id = ?', [id]);
}

export async function addCategory(db: Db, name: string) {
  // The id is made from the name as saved (fitRow), so it stays within its own limit.
  const trimmed = fitRow('categories', { name: name.trim() }).row.name.trim();
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

/** The photos of one bill, or none if they were deleted with their last line. */
export async function getBillPhotos(db: Db, photoId: string): Promise<string[]> {
  const [row] = await db.all<{ images: string }>('SELECT images FROM bill_photos WHERE id = ?', [photoId]);
  return row ? (JSON.parse(row.images) as string[]) : [];
}

/** The first page and the page count of each bill photo, for thumbnails (the other pages stay in the database). */
export async function getBillPhotoCovers(db: Db, photoIds: string[]): Promise<{ id: string; cover: string; pages: number }[]> {
  if (!photoIds.length) return [];
  const rows = await db.all<{ id: string; cover: string | null; pages: number }>(
    `SELECT id, json_extract(images, '$[0]') AS cover, json_array_length(images) AS pages FROM bill_photos WHERE id IN (${photoIds.map(() => '?').join(', ')})`,
    photoIds,
  );
  const byId = new Map(rows.filter((r) => r.cover).map((r) => [r.id, { id: r.id, cover: r.cover as string, pages: r.pages }]));
  return photoIds.flatMap((id) => byId.get(id) ?? []);
}

/** Bill photos no line points to any more (their lines and lists were deleted). */
async function pruneBillPhotos(tx: SqlExecutor) {
  await tx.run(`DELETE FROM bill_photos WHERE id NOT IN (SELECT photo_id FROM items WHERE photo_id != '')`);
}

export async function countBillPhotos(db: Db): Promise<number> {
  const [row] = await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM bill_photos');
  return row?.n ?? 0;
}

/** Free space: drop every kept bill photo. The lines stay. */
export async function clearBillPhotos(db: Db) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM bill_photos');
    await tx.run(`UPDATE items SET photo_id = '' WHERE photo_id != ''`);
  });
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

/** Queue a failed entry again, with a fresh count of attempts. */
export async function retryJob(db: Db, jobId: string) {
  await db.run(`UPDATE jobs SET status = 'pending', error = NULL, attempts = 0 WHERE id = ?`, [jobId]);
}

/**
 * Store the extracted items and drop the job in one step; returns the new items' ids. None when the job was
 * deleted while it was read, or its list was (the job is dropped then: there is nowhere to put its lines).
 */
export async function completeJob(db: Db, jobId: string, materials: MaterialInput[]): Promise<string[]> {
  return db.transaction(async (tx) => {
    const [job] = await tx.all<Job>('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) return [];
    if (!(await getRow(tx, 'lists', job.list_id))) {
      await deleteJobsWhere(tx, 'id = ?', [jobId]);
      return [];
    }
    // Keep the bill photos with the lines they became, so they can be checked against the bill later.
    const images = await tx.all<{ data: string }>('SELECT data FROM job_images WHERE job_id = ? ORDER BY idx', [jobId]);
    let photoId = '';
    if (images.length && materials.length) {
      photoId = newId();
      await tx.run('INSERT INTO bill_photos (id, created_at, images) VALUES (?, ?, ?)', [photoId, nowISO(), JSON.stringify(images.map((i) => i.data))]);
    }
    const ids = await insertMaterials(tx, job.list_id, materials, photoId);
    await tx.run('DELETE FROM job_images WHERE job_id = ?', [jobId]);
    await tx.run('DELETE FROM jobs WHERE id = ?', [jobId]);
    return ids;
  });
}

// ---------------------------------------------------------------------------
// Training data (opt-in): bill photos with the lines they became, as finally corrected
// ---------------------------------------------------------------------------

export interface TrainingSampleInput {
  /** What read it: 'phone' or 'gemini'. */
  engine: string;
  ocr_text: string;
  images: string[];
  item_ids: string[];
  category: string;
}

export async function saveTrainingSample(db: Db, s: TrainingSampleInput) {
  await db.run('INSERT INTO training_samples (id, created_at, engine, ocr_text, images, item_ids, category) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    newId(),
    nowISO(),
    s.engine,
    s.ocr_text,
    JSON.stringify(s.images),
    JSON.stringify(s.item_ids),
    s.category,
  ]);
}

export async function countTrainingSamples(db: Db): Promise<number> {
  const [row] = await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM training_samples');
  return row?.n ?? 0;
}

export async function clearTrainingSamples(db: Db) {
  await db.run('DELETE FROM training_samples');
}

/**
 * Training data as JSON Lines: one bill per line with its photos (base64 JPEG),
 * the text the phone read, and the lines as they are now (after any
 * corrections). Bills whose lines were all deleted are left out.
 */
export async function exportTrainingData(db: Db): Promise<{ jsonl: string; count: number }> {
  const samples = await db.all<{ id: string; created_at: string; engine: string; ocr_text: string; images: string; item_ids: string; category: string }>(
    'SELECT * FROM training_samples ORDER BY created_at',
  );
  const out: string[] = [];
  for (const s of samples) {
    const ids = JSON.parse(s.item_ids) as string[];
    if (!ids.length) continue;
    const items = await db.all<ItemRow>(`SELECT ${tableColumns.items.join(', ')} FROM items WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
    if (!items.length) continue;
    const lines = ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is ItemRow => !!i)
      .map((i) => ({
        item_name: i.item_name, original_term: i.original_term, quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, total_amount: i.total_amount,
        vendor: i.vendor, date: i.date, brand: i.brand, model: i.model, spec: i.spec, color: i.color, ordered_as: i.ordered_as,
      }));
    out.push(JSON.stringify({ id: s.id, created_at: s.created_at, read_by: s.engine, category: s.category, images: JSON.parse(s.images), phone_text: s.ocr_text, lines }));
  }
  return { jsonl: out.join('\n'), count: out.length };
}

/** Remove a queued entry; for a quote still being read, the empty quote goes too. */
export async function deleteJob(db: Db, jobId: string) {
  await db.transaction(async (tx) => {
    const [job] = await tx.all<Job>('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (job?.quote_id) await deleteQuotesWhere(tx, 'id = ?', [job.quote_id]);
    await deleteJobsWhere(tx, 'id = ?', [jobId]);
  });
}

/** Queued entries matching `where` (on `jobs`), with their photos. */
async function deleteJobsWhere(tx: SqlExecutor, where: string, params: SqlValue[] = []) {
  await tx.run(`DELETE FROM job_images WHERE job_id IN (SELECT id FROM jobs WHERE ${where})`, params);
  await tx.run(`DELETE FROM jobs WHERE ${where}`, params);
}

/**
 * Clean up what earlier versions could leave when a list was deleted while an entry for it was still queued: the
 * entry stayed, and once read, its lines were stored under the deleted list, where nothing shows them. Removes those
 * entries and lines, quotes of BOQs that are gone, and the bill photos only they used. Returns how many rows went.
 */
export async function removeOrphans(db: Db): Promise<{ jobs: number; items: number; quotes: number }> {
  return db.transaction(async (tx) => {
    const count = async (sql: string) => (await tx.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`))[0]?.n ?? 0;
    const noList = 'list_id NOT IN (SELECT id FROM lists)';
    const found = {
      jobs: await count(`jobs WHERE ${noList} OR (quote_id IS NOT NULL AND quote_id NOT IN (SELECT id FROM quotes))`),
      items: await count(`items WHERE ${noList}`),
      quotes: await count('quotes WHERE boq_id NOT IN (SELECT id FROM lists)'),
    };
    if (!found.jobs && !found.items && !found.quotes) {
      // Photos of entries that are gone (nothing else to do on almost every start).
      await tx.run('DELETE FROM job_images WHERE job_id NOT IN (SELECT id FROM jobs)');
      return found;
    }
    await deleteQuotesWhere(tx, 'boq_id NOT IN (SELECT id FROM lists)');
    await deleteJobsWhere(tx, `${noList} OR (quote_id IS NOT NULL AND quote_id NOT IN (SELECT id FROM quotes))`);
    await tx.run('DELETE FROM job_images WHERE job_id NOT IN (SELECT id FROM jobs)');
    await tx.run(`DELETE FROM items WHERE ${noList}`);
    await pruneBillPhotos(tx);
    return found;
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
 * A vendor quote typed in by hand: a rate against each BOQ item (no AI). It
 * goes to review like a read quote, so it is checked before confirming.
 */
export async function createManualQuote(
  db: Db,
  quote: { boqId: string; vendor: string; quoteDate: string; rates: { boqItemId: string; unitPrice: number }[] },
): Promise<string> {
  const quoteId = newId();
  await db.transaction(async (tx) => {
    const ts = nowISO();
    await writeRow(tx, 'quotes', {
      id: quoteId, boq_id: quote.boqId, vendor: quote.vendor.trim(), quote_date: quote.quoteDate, status: 'review',
      created_at: ts, updated_at: ts,
    });
    const items = new Map((await listItems(tx, quote.boqId)).map((i) => [i.id, i]));
    let position = 0;
    for (const { boqItemId, unitPrice } of quote.rates) {
      const item = items.get(boqItemId);
      if (!item || !(unitPrice > 0)) continue;
      await writeRow(tx, 'quote_lines', {
        id: newId(),
        quote_id: quoteId,
        position: position++,
        boq_item_id: item.id,
        original_term: '',
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: unitPrice,
        total_amount: item.quantity * unitPrice,
        note: '',
        ...variantOf(item),
      });
    }
  });
  return quoteId;
}

/**
 * Store the lines read from a vendor quote and drop the job. `boqItemIds[i]` is
 * the item printed as Sr. i+1 when the job was read.
 */
export async function completeQuoteJob(db: Db, jobId: string, input: QuoteLineInput[], boqItemIds: string[]) {
  const lines = input.map((l) => extractedQuoteLineSchema.parse(l));
  await db.transaction(async (tx) => {
    const [job] = await tx.all<Job>('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job?.quote_id) return;
    if (!(await getRow(tx, 'quotes', job.quote_id))) {
      await deleteJobsWhere(tx, 'id = ?', [jobId]);
      return;
    }
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
        ...variantOf(l),
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

export type QuoteLinePatch = Partial<Pick<QuoteLineRow, 'boq_item_id' | 'item_name' | 'quantity' | 'unit' | 'unit_price' | VariantField>>;

/** Correct a quote line; its total is worked out again only when the quantity or rate changed (it keeps the vendor's own). */
export async function updateQuoteLine(db: Db, id: string, patch: QuoteLinePatch) {
  await db.transaction(async (tx) => {
    const line = await getRow(tx, 'quote_lines', id);
    if (!line) return;
    const next = { ...line, ...patch };
    next.quantity = Number(next.quantity) || 0;
    next.unit_price = Number(next.unit_price) || 0;
    if (next.quantity !== line.quantity || next.unit_price !== line.unit_price) next.total_amount = next.quantity * next.unit_price;
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
    const boqList = await getRow(tx, 'lists', quote.boq_id);
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
        // What the vendor priced: their brand/model/spec/colour where written, else what the BOQ asked for.
        ...Object.fromEntries(VARIANT_FIELDS.map((f) => [f, line[f] || item?.[f] || ''])),
        category: boqList?.category ?? '',
        address: boqList?.address ?? '',
        project_id: boqList?.project_id ?? '',
      });
      const term = line.original_term ? termOf(line) : '';
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
// ---------------------------------------------------------------------------
// Labour contracts
// ---------------------------------------------------------------------------

export type ContractInput = Omit<ContractRow, 'id' | 'status' | 'retention_released_at' | 'created_at' | 'updated_at'>;

/**
 * Add a contract, or update the terms of an existing one (its entries are kept). Throws, saving nothing, when the
 * terms are below 0 or the kind would change under work already recorded (sqft would be read as %, or back) or under
 * rate changes (a lump sum has none). `rate` is the starting rate: with rate changes saved, it is the rate of work
 * before the first one.
 */
export async function saveContract(db: Db, input: ContractInput, id?: string): Promise<string> {
  const problem = contractTermsProblem(input);
  if (problem) throw new Error(problem);
  return db.transaction(async (tx) => {
    const existing = id ? await getRow(tx, 'contracts', id) : undefined;
    if (existing && existing.kind !== input.kind) {
      if ((await tx.all("SELECT 1 FROM contract_entries WHERE contract_id = ? AND kind = 'work' LIMIT 1", [existing.id])).length) throw new Error(kindLockedNote(existing));
      if ((await tx.all('SELECT 1 FROM contract_rates WHERE contract_id = ? AND rate > 0 LIMIT 1', [existing.id])).length) throw new Error(rateChangesLockedNote);
    }
    const ts = nowISO();
    const row: ContractRow = {
      status: 'active',
      retention_released_at: '',
      ...existing,
      ...input,
      contractor: input.contractor.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      work: input.work.trim(),
      unit: input.unit.trim(),
      notes: input.notes.trim(),
      id: existing?.id ?? newId(),
      created_at: existing?.created_at ?? ts,
      updated_at: ts,
    };
    await writeRow(tx, 'contracts', row);
    return row.id;
  });
}

/** Close or reopen a contract; closing can release the retention on the same date. Reopening keeps a release (hold it again with `setRetentionReleased`). */
export async function setContractStatus(db: Db, id: string, status: ContractRow['status'], releaseRetentionOn = '') {
  await db.transaction(async (tx) => {
    const c = await getRow(tx, 'contracts', id);
    if (!c) return;
    await writeRow(tx, 'contracts', { ...c, status, retention_released_at: releaseRetentionOn || c.retention_released_at, updated_at: nowISO() });
  });
}

/** Release the held-back retention on a date, or hold it again with ''. */
export async function setRetentionReleased(db: Db, id: string, date: string) {
  await db.transaction(async (tx) => {
    const c = await getRow(tx, 'contracts', id);
    if (c) await writeRow(tx, 'contracts', { ...c, retention_released_at: date, updated_at: nowISO() });
  });
}

export async function deleteContract(db: Db, id: string) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM contract_entries WHERE contract_id = ?', [id]);
    await tx.run('DELETE FROM contract_rates WHERE contract_id = ?', [id]);
    await tx.run('DELETE FROM contracts WHERE id = ?', [id]);
  });
}

export type ContractEntryInput = Omit<ContractEntryRow, 'id' | 'created_at'>;

/** Record work, a payment or a deduction; with an id, change that entry. */
export async function saveContractEntry(db: Db, input: ContractEntryInput, id?: string): Promise<string> {
  return db.transaction(async (tx) => {
    const existing = id ? await getRow(tx, 'contract_entries', id) : undefined;
    const row: ContractEntryRow = { ...input, mode: input.kind === 'payment' || input.kind === 'advance' ? input.mode : '', note: input.note.trim(), id: existing?.id ?? newId(), created_at: existing?.created_at ?? nowISO() };
    await writeRow(tx, 'contract_entries', row);
    const c = await getRow(tx, 'contracts', row.contract_id);
    if (c) await writeRow(tx, 'contracts', { ...c, updated_at: nowISO() });
    return row.id;
  });
}

export async function deleteContractEntry(db: Db, id: string) {
  await db.run('DELETE FROM contract_entries WHERE id = ?', [id]);
}

/**
 * Change a rate contract's rate from a date: work dated then or later is valued at `rate`. A second change on the same
 * date replaces the first (with a new id). Throws, saving nothing, when the rate is not above 0, the date is not
 * YYYY-MM-DD, or the contract is missing or a lump sum.
 */
export async function saveContractRate(db: Db, contractId: string, rate: number, fromDate: string): Promise<string> {
  if (!(rate > 0) || !Number.isFinite(rate)) throw new Error('Enter a rate above ₹0.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) throw new Error('Pick the date the new rate applies from.');
  return db.transaction(async (tx) => {
    const c = await getRow(tx, 'contracts', contractId);
    if (!c) throw new Error('This contract was deleted.');
    if (c.kind !== 'rate') throw new Error('Only a rate contract has rate changes.');
    // Always a new id: the old row's id may be waiting to be deleted (Undo window), and that delete must miss this one.
    await tx.run('DELETE FROM contract_rates WHERE contract_id = ? AND from_date = ?', [contractId, fromDate]);
    const ts = nowISO();
    const row: ContractRateRow = { id: newId(), contract_id: contractId, rate, from_date: fromDate, created_at: ts, updated_at: ts };
    await writeRow(tx, 'contract_rates', row);
    await writeRow(tx, 'contracts', { ...c, updated_at: ts });
    return row.id;
  });
}

/** Undo a rate change: its work goes back to the rate before it. */
export async function deleteContractRate(db: Db, id: string) {
  await db.run('DELETE FROM contract_rates WHERE id = ?', [id]);
}

/** A contract's rate changes, oldest first. */
export async function listContractRates(db: Db, contractId: string): Promise<ContractRateRow[]> {
  return db.all<ContractRateRow>(`${selectWhere('contract_rates')} WHERE contract_id = ? ORDER BY from_date`, [contractId]);
}

export async function clearAllData(tx: SqlExecutor, { seedDefaults = true } = {}) {
  for (const t of [...dataTables, 'jobs', 'job_images']) await tx.run(`DELETE FROM ${t}`);
  if (seedDefaults) {
    await seedCategories(tx);
    await ensureProjectRows(tx);
  }
}

/** Make sure projects and drafts exist after rows were replaced wholesale (e.g. by a restore). */
export { ensureProjectRows, pruneBillPhotos };
