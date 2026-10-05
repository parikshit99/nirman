import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { VARIANT_FIELDS, parseAmount, todayISO, type MaterialEntry } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { QuantityHelper } from '../components/QuantityHelper.tsx';
import { VariantFields } from '../components/VariantFields.tsx';
import { DRAFT_IDS, type ListKind } from '../data/repo.ts';
import { useAppState } from '../state/AppState.tsx';

const EMPTY: Record<string, string> = { item_name: '', quantity: '', unit: '', unit_price: '', vendor: '', brand: '', model: '', spec: '', color: '', ordered_as: '' };

/** Add one line by hand, without the AI: works with no internet or API key. */
export function ManualEntry({ kind, onClose }: { kind: ListKind; onClose(): void }) {
  const { actions, itemDatabase, knownVendors } = useAppState();
  const dialogs = useDialogs();
  const [draft, setDraft] = useState(EMPTY);
  const [added, setAdded] = useState(0);
  const isAudit = kind === 'audit';
  const known = itemDatabase.find((e) => e.name.toLowerCase() === draft.item_name.trim().toLowerCase());
  const units = [...new Set(itemDatabase.map((e) => e.unit))].sort();

  const set = (field: string, value: string) => setDraft((p) => ({ ...p, [field]: value }));
  const pickName = (name: string) => {
    const match = itemDatabase.find((e) => e.name.toLowerCase() === name.trim().toLowerCase());
    // A known material fills in its unit, unless one was typed already.
    setDraft((p) => ({ ...p, item_name: name, unit: p.unit || match?.unit || '' }));
  };

  const add = async () => {
    const name = draft.item_name.trim();
    if (!name) {
      await dialogs.alert('Enter the item name');
      return;
    }
    const quantity = draft.quantity.trim() ? parseAmount(draft.quantity) : 0;
    const unitPrice = isAudit && draft.unit_price.trim() ? parseAmount(draft.unit_price) : 0;
    if (quantity === null || unitPrice === null) {
      await dialogs.alert('Check the number', `“${quantity === null ? draft.quantity : draft.unit_price}” is not a number. Use digits, e.g. 1500 or 1,500.`);
      return;
    }
    await actions.addItems(DRAFT_IDS[kind], [
      {
        item_name: name,
        quantity,
        unit: draft.unit.trim() || 'unit',
        unit_price: unitPrice,
        total_amount: quantity * unitPrice,
        vendor: isAudit ? draft.vendor.trim() : '',
        date: isAudit ? todayISO() : '',
        ordered_as: draft.ordered_as.trim(),
        ...Object.fromEntries(VARIANT_FIELDS.map((f) => [f, draft[f].trim()])),
      },
    ]);
    setAdded((n) => n + 1);
    // Keep the vendor for the next line from the same bill.
    setDraft({ ...EMPTY, vendor: draft.vendor });
  };

  const field = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400';

  return (
    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2" role="group" aria-label="Add item manually">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-gray-500 font-bold">Add item manually</span>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close manual entry">
          <X size={16} />
        </button>
      </div>
      <label className="block">
        <span className="text-xs font-bold text-gray-500">Item</span>
        <input
          aria-label="Item name"
          list="manual-materials"
          className={`${field} font-bold`}
          value={draft.item_name}
          onChange={(e) => pickName(e.target.value)}
          placeholder="e.g. OPC Cement 53 grade"
        />
        <datalist id="manual-materials">
          {itemDatabase.map((e) => (
            <option key={e.key} value={e.name}>
              {e.unit}
            </option>
          ))}
        </datalist>
      </label>
      {known && <LastPrice entry={known} />}
      <VariantFields value={draft} onChange={set} inputClassName={field} />
      <QuantityHelper
        itemName={draft.item_name}
        spec={draft.spec}
        fieldClassName={field}
        onApply={(r) => setDraft((p) => ({ ...p, quantity: String(r.quantity), unit: r.unit, spec: r.spec, ordered_as: r.ordered_as }))}
      />
      <div className={`grid gap-2 ${isAudit ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Qty</span>
          <input aria-label="Quantity" inputMode="decimal" className={`${field} font-mono`} value={draft.quantity} onChange={(e) => set('quantity', e.target.value)} />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Unit</span>
          <input aria-label="Unit" list="manual-units" className={field} value={draft.unit} onChange={(e) => set('unit', e.target.value)} placeholder="Bag" />
          <datalist id="manual-units">
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        {isAudit && (
          <label className="block min-w-0">
            <span className="text-xs font-bold text-gray-500">Rate ₹</span>
            <input aria-label="Rate" inputMode="decimal" className={`${field} font-mono`} value={draft.unit_price} onChange={(e) => set('unit_price', e.target.value)} />
          </label>
        )}
      </div>
      {draft.ordered_as && (
        <label className="block">
          <span className="text-xs font-bold text-gray-500">Ordered as</span>
          <input aria-label="Ordered as" className={field} value={draft.ordered_as} onChange={(e) => set('ordered_as', e.target.value)} />
        </label>
      )}
      {isAudit && (
        <label className="block">
          <span className="text-xs font-bold text-gray-500">Vendor</span>
          <input aria-label="Vendor" list="manual-vendors" className={field} value={draft.vendor} onChange={(e) => set('vendor', e.target.value)} />
          <datalist id="manual-vendors">
            {knownVendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      )}
      <button onClick={add} className="w-full h-11 bg-[var(--color-brand-dark)] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm">
        <Check size={16} /> Add to {isAudit ? 'purchases' : 'BOQ'}
      </button>
      {added > 0 && (
        <p role="status" className="text-xs text-green-700 text-center">
          {added} {added === 1 ? 'item' : 'items'} added. Add another, or close.
        </p>
      )}
    </div>
  );
}

function LastPrice({ entry }: { entry: MaterialEntry }) {
  const last = entry.priceHistory[entry.priceHistory.length - 1];
  if (!last) return null;
  return (
    <p className="text-xs text-gray-500">
      Last paid ₹{last.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })} / {entry.unit}
      {last.vendor && ` · ${last.vendor}`} · {last.date}
    </p>
  );
}
