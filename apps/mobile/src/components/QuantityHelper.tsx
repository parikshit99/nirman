import { useState } from 'react';
import { Calculator, ChevronDown } from 'lucide-react';
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
 * Works out the billed quantity for material ordered in another unit: TMT
 * bundles and bars → kg, and sqft needed → whole tiles / sheets → billed sqft.
 * Opens by itself for TMT, tile and ACP items.
 */
export function QuantityHelper({ itemName, spec, onApply, fieldClassName }: { itemName: string; spec: string; onApply(r: HelperResult): void; fieldClassName: string }) {
  const detected = conversionKind(itemName);
  const [chosen, setChosen] = useState<ConversionKind | null>(null);
  const [open, setOpen] = useState(false);
  const kind = chosen ?? detected;

  if (!kind || !open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {detected ? (
          <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-bold text-orange-700 border border-orange-200 bg-orange-50 rounded-lg px-2 py-1">
            <Calculator size={12} /> {detected === 'tmt' ? 'Bundles → kg' : detected === 'tile' ? 'Sqft → tiles' : 'Sqft → sheets'}
          </button>
        ) : (
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 font-bold flex items-center gap-1 list-none">
              <Calculator size={12} /> Unit calculator <ChevronDown size={12} />
            </summary>
            <div className="flex gap-2 mt-1">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  onClick={() => {
                    setChosen(k.kind);
                    setOpen(true);
                  }}
                  className="px-2 py-1 rounded-lg border border-gray-200 font-bold text-gray-600"
                >
                  {k.label}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }
  const close = () => setOpen(false);
  return (
    <div className="p-3 rounded-xl border border-orange-200 bg-orange-50/60 space-y-2" role="group" aria-label="Unit calculator">
      <div className="flex justify-between items-center">
        <span className="text-xs text-orange-700 font-bold flex items-center gap-1">
          <Calculator size={12} /> {KINDS.find((k) => k.kind === kind)!.label}
        </span>
        <button onClick={close} className="text-xs font-bold text-gray-500">
          Close
        </button>
      </div>
      {kind === 'tmt' ? (
        <TmtForm spec={spec} field={fieldClassName} onApply={(r) => { onApply(r); close(); }} />
      ) : (
        <PieceForm kind={kind} spec={spec} field={fieldClassName} onApply={(r) => { onApply(r); close(); }} />
      )}
    </div>
  );
}

function TmtForm({ spec, field, onApply }: { spec: string; field: string; onApply(r: HelperResult): void }) {
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
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Diameter</span>
          <select aria-label="Bar diameter" value={diameter} onChange={(e) => setDiameter(Number(e.target.value))} className={field}>
            {diameters.map((d) => (
              <option key={d} value={d}>
                {d} mm
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Bar length (m)</span>
          <input aria-label="Bar length in metres" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} className={field} />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Bundles</span>
          <input aria-label="Bundles" inputMode="decimal" value={bundles} onChange={(e) => setBundles(e.target.value)} className={field} placeholder="0" />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Loose bars</span>
          <input aria-label="Loose bars" inputMode="numeric" value={loose} onChange={(e) => setLoose(e.target.value)} className={field} placeholder="0" />
        </label>
      </div>
      <p className="text-xs text-gray-700" role="status">
        {est ? (
          <>
            {est.bars} bars ({est.perBundle} per bundle) ≈ <b>{est.kg} kg</b> at standard weight
          </>
        ) : (
          'Check the numbers'
        )}
      </p>
      <label className="block">
        <span className="text-xs font-bold text-gray-500">Weighed kg from the slip (optional)</span>
        <input aria-label="Weighed kg" inputMode="decimal" value={weighed} onChange={(e) => setWeighed(e.target.value)} className={field} placeholder={est ? String(est.kg) : ''} />
      </label>
      {diff !== null && (
        <p className={`text-xs ${Math.abs(diff) > 3 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
          {diff >= 0 ? '+' : ''}
          {diff.toFixed(1)}% vs standard weight
        </p>
      )}
      <button onClick={apply} disabled={!est || (!est.kg && !w)} className="w-full py-2 rounded-lg bg-orange-500 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50">
        Use {w > 0 ? `${w} kg` : est ? `${est.kg} kg` : ''}
      </button>
    </div>
  );
}

function PieceForm({ kind, spec, field, onApply }: { kind: 'tile' | 'acp'; spec: string; field: string; onApply(r: HelperResult): void }) {
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

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs font-bold text-gray-500">Size</span>
        <select
          aria-label={`${piece} size`}
          value={presets.some((p) => `${p.width}x${p.length}` === presetKey) ? presetKey : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') return;
            const [pw, pl] = e.target.value.split('x');
            setWidth(pw);
            setLength(pl);
          }}
          className={field}
        >
          {presets.map((p) => (
            <option key={`${p.width}x${p.length}`} value={`${p.width}x${p.length}`}>
              {sizeLabel(p)}
            </option>
          ))}
          <option value="custom">Custom size…</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Width (mm)</span>
          <input aria-label="Width in mm" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} className={field} />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Length (mm)</span>
          <input aria-label="Length in mm" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} className={field} />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Area needed (sqft)</span>
          <input aria-label="Area needed in sqft" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={field} />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Wastage %</span>
          <input aria-label="Wastage percent" inputMode="decimal" value={wastage} onChange={(e) => setWastage(e.target.value)} className={field} />
        </label>
      </div>
      <p className="text-xs text-gray-700" role="status">
        {result && result.pieces > 0 ? (
          <>
            <b>
              {result.pieces} {piece}s
            </b>{' '}
            ({result.perPiece.toFixed(2)} sqft each) → billed <b>{result.billedSqft} sqft</b>
          </>
        ) : (
          `${size.width > 0 && size.length > 0 ? `${pieceSqft(size).toFixed(2)} sqft per ${piece}. ` : ''}Enter the area needed.`
        )}
      </p>
      <button
        onClick={() =>
          result &&
          result.pieces > 0 &&
          onApply({ quantity: result.billedSqft, unit: 'sqft', spec: sizeLabel(size), ordered_as: describePieceOrder(kind, result.pieces, size, a, w) })
        }
        disabled={!result || result.pieces === 0}
        className="w-full py-2 rounded-lg bg-orange-500 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
      >
        Use {result && result.pieces > 0 ? `${result.billedSqft} sqft` : ''}
      </button>
    </div>
  );
}
