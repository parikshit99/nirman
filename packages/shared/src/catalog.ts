import { UNITS } from './billParser.ts';
import { nameSimilarity, normalizeTerm } from './domain.ts';
import type { LearningMap } from './schemas.ts';

// ---------------------------------------------------------------------------
// One name per material. A bill says "Ultratech PPC 50kg" one day and "Cement - UT" the next; both are Cement
// (brand UltraTech, PPC), or prices can't be compared. A line is matched to a material already in Rates first
// (the owner's own names win), else to the starter catalog below, and its unit converted where that is exact.
// ---------------------------------------------------------------------------

/** Units as written, beyond the bill reader's list, and the unit they are stored as. */
const MORE_UNITS: Record<string, string> = {
  kilogram: 'kg', kilograms: 'kg', kilos: 'kg', g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  'm.t': 'MT', 'm.t.': 'MT', tonnes: 'MT', qtls: 'Quintal', qntl: 'Quintal', quintals: 'Quintal',
  'cu.ft': 'cft', 'cu ft': 'cft', cuft: 'cft', 'cubic feet': 'cft', 'cu.m': 'cum', 'cu m': 'cum', m3: 'cum', cbm: 'cum', 'cubic metre': 'cum', 'cubic meter': 'cum',
  'sq ft': 'sqft', 'sq.ft.': 'sqft', 'sq. ft': 'sqft', 'sq m': 'sqm', 'sq.m': 'sqm', m2: 'sqm', 'r.ft': 'rft', 'running feet': 'rft',
  number: 'nos', numbers: 'nos', 'no.': 'nos', 'nos.': 'nos', litres: 'litre', liters: 'litre',
};

/** "Bags", "KGS", "cu.m" → Bag, kg, cum. Unknown units are kept as written (trimmed). */
export function cleanUnit(unit: string): string {
  const u = unit.trim();
  const k = u.toLowerCase().replace(/\s+/g, ' ');
  return UNITS[k] ?? MORE_UNITS[k] ?? UNITS[k.replace(/\.$/, '')] ?? u;
}

/** Each unit as a multiple of its kind's base unit. Units of one kind convert exactly; others never. */
const UNIT_SIZE: Record<string, [kind: string, size: number]> = {
  g: ['mass', 0.001], kg: ['mass', 1], quintal: ['mass', 100], mt: ['mass', 1000],
  cft: ['volume', 1], cum: ['volume', 35.3147], brass: ['volume', 100],
  sqft: ['area', 1], sqm: ['area', 10.7639],
  ft: ['length', 1], rft: ['length', 1], m: ['length', 3.28084],
  ml: ['liquid', 0.001], litre: ['liquid', 1],
  nos: ['count', 1], pcs: ['count', 1], piece: ['count', 1], dozen: ['count', 12],
};

const unitId = (unit: string) => normalizeTerm(cleanUnit(unit));
/** No unit written ("unit" or blank): takes the unit of the material it matches. */
const noUnit = (unit: string) => ['', 'unit', 'units'].includes(unitId(unit));

/**
 * How many `to` make one `from` (1 MT = 1000 kg; 1 brass = 100 cft), or null when they don't convert
 * (Bag to kg depends on the bag). Same unit, or spellings of it, is 1.
 */
export function unitFactor(from: string, to: string): number | null {
  const a = unitId(from);
  const b = unitId(to);
  if (a === b) return 1;
  const x = UNIT_SIZE[a];
  const y = UNIT_SIZE[b];
  return x && y && x[0] === y[0] ? x[1] / y[1] : null;
}

/** A standard material: its name, the unit its rates are compared in, and the words that name it on bills. */
export interface CatalogMaterial {
  name: string;
  /** Rates are compared in this unit; a line in a unit of the same kind is converted (MT → kg). */
  unit?: string;
  category: string;
  /** Lower-case words or phrases; longer phrases are tried first ("white cement" before "cement"). */
  words: string[];
  /** Grade or size, read from the name into Size/spec when the line has none. */
  spec?: (name: string) => string;
}

const mm = (name: string) => /(\d{1,3})\s*mm\b/i.exec(name)?.[1];
const cementSpec = (name: string) => {
  const type = /\b(opc|ppc|psc)\b/i.exec(name)?.[1]?.toUpperCase();
  const grade = /\b(33|43|53)\s*(grade|gr\.?)?\b/i.exec(name)?.[1];
  return [type, grade && `${grade} grade`].filter(Boolean).join(' ');
};
const tmtSpec = (name: string) => {
  const grade = /\bfe\s*-?\s*(415|500|550|600)\s*(d)?\b/i.exec(name);
  const dia = mm(name);
  return [dia && `${dia} mm`, grade && `Fe${grade[1]}${grade[2] ? 'D' : ''}`].filter(Boolean).join(' ');
};
const sizeSpec = (name: string) => {
  const d = mm(name);
  return d ? `${d} mm` : '';
};
const rmcSpec = (name: string) => /\b(m\s*-?\s*\d{2})\b/i.exec(name)?.[1].replace(/\s|-/g, '').toUpperCase() ?? '';

