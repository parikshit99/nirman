import { View } from 'react-native';
import { VARIANT_FIELDS, fieldLimits, type Variant, type VariantField } from '@nirman/shared';
import { Field } from './ui/fields';

const LABELS: Record<VariantField, { label: string; placeholder: string }> = {
  brand: { label: 'Brand', placeholder: 'e.g. Jaquar' },
  model: { label: 'Model / code', placeholder: 'e.g. CNS-WHT-101' },
  spec: { label: 'Size / spec', placeholder: 'e.g. 2.5 sq mm, 6A' },
  color: { label: 'Color', placeholder: 'e.g. White' },
};
/** The same for purchase and BOQ lines, prices in Rates and quote lines. */
const LIMIT = fieldLimits('items');

/** Brand, model / item code, size/spec and colour, all optional, in a 2×2 grid. */
export function VariantFields({ value, onChange, disabled }: { value: Partial<Variant>; onChange(field: VariantField, value: string): void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {VARIANT_FIELDS.map((f) => (
        <View key={f} style={{ width: '48%', flexGrow: 1 }}>
          <Field label={LABELS[f].label} value={value[f] ?? ''} editable={!disabled} onChangeText={(t) => onChange(f, t)} placeholder={LABELS[f].placeholder} maxLength={LIMIT[f]} />
        </View>
      ))}
    </View>
  );
}
