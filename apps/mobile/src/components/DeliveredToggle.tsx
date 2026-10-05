import { CheckSquare, Square, X } from 'lucide-react';
import { todayISO } from '@nirman/shared';

/** Tick a purchase line as delivered to site (today by default, date editable), or untick it. */
export function DeliveredToggle({ name, deliveredAt, onChange }: { name: string; deliveredAt: string; onChange(date: string): void }) {
  if (!deliveredAt) {
    return (
      <button
        onClick={() => onChange(todayISO())}
        className="flex items-center gap-1 text-xs font-bold text-gray-500 px-2 py-0.5 rounded border border-gray-200 hover:border-green-400 hover:text-green-700"
        aria-label={`Mark ${name} delivered`}
      >
        <Square size={12} /> Not delivered
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 pl-2 rounded border border-green-200">
      <CheckSquare size={12} /> Delivered
      <input
        type="date"
        aria-label={`Delivery date of ${name}`}
        value={deliveredAt}
        max={todayISO()}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="bg-transparent font-mono text-xs outline-none w-[7.5rem]"
      />
      <button onClick={() => onChange('')} className="px-1.5 py-0.5 text-green-800 hover:text-red-600" aria-label={`Mark ${name} not delivered`}>
        <X size={12} />
      </button>
    </span>
  );
}
