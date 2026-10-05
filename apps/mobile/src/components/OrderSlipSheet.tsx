import { useState } from 'react';
import { FileSpreadsheet, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { todayISO, type ItemRow } from '@nirman/shared';
import { useBackHandler } from '../lib/backButton.ts';
import { orderSlipSheet, pdfFile, pdfToJpegs, sheetToXlsx, type ExportFormat } from '../lib/exports.ts';
import { shareFiles } from '../lib/files.ts';
import { buildOrderSlipPdf, type OrderSlipDetails } from '../lib/pdf.ts';
import { prefs } from '../lib/prefs.ts';
import { useDialogs } from './Dialogs.tsx';

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
  useBackHandler(onClose, !busy);
  const set = (k: keyof OrderSlipDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  const share = async (format: ExportFormat) => {
    setBusy(format);
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

  const label = 'text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-orange-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-slip-title"
        className="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 shadow-2xl space-y-3 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <div>
            <h3 id="order-slip-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm">
              Order slip
            </h3>
            <p className="text-[11px] text-gray-500">
              {items.length} {items.length === 1 ? 'item' : 'items'} with quantities and sizes, no rates.
            </p>
          </div>
          <button onClick={onClose} disabled={!!busy} className="text-gray-400 hover:text-black" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <label className="block">
          <span className={label}>To (vendor, optional)</span>
          <input aria-label="Vendor" value={details.vendor ?? ''} onChange={set('vendor')} className={input} placeholder="e.g. Sharma Traders" />
        </label>
        <label className="block">
          <span className={label}>Deliver to (site address)</span>
          <input aria-label="Deliver to" list="order-slip-sites" value={details.address} onChange={set('address')} className={input} placeholder="e.g. Sector 44, Gurgaon" />
          <datalist id="order-slip-sites">
            {addresses.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
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
        <div>
          <span className={label}>Share as</span>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map(({ format, label: l, icon: Icon }) => (
              <button
                key={format}
                onClick={() => share(format)}
                disabled={!!busy}
                className="py-3 rounded-xl bg-[var(--color-brand-primary)] text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {busy === format ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** For a BOQ: share it for quotes (rates blank) or as an order slip. */
export function BoqShareChoice({ onPick, onClose }: { onPick(choice: 'boq' | 'order'): void; onClose(): void }) {
  useBackHandler(onClose);
  const option = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm font-bold text-gray-800 text-left';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Share BOQ" className="bg-white w-full max-w-md rounded-t-2xl p-4 pb-6 space-y-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold px-1 pb-1">What do you want to send?</p>
        <button className={option} onClick={() => onPick('boq')}>
          <FileText size={20} className="text-orange-500 shrink-0" />
          <span>
            BOQ for quotes
            <span className="block text-[11px] font-normal text-gray-500">Rate and total left blank for vendors to fill in</span>
          </span>
        </button>
        <button className={option} onClick={() => onPick('order')}>
          <FileSpreadsheet size={20} className="text-orange-500 shrink-0" />
          <span>
            Order slip
            <span className="block text-[11px] font-normal text-gray-500">Place the order: items and quantities, delivery address, date and receiver</span>
          </span>
        </button>
        <button onClick={onClose} className="w-full py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
