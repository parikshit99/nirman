import { X } from 'lucide-react';
import type { MaterialFilter } from '@nirman/shared';

const FIELDS: { key: keyof MaterialFilter; label: string }[] = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'brand', label: 'Brand' },
  { key: 'spec', label: 'Size / spec' },
  { key: 'color', label: 'Color' },
];

/** Vendor, brand, size/spec and colour dropdowns; only those with something recorded are shown. */
export function MaterialFilters({
  value,
  options,
  onChange,
}: {
  value: MaterialFilter;
  options: Record<keyof MaterialFilter, string[]>;
  onChange(next: MaterialFilter): void;
}) {
  const shown = FIELDS.filter((f) => options[f.key].length > 0 || value[f.key]);
  if (shown.length === 0) return null;
  const active = FIELDS.some((f) => value[f.key]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {shown.map(({ key, label }) => (
          <label key={key} className="block min-w-0">
            <span className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold">{label}</span>
            <select
              aria-label={`Filter by ${label.toLowerCase()}`}
              value={value[key] ?? ''}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              className={`w-full px-2 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-orange-400 truncate
                ${value[key] ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-white border-gray-200 text-gray-600'}`}
            >
              <option value="">Any</option>
              {[...new Set([...(value[key] ? [value[key]!] : []), ...options[key]])].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {active && (
        <button onClick={() => onChange({})} className="flex items-center gap-1 text-xs font-bold text-orange-700">
          <X size={12} /> Clear vendor / brand / size / color filters
        </button>
      )}
    </div>
  );
}
