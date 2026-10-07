import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowDownAZ, ArrowDownZA, ArrowUpDown, CalendarArrowDown, CalendarArrowUp, Check, ChevronDown, Database, Download, GitMerge, Pencil, SlidersHorizontal, TrendingUp, Trash2, Truck, X } from 'lucide-react';
import {
  VARIANT_FIELDS,
  materialDatabaseToCSV,
  materialFilterOptions,
  materialKey,
  parseAmount,
  similarMaterials,
  todayISO,
  variantLabel,
  type MaterialEntry,
  type MaterialFilter,
} from '@nirman/shared';
import { MATERIAL_FILTER_FIELDS, MaterialFilters } from '../components/MaterialFilters.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { LineEditor, type LineValues } from '../components/LineEditor.tsx';
import { shareFile, textToBase64 } from '../lib/files.ts';
import { useAppState } from '../state/AppState.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Tabs } from '../components/ui/Tabs.tsx';
import { Sheet, SheetHeader, SheetLabel, SheetOption } from '../components/ui/Sheet.tsx';
import { Button } from '../components/ui/Button.tsx';
import { MATERIAL_SORTS, saveMaterialSort, savedMaterialSort, sortMaterials, type MaterialSort } from '@nirman/core';

type SubTab = 'materials' | 'categories';

const SUB_TABS: { id: SubTab; label: string; about: string }[] = [
  { id: 'materials', label: 'Materials', about: 'One card per material. Tap it (or Edit) to change its name, size, rate or vendor, merge it or delete it. Open Prices and tap a price to fix just that one.' },
  { id: 'categories', label: 'Work types', about: 'Types of work (e.g. Earthwork) you can tag a saved purchase list or BOQ with, to filter by later.' },
];

interface Props {
  entries: MaterialEntry[];
  materialFilter: MaterialFilter;
  onMaterialFilter(f: MaterialFilter): void;
  categoryFilter: string;
  onCategory(c: string): void;
  addressFilter: string;
  onAddress(a: string): void;
}

export function DatabaseView(props: Props) {
  const [tab, setTab] = useState<SubTab>('materials');
  return (
    <div className="space-y-6">
      <Tabs<SubTab> label="Rates" options={SUB_TABS} value={tab} onChange={setTab} className="md:max-w-sm" />
      <p className="text-xs text-gray-600 leading-snug -mt-3">{SUB_TABS.find((t) => t.id === tab)!.about}</p>
      {tab === 'materials' && <Materials {...props} />}
      {tab === 'categories' && <Categories />}
    </div>
  );
}

