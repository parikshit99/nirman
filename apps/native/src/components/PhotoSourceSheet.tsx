import { Button } from './ui/Button';
import { Sheet, SheetLabel, SheetOption } from './ui/Sheet';

/** Camera or gallery; the gallery allows picking several photos at once. */
export function PhotoSourceSheet({ remaining, onPick, onClose }: { remaining: number; onPick(source: 'camera' | 'gallery'): void; onClose(): void }) {
  return (
    <Sheet label="Add bill or note" onClose={onClose} closeOnBackdrop gap={8}>
      <SheetLabel>Add bill or note</SheetLabel>
      <SheetOption icon="photo-camera" label="Take photo" onPress={() => onPick('camera')} />
      <SheetOption icon="photo-library" label="Choose from gallery" about={`Up to ${remaining} photo${remaining === 1 ? '' : 's'}`} onPress={() => onPick('gallery')} />
      <Button variant="ghost" block onPress={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
