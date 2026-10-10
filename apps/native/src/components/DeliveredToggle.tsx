import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Text, View } from 'react-native';
import { Pressable } from './ui/Pressable';
import { todayISO } from '@nirman/shared';
import { useColors } from '../theme';
import { Icon } from './ui/Icon';

const localISO = (d: Date) => todayISO(d);

/** Tick a purchase line as delivered to site (today by default, date editable), or untick it. */
export function DeliveredToggle({ name, deliveredAt, onChange }: { name: string; deliveredAt: string; onChange(date: string): void }) {
  const c = useColors();
  if (!deliveredAt) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${name} delivered`} onPress={() => onChange(todayISO())} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderWidth: 1, borderRadius: 6, borderColor: c.gray200 }}>
        <Icon name="check-box-outline-blank" size={16} color={c.gray500} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Not delivered</Text>
      </Pressable>
    );
  }
  const pick = () =>
    DateTimePickerAndroid.open({
      value: new Date(`${deliveredAt}T12:00:00`),
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, date) => {
        if (e.type === 'set' && date) onChange(localISO(date));
      },
    });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 6, borderColor: c.green200, backgroundColor: c.green50 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delivery date of ${name}: ${deliveredAt}`} onPress={pick} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
        <Icon name="check-box" size={16} color={c.green700} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.green700 }}>Delivered</Text>
        <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.green700 }}>{deliveredAt}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${name} not delivered`} onPress={() => onChange('')} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={16} color={c.green800} />
      </Pressable>
    </View>
  );
}
