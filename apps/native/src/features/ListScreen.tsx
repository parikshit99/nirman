import Fuse from 'fuse.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { guessCategory, todayISO } from '@nirman/shared';
import { logStep, prefs, workTypeKey, type ListKind, type ListMeta } from '@nirman/core';
import { SaveModal } from '../components/SaveModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import type { MenuItem } from '../components/ui/OverflowMenu';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { haptic } from '../lib/haptics';
import { rupeesWhole } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { CapturePanel, QueuedReadings } from './CapturePanel';
import { ItemLog } from './ItemLog';

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
  onProject,
  onVendorQuote,
}: {
  kind: ListKind;
  /** The one line under the header saying what the tab does. */
  about: string;
  extraMenu?: MenuItem[];
  onProject?(): void;
  /** BOQ: scan a vendor's reply. */
  onVendorQuote?(): void;
}) {
  const c = useColors();
  const dialogs = useDialogs();
  const state = useAppState();
  const { actions, itemsFor, categoryNames, uniqueAddresses, pendingDeletes, knownVendors, editing, setEditing, draftIds, project, projectId } = state;
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
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

  const menu: MenuItem[] = [...extraMenu, ...(canClear ? [{ icon: 'delete-outline' as const, label: 'Clear the list', about: 'Remove every item in the open list', onPress: clearCurrent }] : [])];

  const closeAdd = useCallback(() => setAddOpen(false), []);
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
      <ScreenHeader onProject={onProject} menu={menu}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>{isAudit ? 'Spent' : 'Items'}</Text>
            <Text style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: '700', color: c.brandDark }}>{isAudit ? rupeesWhole(total) : String(filteredItems.length)}</Text>
          </View>
          {activeItems.length > 0 && (
            <Button variant="primary" size="sm" icon="save" onPress={openSave}>
              Save
            </Button>
          )}
        </View>
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
        <ItemLog kind={kind} items={filteredItems} searching={!!query} onAdd={() => setAddOpen(true)} header={banner} />
        {listedItems.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isAudit ? 'Add purchases' : 'Add to BOQ'}
            onPress={() => {
              haptic('tap');
              setAddOpen(true);
            }}
            style={({ pressed }) => ({ position: 'absolute', right: 16, bottom: 16, height: 56, paddingLeft: 16, paddingRight: 20, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pressed ? c.orange600 : c.brandPrimary, elevation: 6 })}
          >
            <Icon name="add" size={24} color={c.white} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>Add</Text>
          </Pressable>
        )}
      </View>

      {/* The entry form opens over the list. It stays loaded when closed, so a half-typed entry isn't lost. */}
      <Sheet key={`add-${projectId}-${kind}`} open={addOpen} onClose={closeAdd} label={isAudit ? 'Add purchases' : 'Add to BOQ'}>
        <SheetHeader title={isAudit ? 'Add purchases' : 'Add to BOQ'} onClose={closeAdd} />
        <CapturePanel
          key={`${projectId}-${kind}`}
          kind={kind}
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
