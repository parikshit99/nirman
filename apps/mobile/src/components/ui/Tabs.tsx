/** A row of tabs or filter options, one selected (the grey pill bar used by the main tabs). */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange(id: T): void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex bg-gray-100 p-1 rounded-lg border border-gray-200 ${className}`}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
            value === o.id ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
