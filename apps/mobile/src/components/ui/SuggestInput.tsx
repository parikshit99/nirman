import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

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

/**
 * A text field with suggestions listed under it, in the page rather than over it, so the field stays in view
 * while typing (Android's own suggestion popup for `<datalist>` covers the field and the fields around it).
 */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  onFocus,
  onBlur,
  onKeyDown,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> & {
  value: string;
  onChange(value: string): void;
  suggestions: readonly Suggestion[];
}) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false); // after picking one or Escape, until the next key
  const listRef = useRef<HTMLDivElement>(null);
  const shown = focused && !hidden ? matchSuggestions(suggestions, value) : [];
  const open = shown.length > 0;

  useEffect(() => {
    if (open) listRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);

  return (
    <>
      <input
        {...input}
        value={value}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        onChange={(e) => {
          setHidden(false);
          onChange(e.target.value);
        }}
        onFocus={(e) => {
          setFocused(true);
          setHidden(false);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setHidden(true);
          }
          onKeyDown?.(e);
        }}
      />
      {open && (
        <div ref={listRef} role="listbox" aria-label="Suggestions" className="mt-1 bg-white border border-gray-200 rounded-lg divide-y divide-gray-200 overflow-hidden shadow-sm">
          {shown.map((s) => (
            <button
              key={s.value}
              type="button"
              role="option"
              aria-selected={false}
              // Keep the keyboard open: picking must not take the focus away from the field first.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.value);
                setHidden(true);
              }}
              className="w-full min-h-10 px-3 py-2 text-left text-sm text-gray-800 hover:bg-orange-50 active:bg-orange-50 flex items-baseline justify-between gap-2"
            >
              <span className="min-w-0 break-words">{s.value}</span>
              {s.hint && <span className="shrink-0 text-xs text-gray-500">{s.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
