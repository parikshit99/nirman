import { isCharge, type ChargeKind, chargeKind } from './charges.ts';
import { VARIANT_FIELDS, type ExtractedMaterial, type IndexedRateRow, type ItemRow, type LearningMap, type ListRow, type QuoteLineRow, type QuoteRow, type Variant, type VariantField } from './schemas.ts';

export const DEFAULT_CATEGORIES = ['Civil', 'Electrical', 'Plumbing', 'Carpenter', 'Hvac', 'Tile', 'Stone', 'Other'];

export function normalizeTerm(term: string): string {
  return term.toLowerCase().trim();
}

/** Stable identity of a material in the database: name + unit, case-insensitive. */
export function materialKey(name: string, unit: string | undefined | null): string {
  return JSON.stringify([normalizeTerm(name), normalizeTerm(unit || 'unit')]);
}

/** Brand, model, size/spec and colour of a row, trimmed; missing fields are blank. */
export function variantOf(row: Partial<Variant>): Variant {
  return { brand: (row.brand ?? '').trim(), model: (row.model ?? '').trim(), spec: (row.spec ?? '').trim(), color: (row.color ?? '').trim() };
}

/** Identity of a variant within a material: the four fields, case-insensitive; all blank is the plain item. */
export function variantKey(row: Partial<Variant>): string {
  return JSON.stringify(VARIANT_FIELDS.map((f) => normalizeTerm(row[f] ?? '')));
}

/** "Jaquar · ABC-123 · 2.5 sq mm · White", or '' when nothing is set. */
export function variantLabel(row: Partial<Variant>): string {
  return VARIANT_FIELDS.map((f) => (row[f] ?? '').trim()).filter(Boolean).join(' · ');
}

/**
 * Fields where `offered` names something other than what `wanted` asks for. A blank on either
 * side never counts: a BOQ that names no brand accepts any brand.
 */
export function variantDifferences(wanted: Partial<Variant>, offered: Partial<Variant>): VariantField[] {
  return VARIANT_FIELDS.filter((f) => {
    const a = normalizeTerm(wanted[f] ?? '');
    const b = normalizeTerm(offered[f] ?? '');
    return a !== '' && b !== '' && a !== b;
  });
}

/** Whether a recorded price is for what `wanted` describes: every field `wanted` sets must match. */
export function variantMatches(wanted: Partial<Variant>, candidate: Partial<Variant>): boolean {
  return VARIANT_FIELDS.every((f) => {
    const a = normalizeTerm(wanted[f] ?? '');
    return a === '' || a === normalizeTerm(candidate[f] ?? '');
  });
}

/**
 * Read a number the way people type it on site: "1,500", "₹ 1,50,000",
 * "Rs. 380", "12.5". Returns null for empty or unreadable input (never a
 * silent 0 or a truncated value).
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const cleaned = (input ?? '').replace(/₹|rs\.?|inr/gi, '').replace(/[,\s]/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Electrical: ['wire', 'switch', 'cable', 'mcb', 'led', 'light', 'fan', 'conduit', 'socket'],
  Plumbing: ['pipe', 'valve', 'cpvc', 'tank', 'tap', 'faucet', 'drain', 'bend', 'elbow'],
  Carpenter: ['wood', 'ply', 'plywood', 'laminate', 'hinge', 'handle', 'adhesive', 'screw', 'nail'],
  Tile: ['tile', 'spacer', 'grouts', 'adhesive', 'chemical', 'skirting'],
  Stone: ['granite', 'marble', 'stone', 'quartz'],
  Hvac: ['ac', 'copper', 'gas', 'compressor', 'duct'],
  Civil: ['cement', 'sand', 'brick', 'steel', 'rcc', 'aggregate', 'concrete'],
};

/** Guess the work category from item names by keyword votes; defaults to Civil. */
export function guessCategory(items: Pick<ExtractedMaterial, 'item_name'>[]): string {
  const counts: Record<string, number> = {};
  for (const cat of Object.keys(CATEGORY_KEYWORDS)) counts[cat] = 0;

  for (const item of items) {
    const name = (item.item_name || '').toLowerCase();
    for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
      if (words.some((w) => name.includes(w))) counts[cat]++;
    }
  }

  const [best, votes] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return votes > 0 ? best : 'Civil';
}

