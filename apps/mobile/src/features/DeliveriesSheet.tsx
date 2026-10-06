import { Check } from 'lucide-react';
import { todayISO } from '@nirman/shared';
import { DeliveredToggle } from '../components/DeliveredToggle.tsx';
import { Sheet, SheetHeader } from '../components/ui/Sheet.tsx';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';

/** Tick which lines of a saved purchase list or BOQ (an order) have reached the site. */
export function DeliveriesSheet({ recordId, onClose }: { recordId: string; onClose(): void }) {
  const { history, actions } = useAppState();
  const record: HistoryRecord | undefined = history.find((h) => h.id === recordId);
  if (!record) return null;
  const pending = record.items.filter((i) => !i.delivered_at);

  return (
    <Sheet labelledBy="deliveries-title" size="lg" onClose={onClose} closeOnBackdrop className="p-5">
      <SheetHeader id="deliveries-title" title="Deliveries" subtitle={`${record.title}${record.address ? ` · ${record.address}` : ''}`} onClose={onClose} />
      <p className="text-xs text-gray-500 mt-2">
        Tick each line when it reaches the site.{record.kind === 'audit' ? ' Site reports can count only delivered material.' : ' See what is still to come on this order.'}
      </p>
      <ul className="mt-3 divide-y divide-gray-100 overflow-y-auto flex-1">
        {record.items.map((item) => (
          <li key={item.id} className="py-2 space-y-1">
            <div className="flex justify-between gap-2 text-sm">
              <span className="font-bold truncate">{item.item_name}</span>
              <span className="font-mono text-xs text-gray-500 shrink-0">
                {item.quantity} {item.unit}
              </span>
            </div>
            <DeliveredToggle name={item.item_name} deliveredAt={item.delivered_at} onChange={(date) => actions.setDelivered([item.id], date)} />
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <button
          onClick={() =>
            actions.setDelivered(
              pending.map((i) => i.id),
              todayISO(),
            )
          }
          className="mt-3 w-full py-3 bg-green-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2"
        >
          <Check size={14} /> Mark all {pending.length} delivered today
        </button>
      )}
    </Sheet>
  );
}
