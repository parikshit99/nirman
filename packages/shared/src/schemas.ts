import { z } from 'zod';
import type { ConversionSettings } from './conversions.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoTimestamp = z.string().datetime({ offset: true });

/**
 * What exactly was bought or asked for, where the price depends on it: brand, model or item code,
 * size/spec (thickness, grade, rating) and colour. All optional; rows saved before these existed
 * read as blank.
 */
export const VARIANT_FIELDS = ['brand', 'model', 'spec', 'color'] as const;
export type VariantField = (typeof VARIANT_FIELDS)[number];
export type Variant = Record<VariantField, string>;
const storedVariant = {
  brand: z.string().max(200).default(''),
  model: z.string().max(200).default(''),
  spec: z.string().max(200).default(''),
  color: z.string().max(100).default(''),
};
const readVariant = {
  brand: z.string().catch(''),
  model: z.string().catch(''),
  spec: z.string().catch(''),
  color: z.string().catch(''),
};

/** One material line as returned by the AI extractor. */
export const extractedMaterialSchema = z.object({
  item_name: z.string(),
  original_term: z.string().default(''),
  quantity: z.coerce.number().catch(0),
  unit: z.string().default('unit'),
  unit_price: z.coerce.number().catch(0),
  total_amount: z.coerce.number().catch(0),
  vendor: z.string().default(''),
  date: z.string().default(''),
  ...readVariant,
  /** How it was ordered when billed in another unit, e.g. "3 bundles of 12 mm". */
  ordered_as: z.string().catch(''),
  /** Set when reading matched it to a material in Rates: the line as read (JSON of ReadAs). */
  read_as: z.string().optional().catch(undefined),
});
export type ExtractedMaterial = z.infer<typeof extractedMaterialSchema>;
/** A material to add: like ExtractedMaterial, but optional fields (e.g. brand) may be left out. */
export type MaterialInput = z.input<typeof extractedMaterialSchema>;

// ---------------------------------------------------------------------------
// Rows stored in the phone's database (and in backup files).
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(200);


export const projectStatuses = ['active', 'closed'] as const;

/**
 * A project: one building job or site. Every purchase list, BOQ and labour contract belongs to one,
 * from the moment it is started.
 */
export const projectRowSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  /** Site address, offered when saving its lists and adding its contracts. */
  address: z.string().max(500),
  status: z.enum(projectStatuses),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});
export type ProjectRow = z.infer<typeof projectRowSchema>;

export const listKinds = ['audit', 'boq'] as const;
export const listStatuses = ['draft', 'saved'] as const;

export const listRowSchema = z.object({
  id,
  kind: z.enum(listKinds),
  status: z.enum(listStatuses),
  /** The project it belongs to; blank only in backups made before projects (assigned on restore). */
  project_id: z.string().max(200).default(''),
  title: z.string().max(500),
  address: z.string().max(500),
  category: z.string().max(100),
  site_date: isoDate.nullable(),
  notes: z.string().max(20000),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});
export type ListRow = z.infer<typeof listRowSchema>;

export const itemRowSchema = z.object({
  id,
  list_id: id,
  item_name: z.string().max(500),
  original_term: z.string().max(500),
  quantity: z.number(),
  unit: z.string().max(50),
  unit_price: z.number(),
  total_amount: z.number(),
  vendor: z.string().max(200),
  date: z.string().max(20),
  ...storedVariant,
  /** Date the material reached the site (YYYY-MM-DD); blank until ticked as delivered. */
  delivered_at: z.string().max(20).default(''),
  /** How it was ordered when billed in another unit, e.g. "3 bundles of 12 mm" (billed in kg). */
  ordered_as: z.string().max(300).default(''),
  /** The bill photos it was read from (bill_photos.id); blank for typed or spoken lines. */
  photo_id: z.string().max(100).default(''),
  /** 1: its price was cleared from Rates for good (Settings → Deleted from Rates → Clear); the line itself stays. */
  rates_excluded: z.number().int().min(0).max(1).default(0),
  /** The line as read (JSON: name, unit, quantity, rate, brand, spec, ordered as) when it was matched to a material in Rates; blank otherwise, or when too long to keep (fitRow). */
  read_as: z.string().max(2000).default(''),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});
