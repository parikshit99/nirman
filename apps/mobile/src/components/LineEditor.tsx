import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { VARIANT_FIELDS, parseAmount, type Variant, type VariantField } from '@nirman/shared';
import { useAppState } from '../state/AppState.tsx';
import { useDialogs } from './Dialogs.tsx';
import { QuantityHelper } from './QuantityHelper.tsx';
import { VariantFields } from './VariantFields.tsx';
import { Button } from './ui/Button.tsx';
import { SuggestInput } from './ui/SuggestInput.tsx';

/** What the editor changes on a line or a recorded price. */
export interface LineValues extends Variant {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vendor: string;
  ordered_as: string;
  /** 1 to keep this price out of Rates (and price checks); only with `excludable`. */
  rates_excluded?: number;
}

interface Props {
  initial: LineValues;
  /** Quantity (and the size helper); off for a rate, which has no quantity. */
  showQuantity?: boolean;
  /** Rate, vendor and the line total; off for a BOQ line. */
  showPrice?: boolean;
  onSave(values: LineValues): void | Promise<void>;
  onCancel(): void;
  /** Shown as Delete beside Save, so deleting is never one stray tap on a list. */
  onDelete?(): void;
  deleteLabel?: string;
  /** A second way to save, e.g. "Save as today's price" in Rates. */
  alsoSave?: { label: string; onSave(values: LineValues): void | Promise<void> };
  /** Show "Leave out of Rates", for a purchase line whose price isn't a fair rate. */
  excludable?: boolean;
}

const rupees = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const field = 'w-full px-3 py-2 bg-white border border-orange-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400';

/**
 * The one editor for a material line: name, brand / model / size / colour, quantity
 * with the size helper, unit, rate and vendor. Used for purchase and BOQ lines and
 * for prices in Rates.
 */
export function LineEditor({ initial, showQuantity = true, showPrice = true, onSave, onCancel, onDelete, deleteLabel, alsoSave, excludable }: Props) {
  const { knownVendors } = useAppState();
  const dialogs = useDialogs();
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(VARIANT_FIELDS.map((f) => [f, initial[f] ?? ''])),
    item_name: initial.item_name,
    quantity: String(initial.quantity),
    unit: initial.unit,
    unit_price: String(initial.unit_price),
    vendor: initial.vendor,
    ordered_as: initial.ordered_as,
  }));
  const [excluded, setExcluded] = useState(!!initial.rates_excluded);
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((p) => ({ ...p, [key]: e.target.value }));

  const save = async (to: Props['onSave'] = onSave) => {
    const quantity = draft.quantity.trim() ? parseAmount(draft.quantity) : 0;
    const unitPrice = draft.unit_price.trim() ? parseAmount(draft.unit_price) : 0;
    if (quantity === null || unitPrice === null) {
      await dialogs.alert('Check the number', `“${quantity === null ? draft.quantity : draft.unit_price}” is not a number. Use digits, e.g. 1500 or 1,500.`);
      return;
    }
    await to({
      ...(Object.fromEntries(VARIANT_FIELDS.map((f) => [f, (draft[f] ?? '').trim()])) as Record<VariantField, string>),
      item_name: draft.item_name.trim(),
      quantity,
      unit: draft.unit.trim(),
      unit_price: unitPrice,
      vendor: draft.vendor.trim(),
      ordered_as: draft.ordered_as.trim(),
      ...(excludable ? { rates_excluded: excluded ? 1 : 0 } : {}),
    });
  };

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs font-bold text-gray-500">Item</span>
        <input autoFocus aria-label="Item name" className={`${field} font-bold`} value={draft.item_name} onChange={set('item_name')} />
      </label>
      <VariantFields value={draft} onChange={(f, v) => setDraft((p) => ({ ...p, [f]: v }))} inputClassName={field} />
      {showQuantity && (
        <QuantityHelper
          itemName={draft.item_name}
          spec={draft.spec ?? ''}
          fieldClassName={field}
          onApply={(r) => setDraft((p) => ({ ...p, quantity: String(r.quantity), unit: r.unit, spec: r.spec, ordered_as: r.ordered_as }))}
        />
      )}
      {showQuantity && draft.ordered_as && (
        <label className="block">
          <span className="text-xs font-bold text-gray-500">Ordered as</span>
          <input aria-label="Ordered as" className={field} value={draft.ordered_as} onChange={set('ordered_as')} />
        </label>
      )}
      <div className={`grid gap-2 ${showQuantity && showPrice ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {showQuantity && (
          <label className="block">
            <span className="text-xs font-bold text-gray-500">Qty</span>
            <input aria-label="Quantity" inputMode="decimal" className={`${field} font-mono`} value={draft.quantity} onChange={set('quantity')} />
          </label>
        )}
        <label className="block">
          <span className="text-xs font-bold text-gray-500">Unit</span>
          <input aria-label="Unit" className={field} value={draft.unit} onChange={set('unit')} />
        </label>
        {showPrice && (
          <label className="block">
            <span className="text-xs font-bold text-gray-500">Rate ₹</span>
            <input aria-label="Rate" inputMode="decimal" className={`${field} font-mono`} value={draft.unit_price} onChange={set('unit_price')} placeholder="Rate" />
          </label>
        )}
      </div>
      {showPrice && (
        <label className="block">
          <span className="text-xs font-bold text-gray-500">Vendor</span>
          <SuggestInput aria-label="Vendor" className={field} value={draft.vendor} onChange={(v) => setDraft((p) => ({ ...p, vendor: v }))} suggestions={knownVendors} placeholder="Vendor" />
        </label>
      )}
      {showPrice && showQuantity && (
        <p className="text-sm font-mono font-bold text-orange-600 pt-1">
          Total {rupees((parseAmount(draft.quantity) ?? 0) * (parseAmount(draft.unit_price) ?? 0))}
        </p>
      )}
      {excludable && showPrice && (
        <label className="flex items-start gap-3 min-h-10 py-1 cursor-pointer">
          <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-orange-500" />
          <span className="text-sm text-gray-800">
            Leave out of Rates
            <span className="block text-xs text-gray-500">For a price that isn't the usual rate, e.g. with transport or an emergency charge included. The line stays in the list and its total.</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {onDelete && (
          <Button variant="dangerOutline" size="sm" className="mr-auto" aria-label={deleteLabel ?? `Delete ${initial.item_name}`} onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel">
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => save()} aria-label="Save changes">
          <Check size={14} /> Save
        </Button>
      </div>
      {alsoSave && (
        <Button block size="sm" onClick={() => save(alsoSave.onSave)}>
          {alsoSave.label}
        </Button>
      )}
    </div>
  );
}
