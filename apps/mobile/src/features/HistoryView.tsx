import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, CheckSquare, ClipboardList, Eye, History, Pencil, Plus, RotateCcw, Trash2, Truck } from 'lucide-react';
import { BillPhotosSheet, photoIdsOf } from '../components/BillPhotos.tsx';
import { FilterChips } from '../components/FilterChips.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';
import { Button } from '../components/ui/Button.tsx';

export function HistorySidebar({ onNewBoq, onSiteReport }: { onNewBoq(): void; onSiteReport(): void }) {
  const { history, contracts } = useAppState();
  const hasPurchases = history.some((h) => h.kind === 'audit' && h.address) || contracts.some((c) => c.address);
  return (
    <div className="space-y-3 lg:space-y-6">
      <div className="hidden lg:block p-4 bg-orange-50 border border-orange-100 rounded-xl">
        <h3 className="text-sm font-bold text-orange-900 flex items-center gap-2">
          <History size={16} /> Saved lists
        </h3>
        <p className="text-xs text-orange-700 mt-1">Manage and restore your past purchase lists and Bills of Quantities.</p>
      </div>
      <div className="hidden lg:flex p-3 bg-gray-50 rounded-lg border border-gray-100 justify-between items-center text-xs font-bold">
        <span>On this phone</span>
        <span>{history.length} {history.length === 1 ? 'list' : 'lists'}</span>
      </div>
      <div className={`grid gap-2 ${hasPurchases ? 'grid-cols-2 lg:grid-cols-1' : 'grid-cols-1'}`}>
        <Button variant="secondary" block onClick={onNewBoq}>
          <Plus size={14} /> New BOQ
        </Button>
        {hasPurchases && (
          <Button variant="secondary" block onClick={onSiteReport}>
            <ClipboardList size={14} /> Site report
          </Button>
        )}
      </div>
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
  onDeliveries(record: HistoryRecord): void;
  onBuyAgain(record: HistoryRecord): void;
  onDeleteAll(): void;
}

export function HistoryView({ records, categoryFilter, onCategory, addressFilter, onAddress, onEdit, onOpen, onQuotes, onDeliveries, onBuyAgain, onDeleteAll }: Props) {
  const { categoryNames, uniqueAddresses, quotesFor, history } = useAppState();
  const [photosOf, setPhotosOf] = useState<HistoryRecord | null>(null);

  return (
    <div className="space-y-6">
      {history.length > 0 && (
        <FilterChips
          categories={categoryNames}
          categoryFilter={categoryFilter}
          onCategory={onCategory}
          addresses={uniqueAddresses}
          addressFilter={addressFilter}
          onAddress={onAddress}
          addressLabel="Filter by Address"
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {records.length === 0 ? (
          <EmptyState icon={History} title={history.length ? 'No saved lists match.' : 'Nothing saved yet.'} className="col-span-full">
            {history.length ? 'Check the filters or search.' : 'Lists you save from Purchases or BOQ (the Save button) appear here.'}
          </EmptyState>
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
                  <h3 className="font-bold text-gray-900 group-hover:text-orange-600 transition-colors uppercase tracking-tight break-words underline decoration-dotted decoration-gray-300 underline-offset-4">
                    {record.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded uppercase shrink-0">{record.category || 'Civil'}</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded uppercase shrink-0">{record.kind === 'audit' ? 'Purchases' : 'BOQ'}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <span className="text-xs font-mono text-gray-500">{new Date(record.created_at).toLocaleString('en-IN')}</span>
                    {record.address && <span className="text-xs text-gray-500 italic truncate">📍 {record.address}</span>}
                    <span className="text-xs font-bold text-gray-500 uppercase">
                      {record.items.length} {record.items.length === 1 ? 'item' : 'items'}
                      {record.items.length > 0 && (
                        <span className={record.items.every((i) => i.delivered_at) ? 'text-green-700' : ''}>
                          {' · '}
                          {record.items.filter((i) => i.delivered_at).length} of {record.items.length} delivered
                        </span>
                      )}
                    </span>
                  </div>
                </button>
                {/* Delete is in the details sheet, next to Update, so it isn't tapped by accident. */}
                <button
                  onClick={() => onEdit(record)}
                  className="p-2.5 -m-1.5 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all flex items-center"
                  aria-label={`Edit details of ${record.title}`}
                >
                  <Pencil size={14} />
                  <span className="text-xs font-bold uppercase ml-1">Edit</span>
                </button>
              </div>

              <div className="space-y-1 mb-4 max-h-20 overflow-hidden relative">
                {record.items.slice(0, 3).map((item) => (
                  <div key={item.id} className="text-xs text-gray-500 flex justify-between">
                    <span>• {item.item_name}</span>
                    <span className="font-mono">
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                ))}
                {record.items.length > 3 && <div className="text-xs text-gray-500 italic mt-1">+ {record.items.length - 3} more items...</div>}
                <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-white to-transparent" />
              </div>

              {record.notes && <div className="mb-4 text-xs text-gray-500 italic line-clamp-1 border-l border-gray-200 pl-2">"{record.notes}"</div>}

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" className="flex-1" onClick={() => onOpen(record)}>
                  <Eye size={12} /> Open
                </Button>
                {record.items.length > 0 && (
                  <Button size="sm" className="flex-1" onClick={() => onDeliveries(record)} aria-label={`Mark delivered: ${record.title}`}>
                    <CheckSquare size={12} className="text-green-700" /> Delivered
                  </Button>
                )}
                {record.kind === 'boq' && (
                  <Button size="sm" className="flex-1" onClick={() => onQuotes(record)}>
                    <Truck size={12} className="text-orange-600" /> Quotes ({quotesFor(record.id).length})
                  </Button>
                )}
                {record.kind === 'audit' && record.items.length > 0 && (
                  <Button size="sm" onClick={() => onBuyAgain(record)} aria-label={`Buy again: ${record.title}`}>
                    <RotateCcw size={12} /> Again
                  </Button>
                )}
                {photoIdsOf(record.items).length > 0 && (
                  <Button size="sm" onClick={() => setPhotosOf(record)} aria-label={`Bill photos of ${record.title}`}>
                    <Camera size={12} /> Bills ({photoIdsOf(record.items).length})
                  </Button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
      {history.length > 1 && (
        <div className="flex justify-center pt-2">
          <Button variant="dangerOutline" size="sm" onClick={onDeleteAll}>
            <Trash2 size={14} /> Delete all saved lists
          </Button>
        </div>
      )}
      <AnimatePresence>
        {photosOf && <BillPhotosSheet key="photos" photoIds={photoIdsOf(photosOf.items)} title={photosOf.title} onClose={() => setPhotosOf(null)} />}
      </AnimatePresence>
    </div>
  );
}
