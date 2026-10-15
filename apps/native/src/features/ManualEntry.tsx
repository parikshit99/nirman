import { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { VARIANT_FIELDS, fieldLimits, parseAmount, todayISO, type MaterialEntry } from '@nirman/shared';
import type { ListKind } from '@nirman/core';
import { QuantityHelper } from '../components/QuantityHelper';
import { VariantFields } from '../components/VariantFields';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { Field, NumberField, SuggestInput } from '../components/ui/fields';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

const LIMIT = fieldLimits('items');

const EMPTY: Record<string, string> = { item_name: '', quantity: '', unit: '', unit_price: '', vendor: '', brand: '', model: '', spec: '', color: '', ordered_as: '' };

/** Add one line by hand, without the AI: works with no internet or API key. */
export function ManualEntry({ kind, onClose }: { kind: ListKind; onClose(): void }) {
  const c = useColors();
  const { actions, itemDatabase, knownVendors, openIds } = useAppState();
  const dialogs = useDialogs();
  const [draft, setDraft] = useState(EMPTY);
  const [added, setAdded] = useState<string[]>([]);
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
    // Matched like a read bill: typed "Mount air" joins "Mountair" in Rates (the line shows Undo).
    const [stored] = await actions.addTypedItems(openIds[kind], [
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
    const matched = stored.item_name !== name ? ` (matched from “${name}”)` : '';
    setAdded((list) => [...list, `${stored.item_name} · ${stored.quantity} ${stored.unit || 'unit'}${unitPrice ? ` · ₹${(quantity * unitPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}${matched}`]);
    // Keep the vendor for the next line from the same bill.
    setDraft({ ...EMPTY, vendor: draft.vendor });
  };

  return (
    <View accessibilityLabel="Add item manually" style={{ padding: 12, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Add item manually</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close manual entry" onPress={onClose} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', margin: -8 }}>
          <Icon name="close" size={18} color={c.gray500} />
        </Pressable>
      </View>
      <SuggestInput label="Item" style={{ fontWeight: '700' }} value={draft.item_name} onChange={pickName} suggestions={itemDatabase.map((e) => ({ value: e.name, hint: e.unit }))} placeholder="e.g. OPC Cement 53 grade" maxLength={LIMIT.item_name} />
      {known && <LastPrice entry={known} />}
      <VariantFields value={draft} onChange={set} />
      <QuantityHelper itemName={draft.item_name} spec={draft.spec} onApply={(r) => setDraft((p) => ({ ...p, quantity: String(r.quantity), unit: r.unit, spec: r.spec, ordered_as: r.ordered_as }))} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <NumberField label="Qty" value={draft.quantity} onChangeText={(t) => set('quantity', t)} />
        </View>
        <View style={{ flex: 1 }}>
          <SuggestInput label="Unit" value={draft.unit} onChange={(v) => set('unit', v)} suggestions={units} placeholder="Bag" maxLength={LIMIT.unit} />
        </View>
        {isAudit && (
          <View style={{ flex: 1 }}>
            <NumberField label="Rate ₹" value={draft.unit_price} onChangeText={(t) => set('unit_price', t)} />
          </View>
        )}
      </View>
      {!!draft.ordered_as && <Field label="Ordered as" value={draft.ordered_as} onChangeText={(t) => set('ordered_as', t)} maxLength={LIMIT.ordered_as} />}
      {isAudit && <SuggestInput label="Vendor" value={draft.vendor} onChange={(v) => set('vendor', v)} suggestions={knownVendors} maxLength={LIMIT.vendor} />}
      <Button variant="primary" block icon="check" onPress={add}>
        {`Add to ${isAudit ? 'purchases' : 'BOQ'}`}
      </Button>
      {added.length > 0 && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: c.green700, textAlign: 'center' }}>
          Added {added[added.length - 1]}
          {added.length > 1 && ` (${added.length} so far)`}. Add another, or close.
        </Text>
      )}
    </View>
  );
}

function LastPrice({ entry }: { entry: MaterialEntry }) {
  const c = useColors();
  const last = entry.priceHistory[entry.priceHistory.length - 1];
  if (!last) return null;
  return (
    <Text style={{ fontSize: 12, color: c.gray500 }}>
      Last paid ₹{last.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })} / {entry.unit}
      {last.vendor && ` · ${last.vendor}`} · {last.date}
    </Text>
  );
}
