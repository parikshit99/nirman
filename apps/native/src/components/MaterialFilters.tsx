import { Text, View } from 'react-native';
import { Pressable } from './ui/Pressable';
import type { MaterialFilter } from '@nirman/shared';
import { useColors } from '../theme';
import { Select } from './ui/Select';

export const MATERIAL_FILTER_FIELDS: { key: keyof MaterialFilter; label: string }[] = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'brand', label: 'Brand' },
  { key: 'spec', label: 'Size / spec' },
  { key: 'color', label: 'Color' },
];

/** Vendor, brand, size/spec and colour pickers; only those with something recorded are shown. */
export function MaterialFilters({ value, options, onChange, clearable = true }: { value: MaterialFilter; options: Record<keyof MaterialFilter, string[]>; onChange(next: MaterialFilter): void; clearable?: boolean }) {
  const c = useColors();
  const shown = MATERIAL_FILTER_FIELDS.filter((f) => options[f.key].length > 0 || value[f.key]);
  if (shown.length === 0) return null;
  const active = MATERIAL_FILTER_FIELDS.some((f) => value[f.key]);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {shown.map(({ key, label }) => (
          <View key={key} style={{ width: '48%', flexGrow: 1 }}>
            <Select label={label} value={value[key] ?? ''} options={[{ value: '', label: 'Any' }, ...[...new Set([...(value[key] ? [value[key]!] : []), ...options[key]])].map((o) => ({ value: o, label: o }))]} onChange={(v) => onChange({ ...value, [key]: v })} />
          </View>
        ))}
      </View>
      {active && clearable && (
        <Pressable accessibilityRole="button" onPress={() => onChange({})} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.orange700 }}>Clear vendor / brand / size / color filters</Text>
        </Pressable>
      )}
    </View>
  );
}
