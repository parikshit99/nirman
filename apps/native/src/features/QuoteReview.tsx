import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { compareQuotes, normalizeTerm, parseAmount, variantDifferences, variantLabel, type QuoteLineRow, type QuoteRow, type VariantField } from '@nirman/shared';
import type { QuoteLinePatch } from '@nirman/core';
import { VsLastBadge, rupees } from '../components/PriceBadges';
import { UndoButton } from '../components/UndoButton';
import { VariantFields } from '../components/VariantFields';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { Select } from '../components/ui/Select';
import { Label } from '../components/ui/fields';
import { plural } from '../lib/format';
import { useAppState, type HistoryRecord } from '../state/AppState';
import { useColors } from '../theme';

/**
 * Check the reading of one vendor quote: every line with the BOQ item it was matched to, what's missing from the
 * quote, and how each rate compares to the last recorded price. Confirming adds the prices to Rates.
 */
export function QuoteReview({ boq, quote, onDone }: { boq: HistoryRecord; quote: QuoteRow; onDone(): void }) {
  const c = useColors();
  const { linesFor, itemDatabase, learning, actions, pendingDeletes } = useAppState();
  const dialogs = useDialogs();
  const allLines = linesFor(quote.id);
  /** Lines that count: deleted ones stay listed (struck through) until the undo window ends. */
  const lines = allLines.filter((l) => !pendingDeletes.has(l.id));
  useEffect(() => () => void actions.flushDeletes(), [actions]);
  const readOnly = quote.status === 'confirmed';
  const { rows, vendors } = compareQuotes(boq.items, [quote], lines, itemDatabase, learning, boq.project_id);
  const summary = vendors[0];
  const itemsById = new Map(boq.items.map((i, idx) => [i.id, { item: i, sr: idx + 1 }]));
  const cellByLine = new Map(rows.flatMap((r) => (r.cells[quote.id] ? [[r.cells[quote.id]!.line.id, r.cells[quote.id]!] as const] : [])));
  const firstLineFor = new Map<string, string>();
  for (const l of lines) if (l.boq_item_id && !firstLineFor.has(l.boq_item_id)) firstLineFor.set(l.boq_item_id, l.id);
  const [vendor, setVendor] = useState(quote.vendor);

  const confirm = async () => {
    const issues = [
      summary.missing.length > 0 && `${summary.missing.length} BOQ item${summary.missing.length === 1 ? ' has' : 's have'} no price`,
      summary.unitIssues > 0 && `${summary.unitIssues} line${summary.unitIssues === 1 ? ' is' : 's are'} in a different unit`,
    ].filter(Boolean);
    const ok = await dialogs.confirm(`Confirm ${quote.vendor}'s quote?`, {
      message: `Prices are added to Rates under the BOQ's item names, dated ${new Date(quote.quote_date).toLocaleDateString('en-IN')}.${issues.length ? `\nStill open: ${issues.join('; ')}.` : ''}`,
      confirmLabel: 'Confirm',
    });
    if (!ok) return;
    await actions.flushDeletes();
    await actions.confirmQuote(quote.id);
    onDone();
  };

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Label>Vendor</Label>
          <TextInput
            value={vendor}
            editable={!readOnly}
            onChangeText={setVendor}
            onEndEditing={() => vendor.trim() !== quote.vendor && actions.updateQuote(quote.id, { vendor: vendor.trim() })}
            style={{ minHeight: 44, paddingHorizontal: readOnly ? 0 : 12, borderWidth: readOnly ? 0 : 1, borderColor: c.gray200, borderRadius: 10, backgroundColor: readOnly ? 'transparent' : c.gray50, color: c.brandDark, fontSize: 14, fontWeight: readOnly ? '700' : '400' }}
          />
        </View>
        <View>
          <Label>Date</Label>
          <Text style={{ minHeight: 44, textAlignVertical: 'center', fontSize: 14, fontFamily: 'monospace', color: c.brandDark }}>{quote.quote_date}</Text>
        </View>
      </View>

      <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: summary.missing.length ? c.red100 : c.green100, backgroundColor: summary.missing.length ? c.red50 : c.green50 }}>
        <Text style={{ fontSize: 12, color: c.gray800 }}>
          <Text style={{ fontWeight: '700' }}>{summary.quoted} of {boq.items.length} BOQ items quoted</Text>
          {summary.missing.length > 0 && <Text style={{ fontWeight: '700', color: c.red700 }}>{` · ${summary.missing.length} missing`}</Text>}
          {summary.extras.length > 0 && ` · ${summary.extras.length} not in BOQ`}
          {summary.unitIssues > 0 && <Text style={{ color: c.orange700 }}>{` · ${summary.unitIssues} in a different unit`}</Text>}
        </Text>
      </View>

      {summary.missing.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.red600, marginBottom: 4 }}>Missing from this quote</Text>
          {summary.missing.map((item) => (
            <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: c.red50 }}>
              <Text style={{ flex: 1, fontSize: 12, color: c.gray800 }}>
                <Text style={{ fontFamily: 'monospace', color: c.gray500 }}>{itemsById.get(item.id)?.sr}. </Text>
                {item.item_name}
                {variantLabel(item) ? <Text style={{ color: c.gray500 }}>{` · ${variantLabel(item)}`}</Text> : null}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray500 }}>
                {item.quantity} {item.unit}
              </Text>
            </View>
          ))}
          {!readOnly && <Text style={{ fontSize: 12, color: c.gray500, marginTop: 4 }}>Ask the vendor for these, or match one of their lines below to the right item.</Text>}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>What the vendor wrote ({plural(lines.length, 'line')})</Text>
        {allLines.map((line) => {
          if (pendingDeletes.has(line.id)) {
            return (
              <View key={line.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.red100, backgroundColor: c.red50 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, textDecorationLine: 'line-through', color: c.gray500 }}>
                  “{line.original_term || line.item_name}”
                </Text>
                <UndoButton onUndo={() => actions.undoDelete(line.id)} label={line.original_term || line.item_name} />
              </View>
            );
          }
          const match = line.boq_item_id ? itemsById.get(line.boq_item_id) : undefined;
          const duplicate = !!line.boq_item_id && firstLineFor.get(line.boq_item_id) !== line.id;
          return <LineCard key={line.id} line={line} match={match} duplicate={duplicate} cell={cellByLine.get(line.id)} boq={boq} readOnly={readOnly} onChange={(patch) => actions.updateQuoteLine(line.id, patch)} onDelete={() => actions.deleteQuoteLineLater(line.id)} />;
        })}
      </View>

      {!readOnly && (
        <Button variant="primary" block icon="check-circle" onPress={confirm}>
          Confirm quote
        </Button>
      )}
    </View>
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
  const c = useColors();
  const [rate, setRate] = useState(String(line.unit_price || ''));
  const [unit, setUnit] = useState(line.unit);
  const [showDetails, setShowDetails] = useState(false);
  const [variant, setVariant] = useState({ brand: line.brand, model: line.model, spec: line.spec, color: line.color });
  const variantDiffers = match ? variantDifferences(match.item, line) : [];
  const unitDiffers = !!match && normalizeTerm(unit) !== normalizeTerm(match.item.unit);
  const input = { minHeight: 44, paddingHorizontal: 8, borderWidth: readOnly ? 0 : 1, borderColor: c.gray200, borderRadius: 8, backgroundColor: readOnly ? 'transparent' : c.gray50, color: c.brandDark, fontSize: 14 };

  return (
    <View style={{ padding: 12, gap: 8, borderRadius: 12, borderWidth: 1, borderStyle: match ? 'solid' : 'dashed', borderColor: match ? c.gray200 : c.gray300, backgroundColor: match ? 'transparent' : c.gray50 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray900 }}>“{line.original_term || line.item_name}”</Text>
          <Text style={{ fontSize: 12, color: c.gray500 }}>
            {line.item_name !== line.original_term && line.original_term ? `${line.item_name} · ` : ''}
            {line.quantity > 0 && `${line.quantity} ${line.unit}`}
          </Text>
          {variantLabel(line) ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray700 }}>{variantLabel(line)}</Text> : null}
        </View>
        {!readOnly && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete line ${line.original_term || line.item_name}`} onPress={onDelete} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', margin: -8 }}>
            <Icon name="delete-outline" size={16} color={c.gray500} />
          </Pressable>
        )}
      </View>

      <Select
        label="Matched BOQ item"
        value={line.boq_item_id ?? ''}
        options={[{ value: '', label: '— Not in BOQ (extra item) —' }, ...boq.items.map((item, i) => ({ value: item.id, label: `${i + 1}. ${item.item_name}${variantLabel(item) ? ` · ${variantLabel(item)}` : ''} (${item.quantity} ${item.unit})` }))]}
        onChange={readOnly ? () => {} : (v) => onChange({ boq_item_id: v || null })}
      />

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: c.gray500 }}>₹</Text>
        <TextInput
          keyboardType="decimal-pad"
          value={rate}
          editable={!readOnly}
          onChangeText={setRate}
          onEndEditing={() => {
            const value = rate.trim() ? parseAmount(rate) : 0;
            if (value === null) setRate(String(line.unit_price || ''));
            else if (value !== line.unit_price) onChange({ unit_price: value });
          }}
          accessibilityLabel="Rate"
          placeholder="Rate"
          placeholderTextColor={c.gray500}
          style={[input, { width: 112, fontFamily: 'monospace' }]}
        />
        <Text style={{ fontSize: 12, color: c.gray500 }}>per</Text>
        <TextInput value={unit} editable={!readOnly} onChangeText={setUnit} onEndEditing={() => unit.trim() !== line.unit && onChange({ unit: unit.trim() || 'unit' })} accessibilityLabel="Unit" style={[input, { width: 80 }]} />
      </View>

      {!readOnly && (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>{showDetails ? '▴' : '▾'} Brand, model, size, color</Text>
        </Pressable>
      )}
      {showDetails && (
        <View style={{ gap: 8 }}>
          <VariantFields value={variant} onChange={(f: VariantField, v: string) => setVariant((p) => ({ ...p, [f]: v }))} />
          <Button
            variant="primary"
            size="sm"
            onPress={() => {
              onChange(Object.fromEntries(Object.entries(variant).map(([k, v]) => [k, v.trim()])));
              setShowDetails(false);
            }}
          >
            Save details
          </Button>
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {line.unit_price <= 0 && <Flag tone="red">No rate written</Flag>}
        {variantDiffers.length > 0 && <Flag tone="orange">{`Different ${variantDiffers.join(' / ').replace('spec', 'size/spec')}: BOQ asks for ${variantLabel(match!.item)}. Not ranked against other vendors`}</Flag>}
        {duplicate && <Flag tone="orange">{`Item ${match?.sr} is matched twice; only the first line counts`}</Flag>}
        {unitDiffers && <Flag tone="orange">{`Different unit: BOQ is in ${match!.item.unit}. Fix the rate and unit, or it won't be compared`}</Flag>}
        {cell?.qtyDiffers && <Flag tone="gray">{`BOQ ${match!.item.quantity} ${match!.item.unit}, quoted ${line.quantity}`}</Flag>}
        {line.note ? <Flag tone="gray">{line.note}</Flag> : null}
        {cell && <VsLastBadge vsLast={cell.vsLast} last={cell.lastPoint} projectId={boq.project_id} />}
        {cell && !cell.lastPoint && !cell.unitDiffers && cell.price > 0 && <Flag tone="gray">First price recorded for this item</Flag>}
        {match && line.total_amount > 0 && <Flag tone="gray">{`Line total ${rupees(line.total_amount)}`}</Flag>}
      </View>
    </View>
  );
}

function Flag({ tone, children }: { tone: 'red' | 'orange' | 'gray'; children: ReactNode }) {
  const c = useColors();
  const look = { red: { bg: c.red50, fg: c.red600 }, orange: { bg: c.orange50, fg: c.orange700 }, gray: { bg: c.gray100, fg: c.gray600 } }[tone];
  return <Text style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 12, fontWeight: '700', backgroundColor: look.bg, color: look.fg }}>{children}</Text>;
}
