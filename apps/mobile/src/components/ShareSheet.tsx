import { useState } from 'react';
import { FileSpreadsheet, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import type { ExportFormat } from '../lib/exports.ts';
import { useBackHandler } from '../lib/backButton.ts';

const OPTIONS: { format: ExportFormat; label: string; about: string; icon: typeof FileText }[] = [
  { format: 'pdf', label: 'PDF document', about: 'Best for printing and sending to vendors', icon: FileText },
  { format: 'xlsx', label: 'Excel sheet (.xlsx)', about: 'Opens in Excel, Google Sheets or WPS; numbers stay editable', icon: FileSpreadsheet },
  { format: 'jpg', label: 'Image (JPG)', about: 'A picture of each page, easy to view in WhatsApp', icon: ImageIcon },
];

/** Pick a file format, then the phone's share sheet opens (save to Files, WhatsApp, email…). */
export function ShareSheet({ title, onShare, onClose }: { title: string; onShare(format: ExportFormat): Promise<void>; onClose(): void }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  useBackHandler(onClose);
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${title}`}
        className="bg-white w-full max-w-md rounded-t-2xl p-4 pb-6 space-y-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold px-1 pb-1">Share {title} as</p>
        {OPTIONS.map(({ format, label, about, icon: Icon }) => (
          <button
            key={format}
            disabled={!!busy}
            onClick={() => pick(format)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm font-bold text-gray-800 text-left disabled:opacity-60"
          >
            {busy === format ? <Loader2 size={20} className="animate-spin text-orange-500 shrink-0" /> : <Icon size={20} className="text-orange-500 shrink-0" />}
            <span>
              {label}
              <span className="block text-[11px] font-normal text-gray-500">{about}</span>
            </span>
          </button>
        ))}
        <button onClick={onClose} disabled={!!busy} className="w-full py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
