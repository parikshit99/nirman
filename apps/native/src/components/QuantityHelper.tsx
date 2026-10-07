import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  conversionKind,
  describePieceOrder,
  describeTmtOrder,
  parseAmount,
  parseDiameter,
  parseSize,
  pieceSqft,
  piecesForArea,
  sizeLabel,
  tmtEstimate,
  type ConversionKind,
  type SheetSize,
} from '@nirman/shared';
import { loadConversions } from '@nirman/core';
import { useColors } from '../theme';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { NumberField } from './ui/fields';
import { Select } from './ui/Select';

export interface HelperResult {
  quantity: number;
  unit: string;
  spec: string;
  ordered_as: string;
}

const KINDS: { kind: ConversionKind; label: string }[] = [
  { kind: 'tmt', label: 'TMT bars' },
  { kind: 'tile', label: 'Tiles' },
  { kind: 'acp', label: 'ACP sheets' },
];

const num = (s: string) => (s.trim() ? (parseAmount(s) ?? NaN) : 0);

/**
 * Works out the billed quantity for material ordered in another unit: TMT bundles and bars → kg, and sqft needed →
 * whole tiles / sheets → billed sqft. Offers itself for TMT, tile and ACP items.
 */
export function QuantityHelper({ itemName, spec, onApply }: { itemName: string; spec: string; onApply(r: HelperResult): void }) {
  const c = useColors();
  const detected = conversionKind(itemName);
  const [chosen, setChosen] = useState<ConversionKind | null>(null);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const kind = chosen ?? detected;

  if (!kind || !open) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {detected ? (
          <Pressable onPress={() => setOpen(true)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8, borderColor: c.orange200, backgroundColor: c.orange50 }}>
            <Icon name="calculate" size={14} color={c.orange700} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.orange700 }}>{detected === 'tmt' ? 'Bundles → kg' : detected === 'tile' ? 'Sqft → tiles' : 'Sqft → sheets'}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={() => setMore(!more)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="calculate" size={14} color={c.gray500} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Unit calculator</Text>
              <Icon name={more ? 'expand-less' : 'expand-more'} size={16} color={c.gray500} />
            </Pressable>
            {more &&
              KINDS.map((k) => (
                <Pressable
                  key={k.kind}
                  onPress={() => {
                    setChosen(k.kind);
                    setOpen(true);
                  }}
                  style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 8, borderColor: c.gray200 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>{k.label}</Text>
                </Pressable>
              ))}
          </>
        )}
      </View>
    );
  }
  const close = () => setOpen(false);
  return (
    <View accessibilityLabel="Unit calculator" style={{ padding: 12, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.orange200, backgroundColor: c.orange50 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.orange700 }}>{KINDS.find((k) => k.kind === kind)!.label}</Text>
        <Pressable onPress={close} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Close</Text>
        </Pressable>
      </View>
      {kind === 'tmt' ? (
        <TmtForm
          spec={spec}
          onApply={(r) => {
            onApply(r);
            close();
          }}
        />
      ) : (
        <PieceForm
          kind={kind}
          spec={spec}
          onApply={(r) => {
            onApply(r);
            close();
          }}
        />
      )}
    </View>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>;
}

