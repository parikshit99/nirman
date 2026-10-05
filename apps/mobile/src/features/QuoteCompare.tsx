import { useState } from 'react';
import { Plus, Share2, Trophy } from 'lucide-react';
import { compareQuotes, variantLabel, type QuoteCell, type QuoteRow } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { Sparkline, VsLastBadge, pct, rupees, shortDate } from '../components/PriceBadges.tsx';
import { ShareSheet } from '../components/ShareSheet.tsx';
import { OrderSlipSheet } from '../components/OrderSlipSheet.tsx';
import { comparisonSheet, pdfFile, pdfToJpegs, sheetToXlsx, type ExportFormat } from '../lib/exports.ts';
import { shareFiles } from '../lib/files.ts';
import { buildQuoteComparisonPdf } from '../lib/pdf.ts';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';

/**
 * Confirmed quotes side by side: BOQ items as rows, vendors as columns, the
 * cheapest rate highlighted, and every rate checked against the item's past
 * prices in the material database.
 */
export function QuoteCompare({ boq, quotes, onAdd }: { boq: HistoryRecord; quotes: QuoteRow[]; onAdd(): void }) {
  const { linesFor, itemDatabase, learning } = useAppState();
  const dialogs = useDialogs();
  const [shareOpen, setShareOpen] = useState(false);
  const [orderFrom, setOrderFrom] = useState<string | null>(null);
  const { uniqueAddresses } = useAppState();
  const lines = quotes.flatMap((q) => linesFor(q.id));
  const comparison = compareQuotes(boq.items, quotes, lines, itemDatabase, learning);

  if (quotes.length === 0) {
    return (
      <div className="text-center p-8 space-y-4">
        <p className="text-sm text-gray-500">No confirmed quotes yet. Add a vendor's quote and confirm it to compare prices here.</p>
        <button onClick={onAdd} className="px-5 py-3 bg-[var(--color-brand-primary)] text-white rounded-xl text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2">
          <Plus size={14} /> Add vendor quote
        </button>
      </div>
    );
  }

  const share = async (format: ExportFormat) => {
    const name = `${(boq.title || 'BOQ').replace(/[^\w-]+/g, '_')}_quotes`;
    try {
      if (format === 'xlsx') {
        const widths = [5, 30, 12, 12, 12, 10, 8, 8, 12, 20, ...comparison.vendors.map(() => 16)];
        await shareFiles([await sheetToXlsx(comparisonSheet(boq, comparison), `${name}.xlsx`, 'Comparison', widths)]);
      } else {
        const doc = buildQuoteComparisonPdf(boq, comparison);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
    } catch (err) {
      await dialogs.alert('Export failed', (err as Error).message);
    }
  };

  // Cheapest on the items every vendor priced; totals over different item sets aren't comparable.
  const multi = comparison.vendors.length > 1 && comparison.commonItems > 0;
  const ranked = [...comparison.vendors].sort((a, b) => a.commonTotal - b.commonTotal);
  const best = multi && ranked[0].commonTotal < ranked[1].commonTotal ? ranked[0] : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {comparison.vendors.map((v) => (
          <div key={v.quote.id} className={`p-3 rounded-xl border ${v === best ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
            <div className="flex justify-between items-center gap-2">
              <span className="font-bold text-sm truncate">{v.quote.vendor}</span>
              {v === best && (
                <span className="text-[11px] font-bold text-green-700 flex items-center gap-1 shrink-0">
                  <Trophy size={10} /> Cheapest overall
                </span>
              )}
            </div>
            <div className="text-lg font-mono font-bold">{rupees(Math.round(v.total))}</div>
            <div className="text-[11px] text-gray-500 space-x-1">
              <span>{shortDate(v.quote.quote_date)}</span>
              <span>· {v.quoted}/{boq.items.length} quoted</span>
              {v.missing.length > 0 && <b className="text-red-600">· {v.missing.length} missing</b>}
              {v.unitIssues > 0 && <span className="text-orange-700">· {v.unitIssues} other unit</span>}
              {v.variantIssues > 0 && <span className="text-orange-700">· {v.variantIssues} other brand/model</span>}
            </div>
            {multi && comparison.commonItems < boq.items.length && (
              <div className="text-[11px] text-gray-600 mt-1">
                {rupees(Math.round(v.commonTotal))} on the {comparison.commonItems} item{comparison.commonItems === 1 ? '' : 's'} all vendors quoted
              </div>
            )}
            {v.vsLast !== null && (
              <div className={`text-[11px] font-bold mt-1 ${v.vsLast > 0.005 ? 'text-red-600' : v.vsLast < -0.005 ? 'text-green-700' : 'text-gray-500'}`}>
                {pct(v.vsLast)} vs last prices for the same items ({rupees(Math.round(v.lastTotal))})
              </div>
            )}
            <button
              onClick={() => setOrderFrom(v.quote.id)}
              className={`mt-2 w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider ${v === best ? 'bg-green-700 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}
            >
              Order from {v.quote.vendor || 'this vendor'}
            </button>
          </div>
        ))}
      </div>

      <div className="md:hidden space-y-2">
        {comparison.rows.map((row) => (
          <div key={row.item.id} className="border border-gray-200 rounded-xl p-3">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono text-gray-400 mr-1 text-xs">{row.sr}.</span>
                <span className="font-bold text-sm">{row.item.item_name}</span>
                {variantLabel(row.item) && <div className="text-xs text-gray-600">{variantLabel(row.item)}</div>}
              </div>
              <span className="text-[11px] text-gray-500 font-mono shrink-0">
                {row.item.quantity} {row.item.unit}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
              {row.history.last ? (
                <>
                  <span>
                    Last {rupees(row.history.last.price)} · {shortDate(row.history.last.date)} · {row.history.last.vendor}
                  </span>
                  <Sparkline points={row.history.points} width={48} height={14} />
                </>
              ) : (
                <span className="italic">No past price</span>
              )}
            </div>
            <div className="mt-2 divide-y divide-gray-100">
              {comparison.vendors.map((v) => (
                <div key={v.quote.id} className="flex justify-between items-start gap-2 py-1.5">
                  <span className="text-xs text-gray-700 truncate">{v.quote.vendor}</span>
                  <PriceCell cell={row.cells[v.quote.id]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left p-2 font-bold">Item (BOQ qty)</th>
              <th className="text-left p-2 font-bold">Past prices</th>
              {comparison.vendors.map((v) => (
                <th key={v.quote.id} className="text-right p-2 font-bold">
                  {v.quote.vendor}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.item.id} className="border-t border-gray-100 align-top">
                <td className="p-2">
                  <span className="font-mono text-gray-400 mr-1">{row.sr}.</span>
                  <span className="font-bold">{row.item.item_name}</span>
                  {variantLabel(row.item) && <div className="text-[11px] text-gray-600">{variantLabel(row.item)}</div>}
                  <div className="text-[11px] text-gray-500">
                    {row.item.quantity} {row.item.unit}
                  </div>
                </td>
                <td className="p-2">
                  {row.history.last ? (
                    <div className="space-y-0.5">
                      <div className="font-mono">{rupees(row.history.last.price)}</div>
                      <div className="text-[11px] text-gray-500">
                        {shortDate(row.history.last.date)} · {row.history.last.vendor}
                      </div>
                      {row.history.points.length > 1 && (
                        <div className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Sparkline points={row.history.points} />
                          {rupees(row.history.min)}–{rupees(row.history.max)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">No past price</span>
                  )}
                </td>
                {comparison.vendors.map((v) => (
                  <td key={v.quote.id} className={`p-2 text-right ${row.cells[v.quote.id]?.cheapest ? 'bg-green-50' : ''}`}>
                    <PriceCell cell={row.cells[v.quote.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comparison.vendors.some((v) => v.extras.length > 0) && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">Also quoted (not in the BOQ)</h4>
          <ul className="text-xs space-y-1">
            {comparison.vendors.flatMap((v) =>
              v.extras.map((l) => (
                <li key={l.id} className="flex justify-between gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <span>
                    {l.item_name} <span className="text-gray-400">· {v.quote.vendor}</span>
                  </span>
                  <span className="font-mono shrink-0">
                    {l.unit_price > 0 ? `${rupees(l.unit_price)}/${l.unit}` : 'no rate'}
                  </span>
                </li>
              )),
            )}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <button onClick={onAdd} className="flex-1 py-3 bg-white border border-gray-200 rounded-xl text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
          <Plus size={14} /> Add vendor quote
        </button>
        <button onClick={() => setShareOpen(true)} className="flex-1 py-3 bg-[var(--color-brand-primary)] text-white rounded-xl text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
          <Share2 size={14} /> Share comparison
        </button>
      </div>
      {shareOpen && <ShareSheet title="comparison" onShare={share} onClose={() => setShareOpen(false)} />}
      {orderFrom && (() => {
        const v = comparison.vendors.find((x) => x.quote.id === orderFrom);
        if (!v) return null;
        // Only what this vendor quoted for; the rest goes to someone else.
        const items = boq.items.filter((i) => (comparison.rows.find((r) => r.item.id === i.id)?.cells[v.quote.id]?.price ?? 0) > 0);
        return <OrderSlipSheet items={items} notes={boq.notes} address={boq.address} addresses={uniqueAddresses} vendor={v.quote.vendor} onClose={() => setOrderFrom(null)} />;
      })()}
    </div>
  );
}

/** One vendor's rate for one item: lowest marker, change against the last price, unit/quantity notes. */
function PriceCell({ cell }: { cell?: QuoteCell }) {
  if (!cell || cell.price <= 0) return <span className="text-[11px] text-red-500 italic">not quoted</span>;
  return (
    <div className="text-right">
      <div className={`font-mono font-bold text-xs ${cell.cheapest ? 'text-green-700' : ''}`}>
        {rupees(cell.price)}
        {cell.unitDiffers && <span className="text-orange-600 font-normal">/{cell.line.unit}</span>}
        {cell.cheapest && <span className="ml-1 text-[11px] font-bold">· Lowest</span>}
      </div>
      <div className="mt-0.5">
        <VsLastBadge vsLast={cell.vsLast} last={cell.lastPoint} />
      </div>
      {cell.unitDiffers && <div className="text-[11px] text-orange-700">different unit, not compared</div>}
      {cell.variantDiffers.length > 0 && <div className="text-[11px] text-orange-700">{variantLabel(cell.line)}: not what the BOQ asks for, not ranked</div>}
      {cell.qtyDiffers && <div className="text-[11px] text-gray-500">quoted for {cell.line.quantity}</div>}
    </div>
  );
}