/** Apply a learned correction (by original term, falling back to item name). */
export function applyLearning(
  learning: LearningMap,
  item: { item_name: string; unit?: string | null; original_term?: string | null },
): { item_name: string; unit: string } {
  const term = normalizeTerm(item.original_term || item.item_name || '');
  const learned = term ? learning[term] : undefined;
  if (learned) return { item_name: learned.item_name, unit: learned.unit };
  return { item_name: item.item_name, unit: item.unit || 'unit' };
}

export interface PricePoint {
  date: string;
  price: number;
  vendor: string;
  timestamp: string;
  /** Title of the saved list the price came from; absent for a single added rate or the open purchase list. */
  listTitle?: string;
  /** From the purchase list still being written (not saved yet). */
  draft?: boolean;
  /** Project and site address it was bought for (blank for a rate added on its own). */
  projectId?: string;
  site?: string;
  /** Id of the saved-list line the price came from, so it can be edited or removed. */
  itemId?: string;
  /** Id of the single added rate (Index rate, or a confirmed vendor quote), so it can be removed. */
  rateId?: string;
  /** Brand, model, size/spec and colour this price was for (blank fields when not recorded). */
  variant: Variant;
}

/** One brand/model/spec/colour of a material, with its own prices. */
export interface MaterialVariant {
  key: string;
  /** e.g. "Jaquar · ABC-123 · White"; '' for the plain item. */
  label: string;
  variant: Variant;
  priceHistory: PricePoint[];
  minPrice: number;
  maxPrice: number;
  latestPrice: number;
}

export interface MaterialEntry {
  key: string;
  name: string;
  unit: string;
  vendors: string[];
  categories: string[];
  addresses: string[];
  priceHistory: PricePoint[];
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  latestPrice: number;
  /** Every brand/model/spec/colour recorded for this material, plain item first. */
  variants: MaterialVariant[];
}

const priceStats = (priceHistory: PricePoint[]) => {
  const prices = priceHistory.map((h) => h.price);
  const has = prices.length > 0;
  return {
    minPrice: has ? Math.min(...prices) : 0,
    maxPrice: has ? Math.max(...prices) : 0,
    latestPrice: has ? priceHistory[priceHistory.length - 1].price : 0,
  };
};

/** Lists whose lines feed Rates: saved lists, and the purchase list still being written. */
const countsInRates = (l: ListRow) => l.status === 'saved' || (l.status === 'draft' && l.kind === 'audit');

/**
 * Build the material price database from saved lists, the open purchase list
 * (its prices count as soon as they are entered) and single added rates. A line
 * marked `rates_excluded`, and every transport or loading charge, is left out. `deleted` maps a material key to when it was
 * deleted from the database: everything recorded up to then is left out (saved
 * lists themselves are untouched), and anything recorded later shows again.
 */
