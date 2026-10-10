import { ScrollView, Text, View } from 'react-native';
import { todayISO } from '@nirman/shared';
import { DeliveredToggle } from '../components/DeliveredToggle';
import { Button } from '../components/ui/Button';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { useAppState, type HistoryRecord } from '../state/AppState';
import { useColors } from '../theme';

/** Tick which lines of a saved purchase list or BOQ (an order) have reached the site. */
export function DeliveriesSheet({ recordId, onClose }: { recordId: string; onClose(): void }) {
  const c = useColors();
  // Any project's list: Saved can show every project's lists.
  const { allHistory, actions } = useAppState();
  const record: HistoryRecord | undefined = allHistory.find((h) => h.id === recordId);
  if (!record) return null;
  const pending = record.items.filter((i) => !i.delivered_at);

  return (
    <Sheet kind="screen" scroll={false} label="Deliveries" onClose={onClose}>
      <SheetHeader title="Deliveries" subtitle={`${record.title}${record.address ? ` · ${record.address}` : ''}`} onClose={onClose} />
      <Text style={{ fontSize: 12, color: c.gray500 }}>Tick each line when it reaches the site.{record.kind === 'audit' ? ' Site reports can count only delivered material.' : ' See what is still to come on this order.'}</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {record.items.map((item) => (
          <View key={item.id} style={{ paddingVertical: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: c.gray100 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.brandDark }}>
                {item.item_name}
              </Text>
              <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>
                {item.quantity} {item.unit}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <DeliveredToggle name={item.item_name} deliveredAt={item.delivered_at} onChange={(date) => actions.setDelivered([item.id], date)} />
            </View>
          </View>
        ))}
      </ScrollView>
      {pending.length > 0 && (
        <Button variant="primary" block icon="check" onPress={() => actions.setDelivered(pending.map((i) => i.id), todayISO())}>
          {`Mark all ${pending.length} delivered today`}
        </Button>
      )}
    </Sheet>
  );
}
