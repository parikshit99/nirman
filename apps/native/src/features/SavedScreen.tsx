import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';
import { Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { todayISO } from '@nirman/shared';
import type { ListMeta } from '@nirman/core';
import { ActionFab, useHideOnScroll, type FabAction } from '../components/ActionFab';
import { BillPhotosSheet, BillThumbs, photoIdsOf } from '../components/BillPhotos';
import { FilterChips } from '../components/FilterChips';
import { SaveModal } from '../components/SaveModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { SwipeRow } from '../components/SwipeRow';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { plural } from '../lib/format';
import { useAppState, type HistoryRecord } from '../state/AppState';
import { useColors } from '../theme';
import { DeliveriesSheet } from './DeliveriesSheet';
import { ListShare } from './ListShare';

const titlePrefix = (kind: HistoryRecord['kind']) => (kind === 'audit' ? 'Purchases' : 'BOQ');

/** One vendor on every line, or several. */
function vendorOf(items: { vendor: string }[]): { initial: string; mixed: boolean } {
  const vendors = [...new Set(items.map((i) => i.vendor.trim()).filter(Boolean))];
  return { initial: vendors.length === 1 ? vendors[0] : '', mixed: vendors.length > 1 };
}

interface SaveState {
  record: HistoryRecord;
  initial: ListMeta;
}

/** The Saved tab: the saved purchase lists and BOQs of the open project. */
export function SavedScreen({ about, onQuotes, onSiteReport }: { about: string; onQuotes?(boqId: string): void; onSiteReport?(): void }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const dialogs = useDialogs();
  const navigation = useNavigation<{ navigate(name: string): void }>();
  const state = useAppState();
  const { actions, history: allHistory, pendingDeletes, categoryNames, uniqueAddresses, knownVendors, quotesFor, projects, projectId, project, draftIds, setEditing } = state;
  // A list swiped away leaves at once; the strip at the bottom offers Undo until it is really deleted.
  const history = useMemo(() => allHistory.filter((h) => !pendingDeletes.has(h.id)), [allHistory, pendingDeletes]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [addressFilter, setAddressFilter] = useState('All');
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [photosOf, setPhotosOf] = useState<HistoryRecord | null>(null);
  const [sharing, setSharing] = useState<HistoryRecord | null>(null);
  const [fabHidden, onListScroll] = useHideOnScroll();

  const addresses = [...new Set(history.map((h) => h.address).filter(Boolean))];
  const q = search.trim();
  const records = useMemo(() => {
    const base = q ? new Fuse(history, { keys: ['title', 'address', 'category'], threshold: 0.4 }).search(q).map((r) => r.item) : history;
    return base.filter((r) => (categoryFilter === 'All' || r.category.toLowerCase() === categoryFilter.toLowerCase()) && (addressFilter === 'All' || r.address === addressFilter));
  }, [history, q, categoryFilter, addressFilter]);

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.status === 'closed' ? `${p.name} (closed)` : p.name }));

  const editDetails = (record: HistoryRecord) =>
    setSaveState({
      record,
      initial: { title: record.title, address: record.address, category: record.category || 'Civil', site_date: record.site_date || record.created_at.slice(0, 10) },
    });

  const deleteRecord = async (record: HistoryRecord) => {
    const quotes = quotesFor(record.id).length;
    const ok = await dialogs.confirm(`Delete “${record.title}”?`, {
      message: `${plural(record.items.length, 'item')}${quotes ? ` and ${plural(quotes, 'vendor quote')}` : ''} will be removed from this phone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setSaveState(null);
    await actions.deleteList(record.id);
  };

  const handleSave = async (meta: ListMeta, _asNew: boolean, vendor?: string, moveTo?: string) => {
    if (!saveState) return;
    const { record } = saveState;
    setSaveState(null);
    await actions.updateListMeta(record.id, meta);
    if (vendor) await actions.setListVendor(record.id, vendor);
    if (moveTo) {
      await actions.moveList(record.id, moveTo);
      dialogs.toast(`Moved to ${projects.find((p) => p.id === moveTo)?.name ?? 'the other project'}`);
    }
  };

  /** Edit a saved list in place on its tab; the open list for the next bill is kept as it is. */
  const openRecord = async (record: HistoryRecord) => {
    await actions.flushDeletes();
    setEditing(record.kind, record.id);
    navigation.navigate(record.kind === 'audit' ? 'Purchases' : 'BOQ');
  };

  /** Repeat order: the saved list's lines go into the purchase list, dated today and not yet delivered. */
  const buyAgain = async (record: HistoryRecord) => {
    const current = state.snapshot.items.filter((i) => i.list_id === draftIds.audit).length;
    if (current > 0) {
      const ok = await dialogs.confirm(`Add ${plural(record.items.length, 'item')} to the current list?`, {
        message: `The purchase list already has ${plural(current, 'item')}. Save or clear it first to keep the bills separate.`,
        confirmLabel: 'Add them',
      });
      if (!ok) return;
    }
    await actions.addItems(
      draftIds.audit,
      record.items.map((i) => ({ ...i, date: todayISO() })),
    );
    setEditing('audit', null);
    navigation.navigate('Purchases');
  };

  const deleteAllSaved = async () => {
    const ok = await dialogs.confirm(`Delete all saved lists of ${project?.name ?? 'this project'}?`, {
      message: `${plural(history.length, 'saved list')} will be permanently deleted from this phone. Other projects are not affected.`,
      confirmLabel: 'Delete all',
      danger: true,
    });
    if (ok) await actions.deleteAllHistory(projectId);
  };

  const swipeDelete = (record: HistoryRecord) => {
    actions.deleteListLater(record.id);
    dialogs.undoable(`Deleted “${record.title}”`, () => actions.undoDelete(record.id));
  };

  // The bottom-right buttons, as on Purchases and BOQ: + starts a BOQ, the small one holds the rest.
  const fabActions: FabAction[] = [
    ...(history.length > 1 ? [{ icon: 'delete-outline' as const, label: 'Delete all saved lists', tone: 'danger' as const, onPress: deleteAllSaved }] : []),
    { icon: 'shopping-cart', label: 'New purchase list', onPress: () => navigation.navigate('Purchases') },
    ...(onSiteReport ? [{ icon: 'assignment' as const, label: 'Site report', tone: 'primary' as const, onPress: onSiteReport }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.brandGray }}>
      <ScreenHeader>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>In this project</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>{plural(history.length, 'list')}</Text>
          </View>
          {/* On show, as in 6.x, not only in the ⋮ menu (#91). */}
          {onSiteReport && (
            <Button variant="secondary" size="sm" icon="assignment" onPress={onSiteReport}>
              Site report
            </Button>
          )}
        </View>
      </ScreenHeader>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: c.brandConcrete, borderRadius: 22, backgroundColor: c.white }}>
          <Icon name="search" size={18} color={c.gray500} />
          <TextInput accessibilityLabel="Search" value={search} onChangeText={setSearch} placeholder="Search saved lists…" placeholderTextColor={c.gray500} style={{ flex: 1, fontSize: 14, color: c.brandDark, paddingVertical: 8 }} />
        </View>
      </View>
      <FlashList
        data={records}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 96 }}
        onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingTop: 8 }}>
            <Text style={{ marginHorizontal: 16, marginTop: 4, fontSize: 12, lineHeight: 17, color: c.gray600 }}>{about}</Text>
            {history.length > 0 && <FilterChips categories={categoryNames} categoryFilter={categoryFilter} onCategory={setCategoryFilter} addresses={addresses.length > 1 ? addresses : []} addressFilter={addressFilter} onAddress={setAddressFilter} addressLabel="Filter by site" />}
          </View>
        }
        ListFooterComponent={
          history.length > 1 ? (
            <View style={{ alignItems: 'center', paddingTop: 16 }}>
              <Button variant="dangerOutline" size="sm" icon="delete-outline" onPress={deleteAllSaved}>
                Delete all saved lists
              </Button>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState title={history.length ? 'No saved lists match.' : 'Nothing saved yet.'} icon={require('../../assets/tabs/saved.png')}>
            {history.length ? 'Check the filters or search.' : 'Lists you save in this project from Purchases or BOQ (the Save button) appear here.'}
          </EmptyState>
        }
        renderItem={({ item: record }) => {
          const delivered = record.items.filter((i) => i.delivered_at).length;
          const bills = photoIdsOf(record.items);
          return (
            <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 16, overflow: 'hidden' }}>
              <SwipeRow onDelete={() => swipeDelete(record)}>
                <View style={{ padding: 16, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.white }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <Pressable accessibilityRole="button" onPress={() => editDetails(record)} style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray900 }}>{record.title}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, fontWeight: '700', color: c.orange700, backgroundColor: c.orange100 }}>{record.category || 'Civil'}</Text>
                        <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, fontWeight: '700', color: c.gray500, backgroundColor: c.gray100 }}>{titlePrefix(record.kind)}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500, marginTop: 4 }}>{new Date(record.created_at).toLocaleString('en-IN')}</Text>
                      {record.address ? <Text numberOfLines={1} style={{ fontSize: 12, fontStyle: 'italic', color: c.gray500 }}>{record.address}</Text> : null}
                      <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>
                        {plural(record.items.length, 'item')}
                        {record.items.length > 0 && <Text style={{ color: delivered === record.items.length ? c.green700 : c.gray500 }}>{` · ${delivered} of ${record.items.length} delivered`}</Text>}
                      </Text>
                    </Pressable>
                    {bills.length > 0 && <BillThumbs photoIds={bills} max={width >= 400 ? 2 : 1} title={record.title} onPress={() => setPhotosOf(record)} />}
                    {/* Delete is in the details sheet, next to Update, so it isn't tapped by accident. */}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit details of ${record.title}`} onPress={() => editDetails(record)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 }}>
                      <Icon name="edit" size={14} color={c.gray500} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Edit</Text>
                    </Pressable>
                  </View>

                  <View style={{ gap: 2 }}>
                    {record.items.slice(0, 3).map((item) => (
                      <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: c.gray500 }}>
                          • {item.item_name}
                        </Text>
                        <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>
                          {item.quantity} {item.unit}
                        </Text>
                      </View>
                    ))}
                    {record.items.length > 3 && <Text style={{ fontSize: 12, fontStyle: 'italic', color: c.gray500 }}>+ {record.items.length - 3} more items...</Text>}
                  </View>

                  {record.notes ? (
                    <Text numberOfLines={1} style={{ fontSize: 12, fontStyle: 'italic', color: c.gray500, borderLeftWidth: 1, borderLeftColor: c.gray200, paddingLeft: 8 }}>
                      "{record.notes}"
                    </Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Button variant="primary" size="sm" icon="visibility" style={{ flexGrow: 1 }} onPress={() => openRecord(record)}>
                      Open
                    </Button>
                    {record.items.length > 0 && (
                      <Button size="sm" icon="check-box" label={`Mark delivered: ${record.title}`} style={{ flexGrow: 1 }} onPress={() => setDeliveriesFor(record.id)}>
                        Delivered
                      </Button>
                    )}
                    {record.kind === 'boq' && onQuotes && (
                      <Button size="sm" icon="local-shipping" style={{ flexGrow: 1 }} onPress={() => onQuotes(record.id)}>
                        {`Quotes (${quotesFor(record.id).length})`}
                      </Button>
                    )}
                    {record.kind === 'audit' && record.items.length > 0 && (
                      <Button size="sm" icon="replay" label={`Buy again: ${record.title}`} onPress={() => buyAgain(record)}>
                        Again
                      </Button>
                    )}
                    {record.items.length > 0 && (
                      <Button size="sm" icon="share" label={`Share ${record.title}`} onPress={() => setSharing(record)}>
                        Share
                      </Button>
                    )}
                  </View>
                </View>
              </SwipeRow>
            </View>
          );
        }}
      />
      <ActionFab label="New BOQ" icon="playlist-add" onPress={() => navigation.navigate('BOQ')} actions={fabActions} actionsLabel="Site report and more" hidden={fabHidden} />
      {sharing && <ListShare kind={sharing.kind} items={sharing.items} notes={sharing.notes} address={sharing.address || project?.address || ''} onClose={() => setSharing(null)} />}
      {photosOf && <BillPhotosSheet photoIds={photoIdsOf(photosOf.items)} title={photosOf.title} onClose={() => setPhotosOf(null)} />}
      {deliveriesFor && <DeliveriesSheet recordId={deliveriesFor} onClose={() => setDeliveriesFor(null)} />}
      {saveState && (
        <SaveModal
          initial={saveState.initial}
          categories={categoryNames}
          recentAddresses={uniqueAddresses}
          editing
          allowSaveAsNew={false}
          titlePrefix={titlePrefix(saveState.record.kind)}
          vendor={saveState.record.kind === 'audit' && saveState.record.items.length ? { ...vendorOf(saveState.record.items), known: knownVendors } : undefined}
          project={{ id: saveState.record.project_id, options: projectOptions }}
          onDelete={() => deleteRecord(saveState.record)}
          onSave={handleSave}
          onClose={() => setSaveState(null)}
        />
      )}
    </View>
  );
}
