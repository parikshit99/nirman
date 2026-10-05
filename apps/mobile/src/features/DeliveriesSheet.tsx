import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { todayISO } from '@nirman/shared';
import { DeliveredToggle } from '../components/DeliveredToggle.tsx';
import { useBackHandler } from '../lib/backButton.ts';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';

/** Tick which lines of a saved purchase session have reached the site. */
export function DeliveriesSheet({ recordId, onClose }: { recordId: string; onClose(): void }) {
  const { history, actions } = useAppState();
  useBackHandler(onClose);
  const record: HistoryRecord | undefined = history.find((h) => h.id === recordId);
  if (!record) return null;
  const pending = record.items.filter((i) => !i.delivered_at);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deliveries-title"
        className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h3 id="deliveries-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm">
              Deliveries
            </h3>
            <p className="text-[11px] text-gray-500 truncate">
              {record.title}
              {record.address && ` · ${record.address}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Tick each line when it reaches the site. Site reports can count only delivered material.</p>
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
            onClick={() => actions.setDelivered(pending.map((i) => i.id), todayISO())}
            className="mt-3 w-full py-3 bg-green-700 text-white text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2"
          >
            <Check size={14} /> Mark all {pending.length} delivered today
          </button>
        )}
      </div>
    </motion.div>
  );
}
