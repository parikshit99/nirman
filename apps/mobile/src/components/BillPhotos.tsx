import { useEffect, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useAppState } from '../state/AppState.tsx';
import { Sheet, SheetHeader } from './ui/Sheet.tsx';

/** The bill photos lines were read from, to check the lines against the bill. */
export function BillPhotosSheet({ photoIds, title, onClose }: { photoIds: string[]; title: string; onClose(): void }) {
  const { actions } = useAppState();
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const key = photoIds.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(key.split(',').filter(Boolean).map((id) => actions.getBillPhotos(id))).then((all) => live && setPhotos(all.flat()));
    return () => {
      live = false;
    };
  }, [key, actions]);

  return (
    <Sheet kind="screen" size="lg" tall labelledBy="bill-photos-title" onClose={onClose} closeOnBackdrop className="p-4 gap-3">
      <SheetHeader id="bill-photos-title" icon={<Camera size={18} className="text-orange-500" />} title="Bill photos" subtitle={title} onClose={onClose} />
      {photos === null ? (
        <div className="flex-1 flex items-center justify-center py-10 text-gray-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">The photos of this bill are no longer on this phone.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Tap a photo to zoom in; it scrolls inside its box.</p>
          {photos.map((data, i) => (
            <button
              key={i}
              onClick={() => setZoomed(zoomed === i ? null : i)}
              aria-pressed={zoomed === i}
              className={`block w-full rounded-xl border border-gray-200 bg-gray-50 ${zoomed === i ? 'overflow-auto max-h-[75vh]' : 'overflow-hidden'}`}
            >
              <img src={`data:image/jpeg;base64,${data}`} alt={`Bill photo ${i + 1} of ${photos.length}`} className={zoomed === i ? 'max-w-none w-[250%]' : 'w-full'} />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Distinct bill photos behind some lines, in order. */
export const photoIdsOf = (items: { photo_id: string }[]) => [...new Set(items.map((i) => i.photo_id).filter(Boolean))];
