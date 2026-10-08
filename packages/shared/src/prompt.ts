import {
  extractedMaterialSchema,
  extractedQuoteLineSchema,
  type ExtractedMaterial,
  type ExtractedQuoteLine,
  type LearningMap,
  type QuoteBoqItem,
} from './schemas.ts';
import { variantOf } from './domain.ts';
import { DEFAULT_CONVERSIONS, toBilledUnits, type ConversionSettings } from './conversions.ts';

export interface PromptOptions {
  learning?: LearningMap;
  /** Names already used for materials, so the same thing gets the same name every time. */
  materials?: { name: string; unit: string }[];
  category?: string;
  /** YYYY-MM-DD used when the source has no date. */
  captureDate: string;
}

export function buildSystemInstruction({ learning, materials, category, captureDate }: PromptOptions): string {
  const categoryContext = category
    ? `\n\nWORK CATEGORY CONTEXT: The materials are for a "${category}" task. Please interpret generic terms accordingly. For example, if task is "Electrical", "tape" means "PVC Electrical Tape". If "Plumbing", it means "Teflon Tape". If "Painter", it means "Masking Tape". Make sure to include the specific type in the item_name based on this category.`
    : '';

  return `
    You are an expert Construction Material Auditor.
    Task: Extract purchase data from construction-related text or images (often handwritten notes).
    You may be provided with multiple images forming a single document or multiple related notes.

    Processing Rules:
    1. Language: Automatically translate Hindi/Hinglish terms to professional English (e.g., 'Eent' -> 'Bricks', 'Reti' -> 'Sand').
    2. Units: Use standard professional abbreviations (Bag, kg, Rft, sqft, piece, MT).
    3. Literal Extraction: The "original_term" field MUST be the exact word found in the source text.
    4. Data Cleaning: Strip currency symbols (₹, Rs) and ensure numbers are clean floats.
    5. Context: Use ${captureDate} as the default date if not found. Dates must be YYYY-MM-DD.
    6. Brand, model, spec, color: fill each only if the source shows it, else "". brand = maker
       (Jaquar, Havells, Polycab, UltraTech); model = model number or item code (e.g. "CON-WHT-101");
       spec = size, thickness, grade or rating (e.g. "2.5 sq mm", "53 grade", "6A", "15 mm"); color as written.
       Keep item_name generic and without these (e.g. item_name "Wash basin", brand "Jaquar").
    7. Ordered in one unit, billed in another:
       - TMT / steel bars (saria): put the diameter in spec (e.g. "12 mm"). If a weight in kg (or MT) is written,
         use it as quantity with unit "kg" and write how it was ordered in ordered_as (e.g. "3 bundles + 4 bars").
         If only bundles or bars are written, give that count as quantity with unit "bundle" or "bar".
       - Tiles and ACP sheets: put the size in mm in spec as "600x1200". If sqft is written, quantity is the sqft with
         unit "sqft"; if only a count of pieces is written, give it with unit "piece".
       - Otherwise leave ordered_as "".
    ${learningContext(learning)}
    ${materialsContext(materials)}
    ${categoryContext}

    IMPORTANT: Return a JSON array of objects conforming to the provided schema.
  `;
}

export const IMAGE_INSTRUCTION =
  'Extract every material item and quantity from all these images. Combine findings into a single list. Be precise with handwritten numbers across all pages.';
export const TEXT_INSTRUCTION = 'Extract material items from the text provided.';

/** JSON-quoted, so a term like 12" pipe (inches) or a stray newline can't break the rule line. */
const quote = (text: string) => JSON.stringify(text);

function learningContext(learning?: LearningMap): string {
  const entries = Object.entries(learning ?? {});
  return entries.length > 0
    ? `\n\nUSER PREFERENCES (Follow these rules strictly based on user's past corrections):
       ${entries.map(([term, pref]) => `- When you see ${quote(term)}, always use name: ${quote(pref.item_name)} and unit: ${quote(pref.unit)}`).join('\n')}`
    : '';
}

function materialsContext(materials?: { name: string; unit: string }[]): string {
  return materials?.length
    ? `\n\nKNOWN MATERIALS (name | unit): when an item is one of these (another spelling, a short form or a brand of it),
       use exactly this item_name, and its unit where the bill's unit is of the same kind. Otherwise name it as usual.
       ${materials.map((m) => `- ${quote(m.name)}${m.unit ? ` | ${quote(m.unit)}` : ''}`).join('\n')}`
    : '';
}

