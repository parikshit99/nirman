/**
 * Materials ordered in one unit and billed in another: TMT bars ordered in
 * bundles or loose bars but priced per kg, and tiles / ACP sheets measured in
 * sqft but supplied as whole pieces.
 */

/** Bars in one bundle, by diameter in mm. */
export type BundleBars = Record<string, number>;

export interface SheetSize {
  /** Millimetres, e.g. 600 × 1200. */
  width: number;
  length: number;
}

export interface ConversionSettings {
  bundleBars: BundleBars;
  /** Standard bar length in metres. */
  barLength: number;
  tileSizes: SheetSize[];
  acpSizes: SheetSize[];
}

export const DEFAULT_CONVERSIONS: ConversionSettings = {
  bundleBars: { '8': 18, '10': 12, '12': 8, '16': 5, '20': 3, '25': 2 },
  barLength: 12,
  tileSizes: [
    { width: 600, length: 1200 },
    { width: 800, length: 1600 },
    { width: 1200, length: 1800 },
    { width: 1200, length: 3000 },
  ],
  acpSizes: [
    { width: 1200, length: 2400 },
    { width: 1200, length: 3000 },
    { width: 1200, length: 3600 },
  ],
};

export type ConversionKind = 'tmt' | 'tile' | 'acp';

/** Which helper fits a material, from its name. */
export function conversionKind(itemName: string): ConversionKind | null {
  const n = itemName.toLowerCase();
  if (/\b(tmt|rebar|saria|sariya|sarya|steel bars?|reinforcement)\b/.test(n)) return 'tmt';
  if (/\b(acp|aluminium composite|aluminum composite)\b/.test(n)) return 'acp';
  if (/\btiles?\b|vitrified|ceramic|porcelain/.test(n)) return 'tile';
  return null;
}

/** Weight of one metre of bar: d² / 162 kg (d in mm). */
export const kgPerMetre = (diameter: number) => (diameter * diameter) / 162;

