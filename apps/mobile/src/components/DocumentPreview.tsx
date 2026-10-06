import { useEffect, useState } from 'react';
import type { jsPDF } from 'jspdf';
import { Eye, Loader2, Share2 } from 'lucide-react';
import { pdfToJpegs } from '../lib/exports.ts';
import { Button } from './ui/Button.tsx';
import { Sheet, SheetHeader } from './ui/Sheet.tsx';

/** The PDF exactly as it will be shared, page by page, before sharing it. */
export function DocumentPreview({
  title,
  build,
  onShare,
  shareLabel = 'Share PDF',
  onClose,
}: {
  title: string;
  build(): jsPDF;
  onShare(): void;
  shareLabel?: string;
  onClose(): void;
}) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const files = await pdfToJpegs(build(), 'preview');
        if (live) setPages(files.map((f) => `data:image/jpeg;base64,${f.base64}`));
      } catch (err) {
        if (live) setError((err as Error).message);
      }
    })();
    return () => {
      live = false;
    };
    // Built once when opened: the preview shows what was on screen then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet kind="screen" size="xl" tall layer="top" labelledBy="doc-preview-title" onClose={onClose} className="p-4 gap-3">
      <SheetHeader id="doc-preview-title" icon={<Eye size={18} className="text-orange-500" />} title="Preview" subtitle={title} onClose={onClose} />
      <div className="flex-1 bg-gray-100 rounded-xl p-2 space-y-2 min-h-[200px]">
        {error ? (
          <p className="text-sm text-red-600 p-4">Could not show the preview: {error}</p>
        ) : pages === null ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          // The page is paper: it stays white in dark mode, like the file.
          pages.map((src, i) => <img key={i} src={src} alt={`Page ${i + 1} of ${pages.length}`} className="w-full bg-[#fff] shadow rounded-sm" />)
        )}
      </div>
      <Button variant="primary" block onClick={onShare}>
        <Share2 size={14} /> {shareLabel}
      </Button>
    </Sheet>
  );
}