function TmtForm({ spec, onApply }: { spec: string; onApply(r: HelperResult): void }) {
  const c = useColors();
  const settings = loadConversions();
  const diameters = Object.keys(settings.bundleBars).map(Number).sort((a, b) => a - b);
  const [diameter, setDiameter] = useState(() => parseDiameter(spec) ?? diameters[2] ?? 12);
  const [bundles, setBundles] = useState('');
  const [loose, setLoose] = useState('');
  const [length, setLength] = useState(String(settings.barLength));
  const [weighed, setWeighed] = useState('');
  const [b, l, len, w] = [num(bundles), num(loose), num(length), num(weighed)];
  const valid = [b, l, len, w].every((x) => Number.isFinite(x) && x >= 0) && len > 0;
  const est = valid ? tmtEstimate({ diameter, bundles: b, looseBars: l, barLength: len, bundleBars: settings.bundleBars }) : null;
  const diff = est && w > 0 && est.kg > 0 ? ((w - est.kg) / est.kg) * 100 : null;

  const apply = () => {
    if (!est || (!est.kg && !w)) return;
    const order = describeTmtOrder({ diameter, bundles: b, looseBars: l, barLength: len });
    onApply({
      quantity: w > 0 ? w : est.kg,
      unit: 'kg',
      spec: `${diameter} mm`,
      ordered_as: w > 0 ? `${order}; weighed ${w} kg (${diff! >= 0 ? '+' : ''}${diff!.toFixed(1)}% vs standard ${est.kg} kg)` : `${order} (weight estimated)`,
    });
  };

  return (
    <View style={{ gap: 8 }}>
      <Pair>
        <View style={{ flex: 1 }}>
          <Select label="Diameter" value={String(diameter)} options={diameters.map((d) => ({ value: String(d), label: `${d} mm` }))} onChange={(v) => setDiameter(Number(v))} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Bar length (m)" value={length} onChangeText={setLength} />
        </View>
      </Pair>
      <Pair>
        <View style={{ flex: 1 }}>
          <NumberField label="Bundles" value={bundles} onChangeText={setBundles} placeholder="0" />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Loose bars" value={loose} onChangeText={setLoose} placeholder="0" keyboardType="number-pad" />
        </View>
      </Pair>
      <Text accessibilityRole="text" style={{ fontSize: 12, color: c.gray700 }}>
        {est ? `${est.bars} bars (${est.perBundle} per bundle) ≈ ${est.kg} kg at standard weight` : 'Check the numbers'}
      </Text>
      <NumberField label="Weighed kg from the slip (optional)" value={weighed} onChangeText={setWeighed} placeholder={est ? String(est.kg) : ''} />
      {diff !== null && (
        <Text style={{ fontSize: 12, color: Math.abs(diff) > 3 ? c.red600 : c.gray600, fontWeight: Math.abs(diff) > 3 ? '700' : '400' }}>
          {diff >= 0 ? '+' : ''}
          {diff.toFixed(1)}% vs standard weight
        </Text>
      )}
      <Button variant="primary" size="sm" block disabled={!est || (!est.kg && !w)} onPress={apply}>
        {`Use ${w > 0 ? `${w} kg` : est ? `${est.kg} kg` : ''}`}
      </Button>
    </View>
  );
}

function PieceForm({ kind, spec, onApply }: { kind: 'tile' | 'acp'; spec: string; onApply(r: HelperResult): void }) {
  const c = useColors();
  const settings = loadConversions();
  const presets = kind === 'tile' ? settings.tileSizes : settings.acpSizes;
  const initial = parseSize(spec) ?? presets[0] ?? { width: 600, length: 1200 };
  const [width, setWidth] = useState(String(initial.width));
  const [length, setLength] = useState(String(initial.length));
  const [area, setArea] = useState('');
  const [wastage, setWastage] = useState('0');
  const size: SheetSize = { width: num(width), length: num(length) };
  const [a, w] = [num(area), num(wastage)];
  const valid = size.width > 0 && size.length > 0 && Number.isFinite(a) && Number.isFinite(w) && w >= 0;
  const result = valid ? piecesForArea(a, size, w) : null;
  const piece = kind === 'tile' ? 'tile' : 'sheet';
  const presetKey = `${size.width}x${size.length}`;
  const options = [...presets.map((p) => ({ value: `${p.width}x${p.length}`, label: sizeLabel(p) })), { value: 'custom', label: 'Custom size…' }];

  return (
    <View style={{ gap: 8 }}>
      <Select
        label="Size"
        value={presets.some((p) => `${p.width}x${p.length}` === presetKey) ? presetKey : 'custom'}
        options={options}
        onChange={(v) => {
          if (v === 'custom') return;
          const [pw, pl] = v.split('x');
          setWidth(pw);
          setLength(pl);
        }}
      />
      <Pair>
        <View style={{ flex: 1 }}>
          <NumberField label="Width (mm)" value={width} onChangeText={setWidth} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Length (mm)" value={length} onChangeText={setLength} keyboardType="number-pad" />
        </View>
      </Pair>
      <Pair>
        <View style={{ flex: 1 }}>
          <NumberField label="Area needed (sqft)" value={area} onChangeText={setArea} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Wastage %" value={wastage} onChangeText={setWastage} />
        </View>
      </Pair>
      <Text style={{ fontSize: 12, color: c.gray700 }}>
        {result && result.pieces > 0
          ? `${result.pieces} ${piece}s (${result.perPiece.toFixed(2)} sqft each) → billed ${result.billedSqft} sqft`
          : `${size.width > 0 && size.length > 0 ? `${pieceSqft(size).toFixed(2)} sqft per ${piece}. ` : ''}Enter the area needed.`}
      </Text>
      <Button
        variant="primary"
        size="sm"
        block
        disabled={!result || result.pieces === 0}
        onPress={() => result && result.pieces > 0 && onApply({ quantity: result.billedSqft, unit: 'sqft', spec: sizeLabel(size), ordered_as: describePieceOrder(kind, result.pieces, size, a, w) })}
      >
        {`Use ${result && result.pieces > 0 ? `${result.billedSqft} sqft` : ''}`}
      </Button>
    </View>
  );
}
