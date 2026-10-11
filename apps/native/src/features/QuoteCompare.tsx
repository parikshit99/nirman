import { useState } from 'react';
import { Text, View } from 'react-native';
import { compareQuotes, variantLabel, type QuoteCell, type QuoteRow } from '@nirman/shared';
import { comparisonSheet, pdfFile, type ExportFormat, logStep, buildQuoteComparisonPdf } from '@nirman/core';
import { Sparkline, VsLastBadge, pct, shortDate } from '../components/PriceBadges';
import { ShareSheet } from '../components/ShareSheet';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { pdfToJpegs, sheetToXlsx } from '../lib/exportFiles';
import { shareFiles } from '../lib/files';
import { plural, rupees } from '../lib/format';
import { useAppState, type HistoryRecord } from '../state/AppState';
import { useColors } from '../theme';
import { OrderSlipSheet } from './OrderSlipSheet';

/**
 * Confirmed quotes side by side: BOQ items as rows, vendors as columns, the cheapest rate highlighted, and every rate
 * checked against the item's past prices in Rates. On a phone each item is a card with one line per vendor.
 */
export function QuoteCompare({ boq, quotes, onAdd }: { boq: HistoryRecord; quotes: QuoteRow[]; onAdd(): void }) {
  const c = useColors();
  const { linesFor, itemDatabase, learning, uniqueAddresses } = useAppState();
  const dialogs = useDialogs();
  const [shareOpen, setShareOpen] = useState(false);
  const [orderFrom, setOrderFrom] = useState<string | null>(null);
  const lines = quotes.flatMap((q) => linesFor(q.id));
  const comparison = compareQuotes(boq.items, quotes, lines, itemDatabase, learning, boq.project_id);

  if (quotes.length === 0) {
    return (
      <View style={{ padding: 32, gap: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: c.gray500, textAlign: 'center' }}>No confirmed quotes yet. Add a vendor's quote and confirm it to compare prices here.</Text>
        <Button variant="primary" icon="add" onPress={onAdd}>
          Add vendor quote
        </Button>
      </View>
    );
  }

  const share = async (format: ExportFormat) => {
    logStep('share', { what: 'comparison', format, vendors: comparison.vendors.length });
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
  const order = orderFrom ? comparison.vendors.find((x) => x.quote.id === orderFrom) : undefined;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        {comparison.vendors.map((v) => (
          <View key={v.quote.id} style={{ padding: 12, gap: 2, borderRadius: 12, borderWidth: 1, borderColor: v === best ? c.green300 : c.gray200, backgroundColor: v === best ? c.green50 : 'transparent' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.brandDark }}>
                {v.quote.vendor}
              </Text>
              {v === best && <Text style={{ fontSize: 12, fontWeight: '700', color: c.green700 }}>Cheapest overall</Text>}
            </View>
            <Text style={{ fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '700', color: c.brandDark }}>{rupees(Math.round(v.total))}</Text>
            <Text style={{ fontSize: 12, color: c.gray500 }}>
              {shortDate(v.quote.quote_date)} · {v.quoted}/{boq.items.length} quoted
              {v.missing.length > 0 && <Text style={{ fontWeight: '700', color: c.red600 }}>{` · ${v.missing.length} missing`}</Text>}
              {v.unitIssues > 0 && <Text style={{ color: c.orange700 }}>{` · ${v.unitIssues} other unit`}</Text>}
              {v.variantIssues > 0 && <Text style={{ color: c.orange700 }}>{` · ${v.variantIssues} other brand/model`}</Text>}
            </Text>
            {multi && comparison.commonItems < boq.items.length && (
              <Text style={{ fontSize: 12, color: c.gray600, marginTop: 4 }}>
                {rupees(Math.round(v.commonTotal))} on the {plural(comparison.commonItems, 'item')} all vendors quoted
              </Text>
            )}
            {v.vsLast !== null && (
              <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 4, color: v.vsLast > 0.005 ? c.red600 : v.vsLast < -0.005 ? c.green700 : c.gray500 }}>
                {pct(v.vsLast)} vs last prices for the same items ({rupees(Math.round(v.lastTotal))})
              </Text>
            )}
            <View style={{ marginTop: 8 }}>
              <Button variant={v === best ? 'primary' : 'secondary'} size="sm" block onPress={() => setOrderFrom(v.quote.id)}>
                {`Order from ${v.quote.vendor || 'this vendor'}`}
              </Button>
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        {comparison.rows.map((row) => (
          <View key={row.item.id} style={{ padding: 12, borderWidth: 1, borderColor: c.gray200, borderRadius: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>
                  <Text style={{ fontVariant: ['tabular-nums'], fontSize: 12, color: c.gray500 }}>{row.sr}. </Text>
                  {row.item.item_name}
                </Text>
                {variantLabel(row.item) ? <Text style={{ fontSize: 12, color: c.gray600 }}>{variantLabel(row.item)}</Text> : null}
              </View>
              <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>
                {row.item.quantity} {row.item.unit}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {row.history.last ? (
                <>
                  <Text style={{ flexShrink: 1, fontSize: 12, color: c.gray500 }}>
                    Last {rupees(row.history.last.price)} · {shortDate(row.history.last.date)} · {row.history.last.vendor}
                  </Text>
                  <Sparkline points={row.history.points} width={48} height={14} />
                </>
              ) : (
                <Text style={{ fontSize: 12, fontStyle: 'italic', color: c.gray500 }}>No past price</Text>
              )}
            </View>
            <View style={{ marginTop: 8 }}>
              {comparison.vendors.map((v, i) => (
                <View key={v.quote.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.gray100 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: c.gray700 }}>
                    {v.quote.vendor}
                  </Text>
                  <PriceCell cell={row.cells[v.quote.id]} projectId={boq.project_id} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {comparison.vendors.some((v) => v.extras.length > 0) && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500, marginBottom: 4 }}>Also quoted (not in the BOQ)</Text>
          {comparison.vendors.flatMap((v) =>
            v.extras.map((l) => (
              <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: c.gray50 }}>
                <Text style={{ flex: 1, fontSize: 12, color: c.gray800 }}>
                  {l.item_name} <Text style={{ color: c.gray500 }}>· {v.quote.vendor}</Text>
                </Text>
                <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray800 }}>{l.unit_price > 0 ? `${rupees(l.unit_price)}/${l.unit}` : 'no rate'}</Text>
              </View>
            )),
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button icon="add" style={{ flex: 1 }} onPress={onAdd}>
          Add vendor quote
        </Button>
        <Button variant="primary" icon="share" style={{ flex: 1 }} onPress={() => setShareOpen(true)}>
          Share comparison
        </Button>
      </View>
      {shareOpen && <ShareSheet title="comparison" onShare={share} preview={() => buildQuoteComparisonPdf(boq, comparison)} onClose={() => setShareOpen(false)} />}
      {order && (
        // Only what this vendor quoted for; the rest goes to someone else.
        <OrderSlipSheet
          items={boq.items.filter((i) => (comparison.rows.find((r) => r.item.id === i.id)?.cells[order.quote.id]?.price ?? 0) > 0)}
          notes={boq.notes}
          address={boq.address}
          addresses={uniqueAddresses}
          vendor={order.quote.vendor}
          onClose={() => setOrderFrom(null)}
        />
      )}
    </View>
  );
}

/** One vendor's rate for one item: lowest marker, change against the last price, unit/quantity notes. */
function PriceCell({ cell, projectId }: { cell?: QuoteCell; projectId: string }) {
  const c = useColors();
  if (!cell || cell.price <= 0) return <Text style={{ fontSize: 12, fontStyle: 'italic', color: c.red500 }}>not quoted</Text>;
  return (
    <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
      <Text style={{ fontVariant: ['tabular-nums'], fontWeight: '700', fontSize: 12, color: cell.cheapest ? c.green700 : c.brandDark }}>
        {rupees(cell.price)}
        {cell.unitDiffers && <Text style={{ fontWeight: '400', color: c.orange600 }}>{`/${cell.line.unit}`}</Text>}
        {cell.cheapest && ' · Lowest'}
      </Text>
      <VsLastBadge vsLast={cell.vsLast} last={cell.lastPoint} projectId={projectId} />
      {cell.unitDiffers && <Text style={{ fontSize: 12, color: c.orange700 }}>different unit, not compared</Text>}
      {cell.variantDiffers.length > 0 && <Text style={{ fontSize: 12, color: c.orange700, textAlign: 'right' }}>{variantLabel(cell.line)}: not what the BOQ asks for, not ranked</Text>}
      {cell.qtyDiffers && <Text style={{ fontSize: 12, color: c.gray500 }}>quoted for {cell.line.quantity}</Text>}
    </View>
  );
}
