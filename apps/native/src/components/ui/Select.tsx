import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { todayISO } from '@nirman/shared';
import { useColors } from '../../theme';
import { Icon } from './Icon';
import { Label } from './fields';
import { Sheet, SheetHeader } from './Sheet';

/** Pick one of a few options (the old `<select>`): opens Android's list sheet. */
export function Select({ label, value, options, onChange, placeholder }: { label?: string; value: string; options: readonly { value: string; label: string }[]; onChange(value: string): void; placeholder?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const shown = options.find((o) => o.value === value)?.label ?? (value || placeholder || '');
  return (
    <View style={{ flexShrink: 1, minWidth: 0 }}>
      {label ? <Label>{label}</Label> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label ? `${label}: ${shown}` : shown} onPress={() => setOpen(true)} style={[styles.box, { backgroundColor: c.white, borderColor: c.gray200 }]}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.brandDark }}>
          {shown}
        </Text>
        <Icon name="arrow-drop-down" size={22} color={c.gray500} />
      </Pressable>
      {open && (
        <Sheet closeOnBackdrop onClose={() => setOpen(false)} label={label}>
          <SheetHeader title={label ?? 'Choose'} onClose={() => setOpen(false)} />
          {options.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={[styles.option, { backgroundColor: o.value === value ? c.orange100 : c.gray50 }]}
            >
              <Text style={{ flex: 1, fontSize: 14, fontWeight: o.value === value ? '700' : '500', color: c.gray800 }}>{o.label}</Text>
              {o.value === value && <Icon name="check" size={18} color={c.orange600} />}
            </Pressable>
          ))}
        </Sheet>
      )}
    </View>
  );
}

/** A date (`YYYY-MM-DD`) with Android's own date picker. */
export function DateField({ label, value, onChange, max }: { label?: string; value: string; onChange(iso: string): void; max?: string }) {
  const c = useColors();
  const open = () =>
    DateTimePickerAndroid.open({
      value: value ? new Date(`${value}T12:00:00`) : new Date(),
      mode: 'date',
      maximumDate: max ? new Date(`${max}T12:00:00`) : undefined,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(localISO(date));
      },
    });
  return (
    <View style={{ flexShrink: 1, minWidth: 0 }}>
      {label ? <Label>{label}</Label> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label ? `${label}: ${value}` : value} onPress={open} style={[styles.box, { backgroundColor: c.white, borderColor: c.gray200 }]}>
        <Text style={{ flex: 1, fontSize: 14, fontVariant: ['tabular-nums'], color: c.brandDark }}>{value || todayISO()}</Text>
        <Icon name="event" size={18} color={c.gray500} />
      </Pressable>
    </View>
  );
}

/** `YYYY-MM-DD` in the phone's own day (the date picker returns local midnight-ish times). */
function localISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const styles = StyleSheet.create({
  box: { minHeight: 44, paddingLeft: 12, paddingRight: 6, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  option: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
});
