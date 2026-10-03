import { RotateCcw } from 'lucide-react';

/** Takes the place of the trash button while a delete can still be undone. */
export function UndoButton({ onUndo, label }: { onUndo(): void; label: string }) {
  return (
    <button
      onClick={onUndo}
      className="px-2.5 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all flex items-center gap-1 text-[11px] font-bold"
      aria-label={`Undo delete ${label}`}
    >
      <RotateCcw size={16} /> Undo
    </button>
  );
}
