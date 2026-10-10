import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { Icon } from '../components/ui/Icon';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { plural } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

/** Choose the saved BOQ a vendor's quote answers. */
export function BoqPicker({ onPick, onClose }: { onPick(boqId: string): void; onClose(): void }) {
  const c = useColors();
  const { savedBoqs, quotesFor } = useAppState();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const boqs = savedBoqs.filter((b) => !q || `${b.title} ${b.address} ${b.category}`.toLowerCase().includes(q));

  return (
    <Sheet label="Which BOQ is this quote for?" onClose={onClose} padding={20} gap={16}>
      <SheetHeader title="Which BOQ is this quote for?" subtitle="The vendor's lines will be matched to this BOQ's items." onClose={onClose} />

      {savedBoqs.length > 3 && (
        <TextInput accessibilityLabel="Search BOQs" value={query} onChangeText={setQuery} placeholder="Search by title or site" placeholderTextColor={c.gray500} style={{ minHeight: 44, paddingHorizontal: 16, borderWidth: 1, borderColor: c.gray200, borderRadius: 22, backgroundColor: c.gray50, color: c.brandDark, fontSize: 14 }} />
      )}

      <View style={{ gap: 8 }}>
        {savedBoqs.length === 0 ? (
          <Text style={{ fontSize: 12, lineHeight: 18, color: c.gray500, padding: 16, borderRadius: 12, backgroundColor: c.gray50 }}>No saved BOQs yet. Create the BOQ on the BOQ tab and tap Save, then come back here when the vendor replies.</Text>
        ) : boqs.length === 0 ? (
          <Text style={{ fontSize: 12, color: c.gray500, padding: 16, textAlign: 'center' }}>No BOQ matches “{query}”.</Text>
        ) : (
          boqs.map((b) => {
            const quotes = quotesFor(b.id).length;
            return (
              <Pressable key={b.id} accessibilityRole="button" onPress={() => onPick(b.id)} style={{ padding: 12, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.gray200, backgroundColor: c.white }}>
                <Icon name="description" size={18} color={c.orange500} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: c.gray900 }}>
                    {b.title || 'Untitled BOQ'}
                  </Text>
                  {b.address ? (
                    <Text numberOfLines={1} style={{ fontSize: 12, color: c.gray500 }}>
                      {b.address}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500, marginTop: 2 }}>
                    {new Date(b.created_at).toLocaleDateString('en-IN')} · {plural(b.items.length, 'item')}
                    {quotes > 0 && ` · ${plural(quotes, 'quote')}`}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </Sheet>
  );
}
