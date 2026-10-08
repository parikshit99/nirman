import { FlashList } from '@shopify/flash-list';
import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { lastPaidFor, materialKey, todayISO, variantLabel, type ItemRow, type LastPaid, type MaterialEntry } from '@nirman/shared';
import type { ListKind } from '@nirman/core';
import { BillPhotosSheet } from '../components/BillPhotos';
import { DeliveredToggle } from '../components/DeliveredToggle';
import { LineEditor } from '../components/LineEditor';
import { UndoButton } from '../components/UndoButton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { rupees } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

interface Props {
  kind: ListKind;
  items: ItemRow[];
  searching: boolean;
  /** Opens the entry form, offered when the list is empty. */
  onAdd?(): void;
  /** Above the first card: the editing banner, readings in progress. */
  header?: ReactElement | null;
}

/** The current Purchases or BOQ list: one card per item. */
export function ItemLog({ kind, items, searching, onAdd, header }: Props) {
  const c = useColors();
  const { actions, itemDatabase, pendingDeletes, projectId, projects } = useAppState();
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photosOf, setPhotosOf] = useState<ItemRow | null>(null);
  const isAudit = kind === 'audit';
  const byKey = new Map<string, MaterialEntry>(itemDatabase.map((e) => [e.key, e]));

  // Leaving the list carries out any delete still waiting for undo.
  useEffect(() => () => void actions.flushDeletes(), [actions]);

  const undelivered = items.filter((i) => !i.delivered_at && !pendingDeletes.has(i.id));

  return (
    <>
      <FlashList
        data={items}
        keyExtractor={(item) => item.id}
        extraData={{ editingId, pendingDeletes, byKey }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            title={searching ? 'No items match.' : 'No items yet.'}
            action={
              !searching && onAdd ? (
                <Button variant="primary" icon="add" onPress={onAdd}>
                  {`Add ${isAudit ? 'purchases' : 'items'}`}
                </Button>
              ) : undefined
            }
          >
            {searching ? 'Check the search.' : 'Add items with a photo, voice or text, or type one in.'}
          </EmptyState>
        }
        ListFooterComponent={
          items.length > 0 ? (
            <View style={{ padding: 16, gap: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>{items.length === 1 ? '1 item' : `${items.length} items`}</Text>
              {undelivered.length > 0 && (
                <Button block icon="check" onPress={() => actions.setDelivered(undelivered.map((i) => i.id), todayISO())}>
                  Mark all delivered
                </Button>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.gray100, backgroundColor: editingId === item.id ? c.orange50 : pendingDeletes.has(item.id) ? c.red50 : c.white }}>
            {editingId === item.id ? (
              <LineEditor
                initial={item}
                showPrice={isAudit}
                excludable={isAudit}
                onSave={async (values) => {
                  await actions.updateItem(item.id, values);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                onDelete={() => {
                  setEditingId(null);
                  actions.deleteItemLater(item.id);
                }}
              />
            ) : (
              <ItemCard
                item={item}
                isAudit={isAudit}
                lastPaid={lastPaidFor(byKey.get(materialKey(item.item_name, item.unit)), item, projectId, todayISO())}
                projectName={projectName}
                onEdit={() => setEditingId(item.id)}
                onPhotos={() => setPhotosOf(item)}
                onDelivered={(date) => actions.setDelivered([item.id], date)}
                pendingDelete={pendingDeletes.has(item.id)}
                onUndo={() => actions.undoDelete(item.id)}
              />
            )}
          </View>
        )}
      />
      {photosOf && <BillPhotosSheet photoIds={[photosOf.photo_id]} title={photosOf.item_name} onClose={() => setPhotosOf(null)} />}
    </>
  );
}

interface CardProps {
  item: ItemRow;
  isAudit: boolean;
  lastPaid?: LastPaid;
  projectName(id: string): string;
  onEdit(): void;
  /** Shows the bill photo the line was read from. */
  onPhotos(): void;
  onDelivered(date: string): void;
  pendingDelete: boolean;
  onUndo(): void;
}

function ItemCard({ item, isAudit, lastPaid, projectName, onEdit, onPhotos, onDelivered, pendingDelete, onUndo }: CardProps) {
  const c = useColors();
  const strike = { textDecorationLine: 'line-through' as const };
  if (pendingDelete) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <View style={{ flex: 1, minWidth: 0, opacity: 0.6 }}>
          <Text numberOfLines={1} style={[{ fontSize: 14, fontWeight: '700', color: c.brandDark }, strike]}>
            {item.item_name}
          </Text>
          <Text style={[{ fontSize: 12, fontFamily: 'monospace', color: c.gray600 }, strike]}>
            {item.quantity} {item.unit}
            {isAudit && ` · ${rupees(item.total_amount)}`}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: c.red600 }}>Deleted</Text>
        <UndoButton onUndo={onUndo} label={item.item_name} />
      </View>
    );
  }

  const diffPercent = lastPaid && item.unit_price && lastPaid.price > 0 ? ((item.unit_price - lastPaid.price) / lastPaid.price) * 100 : 0;
  // Another site's price can differ for transport alone: say where it is from.
  const where = lastPaid?.scope === 'elsewhere' ? ` at ${lastPaid.site || projectName(lastPaid.projectId) || 'another site'}` : '';
  const isHigher = diffPercent > 2;
  const isLower = diffPercent < -2;
  const chip = { minHeight: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: c.gray200 };

  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.item_name}`} onPress={onEdit}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 14, fontWeight: '700', color: c.brandDark }}>
              {item.item_name}
            </Text>
            <Icon name="edit" size={12} color={c.gray500} />
          </View>
          {isAudit && <Text style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: '700', color: c.brandDark }}>{rupees(item.total_amount)}</Text>}
        </View>
        {variantLabel(item) ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray700, marginTop: 2 }}>{variantLabel(item)}</Text> : null}
        {item.ordered_as ? <Text style={{ fontSize: 12, color: c.orange800, marginTop: 2 }}>Ordered: {item.ordered_as}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2, marginTop: 2 }}>
          <Text style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray500 }}>
            {item.quantity} {item.unit}
            {isAudit && ` × ${rupees(item.unit_price)}`}
          </Text>
          {isAudit && item.vendor ? <Text style={{ fontSize: 12, color: c.gray500 }}>{item.vendor}</Text> : null}
          {!isAudit && item.date ? <Text style={{ fontSize: 12, color: c.gray500 }}>{item.date}</Text> : null}
          {item.original_term && item.original_term !== item.item_name ? <Text style={{ fontSize: 12, fontStyle: 'italic', color: c.gray500 }}>“{item.original_term}”</Text> : null}
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
        {item.photo_id ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Bill photo of ${item.item_name}`} onPress={onPhotos} style={chip}>
            <Icon name="photo-camera" size={12} color={c.gray600} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>Bill</Text>
          </Pressable>
        ) : null}
        <DeliveredToggle name={item.item_name} deliveredAt={item.delivered_at} onChange={onDelivered} />
        {isAudit && !!item.rates_excluded && (
          <View style={[chip, { backgroundColor: c.gray100, minHeight: 28 }]}>
            <Icon name="visibility-off" size={12} color={c.gray600} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>Not in Rates</Text>
          </View>
        )}
        {isAudit && lastPaid && lastPaid.price > 0 && item.unit_price > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {(isHigher || isLower) && <Icon name="warning" size={12} color={isHigher ? c.red600 : c.green700} />}
            <Text style={{ fontSize: 12, color: isHigher ? c.red600 : isLower ? c.green700 : c.gray500 }}>
              Last paid{where} {rupees(lastPaid.price)}
              {isHigher ? ' (this is higher)' : isLower ? ' (this is lower)' : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