/**
 * Instructions for reading a vendor's quote (usually their own handwritten list,
 * not our BOQ sheet) and matching each line to the BOQ it answers.
 */
export function buildQuoteInstruction({ boq, learning }: { boq: QuoteBoqItem[]; learning?: LearningMap }): string {
  const boqList = boq.map((b) => `${b.sr}. ${b.item_name}${b.variant ? ` (${b.variant})` : ''} | qty ${b.quantity} ${b.unit}`).join('\n');
  return `
    You are an expert Construction Material Auditor in India.
    We sent a vendor the Bill of Quantities (BOQ) below and asked for rates. The vendor replied with
    their own list instead (often handwritten, in their own words, order and units). Read their reply
    and match every line to the BOQ item it prices.

    BOQ (Sr. | item (brand · model · size/spec · colour, where asked) | quantity and unit):
    ${boqList}

    Rules:
    1. Return one object per line the vendor wrote. Do not add lines that are not in their reply.
    2. boq_sr: the Sr. number of the BOQ item this line prices. Match by meaning, not spelling: Hindi/Hinglish
       ('sariya' = TMT steel bar, 'reti' = sand, 'eent' = bricks), brand names (ACC, UltraTech = cement),
       sizes and grades must agree. Use null if the line is not in the BOQ. Never match two lines to the
       same Sr. unless the vendor clearly split one item. A different brand, model or colour still matches
       the item it prices.
    8. brand, model, spec, color: what the vendor wrote for this line, each "" if not written
       (spec = size, thickness, grade or rating). Do not copy them from the BOQ.
    3. original_term: the vendor's own words for the item, exactly as written.
    4. item_name: a clean professional English name for what the vendor quoted.
    5. quantity, unit, unit_price: as the vendor wrote them. Keep the vendor's unit even if it differs
       from the BOQ. Never invent or convert a price; use 0 if no rate is written. Strip ₹/Rs.
    6. total_amount: the vendor's line total if written, else 0.
    7. note: a few words when something needs checking, e.g. "unit differs: quoted per kg, BOQ in MT",
       "rate unclear". Empty otherwise.
    ${learningContext(learning)}

    IMPORTANT: Return a JSON array of objects conforming to the provided schema.
  `;
}

export const QUOTE_IMAGE_INSTRUCTION =
  "Read every line of the vendor's quote across all these images and match each line to the BOQ. Be precise with handwritten numbers.";
export const QUOTE_TEXT_INSTRUCTION = "Read every line of the vendor's quote in the text provided and match each line to the BOQ.";

function parseJsonArray(text: string): unknown[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const match = text.match(/\[.*\]/s);
    if (!match) return [];
    try {
      raw = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

/**
 * Parse the model's quote output. Drops empty lines and turns Sr. numbers that
 * are not in the BOQ (1..boqSize) into null.
 */
export function parseQuoteOutput(text: string, boqSize: number): ExtractedQuoteLine[] {
  const lines: ExtractedQuoteLine[] = [];
  for (const entry of parseJsonArray(text)) {
    const parsed = extractedQuoteLineSchema.safeParse(entry);
    if (!parsed.success) continue;
    const l = parsed.data;
    if (!l.item_name.trim() && !l.original_term.trim()) continue;
    const sr = l.boq_sr !== null && l.boq_sr >= 1 && l.boq_sr <= boqSize ? l.boq_sr : null;
    lines.push({
      ...l,
      boq_sr: sr,
      item_name: l.item_name.trim() || l.original_term.trim(),
      unit: l.unit.trim() || 'unit',
      total_amount: l.total_amount || l.quantity * l.unit_price,
      ...variantOf(l),
    });
  }
  return lines;
}

/**
 * Parse the model's JSON output into clean material rows. Tolerates stray text
 * around the array, fills in missing fields and computes missing totals.
 */
export function parseExtractionOutput(text: string, conversions: ConversionSettings = DEFAULT_CONVERSIONS): ExtractedMaterial[] {
  const items: ExtractedMaterial[] = [];
  for (const entry of parseJsonArray(text)) {
    const item = extractedMaterialSchema.safeParse(entry);
    if (!item.success || !item.data.item_name.trim()) continue;
    const m = item.data;
    // TMT read in bundles becomes kg, tiles / ACP read in pieces become sqft, so rates compare.
    items.push(
      toBilledUnits(
        {
          ...m,
          unit: m.unit || 'unit',
          total_amount: m.total_amount || m.quantity * m.unit_price,
          ...variantOf(m),
        },
        conversions,
      ),
    );
  }
  return items;
}
