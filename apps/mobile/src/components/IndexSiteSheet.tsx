import { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { useBackHandler } from '../lib/backButton.ts';

export interface RateSite {
  address: string;
  category: string;
}

/** Asks which site and work type rates belong to before indexing them from the unsaved purchase list. */
export function IndexSiteSheet({
  count,
  initial,
  addresses,
  categories,
  onConfirm,
  onClose,
}: {
  count: number;
  initial: RateSite;
  addresses: string[];
  categories: string[];
  onConfirm(site: RateSite): void;
  onClose(): void;
}) {
  const [site, setSite] = useState(initial);
  useBackHandler(onClose);
  const label = 'text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-orange-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="index-site-title"
        className="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <div>
            <h3 id="index-site-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm">
              Index {count === 1 ? 'rate' : `${count} rates`}
            </h3>
            <p className="text-[11px] text-gray-500">Which site were these bought for? Used by the Data tab filters and the site report.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <label className="block">
          <span className={label}>Site address</span>
          <input
            aria-label="Site address"
            list="index-sites"
            value={site.address}
            onChange={(e) => setSite((s) => ({ ...s, address: e.target.value }))}
            className={input}
            placeholder="e.g. Sector 44, Gurgaon"
          />
          <datalist id="index-sites">
            {addresses.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={label}>Work type</span>
          <select aria-label="Work type" value={site.category} onChange={(e) => setSite((s) => ({ ...s, category: e.target.value }))} className={input}>
            {[...new Set([site.category, ...categories])].filter(Boolean).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => onConfirm({ address: site.address.trim(), category: site.category })}
          className="w-full py-3 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
        >
          <Zap size={14} fill="currentColor" /> Index
        </button>
      </div>
    </div>
  );
}
