import { useState } from 'react';
import type { jsPDF } from 'jspdf';
import type { ExportFormat } from '@nirman/core';
import { DocumentPreview } from './DocumentPreview';
import { Button } from './ui/Button';
import type { IconName } from './ui/Icon';
import { Sheet, SheetLabel, SheetOption } from './ui/Sheet';

const OPTIONS: { format: ExportFormat; label: string; about: string; icon: IconName }[] = [
  { format: 'pdf', label: 'PDF document', about: 'Best for printing and sending to vendors', icon: 'picture-as-pdf' },
  { format: 'xlsx', label: 'Excel sheet (.xlsx)', about: 'Opens in Excel, Google Sheets or WPS; numbers stay editable', icon: 'table-chart' },
  { format: 'jpg', label: 'Image (JPG)', about: 'A picture of each page, easy to view in WhatsApp', icon: 'image' },
];

/** Pick a file format, then the phone's share sheet opens. With `preview`, the PDF can be looked at first. */
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
    <Sheet label={`Share ${title}`} onClose={onClose} busy={!!busy} closeOnBackdrop gap={8}>
      {preview && <SheetOption icon="visibility" label="Preview" about="See the PDF before sharing it" disabled={!!busy} onPress={() => setPreviewing(true)} />}
      <SheetLabel>{`Share ${title} as`}</SheetLabel>
      {OPTIONS.map(({ format, label, about, icon }) => (
        <SheetOption key={format} icon={icon} label={label} about={about} busy={busy === format} disabled={!!busy} onPress={() => pick(format)} />
      ))}
      <Button variant="ghost" block onPress={onClose} disabled={!!busy}>
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
