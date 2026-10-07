import { applyLearning, nameSimilarity } from './domain.ts';
import type { ExtractedMaterial, LearningMap, QuoteLineInput } from './schemas.ts';

// ---------------------------------------------------------------------------
// Matching a vendor's quote to the BOQ on the phone, without Gemini.
// ---------------------------------------------------------------------------

/** "12mm" and "12 mm" are the same size: split numbers from the letters around them before comparing. */
const spaced = (name: string) => name.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2');
const alike = (a: string, b: string) => nameSimilarity(spaced(a), spaced(b));

/** A line at least this alike a BOQ item (`nameSimilarity`: shared words, sizes and codes must agree) is taken as a quote for it. */
export const MATCH_THRESHOLD = 0.5;

/**
 * Pair each quote line read on the phone with at most one BOQ item, best matches first, and each BOQ item
 * with at most one line. Unmatched lines keep `boq_sr: null`, to be matched by hand when reviewing.
 */
export function matchQuoteLines(
  boq: { sr: number; item_name: string; original_term?: string }[],
  read: ExtractedMaterial[],
  learning: LearningMap,
): { lines: QuoteLineInput[]; matched: number } {
  const names = read.map((l) => applyLearning(learning, l).item_name);
  const pairs: { line: number; sr: number; score: number }[] = [];
  for (const [line, name] of names.entries()) {
    for (const b of boq) {
      const score = Math.max(alike(name, b.item_name), b.original_term ? alike(name, b.original_term) : 0);
      if (score >= MATCH_THRESHOLD) pairs.push({ line, sr: b.sr, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.line - y.line);
  const srOf = new Map<number, number>();
  const taken = new Set<number>();
  for (const p of pairs) {
    if (srOf.has(p.line) || taken.has(p.sr)) continue;
    srOf.set(p.line, p.sr);
    taken.add(p.sr);
  }
  const lines: QuoteLineInput[] = read.map((l, i) => ({
    boq_sr: srOf.get(i) ?? null,
    original_term: l.original_term || l.item_name,
    item_name: names[i],
    quantity: l.quantity,
    unit: l.unit,
    unit_price: l.unit_price,
    total_amount: l.total_amount,
    note: '',
    brand: l.brand,
    model: l.model,
    spec: l.spec,
    color: l.color,
  }));
  return { lines, matched: srOf.size };
}
