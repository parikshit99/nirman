import { VARIANT_FIELDS, type Variant, type VariantField } from '@nirman/shared';

const LABELS: Record<VariantField, { label: string; placeholder: string }> = {
  brand: { label: 'Brand', placeholder: 'e.g. Jaquar' },
  model: { label: 'Model / code', placeholder: 'e.g. CNS-WHT-101' },
  spec: { label: 'Size / spec', placeholder: 'e.g. 2.5 sq mm, 6A' },
  color: { label: 'Color', placeholder: 'e.g. White' },
};

/** Brand, model / item code, size/spec and colour, all optional, in a 2×2 grid. */
export function VariantFields({
  value,
  onChange,
  inputClassName,
  disabled,
}: {
  value: Partial<Variant>;
  onChange(field: VariantField, value: string): void;
  inputClassName: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {VARIANT_FIELDS.map((f) => (
        <label key={f} className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">{LABELS[f].label}</span>
          <input
            aria-label={LABELS[f].label}
            className={inputClassName}
            value={value[f] ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(f, e.target.value)}
            placeholder={LABELS[f].placeholder}
          />
        </label>
      ))}
    </div>
  );
}
