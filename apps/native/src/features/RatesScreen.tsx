import { FlashList } from '@shopify/flash-list';
import Fuse from 'fuse.js';
import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import {
  VARIANT_FIELDS,
  fieldLimits,
  filterMaterials,
  materialDatabaseToCSV,
  materialFilterOptions,
  materialKey,
  parseAmount,
  similarMaterials,
  unitFactor,
  todayISO,
  variantLabel,
  type MaterialEntry,
  type MaterialFilter,
} from '@nirman/shared';
import { MATERIAL_SORTS, saveMaterialSort, savedMaterialSort, sortMaterials, type MaterialSort } from '@nirman/core';
import { ActionFab, useHideOnScroll, type FabAction } from '../components/ActionFab';
import { LineEditor, type LineValues } from '../components/LineEditor';
import { MATERIAL_FILTER_FIELDS, MaterialFilters } from '../components/MaterialFilters';
import { PriceChart } from '../components/PriceChart';
import { ScreenHeader } from '../components/ScreenHeader';
import { TrashButton } from '../components/TrashButton';
import { UndoButton } from '../components/UndoButton';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, type IconName } from '../components/ui/Icon';
import { Field, NumberField } from '../components/ui/fields';
import { Sheet, SheetHeader, SheetLabel, SheetOption } from '../components/ui/Sheet';
import { Tabs } from '../components/ui/Tabs';
import { shareFile, textToBase64 } from '../lib/files';
import { plural, rupees, rupeesWhole } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

type SubTab = 'materials' | 'categories';

const SUB_TABS: { id: SubTab; label: string; about: string }[] = [
  { id: 'materials', label: 'Materials', about: 'One card per material. Tap it (or Edit) to change its name, size, rate or vendor, merge it or delete it. Open Prices and tap a price to fix just that one.' },
  { id: 'categories', label: 'Work types', about: 'Types of work (e.g. Earthwork) you can tag a saved purchase list or BOQ with, to filter by later.' },
];

const SORT_ICONS: Record<MaterialSort, IconName> = { newest: 'schedule', oldest: 'history', name: 'sort-by-alpha', nameDesc: 'sort-by-alpha' };

