import Fuse from 'fuse.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, Text, TextInput, View } from 'react-native';
import { guessCategory, todayISO } from '@nirman/shared';
import { buildPdf, logStep, prefs, workTypeKey, type ListKind, type ListMeta } from '@nirman/core';
import { ActionFab, useHideOnScroll, type FabAction } from '../components/ActionFab';
import { DocumentPreview } from '../components/DocumentPreview';
import { SaveModal } from '../components/SaveModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { RollingText } from '../components/ui/RollingText';
import type { MenuItem } from '../components/ui/OverflowMenu';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { haptic } from '../lib/haptics';
import { rupeesWhole } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { CapturePanel, QueuedReadings } from './CapturePanel';
import { ItemLog } from './ItemLog';
import { useIncomingShare } from './ShareHost';
import { ListShare } from './ListShare';

/** One vendor on every line, or several. */
function vendorOf(items: { vendor: string }[]): { initial: string; mixed: boolean } {
  const vendors = [...new Set(items.map((i) => i.vendor.trim()).filter(Boolean))];
  return { initial: vendors.length === 1 ? vendors[0] : '', mixed: vendors.length > 1 };
}

const titlePrefix = (k: ListKind) => (k === 'audit' ? 'Purchases' : 'BOQ');

interface SaveState {
  /** Saved list being edited, if any. */
  recordId?: string;
  initial: ListMeta;
  vendor?: { initial: string; mixed: boolean };
}

