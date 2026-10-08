import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../../lib/haptics';
import { useColors } from '../../theme';

/** A row of tabs or filter options, one selected (the grey pill bar of the old app). */
export function Tabs<T extends string>({ options, value, onChange, label }: { options: readonly { id: T; label: string }[]; value: T; onChange(id: T): void; label: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.bar, { backgroundColor: c.gray100, borderColor: c.gray200 }]}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) haptic('tick');
              onChange(o.id);
            }}
            style={[styles.tab, on && { backgroundColor: c.white }]}
          >
            <Text numberOfLines={1} style={[styles.text, { color: on ? c.brandDark : c.gray500 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', padding: 4, borderRadius: 8, borderWidth: 1 },
  tab: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
});
