import type { ExtractedMaterial, IndexedRateRow, ItemRow, LearningMap, ListRow, QuoteLineRow, QuoteRow } from './schemas.ts';

export const DEFAULT_CATEGORIES = ['Civil', 'Electrical', 'Plumbing', 'Carpenter', 'Hvac', 'Tile', 'Stone', 'Other'];

export function normalizeTerm(term: string): string {
  return term.toLowerCase().trim();
}

/** Stable identity of a material in the database: name + unit, case-insensitive. */
export function materialKey(name: string, unit: string | undefined | null): string {
  return JSON.stringify([normalizeTerm(name), normalizeTerm(unit || 'unit')]);
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
  /** Title of the saved session the price came from; absent for a single added rate. */
  listTitle?: string;
  /** Id of the saved-list line the price came from, so it can be edited or removed. */
  itemId?: string;
  /** Id of the single added rate (Index rate, or a confirmed vendor quote), so it can be removed. */
  rateId?: string;
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
}

/**
 * Build the material price database from saved sessions and manually indexed
 * rates. Draft lists are ignored.
 */
export function buildItemDatabase(
  lists: ListRow[],
  items: ItemRow[],
  rates: IndexedRateRow[],
  learning: LearningMap,
): MaterialEntry[] {
  type Acc = Omit<MaterialEntry, 'vendors' | 'categories' | 'addresses' | 'minPrice' | 'maxPrice' | 'avgPrice' | 'latestPrice'> & {
    vendors: Set<string>;
    categories: Set<string>;
    addresses: Set<string>;
  };
  const db = new Map<string, Acc>();
  const entry = (name: string, unit: string): Acc => {
    const key = materialKey(name, unit);
    let e = db.get(key);
    if (!e) {
      e = { key, name, unit, vendors: new Set(), categories: new Set(), addresses: new Set(), priceHistory: [] };
      db.set(key, e);
    }
    return e;
  };

  const savedLists = new Map(lists.filter((l) => l.status === 'saved').map((l) => [l.id, l]));

  for (const raw of items) {
    if (!raw.item_name) continue;
    const list = savedLists.get(raw.list_id);
    if (!list) continue;

    const { item_name, unit } = applyLearning(learning, raw);
    const e = entry(item_name, unit);
    if (raw.vendor) e.vendors.add(raw.vendor);
    if (list.category) e.categories.add(list.category);
    if (list.address) e.addresses.add(list.address);
    if (raw.unit_price > 0) {
      e.priceHistory.push({
        date: raw.date || list.created_at.slice(0, 10),
        price: raw.unit_price,
        vendor: raw.vendor || 'Unknown',
        timestamp: list.created_at,
        listTitle: list.title || 'Untitled session',
        itemId: raw.id,
      });
    }
  }

  for (const rate of rates) {
    const { item_name, unit } = applyLearning(learning, rate);
    const e = entry(item_name, unit);
    e.priceHistory.push({
      date: rate.date,
      price: rate.price,
      vendor: rate.vendor || 'Manual Index',
      timestamp: rate.indexed_at,
      rateId: rate.id,
    });
    if (rate.vendor) e.vendors.add(rate.vendor);
  }

  return [...db.values()]
    .map((e) => {
      const priceHistory = [...e.priceHistory].sort((a, b) => {
        const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
        return byDate !== 0 ? byDate : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      const prices = priceHistory.map((h) => h.price);
      const has = prices.length > 0;
      return {
        ...e,
        priceHistory,
        vendors: [...e.vendors],
        categories: [...e.categories],
        addresses: [...e.addresses],
        minPrice: has ? Math.min(...prices) : 0,
        maxPrice: has ? Math.max(...prices) : 0,
        avgPrice: has ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
        latestPrice: has ? priceHistory[priceHistory.length - 1].price : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
    const history = summarizeHistory(allPoints.filter((p) => !quotes.some((q) => fromQuote(p, q))));
    const cells: ComparisonRow['cells'] = {};
    for (const q of quotes) {
      const line = (linesByQuote.get(q.id) ?? []).find((l) => l.boq_item_id === item.id);
      if (!line) continue;
      const unitDiffers = !sameUnit(line.unit, item.unit);
      // Other vendors' quotes in this comparison are left out too, so the order of confirming doesn't matter.
      const lastPoint = unitDiffers ? null : history.points.filter((p) => p.date <= q.quote_date).at(-1) ?? null;
      cells[q.id] = {
        line,
        price: line.unit_price,
        unitDiffers,
        qtyDiffers: line.quantity > 0 && line.quantity !== item.quantity,
        vsLast: lastPoint && line.unit_price > 0 ? (line.unit_price - lastPoint.price) / lastPoint.price : null,
        lastPoint,
        cheapest: false,
      };
    }
    const comparable = Object.values(cells).filter((c): c is QuoteCell => !!c && c.price > 0 && !c.unitDiffers);
    if (comparable.length > 1) {
      const low = Math.min(...comparable.map((c) => c.price));
      for (const c of comparable) c.cheapest = c.price === low;
    }
    return { sr: i + 1, item, history, cells };
  });

  const comparableIn = (row: ComparisonRow, q: QuoteRow) => {
    const c = row.cells[q.id];
    return !!c && c.price > 0 && !c.unitDiffers;
  };
  const common = rows.filter((row) => quotes.length > 0 && quotes.every((q) => comparableIn(row, q)));
  const boqIds = new Set(boqItems.map((b) => b.id));
  const vendors: VendorSummary[] = quotes.map((q) => {
    let total = 0;
    let lastTotal = 0;
    let comparedTotal = 0;
    let quoted = 0;
    let unitIssues = 0;
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

export function materialDatabaseToCSV(entries: MaterialEntry[]): string {
  const headers = ['Item Name', 'Unit', 'Categories', 'Vendors', 'Min Price (Rs)', 'Max Price (Rs)', 'Avg Price (Rs)', 'Latest Price (Rs)', 'Project Locations'];
  const rows = entries.map((e) => [
    csvCell(e.name),
    csvCell(e.unit),
    csvCell(e.categories.join(', ')),
    csvCell(e.vendors.join(', ')),
    e.minPrice,
    e.maxPrice,
    Math.round(e.avgPrice),
    e.latestPrice,
    csvCell(e.addresses.join(', ')),
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
