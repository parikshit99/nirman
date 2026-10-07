import { FileCode, Share2, X } from 'lucide-react';
import { variantLabel, type ItemRow } from '@nirman/shared';
import { appIcon, type ListKind } from '@nirman/core';
import { Sheet } from './ui/Sheet.tsx';

interface Props {
  kind: ListKind;
  items: ItemRow[];
  notes: string;
  onDownload(): void;
  onClose(): void;
}

/** On-screen preview matching the generated PDF. */
export function PdfPreviewModal({ kind, items, notes, onDownload, onClose }: Props) {
  const isAudit = kind === 'audit';
  const total = items.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  return (
    <Sheet kind="screen" size="xl" tall scroll={false} label="Document preview" onClose={onClose} className="paper">
      <div className="p-4 border-b flex items-center justify-between bg-gray-50 border-gray-200 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-[var(--color-brand-primary)] text-white rounded-lg shrink-0">
            <FileCode size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">Document Preview</h3>
            <p className="text-[11px] text-gray-500 font-mono italic truncate">{isAudit ? 'Purchase Report' : 'Bill of Quantities'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-primary)] text-white text-xs font-bold rounded-lg hover:brightness-110 shadow-md shadow-orange-100"
          >
            <Share2 size={14} /> Share
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-500" aria-label="Close preview">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-2 md:p-8 overflow-auto">
        <div className="bg-white mx-auto max-w-[800px] shadow-2xl p-4 md:p-12 min-h-full rounded-sm flex flex-col gap-8 outline outline-1 outline-gray-200">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-[var(--color-brand-primary)] mb-2 flex items-center gap-2 md:gap-3">
                <img src={appIcon} alt="" className="w-8 h-8 md:w-11 md:h-11 shrink-0" />
                {isAudit ? 'PURCHASE REPORT' : 'BILL OF QUANTITIES'}
              </h1>
              <p className="text-xs text-gray-500">{isAudit ? 'Purchases recorded from site bills and notes.' : 'Material inventory and price estimation report.'}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">Nirman by Akohsa</p>
              <p className="text-[11px] text-gray-500">{new Date().toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse border border-gray-900 min-w-[480px]">
              <thead>
                <tr className="bg-gray-900 text-white text-[11px] uppercase tracking-wider font-mono">
                  <th className="border border-gray-900 p-2 text-left w-10">Sr.</th>
                  <th className="border border-gray-900 p-2 text-left">Description</th>
                  <th className="border border-gray-900 p-2 text-center w-16">Qty</th>
                  <th className="border border-gray-900 p-2 text-center w-16">Unit</th>
                  <th className="border border-gray-900 p-2 text-right w-24">Rate (₹)</th>
                  <th className="border border-gray-900 p-2 text-right w-28">Total (₹)</th>
                  {isAudit && <th className="border border-gray-900 p-2 text-right w-24">Vendor</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="text-xs border-b border-gray-300">
                    <td className="border border-gray-300 p-2 text-center">{index + 1}</td>
                    <td className="border border-gray-300 p-2 font-medium">
                      {item.item_name}
                      {variantLabel(item) && <div className="text-[11px] font-normal text-gray-600">{variantLabel(item)}</div>}
                    </td>
                    <td className="border border-gray-300 p-2 text-center font-mono">{item.quantity}</td>
                    <td className="border border-gray-300 p-2 text-center">{item.unit}</td>
                      <td className="border border-gray-300 p-2 text-right font-mono bg-gray-50/50">{isAudit ? item.unit_price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : ''}</td>
                      <td className="border border-gray-300 p-2 text-right font-mono bg-gray-50/50">{isAudit ? item.total_amount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : ''}</td>
                    {isAudit && <td className="border border-gray-300 p-2 text-right">{item.vendor || '-'}</td>}
                  </tr>
                ))}
                {isAudit && (
                  <tr className="text-xs font-bold">
                    <td className="border border-gray-300 p-2" colSpan={5}>
                      TOTAL
                    </td>
                    <td className="border border-gray-300 p-2 text-right font-mono">{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="border border-gray-300 p-2" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!isAudit && notes && (
            <div className="border-l-2 border-orange-400 pl-4 py-2 bg-orange-50/20">
              <h4 className="text-[11px] font-bold text-[var(--color-brand-primary)] uppercase tracking-wider mb-1">Specifications / Notes</h4>
              <p className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed">{notes}</p>
            </div>
          )}

          {!isAudit && (
            <div className="mt-auto pt-8 border-t border-gray-100 italic text-[11px] text-gray-400">
              <p>Note: Rate and Total columns are intentionally left blank for manual estimation or vendor quotes.</p>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