export type ItemRow = z.infer<typeof itemRowSchema>;

export const indexedRateRowSchema = z.object({
  id,
  item_name: z.string().max(500),
  unit: z.string().max(50),
  date: z.string().max(20),
  price: z.number(),
  vendor: z.string().max(200),
  ...storedVariant,
  /** Work category and site of the BOQ a confirmed quote was for; blank for a rate added on its own. */
  category: z.string().max(100).default(''),
  address: z.string().max(500).default(''),
  /** Project of the BOQ a confirmed quote was for; blank for a rate added on its own. */
  project_id: z.string().max(200).default(''),
  indexed_at: isoTimestamp,
});
export type IndexedRateRow = z.infer<typeof indexedRateRowSchema>;

/** id is the normalised source term (see normalizeTerm). */
export const learnedTermRowSchema = z.object({
  /** The original word lower-cased: up to an original_term's 500, or twice that where lower-casing adds a letter (İ → i̇). */
  id: z.string().min(1).max(1000),
  item_name: z.string().max(500),
  unit: z.string().max(50),
  updated_at: isoTimestamp,
});
export type LearnedTermRow = z.infer<typeof learnedTermRowSchema>;

/** id is the lower-cased category name (made from the name as saved, so at most twice its 100: İ → i̇). */
export const categoryRowSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  created_at: isoTimestamp,
});
export type CategoryRow = z.infer<typeof categoryRowSchema>;

export const quoteStatuses = ['review', 'confirmed'] as const;

/** A vendor's price quote for a saved BOQ, read from their own (often handwritten) list. */
export const quoteRowSchema = z.object({
  id,
  boq_id: id,
  vendor: z.string().max(200),
  quote_date: isoDate,
  status: z.enum(quoteStatuses),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});
export type QuoteRow = z.infer<typeof quoteRowSchema>;

/** One line of a vendor's quote; boq_item_id is the BOQ item it was matched to, if any. */
export const quoteLineRowSchema = z.object({
  id,
  quote_id: id,
  position: z.number().int(),
  boq_item_id: id.nullable(),
  original_term: z.string().max(500),
  item_name: z.string().max(500),
  quantity: z.number(),
  unit: z.string().max(50),
  unit_price: z.number(),
  total_amount: z.number(),
  note: z.string().max(500),
  ...storedVariant,
});
export type QuoteLineRow = z.infer<typeof quoteLineRowSchema>;

/** A material hidden from the price database (Data tab and price checks); id is its materialKey. */
export const hiddenMaterialRowSchema = z.object({
  /** materialKey of a name (500) and unit (50) as JSON: long enough even if every character is escaped (\u0001 takes 6). */
  id: z.string().min(1).max(6 * (500 + 50) + 7),
  name: z.string().max(500),
  unit: z.string().max(50),
  hidden_at: isoTimestamp,
});
export type HiddenMaterialRow = z.infer<typeof hiddenMaterialRowSchema>;

export const contractKinds = ['rate', 'lump_sum'] as const;
export const contractStatuses = ['active', 'closed'] as const;

/**
 * A labour contract: a contractor doing one job at a site, paid per unit of
 * work (rate) or a fixed amount in stages (lump sum).
 */
export const contractRowSchema = z.object({
  id,
  /** The project it belongs to; blank only in backups made before projects (assigned on restore). */
  project_id: z.string().max(200).default(''),
  contractor: z.string().max(200),
  /** Room for two numbers and a name, e.g. "98765 43210, 91234 56789 (site supervisor)". */
  phone: z.string().max(100),
  address: z.string().max(500),
  /** Work category, as for purchase lists (Civil, Electrical, …). */
  category: z.string().max(100),
  /** What the job is, e.g. "Internal plaster, 2nd floor". */
  work: z.string().max(500),
  kind: z.enum(contractKinds),
  /** Rate contracts: amount per `unit` of work. */
  rate: z.number(),
  unit: z.string().max(50),
  /** Rate contracts: expected quantity (0 = not known). */
  est_quantity: z.number(),
  /** Lump-sum contracts: the agreed amount. */
  amount: z.number(),
  /** Share of work done held back until completion, in %. */
  retention_pct: z.number(),
  start_date: z.string().max(20),
  status: z.enum(contractStatuses),
  /** Date the held-back retention was released; blank while held. */
  retention_released_at: z.string().max(20),
  notes: z.string().max(5000),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});