/** The starter catalog: common site materials. A material already in Rates is always preferred to these. */
export const CATALOG: CatalogMaterial[] = [
  { name: 'White cement', unit: 'kg', category: 'Civil', words: ['white cement', 'birla white', 'jk white'] },
  { name: 'Cement', unit: 'Bag', category: 'Civil', words: ['cement', 'siment', 'opc', 'ppc', 'psc'], spec: cementSpec },
  { name: 'TMT bar', unit: 'kg', category: 'Civil', words: ['tmt', 'saria', 'sariya', 'sarya', 'rebar', 'steel bar', 'steel bars', 'fe500', 'fe 500', 'fe550', 'fe500d'], spec: tmtSpec },
  { name: 'Binding wire', unit: 'kg', category: 'Civil', words: ['binding wire', 'bandhai wire'] },
  { name: 'M-sand', unit: 'cft', category: 'Civil', words: ['m sand', 'm-sand', 'msand', 'crushed sand', 'manufactured sand'] },
  { name: 'Sand', unit: 'cft', category: 'Civil', words: ['sand', 'reti', 'balu', 'baalu', 'river sand'] },
  { name: 'Aggregate', unit: 'cft', category: 'Civil', words: ['aggregate', 'aggregates', 'gitti', 'bajri', 'stone chips', 'grit', 'kapchi'], spec: sizeSpec },
  { name: 'Fly ash bricks', unit: 'nos', category: 'Civil', words: ['fly ash brick', 'fly ash bricks', 'flyash brick', 'flyash bricks'] },
  { name: 'AAC blocks', unit: 'nos', category: 'Civil', words: ['aac', 'aac block', 'aac blocks'], spec: sizeSpec },
  { name: 'Bricks', unit: 'nos', category: 'Civil', words: ['brick', 'bricks', 'eent', 'eet'] },
  { name: 'Ready mix concrete', unit: 'cum', category: 'Civil', words: ['rmc', 'ready mix', 'ready mixed concrete', 'ready mix concrete'], spec: rmcSpec },
  { name: 'Wall putty', unit: 'kg', category: 'Civil', words: ['putty', 'wall putty'] },
  { name: 'Plaster of Paris', unit: 'kg', category: 'Civil', words: ['plaster of paris', 'pop powder'] },
  { name: 'Tile adhesive', unit: 'kg', category: 'Tile', words: ['tile adhesive', 'tile fix', 'tilefix'] },
  { name: 'PVC conduit pipe', category: 'Electrical', words: ['conduit', 'conduit pipe', 'pvc conduit'], spec: sizeSpec },
  { name: 'CPVC pipe', category: 'Plumbing', words: ['cpvc pipe', 'cpvc'], spec: sizeSpec },
  { name: 'UPVC pipe', category: 'Plumbing', words: ['upvc pipe', 'upvc'], spec: sizeSpec },
  { name: 'GI pipe', category: 'Plumbing', words: ['gi pipe', 'g.i. pipe'], spec: sizeSpec },
  { name: 'Plywood', unit: 'sqft', category: 'Carpenter', words: ['plywood', 'ply'], spec: sizeSpec },
];

