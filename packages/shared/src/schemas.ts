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
  /** How it was ordered when billed in another unit, e.g. "3 bundles of 12 mm". */
  ordered_as: z.string().catch(''),
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
  phone: z.string().max(40),
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

export const contractEntryKinds = ['work', 'payment', 'deduction'] as const;
export type ContractEntryKind = (typeof contractEntryKinds)[number];

/**
 * Something that happened on a contract: work measured (quantity in the
 * contract's unit, or % of a lump sum), a payment or advance, or a deduction
 * (material supplied, penalty).
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
  /** Payments: cash, UPI, bank, cheque. */
  mode: z.string().max(40),
  note: z.string().max(500),
  created_at: isoTimestamp,
});
export type ContractEntryRow = z.infer<typeof contractEntryRowSchema>;

export const dataTables = ['projects', 'lists', 'items', 'indexed_rates', 'learned_terms', 'categories', 'quotes', 'quote_lines', 'hidden_materials', 'contracts', 'contract_entries'] as const;
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