/** The Rates tab: every price recorded in all projects, per material, to see how rates change over time. */
export function RatesScreen() {
  const c = useColors();
  const { itemDatabase, categoryNames, uniqueAddresses, itemsFor, pendingDeletes, actions } = useAppState();
  const dialogs = useDialogs();
  const [tab, setTab] = useState<SubTab>('materials');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [addressFilter, setAddressFilter] = useState('All');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>({});
  const [sort, setSort] = useState<MaterialSort>(savedMaterialSort);
  const [sheet, setSheet] = useState<'filter' | 'sort' | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ unit: '', vendor: '', price: '' });
  const [open, setOpen] = useState<string | null>(null);
  const [openVariants, setOpenVariants] = useState<string | null>(null);
  const [editing, setEditing] = useState<MaterialEntry | null>(null);
  // Leaving the tab carries out price removals still waiting for undo.
  useEffect(() => () => void actions.flushDeletes(), [actions]);

  const query = search.trim();
  const filtered = useMemo(() => {
    const base = query ? new Fuse(itemDatabase, { keys: ['name', 'variants.label'], threshold: 0.4 }).search(query).map((r) => r.item) : itemDatabase;
    return filterMaterials(base, materialFilter).filter((e) => !pendingDeletes.has(e.key) && (categoryFilter === 'All' || e.categories.some((x) => x.toLowerCase() === categoryFilter.toLowerCase())) && (addressFilter === 'All' || e.addresses.includes(addressFilter)));
  }, [itemDatabase, query, materialFilter, categoryFilter, addressFilter, pendingDeletes]);
  const entries = useMemo(() => sortMaterials(filtered, sort), [filtered, sort]);
  const totalMaterials = itemDatabase.length;
  const unsavedPriced = itemsFor('audit').filter((i) => i.unit_price > 0 && !pendingDeletes.has(i.id)).length;

  const filterChips = [
    ...(categoryFilter !== 'All' ? [{ label: categoryFilter, clear: () => setCategoryFilter('All') }] : []),
    ...(addressFilter !== 'All' ? [{ label: addressFilter, clear: () => setAddressFilter('All') }] : []),
    ...MATERIAL_FILTER_FIELDS.filter((f) => materialFilter[f.key]).map((f) => ({ label: `${f.label}: ${materialFilter[f.key]}`, clear: () => setMaterialFilter({ ...materialFilter, [f.key]: '' }) })),
  ];
  const clearFilters = () => {
    setCategoryFilter('All');
    setAddressFilter('All');
    setMaterialFilter({});
  };

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const applyBulk = async () => {
    if (selected.size === 0) return;
    const price = bulk.price.trim() ? parseAmount(bulk.price) : undefined;
    if (price === null) {
      await dialogs.alert('Check the price', `“${bulk.price}” is not a number. Use digits, e.g. 1500 or 1,500.`);
      return;
    }
    if (!bulk.unit.trim() && !price) {
      await dialogs.alert('Nothing to change', 'Enter a new unit, or a price to record for today.');
      return;
    }
    const materials = itemDatabase.filter((e) => selected.has(e.key)).map((e) => ({ key: e.key, name: e.name, unit: e.unit }));
    await actions.bulkEditMaterials(materials, { unit: bulk.unit.trim() || undefined, vendor: bulk.vendor.trim() || undefined, price });
    setSelected(new Set());
    setSelectMode(false);
    setBulk({ unit: '', vendor: '', price: '' });
  };

  /** Delete materials from Rates after confirming; true when done. */
  const deleteFromRates = async (materials: MaterialEntry[]) => {
    if (materials.length === 0) return false;
    const ok = await dialogs.confirm(materials.length === 1 ? `Delete “${materials[0].name}” from Rates?` : `Delete ${materials.length} materials from Rates?`, {
      message: 'Their prices leave Rates and price checks. Saved purchase lists and BOQs stay as they are, and new purchases show up again. Restore from Settings → On this phone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return false;
    await actions.hideMaterials(materials.map((m) => ({ key: m.key, name: m.name, unit: m.unit })));
    return true;
  };

  const exportCsv = async () => {
    if (entries.length === 0) {
      await dialogs.alert('Nothing to export', 'No materials match the current filters.');
      return;
    }
    try {
      await shareFile(`rates_${todayISO()}.csv`, textToBase64(materialDatabaseToCSV(entries)), 'text/csv');
    } catch (err) {
      await dialogs.alert('Export failed', (err as Error).message);
    }
  };

  // The small button at the bottom right, as on Purchases and BOQ: for the materials shown.
  const fabActions: FabAction[] =
    tab === 'materials' && entries.length > 0 && !selectMode
      ? [
          { icon: 'delete-outline', label: entries.length === totalMaterials ? 'Delete all' : `Delete ${entries.length} shown`, tone: 'danger', onPress: () => void deleteFromRates(entries) },
          { icon: 'file-download', label: 'Export CSV', tone: 'primary', onPress: exportCsv },
        ]
      : [];
  const [fabHidden, onListScroll] = useHideOnScroll();
  const deleteWithUndo = (m: MaterialEntry) => {
    actions.deleteMaterialLater({ key: m.key, name: m.name, unit: m.unit });
    dialogs.undoable(`Deleted “${m.name}” from Rates`, () => actions.undoDelete(m.key));
  };

  const sortLabel = MATERIAL_SORTS.find((o) => o.id === sort)!;

  const header = (
    <View style={{ gap: 12, padding: 16 }}>
      <Tabs<SubTab> label="Rates" options={SUB_TABS} value={tab} onChange={setTab} />
      <Text style={{ fontSize: 12, lineHeight: 17, color: c.gray600 }}>{SUB_TABS.find((t) => t.id === tab)!.about}</Text>
      {tab === 'materials' && totalMaterials > 0 && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" icon="tune" style={{ flex: 1, borderColor: filterChips.length ? c.orange300 : c.gray200 }} label={`Filter${filterChips.length ? `, ${filterChips.length} on` : ''}`} onPress={() => setSheet('filter')}>
              {`Filter${filterChips.length ? ` (${filterChips.length})` : ''}`}
            </Button>
            <Button size="sm" icon="swap-vert" style={{ flex: 1 }} label={`Sort: ${sortLabel.label}`} onPress={() => setSheet('sort')}>
              {sortLabel.short}
            </Button>
            <Button
              size="sm"
              style={{ flex: 1 }}
              onPress={() => {
                setSelectMode(!selectMode);
                setSelected(new Set());
              }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </Button>
          </View>
          {filterChips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {filterChips.map((chip) => (
                <Pressable key={chip.label} accessibilityRole="button" accessibilityLabel={`Remove filter ${chip.label}`} onPress={chip.clear} style={{ minHeight: 40, maxWidth: '100%', paddingLeft: 12, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, borderWidth: 1, borderColor: c.orange200, backgroundColor: c.orange50 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, fontWeight: '700', color: c.orange800 }}>
                    {chip.label}
                  </Text>
                  <Icon name="close" size={14} color={c.orange800} />
                </Pressable>
              ))}
              <Text style={{ fontSize: 12, color: c.gray500 }}>
                {entries.length} of {plural(totalMaterials, 'material')}
              </Text>
            </View>
          )}
          {selectMode && <Text style={{ fontSize: 12, color: c.gray600 }}>{selected.size ? `${selected.size} selected: change their unit or vendor, add today's price, or delete them.` : 'Tap materials to select them.'}</Text>}
          {selectMode && selected.size > 0 && (
            <View style={{ gap: 8, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray50 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Field label="New unit" value={bulk.unit} onChangeText={(t) => setBulk((p) => ({ ...p, unit: t }))} placeholder="New unit" maxLength={fieldLimits('items').unit} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Vendor" value={bulk.vendor} onChangeText={(t) => setBulk((p) => ({ ...p, vendor: t }))} placeholder="Vendor" maxLength={fieldLimits('items').vendor} />
                </View>
                <View style={{ flex: 1 }}>
                  <NumberField label="Today's ₹" value={bulk.price} onChangeText={(t) => setBulk((p) => ({ ...p, price: t }))} placeholder="Today's ₹" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  size="sm"
                  variant="dangerOutline"
                  icon="delete-outline"
                  onPress={async () => {
                    if (await deleteFromRates(itemDatabase.filter((e) => selected.has(e.key)))) {
                      setSelected(new Set());
                      setSelectMode(false);
                    }
                  }}
                >
                  Delete
                </Button>
                <Button size="sm" variant="primary" icon="check" style={{ flex: 1 }} onPress={applyBulk}>
                  {`Apply to ${selected.size}`}
                </Button>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.brandGray }}>
      <ScreenHeader>
        <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: c.brandConcrete, borderRadius: 22, backgroundColor: c.white }}>
          <Icon name="search" size={18} color={c.gray500} />
          <TextInput accessibilityLabel="Search" value={search} onChangeText={setSearch} placeholder="Search materials…" placeholderTextColor={c.gray500} style={{ flex: 1, fontSize: 14, color: c.brandDark, paddingVertical: 8 }} />
          {!!search && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
              <Icon name="close" size={16} color={c.gray500} />
            </Pressable>
          )}
        </View>
      </ScreenHeader>

      {tab === 'categories' ? (
        <FlashList data={[]} renderItem={null} ListHeaderComponent={<>{header}<Categories /></>} />
      ) : (
        <FlashList
          data={entries}
          keyExtractor={(item) => item.key}
          extraData={{ selected, selectMode, open, openVariants, pendingDeletes }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 96 }}
          onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
          ListHeaderComponent={header}
          ListEmptyComponent={
            totalMaterials > 0 ? (
              <EmptyState icon={require('../../assets/tabs/rates.png')} title="No materials match.">
                Check the filters or search.
              </EmptyState>
            ) : (
              <EmptyState icon={require('../../assets/tabs/rates.png')} title="No prices yet">
                {`A price appears here as soon as you add a purchase with a rate, and when you confirm a vendor quote.${unsavedPriced > 0 ? ` Your purchase list has ${plural(unsavedPriced, 'priced item')} not added yet.` : ''}`}
              </EmptyState>
            )
          }
          ListFooterComponent={
            <View style={{ margin: 16, padding: 16, flexDirection: 'row', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray50 }}>
              <Icon name="trending-up" size={22} color={c.orange500} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray700 }}>Where prices come from</Text>
                <Text style={{ fontSize: 12, lineHeight: 18, color: c.gray500 }}>
                  Every purchase with a rate, as soon as it is added (the open purchase list and saved lists), confirmed vendor quotes, and rates added on their own. Fixing or removing a price here changes its list too. To keep one price out (e.g. transport included), edit the purchase and tick Leave out of Rates.
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => {
            return (
              <MaterialCard
                item={item}
                selectMode={selectMode}
                selected={selected.has(item.key)}
                priceListOpen={open === item.key}
                variantsOpen={openVariants === item.key}
                onToggleSelect={() => toggle(item.key)}
                onEdit={() => setEditing(item)}
                onTogglePrices={() => setOpen(open === item.key ? null : item.key)}
                onToggleVariants={() => setOpenVariants(openVariants === item.key ? null : item.key)}
                onDelete={() => deleteWithUndo(item)}
              />
            );
          }}
        />
      )}

      <ActionFab label="" showMain={false} onPress={() => undefined} actions={fabActions} actionsLabel="Export or delete the materials shown" hidden={fabHidden} />

      {sheet === 'filter' && (
        <FilterSheet
          count={entries.length}
          active={filterChips.length > 0}
          onClear={clearFilters}
          onClose={() => setSheet(null)}
          categories={categoryNames}
          categoryFilter={categoryFilter}
          onCategory={setCategoryFilter}
          addresses={uniqueAddresses}
          addressFilter={addressFilter}
          onAddress={setAddressFilter}
          materialFilter={materialFilter}
          onMaterialFilter={setMaterialFilter}
        />
      )}
      {sheet === 'sort' && (
        <Sheet label="Sort materials" onClose={() => setSheet(null)} closeOnBackdrop gap={8}>
          <SheetHeader title="Sort materials" onClose={() => setSheet(null)} />
          {MATERIAL_SORTS.map((o) => (
            <SheetOption
              key={o.id}
              icon={SORT_ICONS[o.id]}
              label={sort === o.id ? `✓ ${o.label}` : o.label}
              about={o.about}
              onPress={() => {
                setSort(o.id);
                saveMaterialSort(o.id);
                setSheet(null);
              }}
            />
          ))}
        </Sheet>
      )}
      {editing && <MaterialEditor key={editing.key} material={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

function MaterialCard({
  item,
  selectMode,
  selected,
  priceListOpen,
  variantsOpen,
  onToggleSelect,
  onEdit,
  onTogglePrices,
  onToggleVariants,
  onDelete,
}: {
  item: MaterialEntry;
  selectMode: boolean;
  selected: boolean;
  priceListOpen: boolean;
  variantsOpen: boolean;
  onToggleSelect(): void;
  onEdit(): void;
  onTogglePrices(): void;
  onToggleVariants(): void;
  /** Deletes the material from Rates, with Undo (not while picking several). */
  onDelete(): void;
}) {
  const c = useColors();
  const points = item.priceHistory.filter((h) => h.price > 0);
  const chip = { minHeight: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 };
  return (
    <Pressable
      accessibilityRole={selectMode ? 'checkbox' : undefined}
      accessibilityState={selectMode ? { checked: selected } : undefined}
      onPress={selectMode ? onToggleSelect : undefined}
      style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: c.gray100, backgroundColor: selected ? c.orange50 : c.white }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {selectMode && <Icon name={selected ? 'check-box' : 'check-box-outline-blank'} size={22} color={selected ? c.orange500 : c.gray400} />}
        <Pressable accessibilityRole="button" accessibilityLabel={selectMode ? undefined : `Edit ${item.name}`} disabled={selectMode} onPress={onEdit} style={{ flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: '700', color: c.gray900 }}>{item.name}</Text>
              {!selectMode && <Icon name="edit" size={12} color={c.gray500} />}
            </View>
            <Text style={{ fontSize: 12, color: c.gray500 }}>per {item.unit}</Text>
            {item.variants.length === 1 && item.variants[0].label ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray700 }}>{item.variants[0].label}</Text> : null}
          </View>
          <PriceSummary item={item} />
        </Pressable>
        {!selectMode && (
          <View style={{ marginTop: -8, marginRight: -8 }}>
            <TrashButton name={item.name} onPress={onDelete} />
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {item.vendors.map((v) => (
          <Text key={v} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray100, fontSize: 12, color: c.gray700 }}>
            {v}
          </Text>
        ))}
        {item.vendors.length === 0 && <Text style={{ fontSize: 12, fontStyle: 'italic', color: c.gray500 }}>No vendor yet</Text>}
      </View>
      {points.length > 1 && item.variants.length <= 1 && <PriceChart points={points} id={item.key.replace(/\W+/g, '')} />}
      {!selectMode && (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: priceListOpen }} onPress={onTogglePrices} style={chip}>
            <Icon name={priceListOpen ? 'expand-less' : 'expand-more'} size={16} color={c.orange600} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.orange600 }}>Prices ({item.priceHistory.length})</Text>
          </Pressable>
          {item.variants.length > 1 && (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: variantsOpen }} onPress={onToggleVariants} style={chip}>
              <Icon name={variantsOpen ? 'expand-less' : 'expand-more'} size={16} color={c.orange600} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.orange600 }}>Variants ({item.variants.length})</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onEdit} style={chip}>
            <Icon name="edit" size={14} color={c.gray600} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>Edit</Text>
          </Pressable>
        </View>
      )}
      {variantsOpen && !selectMode && <VariantList material={item} />}
      {priceListOpen && !selectMode && <PriceList points={item.priceHistory} />}
    </Pressable>
  );
}

