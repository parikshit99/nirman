import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { VARIANT_FIELDS, parseAmount, type Variant, type VariantField } from '@nirman/shared';
import { useAppState } from '../state/AppState';
import { rupees } from '../lib/format';
import { useColors } from '../theme';
import { useDialogs } from './ui/Dialogs';
import { Icon } from './ui/Icon';
import { QuantityHelper } from './QuantityHelper';
import { VariantFields } from './VariantFields';
import { Button } from './ui/Button';
import { Field, NumberField, SuggestInput } from './ui/fields';

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

/**
 * The one editor for a material line: name, brand / model / size / colour, quantity with the size helper, unit,
 * rate and vendor. Used for purchase and BOQ lines and for prices in Rates.
 */
export function LineEditor({ initial, showQuantity = true, showPrice = true, onSave, onCancel, onDelete, deleteLabel, alsoSave, excludable }: Props) {
  const c = useColors();
  const { knownVendors } = useAppState();
  const dialogs = useDialogs();
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...(Object.fromEntries(VARIANT_FIELDS.map((f) => [f, initial[f] ?? ''])) as Record<VariantField, string>),
    item_name: initial.item_name,
    quantity: String(initial.quantity),
    unit: initial.unit,
    unit_price: String(initial.unit_price),
    vendor: initial.vendor,
    ordered_as: initial.ordered_as,
  }));
  const [excluded, setExcluded] = useState(!!initial.rates_excluded);
  const set = (key: string) => (value: string) => setDraft((p) => ({ ...p, [key]: value }));

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
    <View style={{ gap: 8 }}>
      <Field label="Item" bold autoFocus value={draft.item_name} onChangeText={set('item_name')} />
      <VariantFields value={draft} onChange={(f, v) => set(f)(v)} />
      {showQuantity && (
        <QuantityHelper
          itemName={draft.item_name}
          spec={draft.spec ?? ''}
          onApply={(r) => setDraft((p) => ({ ...p, quantity: String(r.quantity), unit: r.unit, spec: r.spec, ordered_as: r.ordered_as }))}
        />
      )}
      {showQuantity && !!draft.ordered_as && <Field label="Ordered as" value={draft.ordered_as} onChangeText={set('ordered_as')} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {showQuantity && (
          <View style={{ flex: 1 }}>
            <NumberField label="Qty" value={draft.quantity} onChangeText={set('quantity')} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Field label="Unit" value={draft.unit} onChangeText={set('unit')} />
        </View>
        {showPrice && (
          <View style={{ flex: 1 }}>
            <NumberField label="Rate ₹" value={draft.unit_price} onChangeText={set('unit_price')} placeholder="Rate" />
          </View>
        )}
      </View>
      {showPrice && <SuggestInput label="Vendor" value={draft.vendor} onChange={set('vendor')} suggestions={knownVendors} placeholder="Vendor" />}
      {showPrice && showQuantity && <Text style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: '700', color: c.orange600, paddingTop: 4 }}>Total {rupees((parseAmount(draft.quantity) ?? 0) * (parseAmount(draft.unit_price) ?? 0))}</Text>}
      {excludable && showPrice && (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: excluded }} onPress={() => setExcluded(!excluded)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, paddingVertical: 4 }}>
          <Icon name={excluded ? 'check-box' : 'check-box-outline-blank'} size={24} color={excluded ? c.orange500 : c.gray500} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: c.gray800 }}>Leave out of Rates</Text>
            <Text style={{ fontSize: 12, color: c.gray500 }}>For a price that isn't the usual rate, e.g. with transport or an emergency charge included. The line stays in the list and its total.</Text>
          </View>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
        {onDelete && (
          <View style={{ marginRight: 'auto' }}>
            <Button variant="dangerOutline" size="sm" icon="delete-outline" label={deleteLabel ?? `Delete ${initial.item_name}`} onPress={onDelete}>
              Delete
            </Button>
          </View>
        )}
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" icon="check" label="Save changes" onPress={() => save()}>
          Save
        </Button>
      </View>
      {alsoSave && (
        <Button block size="sm" onPress={() => save(alsoSave.onSave)}>
          {alsoSave.label}
        </Button>
      )}
    </View>
  );
}
