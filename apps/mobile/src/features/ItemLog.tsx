import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Calendar, Check, FileCode, HardHat, History, Pencil, Trash2, Truck, X, Zap } from 'lucide-react';
import { VARIANT_FIELDS, materialKey, parseAmount, todayISO, variantLabel, variantMatches, type ItemRow, type MaterialEntry } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { DeliveredToggle } from '../components/DeliveredToggle.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { QuantityHelper } from '../components/QuantityHelper.tsx';
import { VariantFields } from '../components/VariantFields.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import type { ItemPatch, ListKind } from '../data/repo.ts';
import { useBackHandler } from '../lib/backButton.ts';
import { useAppState } from '../state/AppState.tsx';

interface Props {
  kind: ListKind;
  items: ItemRow[];
  searching: boolean;
  /** Indexing saves the purchase list to History (asking its site and work type); Data reads prices from there. */
  onIndex(): void;
}

const rupees = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** The current Audit or BOQ list: one card per item, sized for a phone screen. */
export function ItemLog({ kind, items, searching, onIndex }: Props) {
  const { actions, itemDatabase, itemsFor, pendingDeletes } = useAppState();
  const dialogs = useDialogs();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
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
      brand: item.brand,
      model: item.model,
      spec: item.spec,
      color: item.color,
      ordered_as: item.ordered_as,
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
      ordered_as: (draft.ordered_as ?? '').trim(),
      ...Object.fromEntries(VARIANT_FIELDS.map((f) => [f, (draft[f] ?? '').trim()])),
    };
    await actions.updateItem(editingId, patch);
    setEditingId(null);
  };

  useBackHandler(() => setEditingId(null), editingId !== null);
  // Leaving the list carries out any delete still waiting for undo.
  useEffect(() => () => void actions.flushDeletes(), [actions]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((p) => ({ ...p, [field]: e.target.value }));
  const undelivered = isAudit ? items.filter((i) => !i.delivered_at && !pendingDeletes.has(i.id)) : [];
  const indexable = itemsFor('audit').filter((i) => i.item_name && i.unit_price && !pendingDeletes.has(i.id));
  const field = 'w-full px-3 py-2 bg-white border border-orange-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400';

  return (
    <>
      <div className="bg-white border border-[var(--color-brand-concrete)] rounded-xl overflow-hidden shadow-sm w-full">
        <div className="divide-y divide-gray-100 min-h-[200px]">
          <AnimatePresence initial={false}>
            {items.length === 0 ? (
              <EmptyState icon={isAudit ? HardHat : FileCode} title={searching ? 'No items match.' : 'No items yet.'}>
                {searching ? 'Check the search.' : 'Add items with a photo, voice or text, or type one in.'}
              </EmptyState>
            ) : (
              items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`px-4 md:px-6 py-3 ${editingId === item.id ? 'bg-orange-50/60' : ''} ${pendingDeletes.has(item.id) ? 'bg-red-50/40' : ''}`}
                >
                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <label className="block">
                        <span className="text-xs font-bold text-gray-500">Item</span>
                        <input autoFocus aria-label="Item name" className={`${field} font-bold`} value={draft.item_name} onChange={set('item_name')} />
                      </label>
                      <VariantFields value={draft} onChange={(f, v) => setDraft((p) => ({ ...p, [f]: v }))} inputClassName={field} />
                      <QuantityHelper
                        itemName={draft.item_name}
                        spec={draft.spec ?? ''}
                        fieldClassName={field}
                        onApply={(r) => setDraft((p) => ({ ...p, quantity: String(r.quantity), unit: r.unit, spec: r.spec, ordered_as: r.ordered_as }))}
                      />
                      {draft.ordered_as && (
                        <label className="block">
                          <span className="text-xs font-bold text-gray-500">Ordered as</span>
                          <input aria-label="Ordered as" className={field} value={draft.ordered_as} onChange={set('ordered_as')} />
                        </label>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="text-xs font-bold text-gray-500">Qty</span>
                          <input aria-label="Quantity" inputMode="decimal" className={`${field} font-mono`} value={draft.quantity} onChange={set('quantity')} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-gray-500">Unit</span>
                          <input aria-label="Unit" className={field} value={draft.unit} onChange={set('unit')} />
                        </label>
                        {isAudit && (
                          <label className="block">
                            <span className="text-xs font-bold text-gray-500">Rate ₹</span>
                            <input aria-label="Rate" inputMode="decimal" className={`${field} font-mono`} value={draft.unit_price} onChange={set('unit_price')} placeholder="Rate" />
                          </label>
                        )}
                      </div>
                      {isAudit && (
                        <label className="block">
                          <span className="text-xs font-bold text-gray-500">Vendor</span>
                          <input aria-label="Vendor" className={field} value={draft.vendor} onChange={set('vendor')} placeholder="Vendor" />
                        </label>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        {isAudit ? (
                          <span className="text-sm font-mono font-bold text-orange-600">
                            Total {rupees((parseAmount(draft.quantity) ?? 0) * (parseAmount(draft.unit_price) ?? 0))}
                          </span>
                        ) : (
                          <span />
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold flex items-center gap-1" aria-label="Cancel">
                            <X size={16} /> Cancel
                          </button>
                          <button onClick={saveEdit} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold flex items-center gap-1" aria-label="Save changes">
                            <Check size={16} /> Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ItemCard
                      item={item}
                      isAudit={isAudit}
                      dbMatch={pricesFor(byKey.get(materialKey(item.item_name, item.unit)), item)}
                      onEdit={() => startEditing(item)}
                      onIndex={onIndex}
                      onDelivered={(date) => actions.setDelivered([item.id], date)}
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

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-xs uppercase font-mono tracking-widest text-gray-500 shadow-sm order-2 sm:order-1">
          <History size={12} /> {items.length} {items.length === 1 ? 'item' : 'items'}
        </div>
        {isAudit && undelivered.length > 0 && (
          <button
            onClick={() => actions.setDelivered(undelivered.map((i) => i.id), todayISO())}
            className="w-full sm:w-auto order-1 sm:order-2 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-green-300 text-green-800 text-xs font-bold uppercase tracking-widest rounded-xl"
          >
            <Check size={14} /> Mark all delivered
          </button>
        )}
        {isAudit && indexable.length > 0 && (
          <button
            onClick={onIndex}
            className="w-full sm:w-auto order-1 sm:order-2 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-br from-orange-500 to-orange-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-orange-100 transition-all active:scale-95"
            title="Save this purchase list to History; its rates go into Data"
          >
            <Zap size={14} fill="currentColor" /> Index all rates
          </button>
        )}
      </div>
    </>
  );
}

/** Past prices for this exact item: a line naming a brand/model/colour only sees prices for that. */
type MatchingPrices = Pick<MaterialEntry, 'latestPrice' | 'priceHistory'>;
function pricesFor(entry: MaterialEntry | undefined, item: ItemRow): MatchingPrices | undefined {
  if (!entry) return undefined;
  const priceHistory = entry.priceHistory.filter((p) => variantMatches(item, p.variant));
  return priceHistory.length ? { priceHistory, latestPrice: priceHistory[priceHistory.length - 1].price } : undefined;
}

interface CardProps {
  item: ItemRow;
  isAudit: boolean;
  dbMatch?: MatchingPrices;
  onEdit(): void;
  onIndex(): void;
  onDelivered(date: string): void;
  pendingDelete: boolean;
  onDelete(): void;
  onUndo(): void;
}

function ItemCard({ item, isAudit, dbMatch, onEdit, onIndex, onDelivered, pendingDelete, onDelete, onUndo }: CardProps) {
  if (pendingDelete) {
    return (
      <div className="flex items-center gap-3 min-h-[44px]">
        <div className="flex-1 min-w-0 opacity-60">
          <div className="font-bold text-sm line-through truncate">{item.item_name}</div>
          <div className="text-xs font-mono line-through">
            {item.quantity} {item.unit}
            {isAudit && ` · ${rupees(item.total_amount)}`}
          </div>
        </div>
        <span className="text-xs text-red-600 shrink-0">Deleted</span>
        <UndoButton onUndo={onUndo} label={item.item_name} />
      </div>
    );
  }

  const diffPercent = dbMatch && item.unit_price && dbMatch.latestPrice > 0 ? ((item.unit_price - dbMatch.latestPrice) / dbMatch.latestPrice) * 100 : 0;
  const isHigher = diffPercent > 2;
  const isLower = diffPercent < -2;
  const itemDate = item.date || todayISO();
  const last = dbMatch?.priceHistory[dbMatch.priceHistory.length - 1];
  const isIndexed = !!last && dbMatch!.latestPrice === item.unit_price && last.date === itemDate;

  return (
    <div>
      <div className="flex items-start gap-2">
        <button onClick={onEdit} className="flex-1 min-w-0 text-left" aria-label={`Edit ${item.item_name}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-bold text-sm text-[var(--color-brand-dark)] flex items-center gap-1.5 min-w-0">
              <span className="truncate">{item.item_name}</span>
              <Pencil size={12} className="text-gray-300 shrink-0" />
            </span>
            {isAudit && <span className="font-mono font-bold text-sm text-[var(--color-brand-dark)] shrink-0">{rupees(item.total_amount)}</span>}
          </div>
          {variantLabel(item) && <div className="text-xs font-bold text-gray-700 mt-0.5">{variantLabel(item)}</div>}
          {item.ordered_as && <div className="text-xs text-orange-800 mt-0.5">Ordered: {item.ordered_as}</div>}
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono">
              {item.quantity} {item.unit}
              {isAudit && ` × ${rupees(item.unit_price)}`}
            </span>
            {isAudit && item.vendor && (
              <span className="flex items-center gap-1">
                <Truck size={12} /> {item.vendor}
              </span>
            )}
            {!isAudit && item.date && (
              <span className="flex items-center gap-1">
                <Calendar size={12} /> {item.date}
              </span>
            )}
            {item.original_term && item.original_term !== item.item_name && <span className="italic text-gray-400 truncate">“{item.original_term}”</span>}
          </div>
        </button>
        <button onClick={onDelete} className="p-2 -mr-2 -mt-1 text-red-500 hover:bg-red-50 rounded-xl shrink-0" aria-label={`Delete ${item.item_name}`}>
          <Trash2 size={18} />
        </button>
      </div>

      {isAudit && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <DeliveredToggle name={item.item_name} deliveredAt={item.delivered_at} onChange={onDelivered} />
          {isIndexed ? (
            <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
              <Check size={12} /> Indexed
            </span>
          ) : (
            <button
              onClick={onIndex}
              className="flex items-center gap-1 text-xs font-bold text-orange-700 hover:text-white hover:bg-orange-500 px-2 py-0.5 rounded border border-orange-200 transition-all"
              title="Save this purchase list to History; its rates go into Data"
            >
              <Zap size={12} /> Index rate
            </button>
          )}
          {dbMatch && dbMatch.latestPrice > 0 && !isIndexed && (
            <span className={`flex items-center gap-1 text-xs ${isHigher ? 'text-red-600' : isLower ? 'text-green-700' : 'text-gray-500'}`}>
              {(isHigher || isLower) && <AlertTriangle size={12} />}
              Last paid {rupees(dbMatch.latestPrice)}
              {isHigher ? ' (this is higher)' : isLower ? ' (this is lower)' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