/** Every way to narrow the materials, in one place: work type, site, vendor, brand, size and colour. */
function FilterSheet({
  count,
  active,
  onClear,
  onClose,
  categories,
  categoryFilter,
  onCategory,
  addresses,
  addressFilter,
  onAddress,
  materialFilter,
  onMaterialFilter,
}: {
  count: number;
  active: boolean;
  onClear(): void;
  onClose(): void;
  categories: string[];
  categoryFilter: string;
  onCategory(c: string): void;
  addresses: string[];
  addressFilter: string;
  onAddress(a: string): void;
  materialFilter: MaterialFilter;
  onMaterialFilter(f: MaterialFilter): void;
}) {
  const { itemDatabase } = useAppState();
  return (
    <Sheet label="Filter materials" onClose={onClose} closeOnBackdrop padding={20} gap={16}>
      <SheetHeader title="Filter materials" onClose={onClose} />
      {categories.length > 0 && (
        <View style={{ gap: 4 }}>
          <SheetLabel>Work type</SheetLabel>
          <ChoiceChips options={categories} value={categoryFilter} onChange={onCategory} />
        </View>
      )}
      {addresses.length > 0 && (
        <View style={{ gap: 4 }}>
          <SheetLabel>Site address</SheetLabel>
          <ChoiceChips options={addresses} value={addressFilter} onChange={onAddress} />
        </View>
      )}
      <MaterialFilters value={materialFilter} options={materialFilterOptions(itemDatabase)} onChange={onMaterialFilter} clearable={false} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button disabled={!active} onPress={onClear}>
          Clear all
        </Button>
        <Button variant="primary" style={{ flex: 1 }} onPress={onClose}>
          {`Show ${plural(count, 'material')}`}
        </Button>
      </View>
    </Sheet>
  );
}

