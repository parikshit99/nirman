import { motion } from 'motion/react';
import { Eye, History, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { FilterChips } from '../components/FilterChips.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';

export function HistorySidebar({ onNewBoq }: { onNewBoq(): void }) {
  const { history } = useAppState();
  return (
    <div className="space-y-6">
      <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
        <h3 className="text-sm font-bold text-orange-900 flex items-center gap-2">
          <History size={16} /> Saved Sessions
        </h3>
        <p className="text-[11px] text-orange-700 mt-1">Manage and restore your past audits and Bills of Quantities.</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-center text-[11px] font-bold">
        <span>On this phone</span>
        <span>{history.length} Sessions</span>
      </div>
      <button
        onClick={onNewBoq}
        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={14} /> Create New BOQ
      </button>
    </div>
  );
}

interface Props {
  records: HistoryRecord[];
  categoryFilter: string;
  onCategory(c: string): void;
  addressFilter: string;
  onAddress(a: string): void;
  onEdit(record: HistoryRecord): void;
  onOpen(record: HistoryRecord): void;
  onQuotes(record: HistoryRecord): void;
}

export function HistoryView({ records, categoryFilter, onCategory, addressFilter, onAddress, onEdit, onOpen, onQuotes }: Props) {
  const { actions, categoryNames, uniqueAddresses, quotesFor } = useAppState();
  const dialogs = useDialogs();

  const remove = async (record: HistoryRecord) => {
    const ok = await dialogs.confirm(`Delete “${record.title}”?`, {
      message: `${record.items.length} items${quotesFor(record.id).length ? ` and ${quotesFor(record.id).length} vendor quotes` : ''} will be removed from this phone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await actions.deleteList(record.id);
  };

  return (
    <div className="space-y-6">
      <FilterChips
        categories={categoryNames}
        categoryFilter={categoryFilter}
        onCategory={onCategory}
        addresses={uniqueAddresses}
        addressFilter={addressFilter}
        onAddress={onAddress}
        addressLabel="Filter by Address"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {records.length === 0 ? (
          <div className="col-span-full p-20 flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl">
            <History size={48} strokeWidth={1} />
            <p className="mt-4 font-mono text-sm uppercase tracking-widest text-center">
              No matching sessions
              <br />
              <span className="text-[11px] normal-case italic">Check your filters or search terms</span>
            </p>
          </div>
        ) : (
          records.map((record) => (
            <motion.div
              key={record.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-orange-200 hover:shadow-lg transition-all group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-4">
                <button className="flex-1 min-w-0 text-left" onClick={() => onEdit(record)}>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 group-hover:text-orange-600 transition-colors uppercase tracking-tight truncate underline decoration-dotted decoration-gray-300 underline-offset-4">
                      {record.title}
                    </h3>
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[11px] font-bold rounded uppercase shrink-0">{record.category || 'Civil'}</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-bold rounded uppercase shrink-0">{record.kind === 'audit' ? 'Audit' : 'BOQ'}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <span className="text-[11px] font-mono text-gray-400">{new Date(record.created_at).toLocaleString('en-IN')}</span>
                    {record.address && <span className="text-[11px] text-gray-500 italic truncate">📍 {record.address}</span>}
                    <span className="text-[11px] font-bold text-gray-500 uppercase">{record.items.length} Items</span>
                  </div>
                </button>
                <div className="flex gap-1 items-center">
                  <button
                    onClick={() => onEdit(record)}
                    className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all flex items-center"
                    aria-label="Edit record info"
                  >
                    <Pencil size={14} />
                    <span className="text-[11px] font-bold uppercase ml-1">Edit</span>
                  </button>
                  <button onClick={() => remove(record)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" aria-label="Delete record">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-1 mb-4 max-h-20 overflow-hidden relative">
                {record.items.slice(0, 3).map((item) => (
                  <div key={item.id} className="text-[11px] text-gray-500 flex justify-between">
                    <span>• {item.item_name}</span>
                    <span className="font-mono">
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                ))}
                {record.items.length > 3 && <div className="text-[11px] text-gray-400 italic mt-1">+ {record.items.length - 3} more items...</div>}
                <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-white to-transparent" />
              </div>

              {record.notes && <div className="mb-4 text-[11px] text-gray-400 italic line-clamp-1 border-l border-gray-200 pl-2">"{record.notes}"</div>}

              <div className="flex gap-2">
                <button
                  onClick={() => onOpen(record)}
                  className="flex-1 py-2 bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Eye size={12} /> Open & Restore
                </button>
                {record.kind === 'boq' && (
                  <button
                    onClick={() => onQuotes(record)}
                    className="flex-1 py-2 bg-orange-50 text-orange-700 border border-orange-200 text-[11px] font-bold uppercase tracking-widest rounded-lg hover:bg-orange-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Truck size={12} /> Quotes ({quotesFor(record.id).length})
                  </button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
