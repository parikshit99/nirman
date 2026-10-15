import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { LayoutAnimation, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { isCharge, lastPaidFor, materialKey, todayISO, variantLabel, type ItemRow, type LastPaid, type MaterialEntry, type ReadAs } from '@nirman/shared';
import type { ListKind } from '@nirman/core';
import { BillPhotosSheet } from '../components/BillPhotos';
import { DeliveredToggle } from '../components/DeliveredToggle';
import { SwipeRow } from '../components/SwipeRow';
import { TrashButton } from '../components/TrashButton';
import { LineEditor } from '../components/LineEditor';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
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
  /** How far the list is scrolled (the Add button hides while scrolling down). */
  onScroll?(y: number): void;
  /** Items picked with a long press, for actions on several at once (the list's selection bar). */
  selected: ReadonlySet<string>;
  onToggleSelect(id: string): void;
  /** Clears the open list (after confirming); not offered while a saved list is open or while searching. */
  onClear?(): void;
}

/** The current Purchases or BOQ list: one card per item. */
export function ItemLog({ kind, items: allItems, searching, onAdd, header, onScroll, selected, onToggleSelect, onClear }: Props) {
  const c = useColors();
  const { actions, itemDatabase, pendingDeletes, projectId, projects } = useAppState();
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photosOf, setPhotosOf] = useState<ItemRow | null>(null);
  const dialogs = useDialogs();
  const isAudit = kind === 'audit';
  const selecting = selected.size > 0;
  // A deleted line leaves the list at once; the strip at the bottom offers Undo until it is really deleted.
  const items = allItems.filter((i) => !pendingDeletes.has(i.id));
  const deleteWithUndo = (item: ItemRow) => {
    actions.deleteItemLater(item.id);
    dialogs.undoable(`Deleted “${item.item_name}”`, () => actions.undoDelete(item.id));
  };

  // Lines coming and going slide into place (one bill read, a delete, an undo); not a whole new list or a search.
  const listRef = useRef<FlashListRef<ItemRow>>(null);
  const shownIds = useRef(items.map((i) => i.id).join());
  const ids = items.map((i) => i.id).join();
  if (ids !== shownIds.current) {
    const change = Math.abs(items.length - shownIds.current.split(',').filter(Boolean).length);
    if (!searching && change >= 1 && change <= 5) {
      listRef.current?.prepareForLayoutAnimationRender();
      LayoutAnimation.configureNext(LayoutAnimation.create(250, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity));
    }
    shownIds.current = ids;
  }
  const byKey = new Map<string, MaterialEntry>(itemDatabase.map((e) => [e.key, e]));

  // Leaving the list carries out any delete still waiting for undo.
  useEffect(() => () => void actions.flushDeletes(), [actions]);

  // Transport and loading lines are never delivered.
  const undelivered = items.filter((i) => !i.delivered_at && !pendingDeletes.has(i.id) && !isCharge(i.item_name));

  return (
    <>
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        extraData={{ editingId, byKey, selected }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96 }}
        ListHeaderComponent={header}
        onScroll={onScroll && ((e) => onScroll(e.nativeEvent.contentOffset.y))}
        scrollEventThrottle={32}
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
              {onClear && !searching && (
                <Button variant="dangerOutline" size="sm" icon="delete-outline" onPress={onClear}>
                  Clear all
                </Button>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const picked = selected.has(item.id);
          const row = (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.gray100, backgroundColor: editingId === item.id || picked ? c.orange50 : c.white }}>
              {selecting && (
                <View style={{ width: 22, height: 22, marginTop: 2, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: picked ? c.brandPrimary : c.gray300, backgroundColor: picked ? c.brandPrimary : 'transparent' }}>
                  {picked && <Icon name="check" size={14} color={c.onPrimary} />}
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
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
                      deleteWithUndo(item);
                    }}
                  />
                ) : (
                  <ItemCard
                    item={item}
                    isAudit={isAudit}
                    lastPaid={lastPaidFor(byKey.get(materialKey(item.item_name, item.unit)), item, projectId, todayISO())}
                    projectName={projectName}
                    onEdit={() => (selecting ? onToggleSelect(item.id) : setEditingId(item.id))}
                    onLongPress={() => onToggleSelect(item.id)}
                    onPhotos={() => setPhotosOf(item)}
                    onDelivered={(date) => actions.setDelivered([item.id], date)}
                    onUnmatch={() => actions.undoMatch(item.id)}
                    onDelete={selecting ? undefined : () => deleteWithUndo(item)}
                  />
                )}
              </View>
            </View>
          );
          // Swipe right: delivered (or not). Not while editing or picking. Delete is the bin on the line.
          return editingId === item.id || selecting || isCharge(item.item_name) ? row : (
            <SwipeRow
              left={item.delivered_at ? { icon: 'undo', label: 'Not delivered', color: c.gray600, onPress: () => actions.setDelivered([item.id], '') } : { icon: 'check', label: 'Delivered', color: c.green600, onPress: () => actions.setDelivered([item.id], todayISO()) }}
            >
              {row}
            </SwipeRow>
          );
        }}
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
  /** Deletes the line, with Undo (none while picking several). */
  onDelete?(): void;
  /** Starts picking several lines. */
  onLongPress(): void;
  /** Put the line back as it was read, before it was matched to a material in Rates. */
  onUnmatch(): void;
}