/** Brand names and the short forms bills use. `material`: the brand alone names it ("UT" on a cement bill). */
const BRANDS: { brand: string; words: string[]; material?: string }[] = [
  { brand: 'UltraTech', words: ['ultratech', 'ultra tech', 'ut', 'utcl'], material: 'Cement' },
  { brand: 'ACC', words: ['acc'], material: 'Cement' },
  { brand: 'Ambuja', words: ['ambuja'], material: 'Cement' },
  { brand: 'Shree', words: ['shree cement'], material: 'Cement' },
  { brand: 'Dalmia', words: ['dalmia'], material: 'Cement' },
  { brand: 'Ramco', words: ['ramco'], material: 'Cement' },
  { brand: 'JK Lakshmi', words: ['jk lakshmi', 'jkl'], material: 'Cement' },
  { brand: 'Wonder', words: ['wonder cement'], material: 'Cement' },
  { brand: 'Bangur', words: ['bangur'], material: 'Cement' },
  { brand: 'Tata Tiscon', words: ['tata tiscon', 'tiscon'], material: 'TMT bar' },
  { brand: 'JSW Neosteel', words: ['jsw neosteel', 'neosteel'], material: 'TMT bar' },
  { brand: 'JSW', words: ['jsw'] },
  { brand: 'SAIL', words: ['sail'], material: 'TMT bar' },
  { brand: 'Kamdhenu', words: ['kamdhenu'], material: 'TMT bar' },
  { brand: 'Jindal Panther', words: ['jindal panther', 'jindal'], material: 'TMT bar' },
  { brand: 'Birla White', words: ['birla white'], material: 'White cement' },
  { brand: 'Astral', words: ['astral'] },
  { brand: 'Supreme', words: ['supreme'] },
  { brand: 'Finolex', words: ['finolex'] },
  { brand: 'Ashirvad', words: ['ashirvad'] },
  { brand: 'Prince', words: ['prince'] },
  { brand: 'Polycab', words: ['polycab'] },
  { brand: 'Havells', words: ['havells'] },
  { brand: 'KEI', words: ['kei'] },
  { brand: 'Legrand', words: ['legrand'] },
  { brand: 'Jaquar', words: ['jaquar'] },
  { brand: 'Hindware', words: ['hindware'] },
  { brand: 'Cera', words: ['cera'] },
  { brand: 'Dr. Fixit', words: ['dr fixit', 'dr. fixit', 'fixit'] },
  { brand: 'Century', words: ['centuryply', 'century ply', 'century'] },
  { brand: 'Greenply', words: ['greenply', 'green ply'] },
];

