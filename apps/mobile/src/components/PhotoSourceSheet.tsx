import { Camera, Image as ImageIcon } from 'lucide-react';
import { useBackHandler } from '../lib/backButton.ts';

/** Camera or gallery; the gallery allows picking several photos at once. */
export function PhotoSourceSheet({ remaining, onPick, onClose }: { remaining: number; onPick(source: 'camera' | 'gallery'): void; onClose(): void }) {
  useBackHandler(onClose);
  const option = 'w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm font-bold text-gray-800';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add bill or note"
        className="bg-white w-full max-w-md rounded-t-2xl p-4 pb-6 space-y-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold px-1 pb-1">Add bill or note</p>
        <button className={option} onClick={() => onPick('camera')}>
          <Camera size={20} className="text-orange-500" /> Take photo
        </button>
        <button className={option} onClick={() => onPick('gallery')}>
          <ImageIcon size={20} className="text-orange-500" />
          <span>
            Choose from gallery
            <span className="block text-[10px] font-normal text-gray-500">
              Up to {remaining} photo{remaining === 1 ? '' : 's'}
            </span>
          </span>
        </button>
        <button onClick={onClose} className="w-full py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
