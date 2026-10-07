import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Calendar, Camera, Check, EyeOff, FileCode, HardHat, History, Pencil, Plus, Truck } from 'lucide-react';
import { lastPaidFor, materialKey, todayISO, variantLabel, type ItemRow, type LastPaid, type MaterialEntry } from '@nirman/shared';
import { BillPhotosSheet } from '../components/BillPhotos.tsx';
import { DeliveredToggle } from '../components/DeliveredToggle.tsx';
import { LineEditor } from '../components/LineEditor.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { Button } from '../components/ui/Button.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import type { ListKind } from '@nirman/core';
import { useBackHandler } from '../lib/backButton.ts';
import { useAppState } from '../state/AppState.tsx';

interface Props {
  kind: ListKind;
  items: ItemRow[];
  searching: boolean;
  /** Opens the entry form (phones), offered when the list is empty. */
  onAdd?(): void;
}

const rupees = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** The current Audit or BOQ list: one card per item, sized for a phone screen. */
export function ItemLog({ kind, items, searching, onAdd }: Props) {
  const { actions, itemDatabase, pendingDeletes, projectId, projects } = useAppState();
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photosOf, setPhotosOf] = useState<ItemRow | null>(null);
  const isAudit = kind === 'audit';
  const byKey = new Map<string, MaterialEntry>(itemDatabase.map((e) => [e.key, e]));

  useBackHandler(() => setEditingId(null), editingId !== null);
  // Leaving the list carries out any delete still waiting for undo.
  useEffect(() => () => void actions.flushDeletes(), [actions]);

  const undelivered = items.filter((i) => !i.delivered_at && !pendingDeletes.has(i.id));

  return (
    <>
      <div className="bg-white border border-[var(--color-brand-concrete)] rounded-xl overflow-hidden shadow-sm w-full">
        <div className="divide-y divide-gray-100 min-h-[200px]">
          <AnimatePresence initial={false}>
            {items.length === 0 ? (
              <EmptyState
                icon={isAudit ? HardHat : FileCode}
                title={searching ? 'No items match.' : 'No items yet.'}
                action={
                  !searching &&
                  onAdd && (
                    <Button variant="primary" onClick={onAdd}>
                      <Plus size={16} /> Add {isAudit ? 'purchases' : 'items'}
                    </Button>
                  )
                }
              >
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
                    <LineEditor
                      initial={item}
                      showPrice={isAudit}
                      excludable={isAudit}
                      onSave={async (values) => {
                        await actions.updateItem(item.id, values);
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                      onDelete={() => {
                        setEditingId(null);
                        actions.deleteItemLater(item.id);
                      }}
                    />
                  ) : (
                    <ItemCard
                      item={item}
                      isAudit={isAudit}
                      lastPaid={lastPaidFor(byKey.get(materialKey(item.item_name, item.unit)), item, projectId, todayISO())}
                      projectName={projectName}
                      onEdit={() => setEditingId(item.id)}
                      onPhotos={() => setPhotosOf(item)}
                      onDelivered={(date) => actions.setDelivered([item.id], date)}
                      pendingDelete={pendingDeletes.has(item.id)}
                      onUndo={() => actions.undoDelete(item.id)}
                    />
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {photosOf && <BillPhotosSheet key="photos" photoIds={[photosOf.photo_id]} title={photosOf.item_name} onClose={() => setPhotosOf(null)} />}
      </AnimatePresence>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-xs text-gray-500 shadow-sm order-2 sm:order-1 font-semibold">
          <History size={12} /> {items.length} {items.length === 1 ? 'item' : 'items'}
        </div>
        {undelivered.length > 0 && (
          <button
            onClick={() => actions.setDelivered(undelivered.map((i) => i.id), todayISO())}
            className="w-full sm:w-auto order-1 sm:order-2 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-green-300 text-green-800 text-xs font-bold uppercase tracking-wider rounded-xl"
          >
            <Check size={14} /> Mark all delivered
          </button>
        )}
      </div>
    </>
  );
}

interface CardProps {
  item: ItemRow;
  isAudit: boolean;
  lastPaid?: LastPaid;
  projectName(id: string): string;
  onEdit(): void;
  /** Shows the bill photo the line was read from. */
  onPhotos(): void;
  onDelivered(date: string): void;
  pendingDelete: boolean;
  onUndo(): void;
}

function ItemCard({ item, isAudit, lastPaid, projectName, onEdit, onPhotos, onDelivered, pendingDelete, onUndo }: CardProps) {
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

  const diffPercent = lastPaid && item.unit_price && lastPaid.price > 0 ? ((item.unit_price - lastPaid.price) / lastPaid.price) * 100 : 0;
  // Another site's price can differ for transport alone: say where it is from.
  const where = lastPaid?.scope === 'elsewhere' ? ` at ${lastPaid.site || projectName(lastPaid.projectId) || 'another site'}` : '';
  const isHigher = diffPercent > 2;
  const isLower = diffPercent < -2;

  return (
    <div>
      <div className="flex items-start gap-2">
        <button onClick={onEdit} className="flex-1 min-w-0 text-left" aria-label={`Edit ${item.item_name}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-bold text-sm text-[var(--color-brand-dark)] flex items-center gap-1.5 min-w-0">
              <span className="truncate">{item.item_name}</span>
              <Pencil size={12} className="text-gray-500 shrink-0" />
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
            {item.original_term && item.original_term !== item.item_name && <span className="italic text-gray-500 truncate">“{item.original_term}”</span>}
          </div>
        </button>
      </div>

      {/* A BOQ is what was ordered: its lines can be ticked off as they arrive too. */}
      {!isAudit && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {item.photo_id && <PhotoChip onClick={onPhotos} name={item.item_name} />}
          <DeliveredToggle name={item.item_name} deliveredAt={item.delivered_at} onChange={onDelivered} />
        </div>
      )}
      {isAudit && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {item.photo_id && <PhotoChip onClick={onPhotos} name={item.item_name} />}
          <DeliveredToggle name={item.item_name} deliveredAt={item.delivered_at} onChange={onDelivered} />
          {!!item.rates_excluded && (
            <span className="flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
              <EyeOff size={12} /> Not in Rates
            </span>
          )}
          {lastPaid && lastPaid.price > 0 && item.unit_price > 0 && (
            <span className={`flex items-center gap-1 text-xs ${isHigher ? 'text-red-600' : isLower ? 'text-green-700' : 'text-gray-500'}`}>
              {(isHigher || isLower) && <AlertTriangle size={12} />}
              Last paid{where} {rupees(lastPaid.price)}
              {isHigher ? ' (this is higher)' : isLower ? ' (this is lower)' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoChip({ onClick, name }: { onClick(): void; name: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-bold text-gray-600 px-2 py-0.5 rounded border border-gray-200 hover:border-orange-300"
      aria-label={`Bill photo of ${name}`}
    >
      <Camera size={12} /> Bill
    </button>
  );
}