export function buildItemDatabase(
  lists: ListRow[],
  items: ItemRow[],
  rates: IndexedRateRow[],
  learning: LearningMap,
  deleted: Record<string, string> = {},
): MaterialEntry[] {
  const anyDeleted = Object.keys(deleted).length > 0;
  const isDeleted = (key: string, recordedAt: string) => {
    if (!anyDeleted) return false;
    const cutoff = deleted[key];
    return !!cutoff && recordedAt <= cutoff;
  };
  type Acc = Omit<MaterialEntry, 'vendors' | 'categories' | 'addresses' | 'minPrice' | 'maxPrice' | 'avgPrice' | 'latestPrice' | 'variants'> & {
    vendors: Set<string>;
    categories: Set<string>;
    addresses: Set<string>;
    /** Every variant seen, priced or not (a BOQ line has no price but still names its brand). */
    variants: Map<string, Variant>;
  };
  const db = new Map<string, Acc>();
  // Each point's variant key, worked out once while reading and reused when grouping by variant.
  const pointVariant = new WeakMap<PricePoint, string>();
  const entry = (key: string, name: string, unit: string): Acc => {
    let e = db.get(key);
    if (!e) {
      e = { key, name, unit, vendors: new Set(), categories: new Set(), addresses: new Set(), priceHistory: [], variants: new Map() };
      db.set(key, e);
    }
    return e;
  };

  // Saved lists, and the purchase list still being written: a price counts as soon as it is entered.
  const savedLists = new Map(lists.filter(countsInRates).map((l) => [l.id, l]));
  const savedPrices = new Set<string>();
  const pricePointKey = (key: string, variant: string, date: string, price: number, vendor: string) =>
    [key, variant, date, price, vendor.trim().toLowerCase()].join('\u0000');

  // Saved lines first: saving copies the open list's lines, which then count once, as the saved copy.
  const onDraft = (i: ItemRow) => savedLists.get(i.list_id)?.status === 'draft';
  const ordered = [...items.filter((i) => !onDraft(i)), ...items.filter(onDraft)];
  for (const raw of ordered) {
    if (!raw.item_name) continue;
    const list = savedLists.get(raw.list_id);
    if (!list) continue;

    const { item_name, unit } = applyLearning(learning, raw);
    if (isCharge(item_name)) continue;
    const key = materialKey(item_name, unit);
    const draft = list.status === 'draft';
    const recordedAt = draft ? raw.created_at || list.created_at : list.created_at;
    const variant = variantOf(raw);
    const vKey = variantKey(variant);
    const date = raw.date || recordedAt.slice(0, 10);
    const point = raw.unit_price > 0 ? pricePointKey(key, vKey, date, raw.unit_price, raw.vendor || 'Unknown') : '';
    // The open list's copy of a saved line is that line: counted once, or left out with it.
    if (draft && point && savedPrices.has(point)) continue;
    if (point) savedPrices.add(point);
    if (raw.rates_excluded || isDeleted(key, recordedAt)) continue;

    const e = entry(key, item_name, unit);
    if (!e.variants.has(vKey)) e.variants.set(vKey, variant);
    if (raw.vendor) e.vendors.add(raw.vendor);
    if (list.category) e.categories.add(list.category);
    if (list.address) e.addresses.add(list.address);
    if (point) {
      const p: PricePoint = {
        date,
        price: raw.unit_price,
        vendor: raw.vendor || 'Unknown',
        timestamp: recordedAt,
        ...(draft ? { draft: true } : { listTitle: list.title || 'Untitled list' }),
        projectId: list.project_id || undefined,
        site: list.address || undefined,
        itemId: raw.id,
        variant,
      };
      pointVariant.set(p, vKey);
      e.priceHistory.push(p);
    }
  }

  for (const rate of rates) {
    const { item_name, unit } = applyLearning(learning, rate);
    if (isCharge(item_name)) continue;
    const key = materialKey(item_name, unit);
    if (isDeleted(key, rate.indexed_at)) continue;
    const variant = variantOf(rate);
    const vKey = variantKey(variant);
    // "Index rate" on a line that was later saved: the saved line already counts this price.
    if (savedPrices.has(pricePointKey(key, vKey, rate.date, rate.price, rate.vendor || 'Unknown'))) continue;
    const e = entry(key, item_name, unit);
    if (!e.variants.has(vKey)) e.variants.set(vKey, variant);
    const p: PricePoint = {
      date: rate.date,
      price: rate.price,
      vendor: rate.vendor || 'Manual Index',
      timestamp: rate.indexed_at,
      rateId: rate.id,
      projectId: rate.project_id || undefined,
      site: rate.address || undefined,
      variant,
    };
    pointVariant.set(p, vKey);
    e.priceHistory.push(p);
    if (rate.vendor) e.vendors.add(rate.vendor);
    if (rate.category) e.categories.add(rate.category);
    if (rate.address) e.addresses.add(rate.address);
  }

  return [...db.values()]
    .map((e) => {
      // Oldest first, by date then by when it was recorded; each date parsed once, not on every comparison.
      const priceHistory = e.priceHistory
        .map((p) => ({ p, day: Date.parse(p.date) || 0, at: Date.parse(p.timestamp) || 0 }))
        .sort((a, b) => a.day - b.day || a.at - b.at)
        .map((x) => x.p);
      const prices = priceHistory.map((h) => h.price);
      const byVariant = new Map<string, PricePoint[]>();
      for (const p of priceHistory) {
        const key = pointVariant.get(p) ?? variantKey(p.variant);
        const points = byVariant.get(key);
        if (points) points.push(p);
        else byVariant.set(key, [p]);
      }
      const variants: MaterialVariant[] = [...e.variants.entries()]
        .map(([key, variant]) => {
          const points = byVariant.get(key) ?? [];
          return { key, label: variantLabel(variant), variant, priceHistory: points, ...priceStats(points) };
        })
        .sort((a, b) => (a.label === '' ? -1 : b.label === '' ? 1 : a.label.localeCompare(b.label)));
      return {
        ...e,
        priceHistory,
        vendors: [...e.vendors],
        // A material only ever priced on its own still gets a work type to filter by.
        categories: e.categories.size ? [...e.categories] : [guessCategory([{ item_name: e.name }])],
        addresses: [...e.addresses],
        ...priceStats(priceHistory),
        avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
        variants,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Materials deleted from Rates whose deletion no longer hides anything: every
 * saved line and rate recorded for them up to the deletion has itself been
 * deleted (or renamed). Their hidden_materials rows can go.
 */
export function unusedHiddenMaterials(
  hidden: { id: string; hidden_at: string }[],
  lists: ListRow[],
  items: ItemRow[],
  rates: IndexedRateRow[],
  learning: LearningMap,
): string[] {
  const earliest = new Map<string, string>();
  const seen = (name: string, unit: string, recordedAt: string) => {
    const key = materialKey(name, unit);
    const prev = earliest.get(key);
    if (!prev || recordedAt < prev) earliest.set(key, recordedAt);
  };
  const savedLists = new Map(lists.filter(countsInRates).map((l) => [l.id, l]));
  for (const raw of items) {
    const list = savedLists.get(raw.list_id);
    if (!list || !raw.item_name || raw.rates_excluded) continue;
    const { item_name, unit } = applyLearning(learning, raw);
    if (isCharge(item_name)) continue;
    seen(item_name, unit, list.status === 'draft' ? raw.created_at || list.created_at : list.created_at);
  }
  for (const rate of rates) {
    const { item_name, unit } = applyLearning(learning, rate);
    if (!isCharge(item_name)) seen(item_name, unit, rate.indexed_at);
  }
  return hidden
    .filter((h) => {
      const first = earliest.get(h.id);
      return !first || first > h.hidden_at;
    })
    .map((h) => h.id);
}

/** Narrow the price database to one vendor, brand, size/spec or colour; blank means any. */
export interface MaterialFilter {
  vendor?: string;
  brand?: string;
  spec?: string;
  color?: string;
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The values each filter can take, from the whole database. */
export function materialFilterOptions(entries: MaterialEntry[]): Required<{ [K in keyof MaterialFilter]: string[] }> {
  const collect = (values: string[]) => {
    const byLower = new Map<string, string>();
    for (const v of values) if (v.trim() && !byLower.has(v.trim().toLowerCase())) byLower.set(v.trim().toLowerCase(), v.trim());
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
  };
  const variants = entries.flatMap((e) => e.variants.map((v) => v.variant));
  return {
    vendor: collect(entries.flatMap((e) => e.priceHistory.map((p) => p.vendor))),
    brand: collect(variants.map((v) => v.brand)),
    spec: collect(variants.map((v) => v.spec)),
    color: collect(variants.map((v) => v.color)),
  };
}

/**
 * Keep the materials with a variant (and, for a vendor, a price) matching the
 * filter, showing only the matching variants and prices on each.
 */
export function filterMaterials(entries: MaterialEntry[], filter: MaterialFilter): MaterialEntry[] {
  const { vendor = '', ...wanted } = filter;
  const variantFields = (Object.entries(wanted) as [VariantField, string | undefined][]).filter(([, v]) => v?.trim());
  if (!vendor.trim() && variantFields.length === 0) return entries;
  const variantOk = (v: Variant) => variantFields.every(([f, value]) => sameText(v[f], value!));
  const pointOk = (p: PricePoint) => variantOk(p.variant) && (!vendor.trim() || sameText(p.vendor, vendor));
  return entries.flatMap((e) => {
    const priceHistory = e.priceHistory.filter(pointOk);
    const variants = e.variants
      .filter((v) => variantOk(v.variant))
      .map((v) => {
        const points = v.priceHistory.filter(pointOk);
        return { ...v, priceHistory: points, ...priceStats(points) };
      })
      .filter((v) => !vendor.trim() || v.priceHistory.length > 0);
    if (variants.length === 0) return [];
    const prices = priceHistory.map((p) => p.price);
    return [{
      ...e,
      priceHistory,
      variants,
      vendors: vendor.trim() ? e.vendors.filter((v) => sameText(v, vendor)) : e.vendors,
      ...priceStats(priceHistory),
      avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
    }];
  });
}

// ---------------------------------------------------------------------------
// Site report: everything bought (or delivered) for one address
// ---------------------------------------------------------------------------

export interface SiteReportOptions {
  /** Only lists saved with this site address; absent means every list given. */
  address?: string;
  /** Inclusive YYYY-MM-DD bounds; blank or absent means no limit. */
  from?: string;
  to?: string;
  /** Work categories to include; empty means all. */
  categories?: string[];
  /** Only lines ticked as delivered (transport and loading charges are never delivered, so they are left out). */
  deliveredOnly: boolean;
}

export interface SiteReportLine {
  /** Delivery date if ticked, else the bill date, else the session's date. */
  date: string;
  item: ItemRow;
  listTitle: string;
}

export interface SiteReportMaterial {
  name: string;
  unit: string;
  quantity: number;
  amount: number;
  /** Amount ÷ quantity over the priced lines; 0 when none were priced. */
  avgRate: number;
  vendors: string[];
  /** Number of saved sessions (bills) it appears in. */
  bills: number;
  lines: SiteReportLine[];
  /** Set for a transport or loading charge, listed after the materials of its work type. */
  charge?: ChargeKind;
}

export interface SiteReportCategory {
  name: string;
  amount: number;
  materials: SiteReportMaterial[];
}

export interface SiteReport {
  categories: SiteReportCategory[];
  total: number;
  /** Of the total, transport and loading charges. */
  charges: number;
  lineCount: number;
}

const UNCATEGORISED = 'Uncategorised';

/** The date a purchase line counts under in a site report. */
export const siteReportDate = (item: ItemRow, list: ListRow) => item.delivered_at || item.date || list.site_date || list.created_at.slice(0, 10);

/** Whether any saved purchase line for this address is ticked as delivered. */
export function siteHasDeliveries(lists: ListRow[], items: ItemRow[], address?: string): boolean {
  const ids = new Set(lists.filter((l) => l.kind === 'audit' && l.status === 'saved' && (address === undefined || l.address === address)).map((l) => l.id));
  return items.some((i) => ids.has(i.list_id) && !!i.delivered_at);
}

/**
 * Saved purchases for one site, grouped by work category and then by material
 * (names tidied by learned corrections, as in the price database). Transport and
 * loading charges come after the materials of their work category.
 */
export function buildSiteReport(lists: ListRow[], items: ItemRow[], learning: LearningMap, opts: SiteReportOptions): SiteReport {
  const wanted = new Set((opts.categories ?? []).map((c) => c.trim().toLowerCase()));
  const siteLists = new Map(
    lists
      .filter((l) => l.kind === 'audit' && l.status === 'saved' && (opts.address === undefined || l.address === opts.address))
      .filter((l) => wanted.size === 0 || wanted.has((l.category || UNCATEGORISED).toLowerCase()))
      .map((l) => [l.id, l]),
  );
  type Acc = Omit<SiteReportMaterial, 'avgRate' | 'vendors' | 'bills'> & { vendors: Set<string>; bills: Set<string>; pricedQty: number; pricedAmount: number };
  const byCategory = new Map<string, Map<string, Acc>>();
  let lineCount = 0;

  for (const item of items) {
    const list = siteLists.get(item.list_id);
    if (!list || !item.item_name) continue;
    const { item_name, unit } = applyLearning(learning, item);
    const charge = chargeKind(item_name);
    if (opts.deliveredOnly && (!item.delivered_at || charge)) continue;
    const date = siteReportDate(item, list);
    if (opts.from && date < opts.from) continue;
    if (opts.to && date > opts.to) continue;

    const category = list.category || UNCATEGORISED;
    let materials = byCategory.get(category);
    if (!materials) byCategory.set(category, (materials = new Map()));
    const key = materialKey(item_name, unit);
    let m = materials.get(key);
    if (!m) {
      m = { name: item_name, unit, quantity: 0, amount: 0, vendors: new Set(), bills: new Set(), pricedQty: 0, pricedAmount: 0, lines: [], ...(charge ? { charge } : {}) };
      materials.set(key, m);
    }
    m.quantity += item.quantity || 0;
    m.amount += item.total_amount || 0;
    if (item.unit_price > 0 && item.quantity > 0) {
      m.pricedQty += item.quantity;
      m.pricedAmount += item.total_amount || item.quantity * item.unit_price;
    }
    if (item.vendor) m.vendors.add(item.vendor);
    m.bills.add(list.id);
    m.lines.push({ date, item, listTitle: list.title || 'Untitled session' });
    lineCount++;
  }

  const categories = [...byCategory.entries()]
    .map(([name, materials]) => {
      const list = [...materials.values()]
        .map(({ vendors, bills, pricedQty, pricedAmount, lines, ...m }) => ({
          ...m,
          avgRate: pricedQty > 0 ? pricedAmount / pricedQty : 0,
          vendors: [...vendors].sort(),
          bills: bills.size,
          lines: lines.sort((a, b) => a.date.localeCompare(b.date)),
        }))
        .sort((a, b) => Number(!!a.charge) - Number(!!b.charge) || b.amount - a.amount || a.name.localeCompare(b.name));
      return { name, amount: list.reduce((sum, m) => sum + m.amount, 0), materials: list };
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const charges = categories.reduce((sum, c) => sum + c.materials.reduce((s, m) => s + (m.charge ? m.amount : 0), 0), 0);
  return { categories, total: categories.reduce((sum, c) => sum + c.amount, 0), charges, lineCount };
}

/** Indian financial year (1 April – 31 March) containing `date`, or the one before it. */
export function financialYear(date: string, previous = false): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const start = (m >= 4 ? y : y - 1) - (previous ? 1 : 0);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

// ---------------------------------------------------------------------------
// Vendor quotes compared with each other and with past prices
// ---------------------------------------------------------------------------

/** Past prices of a BOQ item from the material database, excluding the quotes being compared. */
export interface PriceHistory {
  points: PricePoint[];
  last: PricePoint | null;
  min: number;
  max: number;
}

export interface QuoteCell {
  line: QuoteLineRow;
  /** Vendor's rate; 0 when they listed the item without a price. */
  price: number;
  /** Quoted in a different unit than the BOQ, so prices can't be compared directly. */
  unitDiffers: boolean;
  /** Vendor's quantity differs from the BOQ quantity. */
  qtyDiffers: boolean;
  /** Brand, model, size/spec or colour the vendor named that differs from what the BOQ asks for. */
  variantDiffers: VariantField[];
  /** Change against the last price recorded before this quote (0.08 = +8%), when comparable. */
  vsLast: number | null;
  /** The last price that vsLast is measured against. */
  lastPoint: PricePoint | null;
  /** Lowest comparable price for this item among the quotes. */
  cheapest: boolean;
}

export interface ComparisonRow {
  sr: number;
  item: ItemRow;
  history: PriceHistory;
  /** By quote id; missing when that vendor did not quote this item. */
  cells: Record<string, QuoteCell | undefined>;
}

export interface VendorSummary {
  quote: QuoteRow;
  /** Σ BOQ quantity × vendor rate over items quoted in the BOQ's unit. */
  total: number;
  /** BOQ items with a price from this vendor. */
  quoted: number;
  /** BOQ items this vendor did not price. */
  missing: ItemRow[];
  /** Vendor lines that match no BOQ item. */
  extras: QuoteLineRow[];
  /** Lines quoted in a different unit than the BOQ (left out of the total). */
  unitIssues: number;
  /** Lines for a different brand/model/spec/colour than the BOQ asks for (in the total, but not ranked). */
  variantIssues: number;
  /** Same items at their last recorded prices, and the change against that. */
  lastTotal: number;
  vsLast: number | null;
  /** Total over only the items every vendor priced in the BOQ's unit: the fair like-for-like figure. */
  commonTotal: number;
}

export interface QuoteComparison {
  rows: ComparisonRow[];
  vendors: VendorSummary[];
  /** BOQ items every vendor priced comparably (what commonTotal covers). */
  commonItems: number;
}

const sameUnit = (a: string, b: string) => normalizeTerm(a || 'unit') === normalizeTerm(b || 'unit');
/** Priced in the BOQ's unit for what the BOQ asks for, so it can be ranked against other vendors. */
const isComparable = (c: QuoteCell | undefined): c is QuoteCell => !!c && c.price > 0 && !c.unitDiffers && c.variantDiffers.length === 0;
const fromQuote = (p: PricePoint, q: QuoteRow) => p.vendor === q.vendor && p.date === q.quote_date;

function summarizeHistory(points: PricePoint[]): PriceHistory {
  const prices = points.map((p) => p.price);
  return {
    points,
    last: points.at(-1) ?? null,
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0,
  };
}

/**
 * Line up vendor quotes against the BOQ they answer (items in printed order,
 * Sr. 1..n) and against past prices in the material database. Confirmed quotes
 * are indexed into that database, so each quote's own prices are left out of
 * the history it is measured against.
 */
export function compareQuotes(
  boqItems: ItemRow[],
  quotes: QuoteRow[],
  lines: QuoteLineRow[],
  database: MaterialEntry[],
  learning: LearningMap,
  /** The BOQ's project: a past price paid on its site is preferred to one from another site. */
  projectId = '',
): QuoteComparison {
  const byKey = new Map(database.map((e) => [e.key, e]));
  const linesByQuote = new Map<string, QuoteLineRow[]>();
  for (const l of [...lines].sort((a, b) => a.position - b.position)) {
    const list = linesByQuote.get(l.quote_id);
    if (list) list.push(l);
    else linesByQuote.set(l.quote_id, [l]);
  }

  const rows: ComparisonRow[] = boqItems.map((item, i) => {
    const { item_name, unit } = applyLearning(learning, item);
    const allPoints = byKey.get(materialKey(item_name, unit))?.priceHistory ?? [];
    // Only prices for what this BOQ line asks for: a line naming Jaquar is not measured against Hindware.
    const history = summarizeHistory(allPoints.filter((p) => variantMatches(item, p.variant) && !quotes.some((q) => fromQuote(p, q))));
    const cells: ComparisonRow['cells'] = {};
    for (const q of quotes) {
      const line = (linesByQuote.get(q.id) ?? []).find((l) => l.boq_item_id === item.id);
      if (!line) continue;
      const unitDiffers = !sameUnit(line.unit, item.unit);
      const variantDiffers = variantDifferences(item, line);
      // Other vendors' quotes in this comparison are left out too, so the order of confirming doesn't matter.
      const before = unitDiffers || variantDiffers.length ? [] : history.points.filter((p) => p.date <= q.quote_date);
      const here = projectId ? before.filter((p) => p.projectId === projectId) : [];
      const lastPoint = (here.length ? here : before).at(-1) ?? null;
      cells[q.id] = {
        line,
        price: line.unit_price,
        unitDiffers,
        qtyDiffers: line.quantity > 0 && line.quantity !== item.quantity,
        variantDiffers,
        vsLast: lastPoint && line.unit_price > 0 ? (line.unit_price - lastPoint.price) / lastPoint.price : null,
        lastPoint,
        cheapest: false,
      };
    }
    const comparable = Object.values(cells).filter(isComparable);
    if (comparable.length > 1) {
      const low = Math.min(...comparable.map((c) => c.price));
      for (const c of comparable) c.cheapest = c.price === low;
    }
    return { sr: i + 1, item, history, cells };
  });

  const comparableIn = (row: ComparisonRow, q: QuoteRow) => isComparable(row.cells[q.id]);
  const common = rows.filter((row) => quotes.length > 0 && quotes.every((q) => comparableIn(row, q)));
  const boqIds = new Set(boqItems.map((b) => b.id));
  const vendors: VendorSummary[] = quotes.map((q) => {
    let total = 0;
    let lastTotal = 0;
    let comparedTotal = 0;
    let quoted = 0;
    let unitIssues = 0;
    let variantIssues = 0;
    const missing: ItemRow[] = [];
    for (const row of rows) {
      const cell = row.cells[q.id];
      if (!cell || cell.price <= 0) {
        missing.push(row.item);
        continue;
      }
      quoted++;
      if (cell.unitDiffers) {
        unitIssues++;
        continue;
      }
      if (cell.variantDiffers.length) variantIssues++;
      total += row.item.quantity * cell.price;
      if (cell.lastPoint) {
        comparedTotal += row.item.quantity * cell.price;
        lastTotal += row.item.quantity * cell.lastPoint.price;
      }
    }
    const extras = (linesByQuote.get(q.id) ?? []).filter((l) => !l.boq_item_id || !boqIds.has(l.boq_item_id));
    return {
      quote: q,
      total,
      quoted,
      missing,
      extras,
      unitIssues,
      variantIssues,
      lastTotal,
      vsLast: lastTotal > 0 ? (comparedTotal - lastTotal) / lastTotal : null,
      commonTotal: common.reduce((sum, row) => sum + row.item.quantity * row.cells[q.id]!.price, 0),
    };
  });

  return { rows, vendors, commonItems: common.length };
}

function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return `"${value.replace(/"/g, '""')}"`;
}

/** One row per variant (brand/model/spec/colour) of each material. */
export function materialDatabaseToCSV(entries: MaterialEntry[]): string {
  const headers = ['Item Name', 'Unit', 'Brand', 'Model', 'Size/Spec', 'Color', 'Categories', 'Vendors', 'Min Price (Rs)', 'Max Price (Rs)', 'Avg Price (Rs)', 'Latest Price (Rs)', 'Project Locations'];
  const rows = entries.flatMap((e) =>
    (e.variants.length ? e.variants : [{ variant: variantOf({}), priceHistory: e.priceHistory, ...priceStats(e.priceHistory) }]).map((v) => {
      const prices = v.priceHistory.map((p) => p.price);
      const vendors = [...new Set(v.priceHistory.map((p) => p.vendor))];
      return [
        csvCell(e.name),
        csvCell(e.unit),
        ...VARIANT_FIELDS.map((f) => csvCell(v.variant[f])),
        csvCell(e.categories.join(', ')),
        csvCell((vendors.length ? vendors : e.vendors).join(', ')),
        v.minPrice,
        v.maxPrice,
        prices.length ? Math.round(prices.reduce((x, y) => x + y, 0) / prices.length) : 0,
        v.latestPrice,
        csvCell(e.addresses.join(', ')),
      ];
    }),
  );
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// ---------------------------------------------------------------------------
// Possible duplicates (the same thing recorded under another name)
// ---------------------------------------------------------------------------

const words = (name: string) => normalizeTerm(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const hasDigit = (w: string) => /\p{N}/u.test(w);

/** Same word, or one letter off for longer words ("cemnt" / "cement"). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (hasDigit(a) || hasDigit(b) || a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * How alike two material names are, 0..1, or 0 when they can't be the same product: names with
 * different codes or numbers ("JDS White 101" vs "102", "12mm" vs "16mm") never match, and extra
 * product words ("Wash Basin" vs "Wash Basin Diverter") lower the score.
 */
export function nameSimilarity(a: string, b: string): number {
  const wa = [...new Set(words(a))];
  const wb = [...new Set(words(b))];
  if (!wa.length || !wb.length) return 0;
  const codes = (ws: string[]) => ws.filter(hasDigit).sort().join(' ');
  if (codes(wa) !== codes(wb)) return 0;
  // The same letters spaced or joined differently ("Mount air" / "Mountair"), or one letter off.
  const joinedA = wa.join('');
  const joinedB = wb.join('');
  if (joinedA === joinedB) return 1;
  if (joinedA.length >= 6 && sameWord(joinedA, joinedB)) return 0.9;
  const shared = wa.filter((w) => wb.some((v) => sameWord(w, v))).length;
  return shared / (wa.length + wb.length - shared);
}

/** Materials that look like the same thing under another name, best first (same unit before others). */
export function similarMaterials(material: MaterialEntry, all: MaterialEntry[], limit = 5): MaterialEntry[] {
  const sameUnit = (e: MaterialEntry) => normalizeTerm(e.unit) === normalizeTerm(material.unit);
  return all
    .filter((e) => e.key !== material.key)
    .map((e) => ({ e, score: nameSimilarity(material.name, e.name) }))
    .filter((s) => s.score >= 0.67)
    .sort((x, y) => Number(sameUnit(y.e)) - Number(sameUnit(x.e)) || y.score - x.score)
    .slice(0, limit)
    .map((s) => s.e);
}

/** The price a new line is checked against: the last one paid on this project's site, else the last one anywhere. */
export interface LastPaid {
  price: number;
  date: string;
  vendor: string;
  /** "here": this project; "elsewhere": no price for this project yet, so the latest from another site. */
  scope: 'here' | 'elsewhere';
  /** Site address (or blank) of the price, for "elsewhere". */
  site: string;
  projectId: string;
}

/**
 * Last price paid for a line's material, site first: transport and local charges make the same
 * material cost differently from site to site. The line itself, and its saved copy (same day, rate
 * and vendor), don't count; a line naming a brand, model, size or colour only sees prices for that.
 */
export function lastPaidFor(
  entry: Pick<MaterialEntry, 'priceHistory'> | undefined,
  line: Pick<ItemRow, 'id' | 'date' | 'unit_price' | 'vendor'> & Partial<Variant>,
  projectId: string,
  today: string,
): LastPaid | undefined {
  if (!entry) return undefined;
  const sameLine = (p: PricePoint) => p.itemId === line.id || (p.date === (line.date || today) && p.price === line.unit_price && p.vendor === (line.vendor || 'Unknown'));
  const prices = entry.priceHistory.filter((p) => !sameLine(p) && variantMatches(line, p.variant));
  const here = prices.filter((p) => p.projectId === projectId);
  const last = (here.length ? here : prices).at(-1);
  if (!last) return undefined;
  return { price: last.price, date: last.date, vendor: last.vendor, scope: here.length ? 'here' : 'elsewhere', site: last.site ?? '', projectId: last.projectId ?? '' };
}