export type ContractRow = z.infer<typeof contractRowSchema>;

export const contractEntryKinds = ['work', 'payment', 'advance', 'deduction'] as const;
export type ContractEntryKind = (typeof contractEntryKinds)[number];

/**
 * Something that happened on a contract: work measured (quantity in the
 * contract's unit, or % of a lump sum), a payment against work measured, an
 * advance (kharcha: cash given before the work is measured), or a deduction
 * (material supplied, penalty). Payments and advances both count as paid.
 */
export const contractEntryRowSchema = z.object({
  id,
  contract_id: id,
  kind: z.enum(contractEntryKinds),
  date: isoDate,
  /** Work entries: quantity done (rate) or % of the job (lump sum). */
  quantity: z.number(),
  /** Payments and deductions: the amount. */
  amount: z.number(),
  /** Payments and advances: cash, UPI, bank, cheque. */
  mode: z.string().max(40),
  note: z.string().max(500),
  created_at: isoTimestamp,
});
export type ContractEntryRow = z.infer<typeof contractEntryRowSchema>;

/**
 * A rate change on a rate contract: work dated on or after `from_date` is valued at `rate` (until a later change).
 * Work before the first change keeps the contract's own rate. One per contract and date.
 */
export const contractRateRowSchema = z.object({
  id,
  contract_id: id,
  /** Any number, so every backup restores; a rate not above 0 is ignored by the rules (`withRates`, `rateOn`). */
  rate: z.number(),
  from_date: isoDate,
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});
export type ContractRateRow = z.infer<typeof contractRateRowSchema>;

export const dataTables = ['projects', 'lists', 'items', 'indexed_rates', 'learned_terms', 'categories', 'quotes', 'quote_lines', 'hidden_materials', 'contracts', 'contract_entries', 'contract_rates'] as const;
export type DataTable = (typeof dataTables)[number];

export const rowSchemas = {
  projects: projectRowSchema,
  lists: listRowSchema,
  items: itemRowSchema,
  indexed_rates: indexedRateRowSchema,
  learned_terms: learnedTermRowSchema,
  categories: categoryRowSchema,
  quotes: quoteRowSchema,
  quote_lines: quoteLineRowSchema,
  hidden_materials: hiddenMaterialRowSchema,
  contracts: contractRowSchema,
  contract_entries: contractEntryRowSchema,
  contract_rates: contractRateRowSchema,
} as const;

/** Column names of each table, in schema order. */
export const tableColumns = Object.fromEntries(
  dataTables.map((t) => [t, Object.keys(rowSchemas[t].shape)]),
) as Record<DataTable, string[]>;

export interface RowTypes {
  projects: ProjectRow;
  lists: ListRow;
  items: ItemRow;
  indexed_rates: IndexedRateRow;
  learned_terms: LearnedTermRow;
  categories: CategoryRow;
  quotes: QuoteRow;
  quote_lines: QuoteLineRow;
  hidden_materials: HiddenMaterialRow;
  contracts: ContractRow;
  contract_entries: ContractEntryRow;
  contract_rates: ContractRateRow;
}

// ---------------------------------------------------------------------------
// Limits: what a row may hold, so every backup the app writes restores
// ---------------------------------------------------------------------------

/** The type inside default(), nullable() and optional(). */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodDefault) return unwrap(schema.removeDefault());
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) return unwrap(schema.unwrap());
  return schema;
}

/** Each table's text limits and number columns, read once from its row schema. */
const columnRules = Object.fromEntries(
  dataTables.map((table) => {
    const limits: Record<string, number> = {};
    const numbers: string[] = [];
    for (const [column, schema] of Object.entries(rowSchemas[table].shape as z.ZodRawShape)) {
      const type = unwrap(schema);
      if (type instanceof z.ZodString && type.maxLength !== null) limits[column] = type.maxLength;
      else if (type instanceof z.ZodNumber) numbers.push(column);
    }
    return [table, { limits: Object.freeze(limits), numbers }];
  }),
) as Record<DataTable, { limits: Readonly<Record<string, number>>; numbers: string[] }>;

