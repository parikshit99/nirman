import { Camera, Image as ImageIcon } from 'lucide-react';
import { Button } from './ui/Button.tsx';
import { Sheet, SheetLabel, SheetOption } from './ui/Sheet.tsx';

/** Camera or gallery; the gallery allows picking several photos at once. */
export function PhotoSourceSheet({ remaining, onPick, onClose }: { remaining: number; onPick(source: 'camera' | 'gallery'): void; onClose(): void }) {
  return (
    <Sheet label="Add bill or note" onClose={onClose} closeOnBackdrop className="p-4 pb-6 space-y-2">
      <SheetLabel>Add bill or note</SheetLabel>
      <SheetOption icon={Camera} label="Take photo" onClick={() => onPick('camera')} />
      <SheetOption icon={ImageIcon} label="Choose from gallery" about={`Up to ${remaining} photo${remaining === 1 ? '' : 's'}`} onClick={() => onPick('gallery')} />
      <Button variant="ghost" block onClick={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
