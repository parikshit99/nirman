import { useState } from 'react';
import { motion } from 'motion/react';
import { ClipboardCheck, Copy, MapPin, Save, X } from 'lucide-react';
import type { ListMeta } from '../data/repo.ts';
import { useBackHandler } from '../lib/backButton.ts';

interface Props {
  initial: ListMeta;
  categories: string[];
  recentAddresses: string[];
  /** Editing an existing record (shows "Update" instead of "Save"). */
  editing: boolean;
  /** Offer "Save as new record" next to "Update". */
  allowSaveAsNew: boolean;
  /** Used for the automatic title when left blank, e.g. "BOQ 30/09/2026". */
  titlePrefix: string;
  onSave(meta: ListMeta, asNew: boolean): void;
  onClose(): void;
}

export function SaveModal({ initial, categories, recentAddresses, editing, allowSaveAsNew, titlePrefix, onSave, onClose }: Props) {
  useBackHandler(onClose);
  const [meta, setMeta] = useState(initial);
  const set = (field: keyof ListMeta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setMeta((p) => ({ ...p, [field]: e.target.value }));

  const submit = (asNew: boolean) => {
    const autoTitle = `${titlePrefix} ${meta.site_date.split('-').reverse().join('/')}`.trim();
    onSave({ ...meta, title: meta.title.trim() || autoTitle, address: meta.address.trim() }, asNew);
  };

  const suggestions = meta.address
    ? recentAddresses.filter((a) => a.toLowerCase().includes(meta.address.toLowerCase()) && a !== meta.address)
    : recentAddresses.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-title"
        className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 id="save-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm flex items-center gap-2">
            <ClipboardCheck size={18} className="text-orange-500" /> {editing ? 'Edit Site Info' : 'Site Metadata'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black transition-colors" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 pt-2">
          <div>
            <label htmlFor="save-name" className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">
              Session Title
            </label>
            <input
              id="save-name"
              value={meta.title}
              onChange={set('title')}
              onFocus={(e) => e.target.select()}
              placeholder="e.g. BOQ Morning Audit, Site Visit"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
            />
          </div>

          <div>
            <label htmlFor="save-address" className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">
              Address / Location
            </label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-3.5 text-gray-400" />
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
                    className="px-2 py-1 bg-gray-100 hover:bg-orange-100 text-[11px] text-gray-600 rounded-md transition-colors border border-gray-200 flex items-center gap-1"
                  >
                    <MapPin size={8} /> {addr}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="save-category" className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">
                Work Category
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
              <label htmlFor="save-date" className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1">
                Site Date
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
            <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl uppercase tracking-widest text-[11px] hover:bg-gray-200 transition-all">
              Cancel
            </button>
            <button
              onClick={() => submit(false)}
              className="flex-[2] py-3 bg-black text-white font-bold rounded-xl uppercase tracking-widest text-[11px] hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Save size={14} /> {editing ? 'Update Existing Record' : 'Confirm Save'}
            </button>
          </div>
          {allowSaveAsNew && (
            <button
              onClick={() => submit(true)}
              className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[11px] hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              <Copy size={14} /> Save as New Record
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
