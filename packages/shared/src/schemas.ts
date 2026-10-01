import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoTimestamp = z.string().datetime({ offset: true });

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
});
export type ExtractedMaterial = z.infer<typeof extractedMaterialSchema>;

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

export const dataTables = ['lists', 'items', 'indexed_rates', 'learned_terms', 'categories'] as const;
export type DataTable = (typeof dataTables)[number];

export const rowSchemas = {
  lists: listRowSchema,
  items: itemRowSchema,
  indexed_rates: indexedRateRowSchema,
  learned_terms: learnedTermRowSchema,
  categories: categoryRowSchema,
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
