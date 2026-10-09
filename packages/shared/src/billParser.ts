import { toBilledUnits, DEFAULT_CONVERSIONS, type ConversionSettings } from './conversions.ts';
import { applyLearning } from './domain.ts';
import type { ExtractedMaterial, LearningMap } from './schemas.ts';

// ---------------------------------------------------------------------------
// Reading bills on the phone, without the AI: rows of text (from the phone's
// text recognition, or typed) become purchase lines. Good for printed bills
// and typed lists; the result carries a confidence so unclear bills can go to
// Gemini instead.
// ---------------------------------------------------------------------------

/** A piece of recognised text and where it sits on the photo (pixels). */
export interface TextBox {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Put recognised pieces back into the rows of the bill: pieces whose vertical
 * middles fall within each other's height are one row, read left to right.
 */
export function boxesToRows(boxes: TextBox[]): string[] {
  const sorted = boxes.filter((b) => b.text.trim()).sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
  const rows: TextBox[][] = [];
  for (const box of sorted) {
    const mid = (box.top + box.bottom) / 2;
    const row = rows.find((r) => {
      const ref = r[0];
      const h = Math.max(ref.bottom - ref.top, box.bottom - box.top);
      return Math.abs((ref.top + ref.bottom) / 2 - mid) <= h * 0.5;
    });
    if (row) row.push(box);
    else rows.push([box]);
  }
  return rows.map((r) => r.sort((a, b) => a.left - b.left).map((b) => b.text.trim()).join('  '));
}

/** Units as written on bills, and the unit they are stored as. */
export const UNITS: Record<string, string> = {
  bag: 'Bag', bags: 'Bag', bori: 'Bag', katta: 'Bag', kattas: 'Bag',
  kg: 'kg', kgs: 'kg', kilo: 'kg',
  mt: 'MT', ton: 'MT', tons: 'MT', tonne: 'MT', qtl: 'Quintal', quintal: 'Quintal',
  nos: 'nos', no: 'nos', pcs: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs', pkt: 'packet', packet: 'packet',
  sqft: 'sqft', sft: 'sqft', 'sq.ft': 'sqft', sqm: 'sqm', rft: 'rft', cft: 'cft', cum: 'cum', brass: 'brass',
  ltr: 'litre', ltrs: 'litre', litre: 'litre', liter: 'litre', l: 'litre', ml: 'ml',
  mtr: 'm', mtrs: 'm', meter: 'm', metre: 'm', m: 'm', ft: 'ft', feet: 'ft',
  box: 'box', boxes: 'box', bundle: 'bundle', bundles: 'bundle', coil: 'coil', coils: 'coil', roll: 'roll', rolls: 'roll',
  set: 'set', sets: 'set', pair: 'pair', pairs: 'pair', trolley: 'trolley', tractor: 'trolley', dozen: 'dozen', doz: 'dozen',
  sheet: 'sheet', sheets: 'sheet', length: 'length', lengths: 'length',
};

/** Rows that are about the bill, not an item on it. */
const NOT_ITEM = /\b(total|sub ?total|grand|gst|cgst|sgst|igst|tax|invoice|bill\s*no|gstin|phone|mob(ile)?|ph\.?|address|thank|rupees|amount in words|round(ed)? ?off|discount|freight|cartage|balance|paid|signature|e\.?\s*&\s*o\.?\s*e|state|code|hsn\/sac|terms|bank|ifsc|a\/c|date)\b/i;
const TOTAL = /\b(grand\s*total|net\s*(amount|total)|total(\s*amount)?)\b/i;
const VENDORISH = /\b(traders?|trading|enterprises?|hardware|stores?|agenc(y|ies)|electricals?|electronics|sanitary|steels?|cement|suppliers?|sons|brothers|bros|& co|company|marbles?|tiles|paints?|timber|plywood|building material|depot|mart|centre|center)\b/i;

const NUMBER = /(?<![\w.])\d{1,3}(?:,\d{2,3})+(?:\.\d+)?(?![\w])|(?<![\w.])\d+(?:\.\d+)?(?![\w])/g;
const toNum = (s: string) => Number(s.replace(/,/g, ''));
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.015);

export interface BillLine {
  item: ExtractedMaterial;
  /** 0–1: 1 when quantity × rate = amount on the bill. */
  confidence: number;
}

export interface BillReading {
  lines: BillLine[];
  vendor: string;
  date: string;
  /** Total printed on the bill, if found. */
  billTotal: number;
  /** 0–1 for the whole bill: are the lines and the total consistent? */
  confidence: number;
}

