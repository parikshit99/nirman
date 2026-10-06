import { useState } from 'react';
import { ClipboardCheck, Copy, MapPin, Save, Trash2, Truck } from 'lucide-react';
import type { ListMeta } from '../data/repo.ts';
import { Button } from './ui/Button.tsx';
import { Sheet, SheetHeader } from './ui/Sheet.tsx';
import { SuggestInput } from './ui/SuggestInput.tsx';

interface Props {
  initial: ListMeta;
  categories: string[];
  recentAddresses: string[];
  /** Editing an existing record (shows "Update" instead of "Save"). */
  editing: boolean;
  /** Offer "Save as a new list" next to "Update saved list". */
  allowSaveAsNew: boolean;
  /** Used for the automatic title when left blank, e.g. "BOQ 30/09/2026". */
  titlePrefix: string;
  /**
   * Purchase lists: one vendor for every line, prefilled when the lines agree. A bill
   * read by the AI can carry the buyer's name as vendor; picking the vendor here fixes all lines.
   */
  vendor?: { initial: string; mixed: boolean; known: string[] };
  /** Saved lists: Delete sits here rather than on the list card, so it isn't tapped by accident. */
  onDelete?(): void;
  /** `vendor` is undefined when left as it was. */
  onSave(meta: ListMeta, asNew: boolean, vendor?: string): void;
  onClose(): void;
}

export function SaveModal({ initial, categories, recentAddresses, editing, allowSaveAsNew, titlePrefix, vendor, onDelete, onSave, onClose }: Props) {
  const [meta, setMeta] = useState(initial);
  const [vendorName, setVendorName] = useState(vendor?.initial ?? '');
  const set = (field: keyof ListMeta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setMeta((p) => ({ ...p, [field]: e.target.value }));

  const submit = (asNew: boolean) => {
    const autoTitle = `${titlePrefix} ${meta.site_date.split('-').reverse().join('/')}`.trim();
    const nextVendor = vendorName.trim();
    const vendorChanged = !!vendor && !!nextVendor && (vendor.mixed || nextVendor !== vendor.initial);
    onSave({ ...meta, title: meta.title.trim() || autoTitle, address: meta.address.trim() }, asNew, vendorChanged ? nextVendor : undefined);
  };

  const suggestions = meta.address
    ? recentAddresses.filter((a) => a.toLowerCase().includes(meta.address.toLowerCase()) && a !== meta.address)
    : recentAddresses.slice(0, 5);

  return (
    <Sheet labelledBy="save-title" onClose={onClose} className="p-6 space-y-4">
      <SheetHeader id="save-title" icon={<ClipboardCheck size={18} className="text-orange-500" />} title={editing ? 'List details' : 'Save list'} onClose={onClose} />

      <div className="space-y-4 pt-2">
        <div>
          <label htmlFor="save-name" className="text-xs text-gray-500 font-bold block mb-1">
            Name
          </label>
          <input
            id="save-name"
            value={meta.title}
            onChange={set('title')}
            onFocus={(e) => e.target.select()}
            placeholder="e.g. Cement order, Site visit"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
          />
        </div>

        <div>
          <label htmlFor="save-address" className="text-xs text-gray-500 font-bold block mb-1">
            Site address
          </label>
          <div className="relative">
            <MapPin size={14} className="absolute left-3 top-3.5 text-gray-500" />
            <input
              id="save-address"
              value={meta.address}
              onChange={set('address')}
              placeholder="e.g. Sector 44, Gurgaon"
              className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
            />
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((addr) => (
                <button
                  key={addr}
                  onClick={() => setMeta((p) => ({ ...p, address: addr }))}
                  className="px-2 py-1 bg-gray-100 hover:bg-orange-100 text-xs text-gray-600 rounded-md transition-colors border border-gray-200 flex items-center gap-1"
                >
                  <MapPin size={8} /> {addr}
                </button>
              ))}
            </div>
          )}
        </div>

        {vendor && (
          <div>
            <label htmlFor="save-vendor" className="text-xs text-gray-500 font-bold block mb-1">
              Vendor
            </label>
            <div className="relative">
              <Truck size={14} className="absolute left-3 top-3.5 text-gray-500" />
              <SuggestInput
                id="save-vendor"
                value={vendorName}
                onChange={setVendorName}
                suggestions={vendor.known}
                placeholder={vendor.mixed ? 'Several: each line keeps its own' : 'Who sold it'}
                className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{vendor.mixed ? 'Type or pick one to put it on every line.' : 'Applies to every line in the list.'}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="save-category" className="text-xs text-gray-500 font-bold block mb-1">
              Work type
            </label>
            <select
              id="save-category"
              value={meta.category}
              onChange={set('category')}
              className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-bold"
            >
              {[...new Set([meta.category, ...categories])].filter(Boolean).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="save-date" className="text-xs text-gray-500 font-bold block mb-1">
              Date
            </label>
            <input
              id="save-date"
              type="date"
              value={meta.site_date}
              onChange={set('site_date')}
              className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-mono"
            />
          </div>
        </div>
      </div>

      <div className="pt-4 flex flex-col gap-3">
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-[2]" onClick={() => submit(false)}>
            <Save size={14} /> {editing ? 'Update saved list' : 'Save'}
          </Button>
        </div>
        {allowSaveAsNew && (
          <Button block onClick={() => submit(true)}>
            <Copy size={14} /> Save as a new list
          </Button>
        )}
        {onDelete && (
          <Button variant="dangerOutline" block onClick={onDelete}>
            <Trash2 size={14} /> Delete this list
          </Button>
        )}
      </div>
    </Sheet>
  );
}
