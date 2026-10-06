import { useState } from 'react';
import { Eye, FileSpreadsheet, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { todayISO, type ItemRow } from '@nirman/shared';
import { orderSlipSheet, pdfFile, pdfToJpegs, sheetToXlsx, type ExportFormat } from '../lib/exports.ts';
import { shareFiles } from '../lib/files.ts';
import { buildOrderSlipPdf, type OrderSlipDetails } from '../lib/pdf.ts';
import { prefs } from '../lib/prefs.ts';
import { logStep } from '../lib/diagnostics.ts';
import { useDialogs } from './Dialogs.tsx';
import { DocumentPreview } from './DocumentPreview.tsx';
import { Button } from './ui/Button.tsx';
import { Sheet, SheetHeader, SheetLabel, SheetOption } from './ui/Sheet.tsx';
import { SuggestInput } from './ui/SuggestInput.tsx';

const LAST_KEY = 'nirmaan_order_slip';

const FORMATS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'pdf', label: 'PDF', icon: FileText },
  { format: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { format: 'jpg', label: 'JPG', icon: ImageIcon },
];

/**
 * An order to send a vendor from the open BOQ: items and quantities without
 * rates, plus where, when and to whom to deliver. The site and receiver are
 * remembered for next time.
 */
export function OrderSlipSheet({
  items,
  notes,
  address,
  addresses,
  vendor = '',
  onClose,
}: {
  items: ItemRow[];
  notes: string;
  address: string;
  addresses: string[];
  /** Prefilled when ordering from a vendor's quote. */
  vendor?: string;
  onClose(): void;
}) {
  const dialogs = useDialogs();
  const last = prefs.get<Partial<OrderSlipDetails>>(LAST_KEY, {});
  const [details, setDetails] = useState<OrderSlipDetails>({
    vendor,
    address: address || last.address || '',
    deliveryDate: '',
    receiverName: last.receiverName ?? '',
    receiverPhone: last.receiverPhone ?? '',
    notes,
  });
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const set = (k: keyof OrderSlipDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  const share = async (format: ExportFormat) => {
    setBusy(format);
    logStep('share', { what: 'order slip', format, lines: items.length, toVendor: !!details.vendor?.trim() });
    prefs.set(LAST_KEY, { address: details.address, receiverName: details.receiverName, receiverPhone: details.receiverPhone });
    const name = `Order_slip_${(details.vendor?.trim() || details.address || 'site').replace(/[^\w-]+/g, '_').slice(0, 30)}_${todayISO()}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(orderSlipSheet(items, details), `${name}.xlsx`, 'Order slip', [14, 32, 14, 14, 14, 10, 8, 8, 30])]);
      } else {
        const doc = buildOrderSlipPdf(items, details);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
      onClose();
    } catch (err) {
      await dialogs.alert('Could not create the order slip', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const label = 'text-xs text-gray-600 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-orange-400';

  return (
    <Sheet labelledBy="order-slip-title" onClose={onClose} busy={!!busy} className="p-5 space-y-3">
      <SheetHeader
        id="order-slip-title"
        title="Order slip"
        subtitle={`${items.length} ${items.length === 1 ? 'item' : 'items'} with quantities and sizes, no rates.`}
        onClose={onClose}
        closeDisabled={!!busy}
      />
      <label className="block">
        <span className={label}>To (vendor, optional)</span>
        <input aria-label="Vendor" value={details.vendor ?? ''} onChange={set('vendor')} className={input} placeholder="e.g. Sharma Traders" />
      </label>
      <label className="block">
        <span className={label}>Deliver to (site address)</span>
        <SuggestInput
          aria-label="Deliver to"
          value={details.address}
          onChange={(v) => setDetails((p) => ({ ...p, address: v }))}
          suggestions={addresses}
          className={input}
          placeholder="e.g. Sector 44, Gurgaon"
        />
      </label>
      <label className="block">
        <span className={label}>Delivery date</span>
        <input type="date" aria-label="Delivery date" min={todayISO()} value={details.deliveryDate} onChange={set('deliveryDate')} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={label}>Receiver</span>
          <input aria-label="Receiver name" value={details.receiverName} onChange={set('receiverName')} className={input} placeholder="Name" />
        </label>
        <label className="block min-w-0">
          <span className={label}>Phone</span>
          <input type="tel" inputMode="tel" aria-label="Receiver phone" value={details.receiverPhone} onChange={set('receiverPhone')} className={input} placeholder="98xxxxxxxx" />
        </label>
      </div>
      <label className="block">
        <span className={label}>Specifications / notes</span>
        <textarea aria-label="Order notes" value={details.notes} onChange={set('notes')} className={`${input} h-20 resize-none text-xs`} />
      </label>
      <Button block onClick={() => setPreviewing(true)} disabled={!!busy}>
        <Eye size={14} /> Preview
      </Button>
      <div>
        <span className={label}>Share as</span>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map(({ format, label: l, icon: Icon }) => (
            <Button key={format} variant="primary" onClick={() => share(format)} disabled={!!busy}>
              {busy === format ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {l}
            </Button>
          ))}
        </div>
      </div>
      {previewing && (
        <DocumentPreview
          title={"Order slip"}
          build={() => buildOrderSlipPdf(items, details)}
          onShare={() => {
            setPreviewing(false);
            void share('pdf');
          }}
          onClose={() => setPreviewing(false)}
        />
      )}
    </Sheet>
  );
}

/** For a BOQ: share it for quotes (rates blank) or as an order slip. */
export function BoqShareChoice({ onPick, onClose }: { onPick(choice: 'boq' | 'order'): void; onClose(): void }) {
  return (
    <Sheet label="Share BOQ" onClose={onClose} closeOnBackdrop className="p-4 pb-6 space-y-2">
      <SheetLabel>What do you want to send?</SheetLabel>
      <SheetOption icon={FileText} label="BOQ for quotes" about="Rate and total left blank for vendors to fill in" onClick={() => onPick('boq')} />
      <SheetOption icon={FileSpreadsheet} label="Order slip" about="Place the order: items and quantities, delivery address, date and receiver" onClick={() => onPick('order')} />
      <Button variant="ghost" block onClick={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
