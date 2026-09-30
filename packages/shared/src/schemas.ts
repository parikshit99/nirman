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
// Syncable rows. Every table shares id / updated_at / deleted_at so the sync
// engine can treat them uniformly (last-write-wins on updated_at, soft delete).
// ---------------------------------------------------------------------------

const syncFields = {
  id: z.string().min(1).max(200),
  updated_at: isoTimestamp,
  deleted_at: isoTimestamp.nullable(),
};

export const listKinds = ['audit', 'boq'] as const;
export const listStatuses = ['draft', 'saved'] as const;

export const listRowSchema = z.object({
  ...syncFields,
  kind: z.enum(listKinds),
  status: z.enum(listStatuses),
  title: z.string().max(500),
  address: z.string().max(500),
  category: z.string().max(100),
  site_date: isoDate.nullable(),
  notes: z.string().max(20000),
  created_at: isoTimestamp,
});
export type ListRow = z.infer<typeof listRowSchema>;

export const itemRowSchema = z.object({
  ...syncFields,
  list_id: z.string().min(1).max(200),
  item_name: z.string().max(500),
  original_term: z.string().max(500),
  quantity: z.number(),
  unit: z.string().max(50),
  unit_price: z.number(),
  total_amount: z.number(),
  vendor: z.string().max(200),
  date: z.string().max(20),
  created_at: isoTimestamp,
});
export type ItemRow = z.infer<typeof itemRowSchema>;

export const indexedRateRowSchema = z.object({
  ...syncFields,
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
  ...syncFields,
  item_name: z.string().max(500),
  unit: z.string().max(50),
});
export type LearnedTermRow = z.infer<typeof learnedTermRowSchema>;

/** id is the lower-cased category name, so two devices adding "Tile" converge. */
export const categoryRowSchema = z.object({
  ...syncFields,
  name: z.string().min(1).max(100),
  created_at: isoTimestamp,
});
export type CategoryRow = z.infer<typeof categoryRowSchema>;

export const syncTables = ['lists', 'items', 'indexed_rates', 'learned_terms', 'categories'] as const;
export type SyncTable = (typeof syncTables)[number];

export const rowSchemas = {
  lists: listRowSchema,
  items: itemRowSchema,
  indexed_rates: indexedRateRowSchema,
  learned_terms: learnedTermRowSchema,
  categories: categoryRowSchema,
} as const;

/** Column names of each synced table, in schema order. */
export const syncColumns = Object.fromEntries(
  syncTables.map((t) => [t, Object.keys(rowSchemas[t].shape)]),
) as Record<SyncTable, string[]>;

export interface RowTypes {
  lists: ListRow;
  items: ItemRow;
  indexed_rates: IndexedRateRow;
  learned_terms: LearnedTermRow;
  categories: CategoryRow;
}

export type SyncChanges = { [T in SyncTable]?: RowTypes[T][] };

const MAX_ROWS_PER_TABLE = 1000;

export const syncPushRequestSchema = z.object({
  changes: z.object({
    lists: z.array(listRowSchema).max(MAX_ROWS_PER_TABLE).optional(),
    items: z.array(itemRowSchema).max(MAX_ROWS_PER_TABLE).optional(),
    indexed_rates: z.array(indexedRateRowSchema).max(MAX_ROWS_PER_TABLE).optional(),
    learned_terms: z.array(learnedTermRowSchema).max(MAX_ROWS_PER_TABLE).optional(),
    categories: z.array(categoryRowSchema).max(MAX_ROWS_PER_TABLE).optional(),
  }),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;
export const SYNC_PUSH_BATCH = MAX_ROWS_PER_TABLE;

export interface SyncPushResponse {
  /** Number of rows that were newer than the server copy and got stored. */
  applied: number;
}

export interface SyncPullResponse {
  changes: SyncChanges;
  /** Opaque cursor to pass as `since` on the next pull. */
  cursor: string;
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const refreshRequestSchema = z.object({ refresh_token: z.string().min(1) });

export interface AuthResponse {
  user: { id: string; email: string };
  access_token: string;
  refresh_token: string;
}

// ---------------------------------------------------------------------------
// AI extraction
// ---------------------------------------------------------------------------

export const MAX_IMAGES = 5;
/** ~1.5 MB of base64 per image; the client compresses to 1200px JPEG first. */
const MAX_IMAGE_BASE64_LENGTH = 2_000_000;

export const learningMapSchema = z.record(
  z.string().max(500),
  z.object({ item_name: z.string().max(500), unit: z.string().max(50) }),
);
export type LearningMap = z.infer<typeof learningMapSchema>;

export const extractionRequestSchema = z
  .object({
    job_id: z.string().uuid(),
    text: z.string().max(20000).default(''),
    images: z.array(z.string().max(MAX_IMAGE_BASE64_LENGTH)).max(MAX_IMAGES).default([]),
    category: z.string().max(100).optional(),
    capture_date: isoDate,
    learning: learningMapSchema.default({}),
  })
  .refine((r) => r.text.trim().length > 0 || r.images.length > 0, {
    message: 'Provide text or at least one image',
  });
export type ExtractionRequest = z.infer<typeof extractionRequestSchema>;

export interface ExtractionResponse {
  items: ExtractedMaterial[];
}

export interface ApiError {
  error: string;
  message: string;
}