/** The Purchases and BOQ tabs: the open list, its header with the total, and the Add button. */
export function ListScreen({
  kind,
  about,
  extraMenu = [],
  onVendorQuote,
}: {
  kind: ListKind;
  /** The one line under the header saying what the tab does. */
  about: string;
  extraMenu?: MenuItem[];
  /** BOQ: scan a vendor's reply. */
  onVendorQuote?(): void;
}) {
  const c = useColors();
  const dialogs = useDialogs();
  const state = useAppState();
  const { actions, boqNotes, itemsFor, categoryNames, uniqueAddresses, pendingDeletes, knownVendors, editing, setEditing, draftIds, project, projectId } = state;
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const isAudit = kind === 'audit';

  // The list as listed (rows waiting for undo still show, struck through) and as it counts (totals and saving leave them out).
  const listedItems = itemsFor(kind);
  const activeItems = useMemo(() => listedItems.filter((i) => !pendingDeletes.has(i.id)), [listedItems, pendingDeletes]);
  const query = search.trim();
  const filteredItems = useMemo(() => {
    if (!query) return listedItems;
    return new Fuse(listedItems, { keys: ['item_name', 'vendor', 'original_term', 'brand', 'model', 'spec', 'color'], threshold: 0.4 }).search(query).map((r) => r.item);
  }, [listedItems, query]);
  useEffect(() => setSearch(''), [projectId]);
  // Switching projects carries out deletes still waiting for undo.
  useEffect(() => {
    void actions.flushDeletes();
  }, [projectId, actions]);

  const total = isAudit ? filteredItems.reduce((acc, i) => acc + (pendingDeletes.has(i.id) ? 0 : i.total_amount || 0), 0) : 0;
  const open = editing[kind];
  const canClear = activeItems.length > 0 && !open;

  const openSave = () => {
    if (activeItems.length === 0) return;
    setSaveState({
      recordId: open?.id,
      initial: {
        title: open?.title ?? '',
        address: open?.address || project?.address || '',
        category: open?.category || prefs.get(workTypeKey(kind), '') || guessCategory(activeItems),
        site_date: todayISO(),
      },
      vendor: isAudit ? vendorOf(activeItems) : undefined,
    });
  };

  const handleSave = async (meta: ListMeta, asNew: boolean, vendor?: string) => {
    if (!saveState) return;
    await actions.flushDeletes();
    const { recordId } = saveState;
    setSaveState(null);
    // A saved list being edited is already saved line by line: only its details change.
    if (open) {
      await actions.updateListMeta(open.id, meta);
      if (vendor && isAudit) await actions.setListVendor(open.id, vendor);
      dialogs.toast(`Saved “${meta.title || open.title}”`);
      return;
    }
    if (vendor && isAudit) await actions.setListVendor(draftIds.audit, vendor);
    // Its lines move to the saved list; the open list is left empty for the next bill.
    const id = await actions.saveDraftToHistory(draftIds[kind], meta, asNew ? undefined : recordId);
    const next = await dialogs.confirm(`Saved “${meta.title || titlePrefix(kind)}”`, {
      message: 'The list is empty for the next bill. Or keep working on the one you just saved: changes to it are saved as you make them.',
      confirmLabel: 'Next bill',
      cancelLabel: 'Keep editing it',
    });
    if (!next) setEditing(kind, id);
  };

  const clearCurrent = async () => {
    const ok = await dialogs.confirm(`Clear the ${titlePrefix(kind)} draft?`, {
      message: `${activeItems.length === 1 ? 'The 1 item' : `All ${activeItems.length} items`} in the current draft will be removed. Saved lists are not affected.`,
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    await actions.clearListItems(draftIds[kind]);
    if (kind === 'boq') await actions.setListNotes(draftIds.boq, '');
  };

  const notes = kind === 'boq' ? boqNotes : '';
  const has = activeItems.length > 0;
  // Above the Add button (ActionFab), nearest first.
  const fabActions: FabAction[] = [
    ...(canClear ? [{ icon: 'delete-outline' as const, label: 'Clear the list', tone: 'danger' as const, onPress: clearCurrent }] : []),
    ...extraMenu.map((m) => ({ icon: m.icon, label: m.label, onPress: m.onPress })),
    ...(has ? [{ icon: 'visibility' as const, label: 'Preview', onPress: () => setPreviewOpen(true) }, { icon: 'share' as const, label: 'Share', onPress: () => setShareOpen(true) }, { icon: 'save' as const, label: 'Save', tone: 'primary' as const, onPress: openSave }] : []),
  ];
  // Lines picked with a long press, for Delivered or Delete on all of them at once.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggleSelect = useCallback((id: string) => {
    haptic('tick');
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  useEffect(() => {
    if (!selected.size) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      clearSelection();
      return true;
    });
    return () => sub.remove();
  }, [selected.size, clearSelection]);
  // A new project, list or search starts with nothing picked.
  useEffect(clearSelection, [projectId, kind, query, clearSelection]);
  const pickedItems = filteredItems.filter((i) => selected.has(i.id));
  const markPickedDelivered = () => {
    const allDelivered = pickedItems.every((i) => i.delivered_at);
    void actions.setDelivered(pickedItems.map((i) => i.id), allDelivered ? '' : todayISO());
    clearSelection();
  };
  const deletePicked = () => {
    const ids = pickedItems.map((i) => i.id);
    ids.forEach((id) => actions.deleteItemLater(id));
    dialogs.undoable(ids.length === 1 ? `Deleted “${pickedItems[0].item_name}”` : `Deleted ${ids.length} items`, () => ids.forEach((id) => actions.undoDelete(id)));
    clearSelection();
  };

  const [fabHidden, onListScroll] = useHideOnScroll();

  const closeAdd = useCallback(() => setAddOpen(false), []);
  // Photos or text shared from another app (e.g. WhatsApp) for this list open the entry form with them.
  const incoming = useIncomingShare(kind);
  useEffect(() => {
    if (incoming.share) setAddOpen(true);
  }, [incoming.share]);
  useEffect(() => logStep('tab', { to: kind }), [kind]);

  const banner = (
    <View>
      <Text style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 8, fontSize: 12, lineHeight: 17, color: c.gray600 }}>{about}</Text>
      {open && (
        <View accessibilityLiveRegion="polite" style={{ marginHorizontal: 16, marginBottom: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: c.orange200, backgroundColor: c.orange50 }}>
          <Icon name="edit" size={16} color={c.orange600} />
          <Text style={{ flex: 1, minWidth: 0, fontSize: 14, color: c.gray800 }}>
            Editing the saved list <Text style={{ fontWeight: '700' }}>“{open.title}”</Text>. Changes are saved as you make them.
          </Text>
          <Button size="sm" variant="primary" onPress={() => setEditing(kind, null)}>
            Done
          </Button>
        </View>
      )}
      <QueuedReadings kind={kind} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.brandGray }}>
      <ScreenHeader>
        {selected.size > 0 ? (
          <View accessibilityLiveRegion="polite" style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Stop picking" onPress={clearSelection} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}>
              <Icon name="close" size={22} color={c.gray600} />
            </Pressable>
            <RollingText lineHeight={20} style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>{String(selected.size)}</RollingText>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.brandDark }}> selected</Text>
            {pickedItems.length < filteredItems.length && (
              <Button size="sm" variant="ghost" icon="select-all" label="Pick all" onPress={() => setSelected(new Set(filteredItems.map((i) => i.id)))} />
            )}
            <Button size="sm" variant="ghost" icon="local-shipping" label={pickedItems.every((i) => i.delivered_at) ? 'Mark not delivered' : 'Mark delivered'} onPress={markPickedDelivered} />
            <Button size="sm" variant="ghost" icon="delete-outline" label="Delete" onPress={deletePicked} />
          </View>
        ) : (
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>{isAudit ? 'Spent' : 'Items'}</Text>
            <RollingText lineHeight={20} style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: '700', color: c.brandDark }}>
              {isAudit ? rupeesWhole(total) : String(filteredItems.length)}
            </RollingText>
          </View>
        )}
      </ScreenHeader>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: c.brandConcrete, borderRadius: 22, backgroundColor: c.white }}>
          <Icon name="search" size={18} color={c.gray500} />
          <TextInput accessibilityLabel="Search" value={search} onChangeText={setSearch} placeholder="Search items…" placeholderTextColor={c.gray500} style={{ flex: 1, fontSize: 14, color: c.brandDark, paddingVertical: 8 }} />
          {!!search && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
              <Icon name="close" size={16} color={c.gray500} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ItemLog kind={kind} items={filteredItems} searching={!!query} onAdd={() => setAddOpen(true)} header={banner} onScroll={onListScroll} selected={selected} onToggleSelect={toggleSelect} />
        {selected.size === 0 && (listedItems.length > 0 || fabActions.length > 0) && (
          <ActionFab
            label={isAudit ? 'Add purchases' : 'Add to BOQ'}
            onPress={() => setAddOpen(true)}
            showMain={listedItems.length > 0}
            actions={fabActions}
            actionsLabel="Save, share or preview"
            hidden={fabHidden}
          />
        )}
      </View>

      {/* The entry form opens over the list. It stays loaded when closed, so a half-typed entry isn't lost. */}
      <Sheet key={`add-${projectId}-${kind}`} open={addOpen} onClose={closeAdd} label={isAudit ? 'Add purchases' : 'Add to BOQ'}>
        <SheetHeader title={isAudit ? 'Add purchases' : 'Add to BOQ'} onClose={closeAdd} />
        <CapturePanel
          key={`${projectId}-${kind}`}
          kind={kind}
          incoming={incoming.share}
          onIncomingUsed={incoming.used}
          onVendorQuote={
            onVendorQuote &&
            (() => {
              closeAdd();
              onVendorQuote();
            })
          }
          onQueued={() => {
            closeAdd();
            dialogs.toast('Sent to be read. The items will appear in the list.');
          }}
        />
      </Sheet>

      {previewOpen && <DocumentPreview title={isAudit ? 'Purchase list' : 'BOQ'} build={() => buildPdf(kind, activeItems, notes)} onShare={() => { setPreviewOpen(false); setShareOpen(true); }} onClose={() => setPreviewOpen(false)} />}
      {shareOpen && <ListShare kind={kind} items={activeItems} notes={notes} address={open?.address || project?.address || ''} onClose={() => setShareOpen(false)} />}
      {saveState && (
        <SaveModal
          initial={saveState.initial}
          categories={categoryNames}
          recentAddresses={uniqueAddresses}
          editing={!!saveState.recordId}
          allowSaveAsNew={!!saveState.recordId && !open}
          titlePrefix={titlePrefix(kind)}
          vendor={saveState.vendor && { ...saveState.vendor, known: knownVendors }}
          onSave={handleSave}
          onClose={() => setSaveState(null)}
        />
      )}
    </View>
  );
}
