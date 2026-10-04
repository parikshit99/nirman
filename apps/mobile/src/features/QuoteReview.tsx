import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { compareQuotes, normalizeTerm, parseAmount, variantDifferences, variantLabel, type QuoteLineRow, type QuoteRow, type VariantField } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { VsLastBadge, rupees } from '../components/PriceBadges.tsx';
import type { QuoteLinePatch } from '../data/repo.ts';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { VariantFields } from '../components/VariantFields.tsx';

/**
 * Check the AI's reading of one vendor quote: every line with the BOQ item it
 * was matched to, what's missing from the quote, and how each rate compares to
 * the last recorded price. Confirming adds the prices to the database.
 */
export function QuoteReview({ boq, quote, onDone }: { boq: HistoryRecord; quote: QuoteRow; onDone(): void }) {
  const { linesFor, itemDatabase, learning, actions, pendingDeletes } = useAppState();
  const dialogs = useDialogs();
  const allLines = linesFor(quote.id);
  /** Lines that count: deleted ones stay listed (struck through) until the undo window ends. */
  const lines = allLines.filter((l) => !pendingDeletes.has(l.id));
  useEffect(() => () => void actions.flushDeletes(), [actions]);
  const readOnly = quote.status === 'confirmed';
  const { rows, vendors } = compareQuotes(boq.items, [quote], lines, itemDatabase, learning);
  const summary = vendors[0];
  const itemsById = new Map(boq.items.map((i, idx) => [i.id, { item: i, sr: idx + 1 }]));
  const cellByLine = new Map(rows.flatMap((r) => (r.cells[quote.id] ? [[r.cells[quote.id]!.line.id, r.cells[quote.id]!] as const] : [])));
  const firstLineFor = new Map<string, string>();
  for (const l of lines) if (l.boq_item_id && !firstLineFor.has(l.boq_item_id)) firstLineFor.set(l.boq_item_id, l.id);

  const confirm = async () => {
    const issues = [
      summary.missing.length > 0 && `${summary.missing.length} BOQ item${summary.missing.length === 1 ? ' has' : 's have'} no price`,
      summary.unitIssues > 0 && `${summary.unitIssues} line${summary.unitIssues === 1 ? ' is' : 's are'} in a different unit`,
    ].filter(Boolean);
    const ok = await dialogs.confirm(`Confirm ${quote.vendor}'s quote?`, {
      message: `Prices are added to your material database under the BOQ's item names, dated ${new Date(quote.quote_date).toLocaleDateString('en-IN')}.${
        issues.length ? `\nStill open: ${issues.join('; ')}.` : ''
      }`,
      confirmLabel: 'Confirm',
    });
    if (!ok) return;
    await actions.flushDeletes();
    await actions.confirmQuote(quote.id);
    onDone();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="block flex-1 min-w-[10rem]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Vendor</span>
          <input
            defaultValue={quote.vendor}
            disabled={readOnly}
            onBlur={(e) => e.target.value.trim() !== quote.vendor && actions.updateQuote(quote.id, { vendor: e.target.value.trim() })}
            className="mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm disabled:bg-white disabled:border-transparent disabled:px-0 disabled:font-bold"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Date</span>
          <input
            type="date"
            defaultValue={quote.quote_date}
            disabled={readOnly}
            onBlur={(e) => e.target.value && e.target.value !== quote.quote_date && actions.updateQuote(quote.id, { quote_date: e.target.value })}
            className="mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm disabled:bg-white disabled:border-transparent disabled:px-0"
          />
        </label>
      </div>

      <div className={`p-3 rounded-xl border text-xs ${summary.missing.length ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
        <b>
          {summary.quoted} of {boq.items.length} BOQ items quoted
        </b>
        {summary.missing.length > 0 && <span className="text-red-700 font-bold"> · {summary.missing.length} missing</span>}
        {summary.extras.length > 0 && <span> · {summary.extras.length} not in BOQ</span>}
        {summary.unitIssues > 0 && <span className="text-orange-700"> · {summary.unitIssues} in a different unit</span>}
      </div>

      {summary.missing.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-red-600 mb-2">Missing from this quote</h4>
          <ul className="space-y-1">
            {summary.missing.map((item) => (
              <li key={item.id} className="text-xs flex justify-between gap-2 px-3 py-2 bg-red-50/60 rounded-lg">
                <span>
                  <span className="font-mono text-gray-400 mr-1">{itemsById.get(item.id)?.sr}.</span>
                  {item.item_name}
                  {variantLabel(item) && <span className="text-gray-500"> · {variantLabel(item)}</span>}
                </span>
                <span className="font-mono text-gray-500 shrink-0">
                  {item.quantity} {item.unit}
                </span>
              </li>
            ))}
          </ul>
          {!readOnly && <p className="text-[11px] text-gray-500 mt-1">Ask the vendor for these, or match one of their lines below to the right item.</p>}
        </section>
      )}

      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">What the vendor wrote ({lines.length} lines)</h4>
        <div className="space-y-2">
          {allLines.map((line) => {
            if (pendingDeletes.has(line.id)) {
              return (
                <div key={line.id} className="p-3 rounded-xl border border-red-100 bg-red-50/40 flex items-center justify-between gap-2">
                  <span className="text-sm line-through text-gray-500 truncate">“{line.original_term || line.item_name}”</span>
                  <UndoButton onUndo={() => actions.undoDelete(line.id)} label={line.original_term || line.item_name} />
                </div>
              );
            }
            const match = line.boq_item_id ? itemsById.get(line.boq_item_id) : undefined;
            const duplicate = !!line.boq_item_id && firstLineFor.get(line.boq_item_id) !== line.id;
            return (
              <LineCard
                key={line.id}
                line={line}
                match={match}
                duplicate={duplicate}
                cell={cellByLine.get(line.id)}
                boq={boq}
                readOnly={readOnly}
                onChange={(patch) => actions.updateQuoteLine(line.id, patch)}
                onDelete={() => actions.deleteQuoteLineLater(line.id)}
              />
            );
          })}
        </div>
      </section>

      {!readOnly && (
        <button
          onClick={confirm}
          className="w-full h-12 bg-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 uppercase tracking-widest text-xs sticky bottom-0 shadow-lg"
        >
          <CheckCircle2 size={16} /> Confirm quote
        </button>
      )}
    </div>
  );
}

interface LineCardProps {
  line: QuoteLineRow;
  match?: { item: HistoryRecord['items'][number]; sr: number };
  duplicate: boolean;
  cell?: ReturnType<typeof compareQuotes>['rows'][number]['cells'][string];
  boq: HistoryRecord;
  readOnly: boolean;
  onChange(patch: QuoteLinePatch): void;
  onDelete(): void;
}

function LineCard({ line, match, duplicate, cell, boq, readOnly, onChange, onDelete }: LineCardProps) {
  const [rate, setRate] = useState(String(line.unit_price || ''));
  const [unit, setUnit] = useState(line.unit);
  const [showDetails, setShowDetails] = useState(false);
  const [variant, setVariant] = useState({ brand: line.brand, model: line.model, spec: line.spec, color: line.color });
  const variantDiffers = match ? variantDifferences(match.item, line) : [];
  const unitDiffers = !!match && normalizeTerm(unit) !== normalizeTerm(match.item.unit);
  const field = 'px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-white disabled:border-transparent';

  return (
    <div className={`p-3 rounded-xl border ${match ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50/50'}`}>
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900">“{line.original_term || line.item_name}”</div>
          <div className="text-[11px] text-gray-500">
            {line.item_name !== line.original_term && line.original_term ? `${line.item_name} · ` : ''}
            {line.quantity > 0 && `${line.quantity} ${line.unit}`}
          </div>
          {variantLabel(line) && <div className="text-xs font-bold text-gray-700">{variantLabel(line)}</div>}
        </div>
        {!readOnly && (
          <button onClick={onDelete} className="p-1 text-gray-300 hover:text-red-500 self-start" aria-label={`Delete line ${line.original_term || line.item_name}`}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <label className="block mt-2">
        <span className="sr-only">Matched BOQ item</span>
        <select
          value={line.boq_item_id ?? ''}
          disabled={readOnly}
          onChange={(e) => onChange({ boq_item_id: e.target.value || null })}
          className={`w-full ${field} text-xs ${match ? 'text-gray-900' : 'text-gray-500'}`}
        >
          <option value="">— Not in BOQ (extra item) —</option>
          {boq.items.map((item, i) => (
            <option key={item.id} value={item.id}>
              {i + 1}. {item.item_name}{variantLabel(item) ? ` · ${variantLabel(item)}` : ''} ({item.quantity} {item.unit})
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2 mt-2 items-center">
        <span className="text-gray-400 text-sm">₹</span>
        <input
          inputMode="decimal"
          value={rate}
          disabled={readOnly}
          onChange={(e) => setRate(e.target.value)}
          onBlur={() => {
            const value = rate.trim() ? parseAmount(rate) : 0;
            if (value === null) setRate(String(line.unit_price || ''));
            else if (value !== line.unit_price) onChange({ unit_price: value });
          }}
          aria-label="Rate"
          placeholder="Rate"
          className={`w-28 ${field} font-mono`}
        />
        <span className="text-gray-400 text-xs">per</span>
        <input
          value={unit}
          disabled={readOnly}
          onChange={(e) => setUnit(e.target.value)}
          onBlur={() => unit.trim() !== line.unit && onChange({ unit: unit.trim() || 'unit' })}
          aria-label="Unit"
          className={`w-20 ${field}`}
        />
      </div>

      {!readOnly && (
        <button onClick={() => setShowDetails(!showDetails)} className="mt-2 text-xs font-bold text-gray-600" aria-expanded={showDetails}>
          {showDetails ? '▴' : '▾'} Brand, model, size, color
        </button>
      )}
      {showDetails && (
        <div className="mt-2">
          <VariantFields
            value={variant}
            onChange={(f: VariantField, v: string) => setVariant((p) => ({ ...p, [f]: v }))}
            inputClassName={`w-full ${field}`}
          />
          <button
            onClick={() => {
              onChange(Object.fromEntries(Object.entries(variant).map(([k, v]) => [k, v.trim()])));
              setShowDetails(false);
            }}
            className="mt-2 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-bold"
          >
            Save details
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-2">
        {line.unit_price <= 0 && <Flag tone="red">No rate written</Flag>}
        {variantDiffers.length > 0 && (
          <Flag tone="orange">
            Different {variantDiffers.join(' / ').replace('spec', 'size/spec')}: BOQ asks for {variantLabel(match!.item)}. Not ranked against other vendors
          </Flag>
        )}
        {duplicate && <Flag tone="orange">Item {match?.sr} is matched twice; only the first line counts</Flag>}
        {unitDiffers && <Flag tone="orange">Different unit: BOQ is in {match!.item.unit}. Fix the rate and unit, or it won't be compared</Flag>}
        {cell?.qtyDiffers && (
          <Flag tone="gray">
            BOQ {match!.item.quantity} {match!.item.unit}, quoted {line.quantity}
          </Flag>
        )}
        {line.note && <Flag tone="gray">{line.note}</Flag>}
        {cell && <VsLastBadge vsLast={cell.vsLast} last={cell.lastPoint} />}
        {cell && !cell.lastPoint && !cell.unitDiffers && cell.price > 0 && <Flag tone="gray">First price recorded for this item</Flag>}
        {match && line.total_amount > 0 && <Flag tone="gray">Line total {rupees(line.total_amount)}</Flag>}
      </div>
    </div>
  );
}

function Flag({ tone, children }: { tone: 'red' | 'orange' | 'gray'; children: React.ReactNode }) {
  const cls = { red: 'bg-red-50 text-red-600', orange: 'bg-orange-50 text-orange-700', gray: 'bg-gray-100 text-gray-600' }[tone];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${cls}`}>
      {tone !== 'gray' && <AlertTriangle size={9} />}
      {children}
    </span>
  );
}