/** A date written on the bill (13/09/2026, 13-9-26, 13.09.2026) as YYYY-MM-DD. */
export function findDate(rows: string[]): string {
  for (const row of rows) {
    const m = row.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
    if (!m) continue;
    const [d, mo] = [Number(m[1]), Number(m[2])];
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

function findVendor(rows: string[]): string {
  // The shop's name is near the top and is not itself an item line.
  const top = rows.slice(0, 5).map((r) => r.replace(/\s{2,}/g, ' ').trim()).filter((r) => !parseRow(r));
  const named = top.find((r) => VENDORISH.test(r) && !/\d{5,}/.test(r));
  if (named) return named.replace(/^(m\/s\.?|messrs\.?)\s*/i, '').slice(0, 80);
  const plain = top.find((r) => /^[A-Za-z][A-Za-z .&'-]{3,40}$/.test(r) && !NOT_ITEM.test(r) && !/(tax|cash|credit|estimate|quotation|bill|memo)/i.test(r));
  return plain ?? '';
}

const tidyName = (s: string) =>
  s
    .replace(/^\s*(\d{1,3}[.)]|\d{1,3}\s+(?=[A-Za-z]))\s*/, '')
    .replace(/[|:;*_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** One row of a bill or a typed list as a purchase line, or null when it isn't one. */
export function parseRow(row: string): BillLine | null {
  const text = row.replace(/[₹]|rs\.?(?=\s*\d)/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!text || NOT_ITEM.test(text)) return null;
  // The name runs up to the numbers at the end of the row (quantity, unit, rate, amount, codes).
  const tokens = text.split(' ');
  const isTail = (t: string) => {
    const w = t.toLowerCase().replace(/[.,]$/, '');
    return /^[\d,.]+$/.test(w) || !!UNITS[w] || /^(@|x|×|rs|\/-|-|=)$/.test(w) || (/^[\d.]+([a-z]{1,7})$/.test(w) && !!UNITS[w.replace(/^[\d.]+/, '')]);
  };
  let start = tokens.length;
  while (start > 0 && isTail(tokens[start - 1])) start--;
  // "bori 50 380": a unit word can also be the item's name.
  if (start === 0 && /[a-z]{2,}/i.test(tokens[0])) start = 1;
  if (start === tokens.length || start === 0) return null;
  const name = tidyName(tokens.slice(0, start).join(' '));
  if (!/[a-z]{2,}/i.test(name)) return null;
  const rest = ' ' + tokens.slice(start).join(' ');

  // Unit: a known word next to a number ("50 bags", "12kg").
  let unit = '';
  const unitMatch = rest.match(/\d\s*([a-z][a-z.]{0,6})\b/gi);
  for (const m of unitMatch ?? []) {
    const word = m.replace(/^[\d\s]+/, '').toLowerCase().replace(/\.$/, '');
    if (UNITS[word]) {
      unit = UNITS[word];
      break;
    }
  }
  // Long codes (HSN, phone) are not quantities or prices.
  const numbers = (rest.match(NUMBER) ?? []).map(toNum).filter((n) => n > 0 && !(Number.isInteger(n) && n >= 1000 && String(n).length >= 6));
  if (!numbers.length) return null;

  let quantity = 0;
  let rate = 0;
  let amount = 0;
  let confidence = 0.3;
  // Look for quantity × rate = amount among the numbers, in order.
  search: for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      for (let k = j + 1; k < numbers.length; k++) {
        if (close(numbers[i] * numbers[j], numbers[k])) {
          [quantity, rate, amount] = [numbers[i], numbers[j], numbers[k]];
          confidence = 1;
          break search;
        }
      }
    }
  }
  if (!confidence || confidence < 1) {
    if (numbers.length >= 2) {
      // "Cement 50 bags 380": quantity then rate; "@" also marks the rate.
      [quantity, rate] = [numbers[0], numbers[1]];
      amount = quantity * rate;
      confidence = unit ? 0.6 : 0.45;
    } else {
      quantity = numbers[0];
      confidence = unit ? 0.55 : 0.35;
    }
  }
  return {
    item: {
      item_name: name,
      original_term: name,
      quantity,
      unit: unit || 'unit',
      unit_price: rate,
      total_amount: amount,
      vendor: '',
      date: '',
      brand: '',
      model: '',
      spec: '',
      color: '',
      ordered_as: '',
    },
    confidence,
  };
}

/**
 * Read a bill or a typed list: lines with quantities and rates, the vendor and
 * date, and how sure the reading is. Learned corrections rename items, and TMT
 * bundles / tile pieces become kg / sqft as with the AI.
 */
export function parseBill(
  rows: string[],
  opts: { learning?: LearningMap; captureDate?: string; conversions?: ConversionSettings } = {},
): BillReading {
  const vendor = findVendor(rows);
  const date = findDate(rows) || opts.captureDate || '';
  let billTotal = 0;
  const lines: BillLine[] = [];
  for (const row of rows) {
    if (TOTAL.test(row)) {
      const nums = (row.match(NUMBER) ?? []).map(toNum);
      if (nums.length) billTotal = Math.max(billTotal, ...nums);
      continue;
    }
    if (vendor && row.includes(vendor)) continue;
    const line = parseRow(row);
    if (line) lines.push(line);
  }
  for (const line of lines) {
    const learned = applyLearning(opts.learning ?? {}, line.item);
    const known = learned.item_name !== line.item.item_name;
    line.item = toBilledUnits(
      { ...line.item, item_name: learned.item_name, unit: known || line.item.unit === 'unit' ? learned.unit : line.item.unit, vendor, date },
      opts.conversions ?? DEFAULT_CONVERSIONS,
    );
  }
  const sum = lines.reduce((a, l) => a + l.item.total_amount, 0);
  let confidence = lines.length ? lines.reduce((a, l) => a + l.confidence, 0) / lines.length : 0;
  // A printed total that matches the lines (with or without tax) is strong evidence.
  if (billTotal && lines.length && (close(sum, billTotal) || (sum < billTotal && sum > billTotal / 1.3))) confidence = Math.min(1, confidence + 0.2);
  else if (billTotal && sum > billTotal * 1.05) confidence *= 0.6;
  return { lines, vendor, date, billTotal, confidence: Math.round(confidence * 100) / 100 };
}