/**
 * The most characters each text column of a table may hold, `{ column: max }`, from its row schema (the one place
 * limits are set). For inputs' maxLength. Columns with no limit (dates, timestamps) are not listed.
 */
export function fieldLimits(table: DataTable): Readonly<Record<string, number>> {
  return columnRules[table].limits;
}

/** Ids and references (id, list_id, project_id…): cut short, they would point at nothing, so they never are. */
const isKey = (column: string) => column === 'id' || column.endsWith('_id');

/**
 * Columns holding JSON: cut short it could not be read, so one over its limit is blanked instead. items.read_as is
 * the line as read (unlimited until it is fitted), so no limit could always hold it; blank, the match just can't be undone.
 */
const JSON_COLUMNS: Partial<Record<DataTable, string[]>> = { items: ['read_as'] };

/** The first `max` characters as zod counts them (UTF-16 units), without splitting an emoji in two. */
function cutText(text: string, max: number): string {
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * A row made to fit its table, as saving and restoring do: text longer than its column allows is cut to the limit
 * (JSON over its limit is blanked, as cut JSON can't be read), and numbers JSON can't hold (NaN, Infinity; a backup
 * file has null in their place) become 0. Ids and references are never cut: their limits are above anything the app
 * makes. `shortened` counts the values changed.
 */
export function fitRow<R extends object>(table: DataTable, row: R): { row: R; shortened: number } {
  const { limits, numbers } = columnRules[table];
  const values = row as Record<string, unknown>;
  const fitted: Record<string, unknown> = {};
  let shortened = 0;
  for (const [column, max] of Object.entries(limits)) {
    const value = values[column];
    if (typeof value === 'string' && value.length > max && !isKey(column)) {
      fitted[column] = JSON_COLUMNS[table]?.includes(column) ? '' : cutText(value, max);
      shortened++;
    }
  }
  for (const column of numbers) {
    const value = values[column];
    if (value === null || (typeof value === 'number' && !Number.isFinite(value))) {
      fitted[column] = 0;
      shortened++;
    }
  }
  return { row: shortened ? { ...row, ...fitted } : row, shortened };
}

// ---------------------------------------------------------------------------
// AI extraction
// ---------------------------------------------------------------------------

export const MAX_IMAGES = 5;

export const learningMapSchema = z.record(
  z.string().max(500),
  z.object({ item_name: z.string().max(500), unit: z.string().max(50) }),
);
export type LearningMap = z.infer<typeof learningMapSchema>;

export interface ExtractionRequest {
  text: string;
  /** Base64 JPEGs without the data: prefix. */
  images: string[];
  category?: string;
  /** YYYY-MM-DD, used when the source has no date. */
  capture_date: string;
  learning: LearningMap;
  /** Material names already in Rates (and the catalog's), to be reused for the same things. */
  materials?: { name: string; unit: string }[];
  /** How to convert units in what is read (Settings → Units); the defaults if not given. */
  conversions?: ConversionSettings;
}

/** One line of a vendor quote as read by the AI. boq_sr is the matched BOQ Sr. number (1-based) or null. */
export const extractedQuoteLineSchema = z.object({
  boq_sr: z.coerce.number().int().nullable().catch(null),
  original_term: z.string().catch(''),
  item_name: z.string().catch(''),
  quantity: z.coerce.number().catch(0),
  unit: z.string().catch(''),
  unit_price: z.coerce.number().catch(0),
  total_amount: z.coerce.number().catch(0),
  note: z.string().catch(''),
  ...readVariant,
});
export type ExtractedQuoteLine = z.infer<typeof extractedQuoteLineSchema>;
/** A quote line to store: optional fields (e.g. brand) may be left out. */
export type QuoteLineInput = z.input<typeof extractedQuoteLineSchema>;

export interface QuoteBoqItem {
  /** 1-based Sr. number, as printed on the BOQ PDF. */
  sr: number;
  item_name: string;
  quantity: number;
  unit: string;
  /** Brand, model, size/spec and colour the BOQ asks for, e.g. "Jaquar · ABC-123 · White". */
  variant?: string;
}

export interface QuoteExtractionRequest {
  boq: QuoteBoqItem[];
  text: string;
  /** Base64 JPEGs without the data: prefix. */
  images: string[];
  learning: LearningMap;
}
