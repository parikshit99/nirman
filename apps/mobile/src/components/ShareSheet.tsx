import { useState } from 'react';
import type { jsPDF } from 'jspdf';
import { Eye, FileSpreadsheet, FileText, Image as ImageIcon } from 'lucide-react';
import { DocumentPreview } from './DocumentPreview.tsx';
import type { ExportFormat } from '@nirman/core';
import { Button } from './ui/Button.tsx';
import { Sheet, SheetLabel, SheetOption } from './ui/Sheet.tsx';

const OPTIONS: { format: ExportFormat; label: string; about: string; icon: typeof FileText }[] = [
  { format: 'pdf', label: 'PDF document', about: 'Best for printing and sending to vendors', icon: FileText },
  { format: 'xlsx', label: 'Excel sheet (.xlsx)', about: 'Opens in Excel, Google Sheets or WPS; numbers stay editable', icon: FileSpreadsheet },
  { format: 'jpg', label: 'Image (JPG)', about: 'A picture of each page, easy to view in WhatsApp', icon: ImageIcon },
];

/**
 * Pick a file format, then the phone's share sheet opens (save to Files, WhatsApp, email…).
 * With `preview`, the PDF can be looked at first.
 */
export function ShareSheet({ title, onShare, preview, onClose }: { title: string; onShare(format: ExportFormat): Promise<void>; preview?: () => jsPDF; onClose(): void }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const pick = async (format: ExportFormat) => {
    setBusy(format);
    try {
      await onShare(format);
      onClose();
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet label={`Share ${title}`} onClose={onClose} busy={!!busy} closeOnBackdrop className="p-4 pb-6 space-y-2">
      {preview && <SheetOption icon={Eye} label="Preview" about="See the PDF before sharing it" disabled={!!busy} onClick={() => setPreviewing(true)} />}
      <SheetLabel>Share {title} as</SheetLabel>
      {OPTIONS.map(({ format, label, about, icon }) => (
        <SheetOption key={format} icon={icon} label={label} about={about} busy={busy === format} disabled={!!busy} onClick={() => pick(format)} />
      ))}
      <Button variant="ghost" block onClick={onClose} disabled={!!busy}>
        Cancel
      </Button>
      {previewing && preview && (
        <DocumentPreview
          title={title[0].toUpperCase() + title.slice(1)}
          build={preview}
          onShare={() => {
            setPreviewing(false);
            void pick('pdf');
          }}
          onClose={() => setPreviewing(false)}
        />
      )}
    </Sheet>
  );
}
