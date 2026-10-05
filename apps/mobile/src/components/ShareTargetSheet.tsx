import { FileCode, ShoppingCart, Truck } from 'lucide-react';
import type { IncomingShare } from '../lib/sharedFiles.ts';
import { Button } from './ui/Button.tsx';
import { Sheet, SheetLabel, SheetOption } from './ui/Sheet.tsx';

export type ShareTarget = 'audit' | 'boq' | 'quote';

/** Where photos or text shared from another app (e.g. WhatsApp) should go. */
export function ShareTargetSheet({ share, hasSavedBoqs, onPick, onClose }: { share: IncomingShare; hasSavedBoqs: boolean; onPick(target: ShareTarget): void; onClose(): void }) {
  const what = share.images.length ? `${share.images.length} photo${share.images.length === 1 ? '' : 's'}` : 'Text';
  return (
    <Sheet label="Add shared items" onClose={onClose} closeOnBackdrop className="p-4 pb-6 space-y-2">
      <SheetLabel>{what} received</SheetLabel>
      {share.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
          {share.images.map((src, i) => (
            <img key={i} src={src} alt={`Shared photo ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-gray-200 shrink-0" />
          ))}
        </div>
      )}
      {share.text && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 line-clamp-3">“{share.text}”</p>}
      <p className="text-xs text-gray-500 px-1 pb-1">Add to:</p>
      <SheetOption icon={ShoppingCart} label="Purchases" about="A bill or note of what was bought" onClick={() => onPick('audit')} />
      <SheetOption icon={FileCode} label="BOQ" about="A list of what you need, to send to vendors" onClick={() => onPick('boq')} />
      <SheetOption
        icon={Truck}
        label="Vendor quote"
        about={hasSavedBoqs ? "A vendor's prices for one of your saved BOQs" : 'Save a BOQ first to add quotes to it'}
        onClick={() => onPick('quote')}
        disabled={!hasSavedBoqs}
      />
      <Button variant="ghost" block onClick={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