/** Diameter in mm from text such as "12mm", "12 mm", "Ø12", "#12". */
export function parseDiameter(text: string): number | null {
  const t = text.replace(/millimet(er|re)s?/gi, 'mm');
  const m = /(\d{1,2})\s*mm\b/i.exec(t) ?? /(?:ø|#|dia\.?)\s*(\d{1,2})\b/i.exec(t) ?? /^\s*(\d{1,2})\s*$/.exec(t);
  const d = m ? Number(m[1]) : NaN;
  return d >= 6 && d <= 40 ? d : null;
}

export interface TmtOrder {
  diameter: number;
  bundles: number;
  looseBars: number;
  /** Metres. */
  barLength: number;
  bundleBars: BundleBars;
}

/** Bars and their standard weight for an order of bundles plus loose bars. */
export function tmtEstimate({ diameter, bundles, looseBars, barLength, bundleBars }: TmtOrder): { bars: number; kg: number; perBundle: number } {
  const perBundle = bundleBars[String(diameter)] ?? 0;
  const bars = Math.max(0, bundles) * perBundle + Math.max(0, looseBars);
  return { bars, perBundle, kg: round(bars * kgPerMetre(diameter) * barLength, 1) };
}

/** "3 bundles + 4 bars of 12 mm (12 m)". */
export function describeTmtOrder({ diameter, bundles, looseBars, barLength }: Pick<TmtOrder, 'diameter' | 'bundles' | 'looseBars' | 'barLength'>): string {
  const parts = [bundles > 0 && plural(bundles, 'bundle'), looseBars > 0 && plural(looseBars, 'bar')].filter(Boolean);
  return `${parts.join(' + ') || '0 bars'} of ${diameter} mm${barLength !== 12 ? ` (${barLength} m bars)` : ''}`;
}

/** Square feet in one piece of the given size in mm. */
export const pieceSqft = ({ width, length }: SheetSize) => (width * length) / 92903.04;

/** "600×1200 mm". */
export const sizeLabel = ({ width, length }: SheetSize) => `${width}×${length} mm`;

/** Size from text such as "600x1200", "600 X 1200 mm", "2'x4'" is not handled (mm only). */
export function parseSize(text: string): SheetSize | null {
  const m = /(\d{3,4})\s*(?:mm)?\s*[x×*]\s*(\d{3,4})/i.exec(text);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return { width: Math.min(a, b), length: Math.max(a, b) };
}

/**
 * Whole pieces needed to cover an area, as a vendor rounds it up, and the
 * sqft they bill for. Wastage (%) is added before rounding.
 */
export function piecesForArea(areaSqft: number, size: SheetSize, wastagePct = 0): { pieces: number; billedSqft: number; perPiece: number } {
  const perPiece = pieceSqft(size);
  if (!(areaSqft > 0) || !(perPiece > 0)) return { pieces: 0, billedSqft: 0, perPiece };
  // A hair of tolerance so 7.75 sqft doesn't become 2 pieces from float error.
  const pieces = Math.ceil((areaSqft * (1 + Math.max(0, wastagePct) / 100)) / perPiece - 1e-9);
  return { pieces, perPiece, billedSqft: round(pieces * perPiece, 2) };
}

/** "62 tiles of 600×1200 mm for 480 sqft (+5% wastage)". */
export function describePieceOrder(kind: 'tile' | 'acp', pieces: number, size: SheetSize, areaSqft?: number, wastagePct = 0): string {
  const what = plural(pieces, kind === 'tile' ? 'tile' : 'sheet');
  const forArea = areaSqft ? ` for ${round(areaSqft, 2)} sqft` : '';
  return `${what} of ${sizeLabel(size)}${forArea}${wastagePct > 0 ? ` (+${wastagePct}% wastage)` : ''}`;
}

export interface OrderedLine {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  spec: string;
  ordered_as: string;
}

const BUNDLE_UNIT = /^(bundles?|bndls?|bdls?|bundal|gaddi|gaddis)$/i;
const BAR_UNIT = /^(bars?|pcs?|pieces?|nos?|numbers?|rods?)$/i;
const PIECE_UNIT = /^(pcs?|pieces?|nos?|numbers?|tiles?|sheets?|boxes?)$/i;
const SQFT_UNIT = /^(sq\.?\s*ft\.?|sqft|sft|square\s*feet|sq\s*feet)$/i;

/**
 * Turn a line read as "5 bundles of 12 mm TMT" into kg, or "62 tiles of
 * 600×1200" into sqft, so its rate compares with other prices. The order as
 * written goes to `ordered_as`. Lines already in kg / sqft, or that can't be
 * worked out, are left as they are.
 */
export function toBilledUnits<T extends OrderedLine>(line: T, settings: ConversionSettings = DEFAULT_CONVERSIONS): T {
  const kind = conversionKind(line.item_name);
  const unit = line.unit.trim();
  if (kind === 'tmt' && (BUNDLE_UNIT.test(unit) || BAR_UNIT.test(unit))) {
    const diameter = parseDiameter(line.spec) ?? parseDiameter(line.item_name);
    if (!diameter) return line;
    const bundles = BUNDLE_UNIT.test(unit) ? line.quantity : 0;
    const looseBars = BUNDLE_UNIT.test(unit) ? 0 : line.quantity;
    const { kg, perBundle } = tmtEstimate({ diameter, bundles, looseBars, barLength: settings.barLength, bundleBars: settings.bundleBars });
    if (!(kg > 0) || (bundles > 0 && !perBundle)) return line;
    const order = describeTmtOrder({ diameter, bundles, looseBars, barLength: settings.barLength });
    // A price per bundle/bar is spread over the estimated weight; a total stays as written.
    const total = line.total_amount || line.quantity * line.unit_price;
    return {
      ...line,
      quantity: kg,
      unit: 'kg',
      unit_price: total ? round(total / kg, 2) : 0,
      total_amount: total,
      spec: line.spec || `${diameter} mm`,
      ordered_as: [line.ordered_as, `${order} (weight estimated)`].filter(Boolean).join('; '),
    };
  }
  if ((kind === 'tile' || kind === 'acp') && PIECE_UNIT.test(unit) && !/^box/i.test(unit)) {
    const size = parseSize(line.spec) ?? parseSize(line.item_name);
    if (!size) return line;
    const sqft = round(line.quantity * pieceSqft(size), 2);
    const total = line.total_amount || line.quantity * line.unit_price;
    return {
      ...line,
      quantity: sqft,
      unit: 'sqft',
      unit_price: total ? round(total / sqft, 2) : 0,
      total_amount: total,
      spec: line.spec || sizeLabel(size),
      ordered_as: [line.ordered_as, describePieceOrder(kind, line.quantity, size)].filter(Boolean).join('; '),
    };
  }
  if ((kind === 'tile' || kind === 'acp') && SQFT_UNIT.test(unit) && unit !== 'sqft') return { ...line, unit: 'sqft' };
  return line;
}

function plural(n: number, word: string) {
  return `${Number(n.toFixed(2))} ${word}${n === 1 ? '' : 's'}`;
}

function round(n: number, places: number) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
