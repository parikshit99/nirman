import { useState } from 'react';
import { motion } from 'motion/react';
import { FileCode, Search, X } from 'lucide-react';
import { useAppState } from '../state/AppState.tsx';
import { useBackHandler } from '../lib/backButton.ts';

/** Choose the saved BOQ a vendor's quote answers. */
export function BoqPicker({ onPick, onClose }: { onPick(boqId: string): void; onClose(): void }) {
  const { savedBoqs, quotesFor } = useAppState();
  useBackHandler(onClose);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const boqs = savedBoqs.filter((b) => !q || `${b.title} ${b.address} ${b.category}`.toLowerCase().includes(q));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="boq-picker-title" className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-start mb-1">
          <h3 id="boq-picker-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm">Which BOQ is this quote for?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-4">The vendor's lines will be matched to this BOQ's items.</p>

        {savedBoqs.length > 3 && (
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or site"
              aria-label="Search BOQs"
              className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-xs outline-none focus:border-gray-400"
            />
          </div>
        )}

        <div className="overflow-y-auto space-y-2 -mx-1 px-1">
          {savedBoqs.length === 0 ? (
            <p className="text-xs text-gray-500 p-4 bg-gray-50 rounded-xl leading-relaxed">
              No saved BOQs yet. Create the BOQ on the BOQ tab and tap <b>Save</b>, then come back here when the vendor replies.
            </p>
          ) : boqs.length === 0 ? (
            <p className="text-xs text-gray-400 p-4 text-center">No BOQ matches “{query}”.</p>
          ) : (
            boqs.map((b) => {
              const quotes = quotesFor(b.id).length;
              return (
                <button
                  key={b.id}
                  onClick={() => onPick(b.id)}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/40 transition-colors flex gap-3 items-start"
                >
                  <FileCode size={18} className="text-orange-500 mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-sm text-gray-900 truncate">{b.title || 'Untitled BOQ'}</span>
                    {b.address && <span className="block text-[11px] text-gray-500 truncate">📍 {b.address}</span>}
                    <span className="block text-[11px] font-mono text-gray-400 mt-0.5">
                      {new Date(b.created_at).toLocaleDateString('en-IN')} · {b.items.length} items
                      {quotes > 0 && ` · ${quotes} quote${quotes === 1 ? '' : 's'}`}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
