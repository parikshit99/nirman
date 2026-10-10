import { ScrollView, Text, View } from 'react-native';
import { useColors } from '../theme';
import { PressScale } from './ui/PressScale';

interface Props {
  categories: string[];
  categoryFilter: string;
  onCategory(cat: string): void;
  addresses: string[];
  addressFilter: string;
  onAddress(addr: string): void;
  addressLabel: string;
}

/** Work-type chips and, when there are several sites, site chips: sideways rows that scroll. */
export function FilterChips({ categories, categoryFilter, onCategory, addresses, addressFilter, onAddress, addressLabel }: Props) {
  const c = useColors();
  return (
    <View style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {['All', ...categories].map((cat) => {
          const on = categoryFilter === cat;
          return (
            <PressScale key={cat} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onCategory(cat)} style={{ minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: on ? c.orange500 : c.gray200, backgroundColor: on ? c.orange500 : c.white }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: on ? c.onPrimary : c.gray500 }}>{cat}</Text>
            </PressScale>
          );
        })}
      </ScrollView>
      {addresses.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500, paddingHorizontal: 16 }}>{addressLabel}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {['All', ...addresses].map((addr) => {
              const on = addressFilter === addr;
              return (
                <PressScale key={addr} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onAddress(addr)} style={{ minHeight: 40, maxWidth: 200, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, backgroundColor: on ? c.gray800 : c.gray100 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: on ? c.onPrimary : c.gray500 }}>
                    {addr === 'All' ? 'All sites' : addr}
                  </Text>
                </PressScale>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