/** Lower-case words of a name, spaced: " - ", "/", brackets and a full stop that ends a word are spaces ("G.I." stays). */
const tidy = (text: string) => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}.]+|\.(?![\p{L}\p{N}])/gu, ' ').replace(/\s+/g, ' ').trim()} `;
const has = (text: string, phrase: string) => tidy(text).includes(tidy(phrase));
const byLength = <T extends { words: string[] }>(list: T[]) => list.flatMap((x) => x.words.map((w) => ({ x, w }))).sort((a, b) => b.w.length - a.w.length);
const CATALOG_WORDS = byLength(CATALOG);
const DETAIL_WORDS = new Set(['opc', 'ppc', 'psc', 'grade', 'gr', 'kg', 'kgs', 'bag', 'bags', 'fe', 'mm', 'd']);
const BRAND_WORDS = byLength(BRANDS);

/** The brand a name mentions, and the name without it ("Cement - UT" → UltraTech, "Cement"). */
export function findBrand(name: string): { brand: string; rest: string; material?: string } | null {
  const hit = BRAND_WORDS.find(({ w }) => has(name, w));
  if (!hit) return null;
  const rest = tidy(name).replace(tidy(hit.w), ' ').trim();
  // The brand names the material only when nothing else is written ("UT 50kg"); "ACC block" is not cement.
  const onlyDetails = rest.split(' ').every((w) => !w || /\p{N}/u.test(w) || DETAIL_WORDS.has(w));
  return { brand: hit.x.brand, rest, material: onlyDetails ? hit.x.material : undefined };
}

/** Words that may sit beside a catalog name without making it another product ("Red bricks", "River sand 1 brass"). */
const PLAIN_WORDS = new Set(
  ('river fine coarse red clay grey gray loose steel bar bars rod rods pipe pipes block blocks brick bricks cement sand wire ready mix concrete ' +
    'wall x inch inches for of and the no nos type quality best local std standard ordinary portland pozzolana size thick mtr length lengths feet ft ' +
    'cu cft brass sqft bag bags kg kgs mt ton tons qtl quintal grade gr opc ppc psc fe mm d white').split(' '),
);

/**
 * The catalog material a name is, if any. Only when nothing else on the line names another product: "Sand paper",
 * "Conduit bend" and "Cement paint" are not Sand, conduit pipe or Cement. A brand ("UT") or a size ("12mm") is fine.
 */
export function findCatalogMaterial(name: string): CatalogMaterial | null {
  const hit = CATALOG_WORDS.find(({ w }) => has(name, w));
  if (!hit) return null;
  // Every word of that material goes ("Saria 12mm Fe500D"), longest first.
  let rest = tidy(name);
  for (const { x, w } of CATALOG_WORDS) if (x === hit.x) rest = rest.replace(tidy(w), ' ');
  const brand = BRAND_WORDS.find(({ w }) => has(rest, w));
  if (brand) rest = tidy(rest).replace(tidy(brand.w), ' ');
  const other = rest.split(' ').filter((w) => w && !/\p{N}/u.test(w) && !PLAIN_WORDS.has(w));
  return other.length ? null : hit.x;
}

/** A material already in Rates (after learned names), and how often it was bought. */
export interface KnownMaterial {
  name: string;
  unit: string;
  uses?: number;
}

/** What a line looked like as read, before it was matched (kept so the match can be undone). */
export interface ReadAs {
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  brand: string;
  spec: string;
  ordered_as: string;
}

export interface MatchableLine {
  item_name: string;
  original_term?: string;
  unit: string;
  quantity: number;
  unit_price: number;
  brand?: string;
  spec?: string;
  ordered_as?: string;
}

/** A known name counts as the same material from this similarity up (one letter off, or spaced differently). */
const SURE = 0.8;
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * One name and unit for a line just read: a learned name first, else the closest material already in Rates (sure
 * matches only, in a unit that converts), else the starter catalog. The brand and grade in the name go to their own
 * fields. Quantity and rate are converted when the unit changes; the total stays as billed. `readAs` is set when the
 * name or unit changed, so the line can show what it was matched from and undo it.
 */
export function standardizeLine<T extends MatchableLine>(line: T, known: KnownMaterial[], learning: LearningMap = {}): { line: T; readAs?: ReadAs } {
  const read: ReadAs = {
    item_name: line.item_name,
    unit: line.unit,
    quantity: line.quantity,
    unit_price: line.unit_price,
    brand: line.brand ?? '',
    spec: line.spec ?? '',
    ordered_as: line.ordered_as ?? '',
  };
  const unit = cleanUnit(line.unit);
  const term = normalizeTerm(line.original_term || line.item_name);
  // A word the owner already merged shows under its learned name in Rates; their merge wins over any match here.
  if (term && learning[term]) return { line };
  const brand = line.brand ? null : findBrand(line.item_name);
  const catalog = findCatalogMaterial(line.item_name) ?? (brand?.material ? (CATALOG.find((c) => c.name === brand.material) ?? null) : null);
  const names = [line.item_name, brand?.rest, catalog?.name].filter((n): n is string => !!n && !!n.trim());
  const fits = (k: KnownMaterial) => noUnit(unit) || unitFactor(unit, k.unit) !== null;

  let target: { name: string; unit: string } | null = null;
  let best = 0;
  for (const k of known) {
    if (!fits(k)) continue;
    const score = Math.max(...names.map((n) => nameSimilarity(n, k.name)));
    // Ties go to the unit as read, then to the material bought most often.
    if (score > best || (score === best && score >= SURE && target && unitFactor(unit, k.unit) === 1 && unitFactor(unit, target.unit) !== 1)) {
      best = score;
      target = { name: k.name, unit: k.unit };
    }
  }
  if (best < SURE) target = null;
  if (!target && catalog) target = { name: catalog.name, unit: catalog.unit && (noUnit(unit) || unitFactor(unit, catalog.unit) !== null) ? catalog.unit : unit };
  if (!target) return { line: unit === line.unit ? line : { ...line, unit } };

  const next: T = { ...line, item_name: target.name, original_term: line.original_term || line.item_name };
  if (brand && !line.brand) next.brand = brand.brand;
  if (catalog?.spec && !line.spec) next.spec = catalog.spec(line.item_name);
  Object.assign(next, convert(next, unit, target.unit));
  const changed = normalizeTerm(next.item_name) !== normalizeTerm(line.item_name) || unitId(next.unit) !== unitId(line.unit);
  return changed ? { line: next, readAs: read } : { line: next };
}

/** The line in `to` (MT → kg: quantity × 1000, rate ÷ 1000; the total stays as billed), noting how it was billed. */
function convert<T extends MatchableLine>(line: T, from: string, to: string): T {
  const factor = noUnit(from) ? 1 : (unitFactor(from, to) ?? 1);
  if (factor === 1) return { ...line, unit: to };
  return {
    ...line,
    unit: to,
    quantity: round(line.quantity * factor, 3),
    unit_price: round(line.unit_price / factor, 2),
    // How it was billed, as with bundles of TMT billed in kg.
    ordered_as: [line.ordered_as, `${line.quantity} ${from}`].filter(Boolean).join('; '),
  };
}

/** Put back what a line was read as. */
export function unmatchLine<T extends MatchableLine>(line: T, read: ReadAs): T {
  return { ...line, ...read };
}

/** The material names Gemini is asked to reuse: the most bought in Rates, then the catalog's. */
export function namesForReading(known: KnownMaterial[], limit = 150): { name: string; unit: string }[] {
  const seen = new Set<string>();
  const out: { name: string; unit: string }[] = [];
  const add = (name: string, unit: string) => {
    const key = normalizeTerm(name);
    if (!key || seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push({ name, unit });
  };
  for (const k of [...known].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))) add(k.name, k.unit);
  for (const c of CATALOG) add(c.name, c.unit ?? '');
  return out;
}
