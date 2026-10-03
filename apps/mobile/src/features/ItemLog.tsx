import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Calendar, Check, ChevronRight, FileCode, HardHat, History, Trash2, Truck, X, Zap } from 'lucide-react';
import { materialKey, parseAmount, todayISO, type ItemRow, type MaterialEntry } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import type { ItemPatch, ListKind } from '../data/repo.ts';
import { useAppState } from '../state/AppState.tsx';
import { useBackHandler } from '../lib/backButton.ts';
import { UndoButton } from '../components/UndoButton.tsx';

interface Props {
  kind: ListKind;
  items: ItemRow[];
  searching: boolean;
}

export function ItemLog({ kind, items, searching }: Props) {
  const { actions, itemDatabase, itemsFor, pendingDeletes } = useAppState();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const dialogs = useDialogs();
  const isAudit = kind === 'audit';
  const byKey = new Map<string, MaterialEntry>(itemDatabase.map((e) => [e.key, e]));

  const startEditing = (item: ItemRow) => {
    setEditingId(item.id);
    setDraft({
      item_name: item.item_name,
      quantity: String(item.quantity),
      unit: item.unit,
      unit_price: String(item.unit_price),
      vendor: item.vendor,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const quantity = draft.quantity.trim() ? parseAmount(draft.quantity) : 0;
    const unitPrice = draft.unit_price.trim() ? parseAmount(draft.unit_price) : 0;
    if (quantity === null || unitPrice === null) {
      await dialogs.alert('Check the number', `“${quantity === null ? draft.quantity : draft.unit_price}” is not a number. Use digits, e.g. 1500 or 1,500.`);
      return;
    }
    const patch: ItemPatch = {
      item_name: draft.item_name.trim(),
      quantity,
      unit: draft.unit.trim(),
      unit_price: unitPrice,
      vendor: draft.vendor.trim(),
    };
    await actions.updateItem(editingId, patch);
    setEditingId(null);
  };

  useBackHandler(() => setEditingId(null), editingId !== null);
  // Leaving the list carries out any delete still waiting for undo.
  useEffect(() => () => void actions.flushDeletes(), [actions]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((p) => ({ ...p, [field]: e.target.value }));
  const auditItems = itemsFor('audit');

  return (
    <>
      <div className="bg-white border border-[var(--color-brand-concrete)] rounded-xl overflow-hidden shadow-sm w-full">
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_40px] px-4 md:px-6 py-3 border-b border-gray-100 bg-gray-50/50">
              {['Description', 'Qty', isAudit ? 'Rate' : '-', isAudit ? 'Total' : '-', isAudit ? 'Vendor' : 'Date'].map((h, i) => (
                <div
                  key={i}
                  className={`text-[9px] md:text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400 ${i === 0 ? '' : i < 3 ? 'text-center' : 'text-right'}`}
                >
                  {h}
                </div>
              ))}
              <div />
            </div>

            <div className="divide-y divide-gray-50 min-h-[300px]">
              <AnimatePresence initial={false}>
                {items.length === 0 ? (
                  <div className="p-12 md:p-20 flex flex-col items-center justify-center text-gray-300">
                    {isAudit ? <HardHat size={48} strokeWidth={1} /> : <FileCode size={48} strokeWidth={1} />}
                    <p className="mt-4 font-mono text-sm uppercase tracking-widest text-center">
                      {searching ? 'No match in search' : 'No Data Found'}
                      <br />
                      <span className="text-[10px] normal-case">{searching ? 'Try clearing filters' : 'Add items with a photo, voice or text'}</span>
                    </p>
                  </div>
                ) : (
                  items.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={`grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_40px] items-center px-4 md:px-6 py-4 transition-colors
                        ${editingId === item.id ? 'bg-orange-50/50 ring-1 ring-orange-200 z-10' : 'hover:bg-gray-100/50'}
                        ${pendingDeletes.has(item.id) ? 'bg-red-50/40' : ''}`}
                    >
                      {editingId === item.id ? (
                        <>
                          <div>
                            <input
                              autoFocus
                              aria-label="Item name"
                              className="w-full text-xs md:text-sm font-bold border-b border-orange-300 bg-transparent outline-none pb-1"
                              value={draft.item_name}
                              onChange={set('item_name')}
                            />
                            <div className="text-[10px] text-orange-400 mt-1">Editing Mode</div>
                          </div>
                          <div className="text-center px-2 flex gap-1">
                            <input
                              aria-label="Quantity"
                              inputMode="decimal"
                              className="w-12 text-center text-xs font-mono border-b border-orange-300 bg-transparent outline-none"
                              value={draft.quantity}
                              onChange={set('quantity')}
                            />
                            <input
                              aria-label="Unit"
                              className="w-12 text-center text-[10px] border-b border-orange-300 bg-transparent outline-none"
                              value={draft.unit}
                              onChange={set('unit')}
                            />
                          </div>
                          <div className="text-center">
                            {isAudit ? (
                              <input
                                aria-label="Rate"
                                inputMode="decimal"
                                className="w-16 text-center text-xs font-mono border-b border-orange-300 bg-transparent outline-none"
                                value={draft.unit_price}
                                onChange={set('unit_price')}
                                placeholder="Rate"
                              />
                            ) : (
                              '--'
                            )}
                          </div>
                          <div className="text-right">
                            {isAudit ? (
                              <div className="text-[10px] md:text-xs font-mono font-bold text-orange-600">
                                ₹{((parseAmount(draft.quantity) ?? 0) * (parseAmount(draft.unit_price) ?? 0)).toLocaleString('en-IN')}
                              </div>
                            ) : (
                              '--'
                            )}
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            {isAudit && (
                              <input
                                aria-label="Vendor"
                                className="w-20 text-right text-[10px] border-b border-orange-300 bg-transparent outline-none"
                                value={draft.vendor}
                                onChange={set('vendor')}
                                placeholder="Vendor"
                              />
                            )}
                            <div className="flex justify-end gap-2 pr-2 mt-1">
                              <button onClick={saveEdit} className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 shadow-sm" aria-label="Save changes">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 shadow-sm" aria-label="Cancel">
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                          <div />
                        </>
                      ) : (
                        <ItemRowView
                          item={item}
                          isAudit={isAudit}
                          dbMatch={byKey.get(materialKey(item.item_name, item.unit))}
                          onEdit={() => startEditing(item)}
                          onIndex={() => actions.indexRates([item])}
                          pendingDelete={pendingDeletes.has(item.id)}
                          onDelete={() => actions.deleteItemLater(item.id)}
                          onUndo={() => actions.undoDelete(item.id)}
                        />
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-[9px] md:text-[10px] uppercase font-mono tracking-widest text-gray-500 shadow-sm order-2 sm:order-1">
          <History size={12} /> {items.length} Records
        </div>
        {isAudit && auditItems.length > 0 && (
          <button
            onClick={() => actions.indexRates(auditItems.filter((i) => i.item_name && i.unit_price))}
            className="w-full sm:w-auto order-1 sm:order-2 flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-br from-orange-500 to-orange-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-orange-100 transition-all active:scale-95"
            title="Index all rates into your vendor database"
          >
            <Zap size={14} fill="currentColor" /> Bulk Index All Rates
          </button>
        )}
      </div>
    </>
  );
}

function ItemRowView({
  item,
  isAudit,
  dbMatch,
  onEdit,
  onIndex,
  pendingDelete,
  onDelete,
  onUndo,
}: {
  item: ItemRow;
  isAudit: boolean;
  dbMatch?: MaterialEntry;
  onEdit(): void;
  onIndex(): void;
  pendingDelete: boolean;
  onDelete(): void;
  onUndo(): void;
}) {
  const diffPercent =
    dbMatch && item.unit_price && dbMatch.latestPrice > 0 ? ((item.unit_price - dbMatch.latestPrice) / dbMatch.latestPrice) * 100 : 0;
  const isHigher = diffPercent > 2;
  const isLower = diffPercent < -2;
  const itemDate = item.date || todayISO();
  const last = dbMatch?.priceHistory[dbMatch.priceHistory.length - 1];
  const isIndexed = !!last && dbMatch!.latestPrice === item.unit_price && last.date === itemDate;

  if (pendingDelete) {
    return (
      <div className="col-span-full min-w-0 flex items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-3 opacity-60">
          <span className="font-bold text-xs md:text-sm line-through truncate">{item.item_name}</span>
          <span className="text-[11px] md:text-sm font-mono line-through shrink-0">
            {item.quantity} {item.unit}
          </span>
          {isAudit && <span className="text-[11px] md:text-sm font-mono line-through shrink-0">₹{(item.total_amount || 0).toLocaleString('en-IN')}</span>}
          <span className="text-[10px] text-red-600 shrink-0">Deleted</span>
        </div>
        <UndoButton onUndo={onUndo} label={item.item_name} />
      </div>
    );
  }

  return (
    <>
      <button onClick={onEdit} className="text-left cursor-pointer group/item min-w-0">
        <div className="font-bold text-xs md:text-sm text-[var(--color-brand-dark)] flex items-center gap-2">
          {item.item_name}
          <ChevronRight size={12} className="text-gray-300 group-hover/item:text-orange-400 transition-colors shrink-0" />
        </div>
        {item.original_term && (
          <div className="text-[9px] md:text-[10px] font-mono text-gray-400 italic truncate max-w-[100px] md:max-w-[150px]">"{item.original_term}"</div>
        )}
      </button>

      <div className="text-center">
        <span className="text-[11px] md:text-sm font-mono font-medium px-2 py-1 bg-gray-50 rounded">
          {item.quantity} <span className="text-[9px] md:text-[10px] text-gray-400">{item.unit}</span>
        </span>
      </div>

      <div className="text-center font-mono text-[10px] md:text-xs text-gray-500 flex flex-col items-center justify-center">
        {isAudit ? (
          <>
            <div className="flex items-center justify-center gap-1">
              ₹{item.unit_price?.toLocaleString('en-IN') || '0'}
              {dbMatch && (isHigher || isLower) && (
                <span title={`${isHigher ? 'Rate higher than index' : 'Great rate! Lower than index'} (Last: ₹${dbMatch.latestPrice.toLocaleString('en-IN')})`}>
                  <AlertTriangle size={10} className={isHigher ? 'text-red-500' : 'text-green-500'} />
                </span>
              )}
            </div>
            {dbMatch && dbMatch.latestPrice > 0 && (
              <div className="text-[8px] text-gray-400 mt-0.5" title="Latest indexed rate">
                Index Last: ₹{dbMatch.latestPrice.toLocaleString('en-IN')}
              </div>
            )}
          </>
        ) : (
          '--'
        )}
      </div>

      <div className="text-right font-mono font-bold text-xs md:text-sm text-[var(--color-brand-dark)]">
        {isAudit ? `₹${(item.total_amount || 0).toLocaleString('en-IN')}` : '--'}
      </div>

      <div className="text-right flex flex-col justify-center">
        <div className="text-[9px] md:text-[11px] font-bold text-gray-600 truncate max-w-[80px] md:max-w-[120px] ml-auto flex items-center justify-end gap-1">
          {isAudit ? <Truck size={10} /> : <Calendar size={10} />}
          {isAudit ? item.vendor : item.date}
        </div>
        {isAudit && (
          <div className="mt-1 flex justify-end">
            {isIndexed ? (
              <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
                <Check size={8} /> Indexed
              </div>
            ) : (
              <button
                onClick={onIndex}
                className="flex items-center gap-1 text-[8px] font-bold uppercase text-orange-600 hover:text-white hover:bg-orange-500 px-1.5 py-0.5 rounded border border-orange-200 transition-all"
                title="Verify and Index this rate"
              >
                <Zap size={8} /> Index Rate?
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end pr-2">
        <button
          onClick={onDelete}
          className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
          aria-label="Delete item"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </>
  );
}