function Materials({ entries: filtered, materialFilter, onMaterialFilter, categoryFilter, onCategory, addressFilter, onAddress }: Props) {
  const { actions, categoryNames, uniqueAddresses, itemDatabase, itemsFor, pendingDeletes } = useAppState();
  const [sort, setSort] = useState<MaterialSort>(savedMaterialSort);
  const [sheet, setSheet] = useState<'filter' | 'sort' | null>(null);
  const entries = sortMaterials(filtered, sort);
  const filterChips = [
    ...(categoryFilter !== 'All' ? [{ label: categoryFilter, clear: () => onCategory('All') }] : []),
    ...(addressFilter !== 'All' ? [{ label: addressFilter, clear: () => onAddress('All') }] : []),
    ...MATERIAL_FILTER_FIELDS.filter((f) => materialFilter[f.key]).map((f) => ({
      label: `${f.label}: ${materialFilter[f.key]}`,
      clear: () => onMaterialFilter({ ...materialFilter, [f.key]: '' }),
    })),
  ];
  const clearFilters = () => {
    onCategory('All');
    onAddress('All');
    onMaterialFilter({});
  };
  const dialogs = useDialogs();
  const totalMaterials = itemDatabase.length;
  const unsavedPriced = itemsFor('audit').filter((i) => i.unit_price > 0 && !pendingDeletes.has(i.id)).length;
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ unit: '', vendor: '', price: '' });
  const [open, setOpen] = useState<string | null>(null);
  const [openVariants, setOpenVariants] = useState<string | null>(null);
  const [editing, setEditing] = useState<MaterialEntry | null>(null);
  // Leaving the tab carries out price removals still waiting for undo.
  useEffect(() => () => void actions.flushDeletes(), [actions]);

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
    await actions.bulkEditMaterials(materials, {
      unit: bulk.unit.trim() || undefined,
      vendor: bulk.vendor.trim() || undefined,
      price,
    });
    setSelected(new Set());
    setSelectMode(false);
    setBulk({ unit: '', vendor: '', price: '' });
  };

  /** Delete materials from Rates after confirming; true when done. */
  const deleteFromData = async (materials: MaterialEntry[]) => {
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
      await shareFile(`material_database_${todayISO()}.csv`, textToBase64(materialDatabaseToCSV(entries)), 'text/csv');
    } catch (err) {
      await dialogs.alert('Export failed', (err as Error).message);
    }
  };

  return (
    <>
      {totalMaterials > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" onClick={() => setSheet('filter')} aria-label={`Filter${filterChips.length ? `, ${filterChips.length} on` : ''}`} className={filterChips.length ? 'border-orange-300 text-orange-700' : ''}>
              <SlidersHorizontal size={14} /> Filter{filterChips.length > 0 && ` (${filterChips.length})`}
            </Button>
            <Button size="sm" onClick={() => setSheet('sort')} aria-label={`Sort: ${MATERIAL_SORTS.find((o) => o.id === sort)!.label}`}>
              <ArrowUpDown size={14} /> {MATERIAL_SORTS.find((o) => o.id === sort)!.short}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSelectMode(!selectMode);
                setSelected(new Set());
              }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </Button>
          </div>
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map((c) => (
                <button
                  key={c.label}
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className="h-10 max-w-full pl-3 pr-2 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-orange-800 flex items-center gap-1"
                >
                  <span className="truncate">{c.label}</span>
                  <X size={14} className="shrink-0" />
                </button>
              ))}
              <span className="text-xs text-gray-500">
                {entries.length} of {totalMaterials} {totalMaterials === 1 ? 'material' : 'materials'}
              </span>
            </div>
          )}
          {selectMode && (
            <div className="text-xs text-gray-600">
              {selected.size ? `${selected.size} selected: change their unit or vendor, add today's price, or delete them.` : 'Tap materials to select them.'}
            </div>
          )}
          <AnimatePresence>
            {selectMode && selected.size > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-2 bg-gray-50 p-2 rounded-xl border border-gray-200 shadow-sm"
              >
                <div className="grid grid-cols-3 gap-2">
                  <input aria-label="New unit" placeholder="New unit" value={bulk.unit} onChange={(e) => setBulk((p) => ({ ...p, unit: e.target.value }))} className="h-10 w-full min-w-0 px-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-400" />
                  <input aria-label="Vendor" placeholder="Vendor" value={bulk.vendor} onChange={(e) => setBulk((p) => ({ ...p, vendor: e.target.value }))} className="h-10 w-full min-w-0 px-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-400" />
                  <input
                    aria-label="Today's price"
                    inputMode="decimal"
                    placeholder="Today's ₹"
                    value={bulk.price}
                    onChange={(e) => setBulk((p) => ({ ...p, price: e.target.value }))}
                    className="h-10 w-full min-w-0 px-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-400 font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="dangerOutline"
                    onClick={async () => {
                      if (await deleteFromData(itemDatabase.filter((e) => selected.has(e.key)))) {
                        setSelected(new Set());
                        setSelectMode(false);
                      }
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </Button>
                  <Button size="sm" variant="primary" className="flex-1" onClick={applyBulk}>
                    <Check size={14} /> Apply to {selected.size}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm w-full divide-y divide-gray-100">
        {entries.length === 0 ? (
          totalMaterials > 0 ? (
            <EmptyState icon={Database} title="No materials match.">
              Check the filters or search.
            </EmptyState>
          ) : (
            <EmptyState icon={Database} title="No prices yet">
              A price appears here as soon as you add a purchase with a rate, and when you confirm a vendor quote.
              {unsavedPriced > 0 && ` Your purchase list has ${unsavedPriced} priced item${unsavedPriced === 1 ? '' : 's'} not added yet.`}
            </EmptyState>
          )
        ) : (
          entries.map((item, idx) => {
            const points = item.priceHistory.filter((h) => h.price > 0);
            const isSelected = selected.has(item.key);
            if (pendingDeletes.has(item.key)) {
              return (
                <div key={item.key} className="px-4 md:px-6 py-3 flex items-center gap-3 bg-red-50/40">
                  <div className="flex-1 min-w-0 opacity-60">
                    <div className="font-bold text-sm line-through truncate">{item.name}</div>
                    <div className="text-xs line-through">
                      per {item.unit} · {item.priceHistory.length} price{item.priceHistory.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span className="text-xs text-red-600 shrink-0">Deleted</span>
                  <UndoButton onUndo={() => actions.undoDelete(item.key)} label={item.name} />
                </div>
              );
            }
            return (
              <div
                key={item.key}
                onClick={() => selectMode && toggle(item.key)}
                className={`px-4 md:px-6 py-4 flex flex-wrap gap-3 transition-colors ${selectMode ? 'cursor-pointer' : ''} ${isSelected ? 'bg-orange-50/60' : ''}`}
              >
                {selectMode && (
                  <div
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors
                      ${isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 bg-white'}`}
                  >
                    {isSelected && <Check size={12} strokeWidth={4} />}
                  </div>
                )}
                <div className="flex-1 min-w-0 md:grid md:grid-cols-[1.5fr_1fr_1.5fr] md:gap-4 md:items-center">
                  {/* Tapping the material opens its editor (in select mode the whole row selects instead). */}
                  <button
                    type="button"
                    onClick={() => !selectMode && setEditing(item)}
                    tabIndex={selectMode ? -1 : 0}
                    aria-label={selectMode ? undefined : `Edit ${item.name}`}
                    className="w-full text-left flex justify-between gap-2 md:block"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                        {item.name}
                        {!selectMode && <Pencil size={12} className="text-gray-500 shrink-0" />}
                      </div>
                      <div className="text-xs text-gray-500">per {item.unit}</div>
                      {item.variants.length === 1 && item.variants[0].label && <div className="text-xs font-bold text-gray-700">{item.variants[0].label}</div>}
                    </div>
                    <div className="text-right md:hidden shrink-0">
                      <PriceSummary item={item} />
                    </div>
                  </button>
                  <div className="hidden md:block">
                    <PriceSummary item={item} />
                  </div>
                  <div className="mt-2 md:mt-0 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {item.vendors.map((v) => (
                        <span key={v} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs flex items-center gap-1 border border-gray-200">
                          <Truck size={12} /> {v}
                        </span>
                      ))}
                      {item.vendors.length === 0 && <span className="text-xs text-gray-500 italic">No vendor yet</span>}
                    </div>
                    {points.length > 1 && item.variants.length <= 1 && (
                      <div className="h-12 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={points}>
                            <defs>
                              <linearGradient id={`colorPrice-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-brand-primary)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--color-brand-primary)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="price" stroke="var(--color-brand-primary)" fillOpacity={1} fill={`url(#colorPrice-${idx})`} strokeWidth={2} />
                            <Tooltip
                              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                              labelStyle={{ fontSize: '12px' }}
                              contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'var(--color-white)', color: 'var(--color-gray-900)' }}
                              formatter={(value) => [`₹${value}`, 'Price']}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {!selectMode && (
                      <div className="flex gap-4">
                        <button
                          onClick={() => setOpen(open === item.key ? null : item.key)}
                          aria-expanded={open === item.key}
                          className="text-xs font-bold text-orange-600 flex items-center gap-1 py-1"
                        >
                          <ChevronDown size={14} className={`transition-transform ${open === item.key ? 'rotate-180' : ''}`} /> Prices ({item.priceHistory.length})
                        </button>
                        {item.variants.length > 1 && (
                          <button
                            onClick={() => setOpenVariants(openVariants === item.key ? null : item.key)}
                            aria-expanded={openVariants === item.key}
                            className="text-xs font-bold text-orange-600 flex items-center gap-1 py-1"
                          >
                            <ChevronDown size={14} className={`transition-transform ${openVariants === item.key ? 'rotate-180' : ''}`} /> Variants ({item.variants.length})
                          </button>
                        )}
                        <button onClick={() => setEditing(item)} className="text-xs font-bold text-gray-600 flex items-center gap-1 py-1">
                          <Pencil size={13} /> Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {openVariants === item.key && !selectMode && <VariantList material={item} />}
                {open === item.key && !selectMode && <PriceList points={item.priceHistory} />}
              </div>
            );
          })
        )}
      </div>

      {entries.length > 0 && !selectMode && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={exportCsv}>
            <Download size={14} /> Export CSV
          </Button>
          <Button size="sm" variant="dangerOutline" onClick={() => deleteFromData(entries)}>
            <Trash2 size={14} /> {entries.length === totalMaterials ? 'Delete all' : `Delete ${entries.length} shown`}
          </Button>
        </div>
      )}

      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-4">
        <TrendingUp className="text-orange-500 shrink-0" />
        <div>
          <h4 className="text-xs font-bold text-gray-700">Where prices come from</h4>
          <p className="text-xs text-gray-500">
            Every purchase with a rate, as soon as it is added (the open purchase list and saved lists), confirmed vendor quotes, and rates added on their own. Fixing or
            removing a price here changes its list too. To keep one price out (e.g. transport included), edit the purchase and tick <b>Leave out of Rates</b>.
          </p>
        </div>
      </div>
      <AnimatePresence>
        {sheet === 'filter' && (
          <FilterSheet
            count={entries.length}
            active={filterChips.length > 0}
            onClear={clearFilters}
            onClose={() => setSheet(null)}
            categories={categoryNames}
            categoryFilter={categoryFilter}
            onCategory={onCategory}
            addresses={uniqueAddresses}
            addressFilter={addressFilter}
            onAddress={onAddress}
            materialFilter={materialFilter}
            onMaterialFilter={onMaterialFilter}
          />
        )}
        {sheet === 'sort' && (
          <Sheet labelledBy="rates-sort-title" onClose={() => setSheet(null)} closeOnBackdrop className="p-5 space-y-3">
            <SheetHeader id="rates-sort-title" title="Sort materials" onClose={() => setSheet(null)} />
            <div className="space-y-2">
              {MATERIAL_SORTS.map((o) => (
                <SheetOption
                  key={o.id}
                  icon={SORT_ICONS[o.id]}
                  aria-pressed={sort === o.id}
                  label={
                    <span className="flex items-center gap-2">
                      {o.label}
                      {sort === o.id && <Check size={16} className="text-orange-600" />}
                    </span>
                  }
                  about={o.about}
                  onClick={() => {
                    setSort(o.id);
                    saveMaterialSort(o.id);
                    setSheet(null);
                  }}
                />
              ))}
            </div>
          </Sheet>
        )}
      </AnimatePresence>
      <AnimatePresence>{editing && <MaterialEditor key={editing.key} material={editing} onClose={() => setEditing(null)} />}</AnimatePresence>
    </>
  );
}

const SORT_ICONS: Record<MaterialSort, typeof ArrowDownAZ> = { newest: CalendarArrowDown, oldest: CalendarArrowUp, name: ArrowDownAZ, nameDesc: ArrowDownZA };

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
    <Sheet labelledBy="rates-filter-title" onClose={onClose} closeOnBackdrop className="p-5 space-y-4">
      <SheetHeader id="rates-filter-title" title="Filter materials" onClose={onClose} />
      {categories.length > 0 && (
        <section>
          <SheetLabel>Work type</SheetLabel>
          <ChoiceChips options={categories} value={categoryFilter} onChange={onCategory} />
        </section>
      )}
      {addresses.length > 0 && (
        <section>
          <SheetLabel>Site address</SheetLabel>
          <ChoiceChips options={addresses} value={addressFilter} onChange={onAddress} />
        </section>
      )}
      <MaterialFilters value={materialFilter} options={materialFilterOptions(itemDatabase)} onChange={onMaterialFilter} clearable={false} />
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={onClear} disabled={!active}>
          Clear all
        </Button>
        <Button variant="primary" className="flex-1" onClick={onClose}>
          Show {count} {count === 1 ? 'material' : 'materials'}
        </Button>
      </div>
    </Sheet>
  );
}

/** "All" and each option as a chip; one is picked. */
function ChoiceChips({ options, value, onChange }: { options: string[]; value: string; onChange(v: string): void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {['All', ...options].map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`h-10 max-w-full px-4 rounded-full text-xs font-bold truncate border transition-colors ${
            value === o ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-orange-300'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Latest price and range; with several brands/models, only the range (one brand's latest says little about another's). */
function PriceSummary({ item }: { item: MaterialEntry }) {
  if (item.variants.length > 1) {
    return (
      <>
        <div className="font-mono font-bold text-sm">{item.minPrice === item.maxPrice ? inr(item.minPrice) : `${inr(item.minPrice)}–${inr(item.maxPrice)}`}</div>
        <div className="text-xs text-gray-500">{item.variants.length} variants</div>
      </>
    );
  }
  return (
    <>
      <div className="font-mono font-bold text-sm">{inr(item.latestPrice)}</div>
      {item.minPrice !== item.maxPrice && (
        <div className="text-xs text-gray-500 font-mono">
          {inr(item.minPrice)}–{inr(item.maxPrice)}
        </div>
      )}
    </>
  );
}

/** Each brand/model/spec/colour of a material with its latest price and range. */
function VariantList({ material }: { material: MaterialEntry }) {
  return (
    <ul className="basis-full min-w-0 mt-2 divide-y divide-gray-100 border border-gray-100 rounded-xl bg-gray-50/50">
      {material.variants.map((v) => (
        <li key={v.key} className="px-3 py-2 flex justify-between items-center gap-2 text-sm">
          <span className="min-w-0">
            <span className="font-bold block truncate">{v.label || 'No brand / model given'}</span>
            <span className="text-xs text-gray-500">
              {v.priceHistory.length} price{v.priceHistory.length === 1 ? '' : 's'}
            </span>
          </span>
          <span className="text-right shrink-0">
            <span className="font-mono font-bold block">{v.priceHistory.length ? `₹${v.latestPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</span>
            {v.minPrice !== v.maxPrice && (
              <span className="text-xs text-gray-500 font-mono">
                ₹{v.minPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}–₹{v.maxPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Every price recorded for one material, newest first. Each can be corrected or removed (with undo). */
function PriceList({ points }: { points: MaterialEntry['priceHistory'] }) {
  return (
    <ul className="basis-full min-w-0 mt-2 divide-y divide-gray-100 border border-gray-100 rounded-xl bg-gray-50/50">
      {[...points].reverse().map((p, i) => (
        <PriceRow key={p.rateId ?? p.itemId ?? `${p.timestamp}-${i}`} point={p} />
      ))}
    </ul>
  );
}

/** Where a price came from, for its row in Prices or above its editor. */
function priceSource(p: MaterialEntry['priceHistory'][number], where: 'row' | 'edit') {
  if (p.draft) return where === 'row' ? 'Open purchase list' : 'Line in the open purchase list; the list changes too.';
  if (p.listTitle) return where === 'row' ? `Saved list: ${p.listTitle}` : `Line in the saved list “${p.listTitle}”; the list changes too.`;
  return 'Added rate';
}

function PriceRow({ point: p }: { point: MaterialEntry['priceHistory'][number] }) {
  const { actions, pendingDeletes, snapshot } = useAppState();
  const [editing, setEditing] = useState(false);
  const id = p.rateId ?? p.itemId;
  const pendingDelete = !!id && pendingDeletes.has(id);
  const label = `₹${p.price} from ${p.date}`;
  const item = p.itemId ? snapshot.items.find((i) => i.id === p.itemId) : undefined;
  const rate = p.rateId ? snapshot.rates.find((r) => r.id === p.rateId) : undefined;
  const remove = () => (p.rateId ? actions.deleteIndexedRateLater(p.rateId) : p.itemId && actions.deleteItemLater(p.itemId));

  if (editing && (item || rate)) {
    return (
      <li className="px-2 py-3 bg-orange-50/60">
        <p className="text-xs text-gray-500 mb-2">{priceSource(p, 'edit')}</p>
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
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-2 ${pendingDelete ? 'bg-red-50/40 px-3 py-2' : ''}`}>
      {pendingDelete ? (
        <>
          <div className="flex-1 min-w-0 line-through opacity-60 text-sm">
            {new Date(p.date).toLocaleDateString('en-IN')} · {p.vendor} · ₹{p.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            {p.itemId && <div className="text-xs">(line removed from the list)</div>}
          </div>
          <UndoButton onUndo={() => actions.undoDelete(id!)} label={label} />
        </>
      ) : (
        <button onClick={() => id && setEditing(true)} disabled={!id} className="flex-1 min-w-0 text-left px-3 py-2" aria-label={`Edit price ${label}`}>
          <div className="flex justify-between items-center gap-2 text-sm">
            <span className="text-gray-700 truncate">
              {new Date(p.date).toLocaleDateString('en-IN')} · {p.vendor}
            </span>
            <span className="font-mono font-bold shrink-0 flex items-center gap-1.5">
              ₹{p.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              {id && <Pencil size={12} className="text-gray-500" />}
            </span>
          </div>
          {variantLabel(p.variant) && <div className="text-xs font-bold text-gray-700 truncate">{variantLabel(p.variant)}</div>}
          <div className="text-xs text-gray-500 truncate">{priceSource(p, 'row')}</div>
        </button>
      )}
    </li>
  );
}

/**
 * The line editor for a whole material: renaming it or changing its unit changes every price
 * (and merges into a material with the same name and unit); brand, size, rate and vendor correct
 * its latest price, or are recorded as today's price. Also merges duplicates and deletes it.
 */
function MaterialEditor({ material, onClose }: { material: MaterialEntry; onClose(): void }) {
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
    const sameUnit = target.unit.toLowerCase() === material.unit.toLowerCase();
    const ok = await dialogs.confirm(`Merge into “${target.name}”?`, {
      message: `“${material.name}” (${material.priceHistory.length} prices) becomes “${target.name}” per ${target.unit}, combining both price histories. Future readings of the same words use the new name.${
        sameUnit ? '' : `\nThe units differ (${material.unit} vs ${target.unit}); the prices are not converted.`
      }`,
      confirmLabel: 'Merge',
    });
    if (!ok) return false;
    await actions.renameMaterial(material.key, { item_name: target.name, unit: target.unit });
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
    <Sheet labelledBy="material-editor-title" onClose={onClose} className="p-5 space-y-5">
      <SheetHeader id="material-editor-title" title="Edit material" onClose={onClose} />

      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          A new name or unit changes {material.priceHistory.length === 1 ? 'its price' : `all ${material.priceHistory.length} prices`} and the lines in saved lists
          (the name and unit of another material merges the two). Brand, size, rate and vendor correct the latest price
          {latest ? ` (${new Date(latest.date).toLocaleDateString('en-IN')}${latest.listTitle ? `, “${latest.listTitle}”` : ''})` : ''}, or add them as today's price.
        </p>
        <LineEditor
          initial={initial}
          showQuantity={false}
          onSave={save}
          onCancel={onClose}
          alsoSave={{ label: "Save as today's price", onSave: saveAsToday }}
        />
      </div>

      {similar.length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-gray-500 mb-2">Same thing under another name?</h4>
          <ul className="space-y-1.5">
            {similar.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-2 p-2 border border-gray-200 rounded-xl">
                <span className="min-w-0 text-sm">
                  <span className="font-bold block break-words">{e.name}</span>
                  {e.variants.some((v) => v.label) && (
                    <span className="text-xs font-bold text-gray-700 block break-words">
                        {e.variants.map((v) => v.label).filter(Boolean).join(' / ')}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    per {e.unit} · {e.priceHistory.length ? `₹${Math.round(e.latestPrice).toLocaleString('en-IN')} latest` : 'no prices'}
                  </span>
                </span>
                <button onClick={async () => (await mergeInto(e)) && onClose()} className="shrink-0 px-3 py-2 text-xs font-bold text-orange-700 bg-orange-50 rounded-lg flex items-center gap-1">
                  <GitMerge size={13} /> Merge into this
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-3 border-t border-gray-100">
        <button onClick={hide} className="w-full py-2.5 text-xs font-bold text-red-600 bg-red-50 rounded-xl flex items-center justify-center gap-2">
          <Trash2 size={14} /> Delete from Rates
        </button>
        <p className="text-xs text-gray-500 mt-1.5">
          Removes its prices from Rates and price checks. Saved lists don't change, and new purchases show up again. Restore it in Settings.
        </p>
      </section>
    </Sheet>
  );
}

function Categories() {
  const { snapshot, actions } = useAppState();
  const [name, setName] = useState('');
  const add = async () => {
    await actions.addCategory(name);
    setName('');
  };
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm max-w-2xl mx-auto">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="text-xs font-bold text-gray-500">Work types</div>
        <div className="text-xs font-mono text-gray-500">{snapshot.categories.length} Total</div>
      </div>
      <div className="p-6">
        <div className="flex gap-2 mb-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add new category (e.g. Earthwork)"
            className="flex-1 min-w-0 px-4 py-2 border border-gray-200 rounded-xl outline-none font-mono text-sm focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
          />
          <button onClick={add} className="px-6 py-2 bg-orange-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-orange-600 transition-colors">
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {snapshot.categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 pl-4 pr-1 py-1 bg-gray-50 border border-gray-200 rounded-full">
              <span className="text-xs font-bold text-gray-700">{cat.name}</span>
              <button
                onClick={() => actions.deleteCategory(cat.id)}
                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                aria-label={`Delete ${cat.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
