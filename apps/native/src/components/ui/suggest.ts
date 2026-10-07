export type Suggestion = string | { value: string; hint?: string };

const MAX_SHOWN = 6;

/** The suggestions to show for what has been typed: names starting with it first, then names containing it. */
export function matchSuggestions(suggestions: readonly Suggestion[], typed: string, max = MAX_SHOWN): { value: string; hint?: string }[] {
  const q = typed.trim().toLowerCase();
  const seen = new Set<string>();
  const starts: { value: string; hint?: string }[] = [];
  const contains: { value: string; hint?: string }[] = [];
  for (const s of suggestions) {
    const item = typeof s === 'string' ? { value: s } : s;
    const key = item.value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!q || key.startsWith(q)) starts.push(item);
    else if (key.includes(q)) contains.push(item);
  }
  const shown = [...starts, ...contains];
  // Nothing to suggest when the field already holds the only match.
  if (shown.length === 1 && shown[0].value.trim().toLowerCase() === q) return [];
  return shown.slice(0, max);
}
