import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Share2, X } from 'lucide-react';
import { buildSiteReport, financialYear, siteHasDeliveries, todayISO } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { ShareSheet } from '../components/ShareSheet.tsx';
import { useBackHandler } from '../lib/backButton.ts';
import { pdfFile, pdfToJpegs, sheetToXlsx, siteReportSheet, type ExportFormat } from '../lib/exports.ts';
import { shareFiles } from '../lib/files.ts';
import { buildSiteReportPdf } from '../lib/pdf.ts';
import { useAppState } from '../state/AppState.tsx';

const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Everything bought (or delivered) for one site, for any period and work types, as PDF / Excel / JPG. */
export function SiteReport({ onClose }: { onClose(): void }) {
  const { snapshot, learning, categoryNames } = useAppState();
  const dialogs = useDialogs();
  const sites = useMemo(
    () => [...new Set(snapshot.lists.filter((l) => l.kind === 'audit' && l.status === 'saved' && l.address).map((l) => l.address))].sort(),
    [snapshot.lists],
  );
  const [address, setAddress] = useState(sites[0] ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [deliveredOnly, setDeliveredOnly] = useState(() => siteHasDeliveries(snapshot.lists, snapshot.items, sites[0] ?? ''));
  const [sharing, setSharing] = useState(false);
  useBackHandler(onClose, !sharing);

  const pickSite = (a: string) => {
    setAddress(a);
    setDeliveredOnly(siteHasDeliveries(snapshot.lists, snapshot.items, a));
  };
  const toggleCategory = (c: string) => setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const siteCategories = useMemo(() => {
    const used = new Set(snapshot.lists.filter((l) => l.kind === 'audit' && l.status === 'saved' && l.address === address).map((l) => l.category || 'Uncategorised'));
    return [...categoryNames.filter((c) => used.has(c)), ...[...used].filter((c) => !categoryNames.includes(c))];
  }, [snapshot.lists, address, categoryNames]);

  const report = useMemo(
    () => buildSiteReport(snapshot.lists, snapshot.items, learning, { address, from, to, categories, deliveredOnly }),
    [snapshot.lists, snapshot.items, learning, address, from, to, categories, deliveredOnly],
  );
  const materialCount = report.categories.reduce((n, c) => n + c.materials.length, 0);
  const period = from || to ? `${from || 'start'} to ${to || 'today'}` : 'All time';
  const filters = [period, categories.length ? categories.join(', ') : 'All categories', deliveredOnly ? 'Delivered only' : 'All saved purchases'].join(' · ');

  const share = async (format: ExportFormat) => {
    const name = `Site_report_${address.replace(/[^\w-]+/g, '_').slice(0, 40)}_${todayISO()}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(siteReportSheet(address, filters, report), `${name}.xlsx`, 'Site report', [16, 30, 12, 12, 12, 14, 24, 10, 8, 26, 12, 14, 18, 20, 14])]);
      } else {
        const doc = buildSiteReportPdf(address, filters, report);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
    } catch (err) {
      await dialogs.alert('Could not create the report', (err as Error).message);
    }
  };

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${on ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`;
  const label = 'text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-orange-400';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center md:p-4 bg-black/60">
      <div role="dialog" aria-modal="true" aria-labelledby="site-report-title" className="bg-white w-full max-w-lg md:rounded-2xl p-5 shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex justify-between items-start mb-1">
          <h3 id="site-report-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm">
            Site report
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-4">Everything bought for one site, grouped by work type and material, with every line listed.</p>

        {sites.length === 0 ? (
          <p className="text-sm text-gray-500">Save a purchase list with a site address first.</p>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className={label}>Site</span>
              <select aria-label="Site" value={address} onChange={(e) => pickSite(e.target.value)} className={`${input} font-bold`}>
                {sites.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>

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
              <span className={label}>Category</span>
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

            <button
              onClick={() => setSharing(true)}
              disabled={report.lineCount === 0}
              className="w-full h-12 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl flex items-center justify-center gap-2 uppercase tracking-widest text-sm disabled:opacity-50"
            >
              <Share2 size={16} /> Share report
            </button>
            {report.lineCount === 0 && (
              <p className="text-xs text-gray-500 text-center">
                Nothing matches.{deliveredOnly ? ' Tick deliveries in History → Deliveries, or include all saved purchases.' : ''}
              </p>
            )}
          </div>
        )}
      </div>
      {sharing && <ShareSheet title="site report" onShare={share} onClose={() => setSharing(false)} />}
    </motion.div>
  );
}
