import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Check, Database, Download, TrendingUp, Trash2, Truck, X } from 'lucide-react';
import { materialDatabaseToCSV, parseAmount, todayISO, type MaterialEntry } from '@nirman/shared';
import { FilterChips } from '../components/FilterChips.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { shareFile, textToBase64 } from '../lib/files.ts';
import { useAppState } from '../state/AppState.tsx';

type SubTab = 'materials' | 'indexed' | 'categories';

interface Props {
  entries: MaterialEntry[];
  categoryFilter: string;
  onCategory(c: string): void;
  addressFilter: string;
  onAddress(a: string): void;
}

export function DatabaseView(props: Props) {
  const [tab, setTab] = useState<SubTab>('materials');
  return (
    <div className="space-y-6">
      <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
        {(
          [
            ['materials', 'Materials'],
            ['indexed', 'Indexed Log'],
            ['categories', 'Categories'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 md:px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap
              ${tab === id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'materials' && <Materials {...props} />}
      {tab === 'indexed' && <IndexedLog />}
      {tab === 'categories' && <Categories />}
    </div>
  );
}

function Materials({ entries, categoryFilter, onCategory, addressFilter, onAddress }: Props) {
  const { actions, categoryNames, uniqueAddresses, itemDatabase, itemsFor, pendingDeletes } = useAppState();
  const dialogs = useDialogs();
  const totalMaterials = itemDatabase.length;
  const unsavedPriced = itemsFor('audit').filter((i) => i.unit_price > 0 && !pendingDeletes.has(i.id)).length;
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ unit: '', vendor: '', price: '' });

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
    await actions.bulkEditMaterials(selected, {
      unit: bulk.unit.trim() || undefined,
      vendor: bulk.vendor.trim() || undefined,
      price,
    });
    setSelected(new Set());
    setSelectMode(false);
    setBulk({ unit: '', vendor: '', price: '' });
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
      <FilterChips
        categories={categoryNames}
        categoryFilter={categoryFilter}
        onCategory={onCategory}
        addresses={uniqueAddresses}
        addressFilter={addressFilter}
        onAddress={onAddress}
        addressLabel="Filter by Project Location"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setSelectMode(!selectMode);
              setSelected(new Set());
            }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border
              ${selectMode ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
          >
            {selectMode ? 'Cancel Selection' : 'Select Items'}
          </button>
          {selectMode && selected.size > 0 && (
            <div className="text-[11px] font-mono font-bold text-orange-600 flex items-center bg-orange-50 px-3 rounded-lg border border-orange-100">
              {selected.size} Selected
            </div>
          )}
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border bg-white text-green-600 border-green-200 hover:border-green-400 hover:bg-green-50 flex items-center gap-1.5"
          >
            <Download size={12} /> Export CSV
          </button>
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
                className="px-2 py-1 text-[11px] border border-gray-200 rounded w-16 outline-none focus:border-orange-300"
              />
              <input
                placeholder="New Vendor"
                value={bulk.vendor}
                onChange={(e) => setBulk((p) => ({ ...p, vendor: e.target.value }))}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded w-20 outline-none focus:border-orange-300"
              />
              <input
                inputMode="decimal"
                placeholder="New Price"
                value={bulk.price}
                onChange={(e) => setBulk((p) => ({ ...p, price: e.target.value }))}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded w-16 outline-none focus:border-orange-300"
              />
              <button onClick={applyBulk} className="bg-orange-500 text-white px-3 py-1 rounded text-[11px] font-bold uppercase hover:bg-orange-600">
                Apply to All
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm w-full divide-y divide-gray-100">
        {entries.length === 0 ? (
          <div className="p-10 text-center text-gray-400 space-y-2">
            <Database size={40} className="mx-auto opacity-30" />
            {totalMaterials > 0 ? (
              <p className="text-sm">No materials match the search or filters.</p>
            ) : (
              <>
                <p className="text-sm font-bold text-gray-600">No prices yet</p>
                <p className="text-xs leading-relaxed max-w-sm mx-auto">
                  Prices appear here when you save a session (Save button) or tap <b>Index rate</b> on an Audit item.
                  {unsavedPriced > 0 && ` Your Audit list has ${unsavedPriced} priced item${unsavedPriced === 1 ? '' : 's'} not added yet.`}
                </p>
              </>
            )}
          </div>
        ) : (
          entries.map((item, idx) => {
            const points = item.priceHistory.filter((h) => h.price > 0);
            const isSelected = selected.has(item.key);
            return (
              <div
                key={item.key}
                onClick={() => selectMode && toggle(item.key)}
                className={`px-4 md:px-6 py-4 flex gap-3 transition-colors ${selectMode ? 'cursor-pointer' : ''} ${isSelected ? 'bg-orange-50/60' : ''}`}
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
                    </div>
                    <div className="text-right md:hidden shrink-0">
                      <div className="font-mono font-bold text-sm">₹{Math.round(item.latestPrice).toLocaleString('en-IN')}</div>
                      {item.minPrice !== item.maxPrice && (
                        <div className="text-xs text-gray-500 font-mono">
                          ₹{item.minPrice.toLocaleString('en-IN')}–₹{item.maxPrice.toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <div className="font-mono font-bold text-sm">₹{Math.round(item.latestPrice).toLocaleString('en-IN')}</div>
                    {item.minPrice !== item.maxPrice && (
                      <div className="text-xs text-gray-500 font-mono">
                        Range ₹{item.minPrice.toLocaleString('en-IN')}–₹{item.maxPrice.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 md:mt-0 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {item.vendors.map((v) => (
                        <span key={v} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs flex items-center gap-1 border border-gray-200">
                          <Truck size={12} /> {v}
                        </span>
                      ))}
                      {item.vendors.length === 0 && <span className="text-xs text-gray-400 italic">No vendor yet</span>}
                    </div>
                    {points.length > 1 && (
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
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-4">
        <TrendingUp className="text-orange-500 shrink-0" />
        <div>
          <h4 className="text-xs font-bold text-gray-700">Database Indexing Active</h4>
          <p className="text-[11px] text-gray-500">Every saved session and indexed rate adds to your material price history.</p>
        </div>
      </div>
    </>
  );
}

function IndexedLog() {
  const { snapshot, actions, pendingDeletes } = useAppState();
  const rates = snapshot.rates;
  useEffect(() => () => void actions.flushDeletes(), [actions]);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm w-full divide-y divide-gray-100">
      {rates.length === 0 ? (
        <div className="p-10 text-center text-gray-400 text-sm">No indexed rates yet. Tap “Index rate” on an Audit item to add one.</div>
      ) : (
        rates.map((rate) => {
          const pendingDelete = pendingDeletes.has(rate.id);
          return (
            <div key={rate.id} className={`px-4 md:px-6 py-3 flex items-center gap-3 ${pendingDelete ? 'bg-red-50/40' : ''}`}>
              <div className={`flex-1 min-w-0 ${pendingDelete ? 'line-through opacity-60' : ''}`}>
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-sm text-gray-900 truncate">{rate.item_name}</span>
                  <span className="font-mono font-bold text-sm shrink-0">
                    ₹{rate.price.toLocaleString('en-IN')} <span className="text-xs font-normal text-gray-500">/ {rate.unit}</span>
                  </span>
                </div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                  <span className="flex items-center gap-1">
                    <Truck size={12} /> {rate.vendor}
                  </span>
                  <span>{rate.date}</span>
                </div>
              </div>
              {pendingDelete ? (
                <UndoButton onUndo={() => actions.undoDelete(rate.id)} label={rate.item_name} />
              ) : (
                <button onClick={() => actions.deleteIndexedRateLater(rate.id)} className="p-2 -mr-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label={`Remove ${rate.item_name} from index`}>
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
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
        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Work Categories</div>
        <div className="text-[11px] font-mono text-gray-500">{snapshot.categories.length} Total</div>
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
          <button onClick={add} className="px-6 py-2 bg-orange-500 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-orange-600 transition-colors">
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {snapshot.categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 pl-4 pr-1 py-1 bg-gray-50 border border-gray-200 rounded-full">
              <span className="text-xs font-bold text-gray-700">{cat.name}</span>
              <button
                onClick={() => actions.deleteCategory(cat.id)}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
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
