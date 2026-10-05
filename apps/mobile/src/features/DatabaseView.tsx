import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Check, ChevronDown, Database, Download, GitMerge, Pencil, TrendingUp, Trash2, Truck, X } from 'lucide-react';
import {
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
import { FilterChips } from '../components/FilterChips.tsx';
import { MaterialFilters } from '../components/MaterialFilters.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { shareFile, textToBase64 } from '../lib/files.ts';
import { useAppState } from '../state/AppState.tsx';
import { Button } from '../components/ui/Button.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Tabs } from '../components/ui/Tabs.tsx';
import { Sheet, SheetHeader } from '../components/ui/Sheet.tsx';

type SubTab = 'materials' | 'categories';

const SUB_TABS: { id: SubTab; label: string; about: string }[] = [
  { id: 'materials', label: 'Materials', about: 'One card per material. Tap Prices to fix or remove a price, Edit to rename or merge duplicates, or 🗑 to delete it from Rates.' },
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

function Materials({ entries, materialFilter, onMaterialFilter, categoryFilter, onCategory, addressFilter, onAddress }: Props) {
  const { actions, categoryNames, uniqueAddresses, itemDatabase, itemsFor, pendingDeletes } = useAppState();
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
        <>
          <FilterChips
            categories={categoryNames}
            categoryFilter={categoryFilter}
            onCategory={onCategory}
            addresses={uniqueAddresses}
            addressFilter={addressFilter}
            onAddress={onAddress}
            addressLabel="Filter by site"
          />
          <MaterialFilters value={materialFilter} options={materialFilterOptions(itemDatabase)} onChange={onMaterialFilter} />
        </>
      )}

      {totalMaterials > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelected(new Set());
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border
              ${selectMode ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            >
              {selectMode ? 'Cancel selection' : 'Select items'}
            </button>
            {selectMode && selected.size > 0 && (
              <div className="text-xs font-mono font-bold text-orange-600 flex items-center bg-orange-50 px-3 rounded-lg border border-orange-100">{selected.size} selected</div>
            )}
            <button
              onClick={exportCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border bg-white text-green-600 border-green-200 hover:border-green-400 hover:bg-green-50 flex items-center gap-1.5"
            >
              <Download size={12} /> Export CSV
            </button>
            {!selectMode && entries.length > 0 && (
              <button
                onClick={() => deleteFromData(entries)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border bg-white text-red-600 border-red-200 hover:border-red-400 hover:bg-red-50 flex items-center gap-1.5"
              >
                <Trash2 size={12} /> {entries.length === totalMaterials ? 'Delete all' : `Delete ${entries.length} shown`}
              </button>
            )}
          </div>

          <AnimatePresence>
            {selectMode && selected.size > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-wrap items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 shadow-sm"
              >
                <input
                  placeholder="New Unit"
                  value={bulk.unit}
                  onChange={(e) => setBulk((p) => ({ ...p, unit: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded w-16 outline-none focus:border-orange-300"
                />
                <input
                  placeholder="Vendor"
                  value={bulk.vendor}
                  onChange={(e) => setBulk((p) => ({ ...p, vendor: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded w-20 outline-none focus:border-orange-300"
                />
                <input
                  inputMode="decimal"
                  placeholder="Today's price"
                  value={bulk.price}
                  onChange={(e) => setBulk((p) => ({ ...p, price: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded w-16 outline-none focus:border-orange-300"
                />
                <button onClick={applyBulk} className="bg-orange-500 text-white px-3 py-1 rounded text-xs font-bold uppercase hover:bg-orange-600">
                  Apply
                </button>
                <button
                  onClick={async () => {
                    if (await deleteFromData(itemDatabase.filter((e) => selected.has(e.key)))) {
                      setSelected(new Set());
                      setSelectMode(false);
                    }
                  }}
                  className="bg-white text-red-600 border border-red-200 px-3 py-1 rounded text-xs font-bold uppercase hover:bg-red-50 flex items-center gap-1"
                >
                  <Trash2 size={11} /> Delete
                </button>
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
              Prices appear here when you save a purchase list (Save button), tap <b>Save rate</b> on a purchase (which saves the list), or confirm a vendor quote.
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
                  <div className="flex justify-between gap-2 md:block">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">per {item.unit}</div>
                      {item.variants.length === 1 && item.variants[0].label && <div className="text-xs font-bold text-gray-700">{item.variants[0].label}</div>}
                    </div>
                    <div className="text-right md:hidden shrink-0">
                      <PriceSummary item={item} />
                    </div>
                  </div>
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
                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="price" stroke="#f97316" fillOpacity={1} fill={`url(#colorPrice-${idx})`} strokeWidth={2} />
                            <Tooltip
                              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                              labelStyle={{ fontSize: '12px' }}
                              contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
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
                        <button onClick={() => setEditing(item)} className="text-xs font-bold text-gray-600 flex items-center gap-1 py-1" aria-label={`Edit ${item.name}`}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          onClick={() => actions.deleteMaterialLater({ key: item.key, name: item.name, unit: item.unit })}
                          className="ml-auto p-1 -mr-1 text-red-500 hover:bg-red-50 rounded-lg"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 size={16} />
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

      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-4">
        <TrendingUp className="text-orange-500 shrink-0" />
        <div>
          <h4 className="text-xs font-bold text-gray-700">Where prices come from</h4>
          <p className="text-xs text-gray-500">
            Saved purchase lists (Save or Save rate), rates saved on their own by earlier versions, and confirmed vendor quotes. Fixing or removing a price from a saved list
            changes that list too.
          </p>
        </div>
      </div>
      <AnimatePresence>{editing && <MaterialEditor key={editing.key} material={editing} onClose={() => setEditing(null)} />}</AnimatePresence>
    </>
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

function PriceRow({ point: p }: { point: MaterialEntry['priceHistory'][number] }) {
  const { actions, pendingDeletes } = useAppState();
  const dialogs = useDialogs();
  const [draft, setDraft] = useState<string | null>(null);
  const id = p.rateId ?? p.itemId;
  const pendingDelete = !!id && pendingDeletes.has(id);
  const label = `₹${p.price} from ${p.date}`;

  const save = async () => {
    if (draft === null) return;
    const value = parseAmount(draft);
    setDraft(null);
    if (value === null || value <= 0) {
      await dialogs.alert('Check the price', `“${draft}” is not a price. Use digits, e.g. 1500 or 1,500.`);
      return;
    }
    if (value !== p.price) await actions.setPrice({ itemId: p.itemId, rateId: p.rateId }, value);
  };
  const remove = () => (p.rateId ? actions.deleteIndexedRateLater(p.rateId) : p.itemId && actions.deleteItemLater(p.itemId));

  return (
    <li className={`px-3 py-2 flex items-center gap-2 ${pendingDelete ? 'bg-red-50/40' : ''}`}>
      <div className={`flex-1 min-w-0 ${pendingDelete ? 'line-through opacity-60' : ''}`}>
        <div className="flex justify-between items-center gap-2 text-sm">
          <span className="text-gray-700 truncate">
            {new Date(p.date).toLocaleDateString('en-IN')} · {p.vendor}
          </span>
          {draft !== null ? (
            <input
              autoFocus
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label={`New price for ${label}`}
              className="w-24 px-2 py-1 border border-orange-300 rounded-lg font-mono text-sm text-right outline-none"
            />
          ) : (
            <span className="font-mono font-bold shrink-0">₹{p.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          )}
        </div>
        {variantLabel(p.variant) && <div className="text-xs font-bold text-gray-700 truncate">{variantLabel(p.variant)}</div>}
        <div className="text-xs text-gray-500 truncate">
          {p.listTitle ? `Saved list: ${p.listTitle}` : 'Added rate'}
          {pendingDelete && p.itemId && ' (line removed from the list)'}
        </div>
      </div>
      {id &&
        (pendingDelete ? (
          <UndoButton onUndo={() => actions.undoDelete(id)} label={label} />
        ) : (
          draft === null && (
            <div className="flex shrink-0 -mr-1">
              <button onClick={() => setDraft(String(p.price))} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label={`Change price ${label}`}>
                <Pencil size={15} />
              </button>
              <button onClick={remove} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label={`Remove price ${label}`}>
                <Trash2 size={16} />
              </button>
            </div>
          )
        ))}
    </li>
  );
}

/** Rename a material, change its unit, merge it into a similar one, or hide it. */
function MaterialEditor({ material, onClose }: { material: MaterialEntry; onClose(): void }) {
  const { actions, itemDatabase, hiddenMaterials } = useAppState();
  const dialogs = useDialogs();
  const [name, setName] = useState(material.name);
  const [unit, setUnit] = useState(material.unit);
  const others = itemDatabase.filter((e) => e.key !== material.key);
  const similar = similarMaterials(material, itemDatabase);

  const mergeInto = async (target: MaterialEntry) => {
    const sameUnit = target.unit.toLowerCase() === material.unit.toLowerCase();
    const ok = await dialogs.confirm(`Merge into “${target.name}”?`, {
      message: `“${material.name}” (${material.priceHistory.length} prices) becomes “${target.name}” per ${target.unit}, combining both price histories. Future readings of the same words use the new name.${
        sameUnit ? '' : `\nThe units differ (${material.unit} vs ${target.unit}); the prices are not converted.`
      }`,
      confirmLabel: 'Merge',
    });
    if (!ok) return;
    await actions.renameMaterial(material.key, { item_name: target.name, unit: target.unit });
    onClose();
  };

  const save = async () => {
    const nextName = name.trim();
    const nextUnit = unit.trim() || 'unit';
    if (!nextName) return;
    const key = materialKey(nextName, nextUnit);
    if (key === material.key && nextName === material.name && nextUnit === material.unit) return onClose();
    const existing = others.find((e) => e.key === key);
    if (existing) return mergeInto(existing);
    const hidden = hiddenMaterials.find((h) => h.id === key);
    if (hidden) {
      const ok = await dialogs.confirm(`“${hidden.name}” per ${hidden.unit} is hidden`, {
        message: 'Saving merges into it and shows it in Rates again, with both price histories.',
        confirmLabel: 'Merge and unhide',
      });
      if (!ok) return;
    }
    await actions.renameMaterial(material.key, { item_name: nextName, unit: nextUnit });
    onClose();
  };

  const hide = async () => {
    await actions.hideMaterial({ key: material.key, name: material.name, unit: material.unit });
    onClose();
  };

  const field = 'mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500';
  return (
    <Sheet labelledBy="material-editor-title" onClose={onClose} className="p-5 space-y-5">
      <SheetHeader id="material-editor-title" title="Edit material" onClose={onClose} />

      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="block flex-1 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block w-24">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Unit</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={field} />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Changes its {material.priceHistory.length === 1 ? 'price' : `${material.priceHistory.length} prices`} and the lines in saved lists. Using the name and unit of another
          material merges the two.
        </p>
        <Button variant="primary" block onClick={save}>
          Save
        </Button>
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
                <button onClick={() => mergeInto(e)} className="shrink-0 px-3 py-2 text-xs font-bold text-orange-700 bg-orange-50 rounded-lg flex items-center gap-1">
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