/** "All" and each option as a chip; one is picked. */
function ChoiceChips({ options, value, onChange }: { options: string[]; value: string; onChange(v: string): void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {['All', ...options].map((o) => (
        <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: value === o }} onPress={() => onChange(o)} style={{ minHeight: 40, maxWidth: '100%', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: value === o ? c.orange500 : c.gray200, backgroundColor: value === o ? c.orange500 : c.white }}>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: value === o ? c.onPrimary : c.gray700 }}>
            {o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Latest price and range; with several brands/models, only the range (one brand's latest says little about another's). */
function PriceSummary({ item }: { item: MaterialEntry }) {
  const c = useColors();
  const price = { fontVariant: ['tabular-nums' as const], fontWeight: '700' as const, fontSize: 14, color: c.brandDark, textAlign: 'right' as const };
  const range = { fontVariant: ['tabular-nums' as const], fontSize: 12, color: c.gray500, textAlign: 'right' as const };
  if (item.variants.length > 1) {
    return (
      <View>
        <Text style={price}>{item.minPrice === item.maxPrice ? rupeesWhole(item.minPrice) : `${rupeesWhole(item.minPrice)}–${rupeesWhole(item.maxPrice)}`}</Text>
        <Text style={[range, { fontFamily: undefined }]}>{item.variants.length} variants</Text>
      </View>
    );
  }
  return (
    <View>
      <Text style={price}>{rupeesWhole(item.latestPrice)}</Text>
      {item.minPrice !== item.maxPrice && (
        <Text style={range}>
          {rupeesWhole(item.minPrice)}–{rupeesWhole(item.maxPrice)}
        </Text>
      )}
    </View>
  );
}

/** Each brand/model/spec/colour of a material with its latest price and range. */
function VariantList({ material }: { material: MaterialEntry }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: c.gray100, borderRadius: 12, backgroundColor: c.gray50 }}>
      {material.variants.map((v, i) => (
        <View key={v.key} style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.gray100 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>
              {v.label || 'No brand / model given'}
            </Text>
            <Text style={{ fontSize: 12, color: c.gray500 }}>{plural(v.priceHistory.length, 'price')}</Text>
          </View>
          <View>
            <Text style={{ fontVariant: ['tabular-nums'], fontWeight: '700', fontSize: 14, color: c.brandDark, textAlign: 'right' }}>{v.priceHistory.length ? rupees(v.latestPrice) : '—'}</Text>
            {v.minPrice !== v.maxPrice && (
              <Text style={{ fontVariant: ['tabular-nums'], fontSize: 12, color: c.gray500, textAlign: 'right' }}>
                {rupees(v.minPrice)}–{rupees(v.maxPrice)}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Every price recorded for one material, newest first. Each can be corrected or removed (with undo). */
function PriceList({ points }: { points: MaterialEntry['priceHistory'] }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: c.gray100, borderRadius: 12, backgroundColor: c.gray50 }}>
      {[...points].reverse().map((p, i) => (
        <PriceRow key={p.rateId ?? p.itemId ?? `${p.timestamp}-${i}`} point={p} first={i === 0} />
      ))}
    </View>
  );
}

/** Where a price came from, for its row in Prices or above its editor. */
function priceSource(p: MaterialEntry['priceHistory'][number], where: 'row' | 'edit') {
  if (p.draft) return where === 'row' ? 'Open purchase list' : 'Line in the open purchase list; the list changes too.';
  if (p.listTitle) return where === 'row' ? `Saved list: ${p.listTitle}` : `Line in the saved list “${p.listTitle}”; the list changes too.`;
  return 'Added rate';
}

function PriceRow({ point: p, first }: { point: MaterialEntry['priceHistory'][number]; first: boolean }) {
  const c = useColors();
  const { actions, pendingDeletes, snapshot } = useAppState();
  const [editing, setEditing] = useState(false);
  const id = p.rateId ?? p.itemId;
  const pendingDelete = !!id && pendingDeletes.has(id);
  const label = `₹${p.price} from ${p.date}`;
  const item = p.itemId ? snapshot.items.find((i) => i.id === p.itemId) : undefined;
  const rate = p.rateId ? snapshot.rates.find((r) => r.id === p.rateId) : undefined;
  const remove = () => (p.rateId ? actions.deleteIndexedRateLater(p.rateId) : p.itemId && actions.deleteItemLater(p.itemId));
  const border = { borderTopWidth: first ? 0 : 1, borderTopColor: c.gray100 };

  if (editing && (item || rate)) {
    return (
      <View style={[{ padding: 8, gap: 8, backgroundColor: c.orange50 }, border]}>
        <Text style={{ fontSize: 12, color: c.gray500 }}>{priceSource(p, 'edit')}</Text>
        <LineEditor
          initial={item ?? { ...rate!, quantity: 0, unit_price: rate!.price, ordered_as: '' }}
          showQuantity={!!item}
          excludable={!!item}
          onSave={async (values) => {
            if (item) await actions.updateItem(item.id, values);
            else {
              const { quantity: _q, ordered_as: _o, unit_price, ...rest } = values;
              await actions.updateRate(rate!.id, { ...rest, price: unit_price });
            }
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={() => {
            setEditing(false);
            remove();
          }}
          deleteLabel={`Remove price ${label}`}
        />
      </View>
    );
  }

  if (pendingDelete) {
    return (
      <View style={[{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.red50 }, border]}>
        <View style={{ flex: 1, minWidth: 0, opacity: 0.6 }}>
          <Text style={{ fontSize: 14, textDecorationLine: 'line-through', color: c.gray700 }}>
            {new Date(p.date).toLocaleDateString('en-IN')} · {p.vendor} · {rupees(p.price)}
          </Text>
          {p.itemId ? <Text style={{ fontSize: 12, color: c.gray600 }}>(line removed from the list)</Text> : null}
        </View>
        <UndoButton onUndo={() => actions.undoDelete(id!)} label={label} />
      </View>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit price ${label}`} disabled={!id} onPress={() => id && setEditing(true)} style={[{ paddingHorizontal: 12, paddingVertical: 8, minHeight: 44 }, border]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.gray700 }}>
          {new Date(p.date).toLocaleDateString('en-IN')} · {p.vendor}
        </Text>
        <Text style={{ fontVariant: ['tabular-nums'], fontWeight: '700', fontSize: 14, color: c.brandDark }}>{rupees(p.price)}</Text>
        {id && <Icon name="edit" size={12} color={c.gray500} />}
      </View>
      {variantLabel(p.variant) ? (
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: c.gray700 }}>
          {variantLabel(p.variant)}
        </Text>
      ) : null}
      <Text numberOfLines={1} style={{ fontSize: 12, color: c.gray500 }}>
        {priceSource(p, 'row')}
      </Text>
    </Pressable>
  );
}

/**
 * The line editor for a whole material: renaming it or changing its unit changes every price (and merges into a
 * material with the same name and unit); brand, size, rate and vendor correct its latest price, or are recorded as
 * today's price. Also merges duplicates and deletes it.
 */
function MaterialEditor({ material, onClose }: { material: MaterialEntry; onClose(): void }) {
  const c = useColors();
  const { actions, itemDatabase, hiddenMaterials, snapshot } = useAppState();
  const dialogs = useDialogs();
  const others = itemDatabase.filter((e) => e.key !== material.key);
  const similar = similarMaterials(material, itemDatabase);
  const latest = material.priceHistory.at(-1);
  const latestItem = latest?.itemId ? snapshot.items.find((i) => i.id === latest.itemId) : undefined;
  const latestRate = latest?.rateId ? snapshot.rates.find((r) => r.id === latest.rateId) : undefined;
  const latestRow = latestItem ?? latestRate;
  const initial: LineValues = {
    item_name: material.name,
    unit: material.unit,
    quantity: 0,
    ordered_as: '',
    unit_price: latest?.price ?? 0,
    vendor: latestRow?.vendor ?? '',
    brand: latestRow?.brand ?? '',
    model: latestRow?.model ?? '',
    spec: latestRow?.spec ?? '',
    color: latestRow?.color ?? '',
  };

  const mergeInto = async (target: MaterialEntry) => {
    const factor = unitFactor(material.unit, target.unit);
    const units =
      factor === 1
        ? ''
        : factor
          ? `\nPrices are converted from per ${material.unit} to per ${target.unit} (1 ${material.unit} = ${Number(factor.toFixed(4))} ${target.unit}).`
          : `\nThe units differ (${material.unit} vs ${target.unit}); the prices are not converted.`;
    const ok = await dialogs.confirm(`Merge into “${target.name}”?`, {
      message: `“${material.name}” (${plural(material.priceHistory.length, 'price')}) becomes “${target.name}” per ${target.unit}, combining both price histories. Future readings of the same words use the new name.${units}`,
      confirmLabel: 'Merge',
    });
    if (!ok) return false;
    await actions.renameMaterial(material.key, { item_name: target.name, unit: target.unit }, true);
    return true;
  };

  /** Rename (or merge) when the name or unit changed; false if the person backed out. */
  const renameIfChanged = async (v: LineValues): Promise<boolean> => {
    const key = materialKey(v.item_name, v.unit);
    if (key === material.key && v.item_name === material.name && v.unit === material.unit) return true;
    const existing = others.find((e) => e.key === key);
    if (existing) return mergeInto(existing);
    const hidden = hiddenMaterials.find((h) => h.id === key);
    if (hidden) {
      const ok = await dialogs.confirm(`“${hidden.name}” per ${hidden.unit} is hidden`, {
        message: 'Saving merges into it and shows it in Rates again, with both price histories.',
        confirmLabel: 'Merge and unhide',
      });
      if (!ok) return false;
    }
    await actions.renameMaterial(material.key, { item_name: v.item_name, unit: v.unit });
    return true;
  };

  const tidy = (v: LineValues): LineValues | null => (v.item_name ? { ...v, unit: v.unit || 'unit' } : null);
  const variantOf = (v: LineValues) => ({ brand: v.brand, model: v.model, spec: v.spec, color: v.color });

  const save = async (raw: LineValues) => {
    const v = tidy(raw);
    if (!v || !(await renameIfChanged(v))) return;
    const changed = v.unit_price !== initial.unit_price || v.vendor !== initial.vendor || VARIANT_FIELDS.some((f) => v[f] !== initial[f]);
    if (changed && latestItem) await actions.updateItem(latestItem.id, { unit_price: v.unit_price, vendor: v.vendor, ...variantOf(v) });
    else if (changed && latestRate) await actions.updateRate(latestRate.id, { price: v.unit_price, vendor: v.vendor, ...variantOf(v) });
    else if (changed && v.unit_price > 0) await saveAsToday(v);
    onClose();
  };

  const saveAsToday = async (raw: LineValues) => {
    const v = tidy(raw);
    if (!v || !(await renameIfChanged(v))) return;
    if (v.unit_price <= 0) {
      await dialogs.alert('Enter the rate', "Today's price needs a rate.");
      return;
    }
    await actions.indexRates([{ item_name: v.item_name, unit: v.unit, unit_price: v.unit_price, vendor: v.vendor, date: todayISO(), ...variantOf(v) }]);
    onClose();
  };

  const hide = async () => {
    await actions.hideMaterial({ key: material.key, name: material.name, unit: material.unit });
    onClose();
  };

  return (
    <Sheet label="Edit material" onClose={onClose} padding={20} gap={20}>
      <SheetHeader title="Edit material" onClose={onClose} />

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, color: c.gray500 }}>
          A new name or unit changes {material.priceHistory.length === 1 ? 'its price' : `all ${material.priceHistory.length} prices`} and the lines in saved lists (the name and unit of another material merges the two). Brand, size, rate and vendor correct the latest price
          {latest ? ` (${new Date(latest.date).toLocaleDateString('en-IN')}${latest.listTitle ? `, “${latest.listTitle}”` : ''})` : ''}, or add them as today's price.
        </Text>
        <LineEditor initial={initial} showQuantity={false} onSave={save} onCancel={onClose} alsoSave={{ label: "Save as today's price", onSave: saveAsToday }} />
      </View>

      {similar.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Same thing under another name?</Text>
          {similar.map((e) => (
            <View key={e.key} style={{ padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderColor: c.gray200, borderRadius: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>{e.name}</Text>
                {e.variants.some((v) => v.label) ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray700 }}>{e.variants.map((v) => v.label).filter(Boolean).join(' / ')}</Text> : null}
                <Text style={{ fontSize: 12, color: c.gray500 }}>
                  per {e.unit} · {e.priceHistory.length ? `₹${Math.round(e.latestPrice).toLocaleString('en-IN')} latest` : 'no prices'}
                </Text>
              </View>
              <Button size="sm" icon="call-merge" onPress={async () => (await mergeInto(e)) && onClose()}>
                Merge into this
              </Button>
            </View>
          ))}
        </View>
      )}

      <View style={{ paddingTop: 12, gap: 6, borderTopWidth: 1, borderTopColor: c.gray100 }}>
        <Button variant="dangerOutline" block icon="delete-outline" onPress={hide}>
          Delete from Rates
        </Button>
        <Text style={{ fontSize: 12, color: c.gray500 }}>Removes its prices from Rates and price checks. Saved lists don't change, and new purchases show up again. Restore it in Settings.</Text>
      </View>
    </Sheet>
  );
}

function Categories() {
  const c = useColors();
  const { snapshot, actions } = useAppState();
  const [name, setName] = useState('');
  const add = async () => {
    await actions.addCategory(name);
    setName('');
  };
  return (
    <View style={{ margin: 16, marginTop: 0, borderWidth: 1, borderColor: c.gray200, borderRadius: 16, backgroundColor: c.white, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.gray50, borderBottomWidth: 1, borderBottomColor: c.gray200 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Work types</Text>
        <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>{snapshot.categories.length} total</Text>
      </View>
      <View style={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field label="New work type" value={name} onChangeText={setName} onSubmitEditing={add} placeholder="e.g. Earthwork" maxLength={fieldLimits('categories').name} />
          </View>
          <Button variant="primary" onPress={add}>
            Add
          </Button>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {snapshot.categories.map((cat) => (
            <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, borderRadius: 20, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray50 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray700 }}>{cat.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${cat.name}`} onPress={() => actions.deleteCategory(cat.id)} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={14} color={c.gray500} />
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
