import { FileCode, ShoppingCart, Truck } from 'lucide-react';
import type { IncomingShare } from '../lib/sharedFiles.ts';
import { useBackHandler } from '../lib/backButton.ts';

export type ShareTarget = 'audit' | 'boq' | 'quote';

/** Where photos or text shared from another app (e.g. WhatsApp) should go. */
export function ShareTargetSheet({ share, hasSavedBoqs, onPick, onClose }: { share: IncomingShare; hasSavedBoqs: boolean; onPick(target: ShareTarget): void; onClose(): void }) {
  useBackHandler(onClose);
  const what = share.images.length ? `${share.images.length} photo${share.images.length === 1 ? '' : 's'}` : 'Text';
  const option = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm font-bold text-gray-800 text-left disabled:opacity-50';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add shared items" className="bg-white w-full max-w-md rounded-t-2xl p-4 pb-6 space-y-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold px-1">{what} received</p>
        {share.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {share.images.map((src, i) => (
              <img key={i} src={src} alt={`Shared photo ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-gray-200 shrink-0" />
            ))}
          </div>
        )}
        {share.text && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 line-clamp-3">“{share.text}”</p>}
        <p className="text-[11px] text-gray-500 px-1 pb-1">Add to:</p>
        <button className={option} onClick={() => onPick('audit')}>
          <ShoppingCart size={20} className="text-orange-500 shrink-0" />
          <span>
            Purchases
            <span className="block text-[11px] font-normal text-gray-500">A bill or note of what was bought</span>
          </span>
        </button>
        <button className={option} onClick={() => onPick('boq')}>
          <FileCode size={20} className="text-orange-500 shrink-0" />
          <span>
            BOQ
            <span className="block text-[11px] font-normal text-gray-500">A list of what you need, to send to vendors</span>
          </span>
        </button>
        <button className={option} onClick={() => onPick('quote')} disabled={!hasSavedBoqs}>
          <Truck size={20} className="text-orange-500 shrink-0" />
          <span>
            Vendor quote
            <span className="block text-[11px] font-normal text-gray-500">{hasSavedBoqs ? "A vendor's prices for one of your saved BOQs" : 'Save a BOQ first to add quotes to it'}</span>
          </span>
        </button>
        <button onClick={onClose} className="w-full py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
