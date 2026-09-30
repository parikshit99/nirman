import type { ExtractedMaterial, IndexedRateRow, ItemRow, LearningMap, ListRow } from './schemas.ts';

export const DEFAULT_CATEGORIES = ['Civil', 'Electrical', 'Plumbing', 'Carpenter', 'Hvac', 'Tile', 'Stone', 'Other'];

export function normalizeTerm(term: string): string {
  return term.toLowerCase().trim();
}

/** Stable identity of a material in the database: name + unit, case-insensitive. */
export function materialKey(name: string, unit: string | undefined | null): string {
  return JSON.stringify([normalizeTerm(name), normalizeTerm(unit || 'unit')]);
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
 * rates. Draft lists and soft-deleted rows are ignored.
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

  const savedLists = new Map(lists.filter((l) => l.status === 'saved' && !l.deleted_at).map((l) => [l.id, l]));

  for (const raw of items) {
    if (raw.deleted_at || !raw.item_name) continue;
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
      });
    }
  }

  for (const rate of rates) {
    if (rate.deleted_at) continue;
    const { item_name, unit } = applyLearning(learning, rate);
    const e = entry(item_name, unit);
    e.priceHistory.push({
      date: rate.date,
      price: rate.price,
      vendor: rate.vendor || 'Manual Index',
      timestamp: rate.indexed_at,
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
