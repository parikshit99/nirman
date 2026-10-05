import { useState } from 'react';
import { FileSpreadsheet, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { contractStatement, todayISO, type ContractEntryRow, type ContractRow } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { useBackHandler } from '../lib/backButton.ts';
import { logStep } from '../lib/diagnostics.ts';
import { contractStatementSheet, pdfFile, pdfToJpegs, sheetToXlsx, type ExportFormat } from '../lib/exports.ts';
import { shareFiles } from '../lib/files.ts';
import { buildContractStatementPdf } from '../lib/pdf.ts';

const FORMATS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'pdf', label: 'PDF', icon: FileText },
  { format: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { format: 'jpg', label: 'JPG', icon: ImageIcon },
];

/** The contractor's account: terms, every entry with a running balance, and what is due. Optionally for a period. */
export function StatementSheet({ contract, entries, onClose }: { contract: ContractRow; entries: ContractEntryRow[]; onClose(): void }) {
  const dialogs = useDialogs();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  useBackHandler(onClose, !busy);

  const share = async (format: ExportFormat) => {
    setBusy(format);
    const statement = contractStatement(contract, entries, { from, to });
    logStep('share', { what: 'labour statement', format, lines: statement.rows.length, dated: !!(from || to) });
    const name = `Statement_${contract.contractor.replace(/[^\w-]+/g, '_').slice(0, 30)}_${todayISO()}`;
    const period = from || to ? `${from || 'start'} to ${to || todayISO()}` : '';
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(contractStatementSheet(contract, statement, period), `${name}.xlsx`, 'Statement', [12, 44, 14, 14, 14, 14])]);
      } else {
        const doc = buildContractStatementPdf(contract, statement, period);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
      onClose();
    } catch (err) {
      await dialogs.alert('Could not create the statement', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const label = 'text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-orange-400';
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={busy ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="statement-title" className="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h3 id="statement-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm">
              Statement
            </h3>
            <p className="text-[11px] text-gray-500">For {contract.contractor}: terms, work, payments and deductions with the balance due.</p>
          </div>
          <button onClick={onClose} disabled={!!busy} className="text-gray-400 hover:text-black" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div>
          <span className={label}>Period (blank = everything)</span>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="Statement from" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} />
            <input type="date" aria-label="Statement to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} />
          </div>
        </div>
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