/** What a matched line was read as ("Mount air", or "Saria, 2 MT" when the unit was converted), or null. */
function readAsLabel(item: ItemRow): string | null {
  if (!item.read_as) return null;
  try {
    const read = JSON.parse(item.read_as) as Partial<ReadAs>;
    const unitChanged = read.unit && read.unit.toLowerCase() !== item.unit.toLowerCase();
    return `${read.item_name ?? ''}${unitChanged ? `, ${read.quantity} ${read.unit}` : ''}`;
  } catch {
    return null;
  }
}

function ItemCard({ item, isAudit, lastPaid, projectName, onEdit, onLongPress, onPhotos, onDelivered, onUnmatch, onDelete }: CardProps) {
  const c = useColors();
  const diffPercent = lastPaid && item.unit_price && lastPaid.price > 0 ? ((item.unit_price - lastPaid.price) / lastPaid.price) * 100 : 0;
  // Another site's price can differ for transport alone: say where it is from.
  const where = lastPaid?.scope === 'elsewhere' ? ` at ${lastPaid.site || projectName(lastPaid.projectId) || 'another site'}` : '';
  const isHigher = diffPercent > 2;
  const isLower = diffPercent < -2;
  const chip = { minHeight: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: c.gray200 };
  const readAs = readAsLabel(item);

  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.item_name}`} accessibilityHint="Long press to pick several" onPress={onEdit} onLongPress={onLongPress} delayLongPress={350}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 14, fontWeight: '700', color: c.brandDark }}>
              {item.item_name}
            </Text>
            <Icon name="edit" size={12} color={c.gray500} />
          </View>
          {isAudit && <Text style={{ fontVariant: ['tabular-nums'], fontSize: 14, fontWeight: '700', color: c.brandDark }}>{rupees(item.total_amount)}</Text>}
        </View>
        {variantLabel(item) ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray700, marginTop: 2 }}>{variantLabel(item)}</Text> : null}
        {item.ordered_as ? <Text style={{ fontSize: 12, color: c.orange800, marginTop: 2 }}>Ordered: {item.ordered_as}</Text> : null}
        {readAs !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Icon name="call-merge" size={12} color={c.gray500} />
            <Text style={{ flexShrink: 1, fontSize: 12, color: c.gray600 }}>Matched to Rates; read as “{readAs}”</Text>
            {/* Looks like UndoButton; a line wrongly matched goes back to its own name and unit. */}
            <Pressable accessibilityRole="button" accessibilityLabel={`Undo the match, keep ${readAs}`} onPress={onUnmatch} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: c.blue50 }}>
              <Icon name="undo" size={16} color={c.blue600} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.blue600 }}>Undo</Text>
            </Pressable>
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2, marginTop: 2 }}>
          <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>
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
        {!isCharge(item.item_name) && <DeliveredToggle name={item.item_name} deliveredAt={item.delivered_at} onChange={onDelivered} />}
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
        {onDelete && (
          <View style={{ marginLeft: 'auto' }}>
            <TrashButton name={item.item_name} onPress={onDelete} />
          </View>
        )}
      </View>
    </View>
  );
}
