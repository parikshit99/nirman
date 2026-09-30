import { z } from 'zod';
import { extractedMaterialSchema, type ExtractedMaterial, type LearningMap } from './schemas.ts';

export interface PromptOptions {
  learning?: LearningMap;
  category?: string;
  /** YYYY-MM-DD used when the source has no date. */
  captureDate: string;
}

export function buildSystemInstruction({ learning, category, captureDate }: PromptOptions): string {
  const learningEntries = Object.entries(learning ?? {});
  const learningContext = learningEntries.length > 0
    ? `\n\nUSER PREFERENCES (Follow these rules strictly based on user's past corrections):
       ${learningEntries.map(([term, pref]) => `- When you see "${term}", always use name: "${pref.item_name}" and unit: "${pref.unit}"`).join('\n')}`
    : '';

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
    ${learningContext}
    ${categoryContext}

    IMPORTANT: Return a JSON array of objects conforming to the provided schema.
  `;
}

export const IMAGE_INSTRUCTION =
  'Extract every material item and quantity from all these images. Combine findings into a single list. Be precise with handwritten numbers across all pages.';
export const TEXT_INSTRUCTION = 'Extract material items from the text provided.';

/**
 * Parse the model's JSON output into clean material rows. Tolerates stray text
 * around the array, fills in missing fields and computes missing totals.
 */
export function parseExtractionOutput(text: string): ExtractedMaterial[] {
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
  const parsed = z.array(z.unknown()).safeParse(raw);
  if (!parsed.success) return [];

  const items: ExtractedMaterial[] = [];
  for (const entry of parsed.data) {
    const item = extractedMaterialSchema.safeParse(entry);
    if (!item.success || !item.data.item_name.trim()) continue;
    const m = item.data;
    items.push({
      ...m,
      unit: m.unit || 'unit',
      total_amount: m.total_amount || m.quantity * m.unit_price,
    });
  }
  return items;
}
