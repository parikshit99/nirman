import { z } from 'zod';

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
});
export type ExtractedMaterial = z.infer<typeof extractedMaterialSchema>;
/** A material to add: like ExtractedMaterial, but optional fields (e.g. brand) may be left out. */
export type MaterialInput = z.input<typeof extractedMaterialSchema>;

// ---------------------------------------------------------------------------
// Rows stored in the phone's database (and in backup files).
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(200);


export const listKinds = ['audit', 'boq'] as const;
export const listStatuses = ['draft', 'saved'] as const;

export const listRowSchema = z.object({
  id,
  kind: z.enum(listKinds),
  status: z.enum(listStatuses),
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
  indexed_at: isoTimestamp,
});
export type IndexedRateRow = z.infer<typeof indexedRateRowSchema>;

/** id is the normalised source term (see normalizeTerm). */
export const learnedTermRowSchema = z.object({
  id,
  item_name: z.string().max(500),
  unit: z.string().max(50),
  updated_at: isoTimestamp,
});
export type LearnedTermRow = z.infer<typeof learnedTermRowSchema>;

/** id is the lower-cased category name. */
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
  id: z.string().min(1).max(1200),
  name: z.string().max(500),
  unit: z.string().max(50),
  hidden_at: isoTimestamp,
});
export type HiddenMaterialRow = z.infer<typeof hiddenMaterialRowSchema>;

export const dataTables = ['lists', 'items', 'indexed_rates', 'learned_terms', 'categories', 'quotes', 'quote_lines', 'hidden_materials'] as const;
export type DataTable = (typeof dataTables)[number];

export const rowSchemas = {
  lists: listRowSchema,
  items: itemRowSchema,
  indexed_rates: indexedRateRowSchema,
  learned_terms: learnedTermRowSchema,
  categories: categoryRowSchema,
  quotes: quoteRowSchema,
  quote_lines: quoteLineRowSchema,
  hidden_materials: hiddenMaterialRowSchema,
} as const;

/** Column names of each table, in schema order. */
export const tableColumns = Object.fromEntries(
  dataTables.map((t) => [t, Object.keys(rowSchemas[t].shape)]),
) as Record<DataTable, string[]>;

export interface RowTypes {
  lists: ListRow;
  items: ItemRow;
  indexed_rates: IndexedRateRow;
  learned_terms: LearnedTermRow;
  categories: CategoryRow;
  quotes: QuoteRow;
  quote_lines: QuoteLineRow;
  hidden_materials: HiddenMaterialRow;
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
