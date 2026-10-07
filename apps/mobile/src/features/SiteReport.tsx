import { useMemo, useState } from 'react';
import { Eye, Share2 } from 'lucide-react';
import { buildLabourReport, buildSiteReport, financialYear, siteHasDeliveries, todayISO } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { DocumentPreview } from '../components/DocumentPreview.tsx';
import { ShareSheet } from '../components/ShareSheet.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Sheet, SheetHeader } from '../components/ui/Sheet.tsx';
import { pdfFile, pdfToJpegs, sheetToXlsx, siteReportSheet, type ExportFormat } from '../lib/exports.ts';
import { shareFiles } from '../lib/files.ts';
import { buildSiteReportPdf } from '../lib/pdf.ts';
import { useAppState } from '../state/AppState.tsx';
import { logStep } from '../lib/diagnostics.ts';

const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Everything bought (or delivered) for the open project, for any period and work types, as PDF / Excel / JPG. */
export function SiteReport({ onClose }: { onClose(): void }) {
  const { snapshot, learning, categoryNames, project, projectId, contracts } = useAppState();
  const dialogs = useDialogs();
  const lists = useMemo(() => snapshot.lists.filter((l) => l.project_id === projectId && l.kind === 'audit' && l.status === 'saved'), [snapshot.lists, projectId]);
  /** The report's heading: the project, and its site address when that says more. */
  const address = [project?.name, project?.address].filter((v, i, all) => v && all.indexOf(v) === i).join(', ');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [deliveredOnly, setDeliveredOnly] = useState(() => siteHasDeliveries(lists, snapshot.items));
  const [sharing, setSharing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const toggleCategory = (c: string) => setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const siteCategories = useMemo(() => {
    const used = new Set([...lists.map((l) => l.category || 'Uncategorised'), ...contracts.map((c) => c.category || 'Uncategorised')]);
    return [...categoryNames.filter((c) => used.has(c)), ...[...used].filter((c) => !categoryNames.includes(c))];
  }, [lists, contracts, categoryNames]);

  const report = useMemo(
    () => buildSiteReport(lists, snapshot.items, learning, { from, to, categories, deliveredOnly }),
    [lists, snapshot.items, learning, from, to, categories, deliveredOnly],
  );
  const labour = useMemo(
    () => buildLabourReport(contracts, snapshot.contractEntries, { from, to, categories }),
    [contracts, snapshot.contractEntries, from, to, categories],
  );
  const empty = report.lineCount === 0 && labour.rows.length === 0;
  const materialCount = report.categories.reduce((n, c) => n + c.materials.length, 0);
  const period = from || to ? `${from || 'start'} to ${to || 'today'}` : 'All time';
  const filters = [period, categories.length ? categories.join(', ') : 'All categories', deliveredOnly ? 'Delivered only' : 'All saved purchases'].join(' · ');

  const share = async (format: ExportFormat) => {
    logStep('share', { what: 'site report', format, lines: report.lineCount, contracts: labour.rows.length, deliveredOnly, categories: categories.length, dated: !!(from || to) });
    const name = `Site_report_${address.replace(/[^\w-]+/g, '_').slice(0, 40)}_${todayISO()}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([
          await sheetToXlsx(siteReportSheet(address, filters, report, labour), `${name}.xlsx`, 'Site report', [16, 30, 12, 12, 12, 14, 24, 10, 8, 26, 12, 14, 18, 20, 14]),
        ]);
      } else {
        const doc = buildSiteReportPdf(address, filters, report, labour);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
    } catch (err) {
      await dialogs.alert('Could not create the report', (err as Error).message);
    }
  };

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${on ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`;
  const label = 'text-xs text-gray-600 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-orange-400';

  return (
    <>
      <Sheet kind="screen" size="lg" labelledBy="site-report-title" onClose={onClose} backEnabled={!sharing && !previewing} className="p-5 gap-4">
        <SheetHeader
          id="site-report-title"
          title="Site report"
          subtitle="Everything bought for this project, grouped by work type and material, with every line listed, plus labour contracts."
          onClose={onClose}
        />

        {lists.length === 0 && contracts.length === 0 ? (
          <p className="text-sm text-gray-500">Save a purchase list or add a labour contract in this project first.</p>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl">
              <span className={label}>Project</span>
              <span className="block text-sm font-bold text-gray-900 break-words">{address}</span>
            </div>

            <div>
              <span className={label}>Period</span>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} />
                <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button className={chip(!from && !to)} onClick={() => { setFrom(''); setTo(''); }}>All time</button>
                {[false, true].map((previous) => {
                  const fy = financialYear(todayISO(), previous);
                  return (
                    <button key={String(previous)} className={chip(from === fy.from && to === fy.to)} onClick={() => { setFrom(fy.from); setTo(fy.to); }}>
                      {previous ? 'Last FY' : 'This FY'} {fy.from.slice(2, 4)}-{fy.to.slice(2, 4)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className={label}>Work type</span>
              <div className="flex flex-wrap gap-2">
                <button className={chip(categories.length === 0)} onClick={() => setCategories([])}>All</button>
                {siteCategories.map((c) => (
                  <button key={c} className={chip(categories.includes(c))} onClick={() => toggleCategory(c)} aria-pressed={categories.includes(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <fieldset>
              <legend className={label}>Include</legend>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map((d) => (
                  <label key={String(d)} className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer ${deliveredOnly === d ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                    <input type="radio" name="include" checked={deliveredOnly === d} onChange={() => setDeliveredOnly(d)} />
                    {d ? 'Only lines marked delivered' : 'All saved purchases'}
                  </label>
                ))}
              </div>
            </fieldset>

            <div role="status" className="p-3 bg-gray-50 rounded-xl text-sm flex justify-between items-center gap-2">
              <span className="text-gray-600">
                {report.lineCount} {report.lineCount === 1 ? 'line' : 'lines'} · {materialCount} {materialCount === 1 ? 'material' : 'materials'}
              </span>
              <span className="font-mono font-bold">{rupees(report.total)}</span>
            </div>
            {labour.rows.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-xl text-sm flex justify-between items-center gap-2">
                <span className="text-gray-600">
                  Labour: {labour.rows.length} {labour.rows.length === 1 ? 'contract' : 'contracts'} · paid {rupees(labour.paid)}
                </span>
                <span className="font-mono font-bold">{rupees(labour.workDone)}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setPreviewing(true)} disabled={empty}>
                <Eye size={16} /> Preview
              </Button>
              <Button variant="primary" onClick={() => setSharing(true)} disabled={empty}>
                <Share2 size={16} /> Share
              </Button>
            </div>
            {empty && (
              <p className="text-xs text-gray-500 text-center">
                Nothing matches.{deliveredOnly ? ' Tick deliveries in Saved → Deliveries, or include all saved purchases.' : ''}
              </p>
            )}
          </div>
        )}
      </Sheet>
      {previewing && (
        <DocumentPreview
          title={`Site report: ${address}`}
          build={() => buildSiteReportPdf(address, filters, report, labour)}
          onShare={() => {
            setPreviewing(false);
            setSharing(true);
          }}
          shareLabel="Share"
          onClose={() => setPreviewing(false)}
        />
      )}
      {sharing && <ShareSheet title="site report" onShare={share} preview={() => buildSiteReportPdf(address, filters, report, labour)} onClose={() => setSharing(false)} />}
    </>
  );
}
