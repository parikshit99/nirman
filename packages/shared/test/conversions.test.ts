import { describe, expect, it } from 'vitest';
import { DEFAULT_CONVERSIONS, conversionKind, parseDiameter, parseSize, pieceSqft, piecesForArea, tmtEstimate, toBilledUnits } from '../src/index.ts';

const line = (over: object) => ({ item_name: 'TMT bar', quantity: 0, unit: 'kg', unit_price: 0, total_amount: 0, spec: '', ordered_as: '', ...over });

describe('TMT bars (#43)', () => {
  it('estimates the weight of bundles and loose bars from the bars per bundle', () => {
    const est = (diameter: number, bundles: number, looseBars = 0, barLength = 12) => tmtEstimate({ diameter, bundles, looseBars, barLength, bundleBars: DEFAULT_CONVERSIONS.bundleBars });
    expect(est(12, 1)).toEqual({ bars: 8, perBundle: 8, kg: 85.3 });
    expect(est(8, 1).kg).toBe(85.3);
    expect(est(25, 1).kg).toBe(92.6);
    expect(est(12, 3, 4).bars).toBe(28);
    expect(est(12, 0, 1, 6).kg).toBe(5.3);
  });

  it('reads diameters and recognises TMT names', () => {
    expect([parseDiameter('12mm'), parseDiameter('Ø 16'), parseDiameter('20 mm Fe500'), parseDiameter('10'), parseDiameter('Fe500')]).toEqual([12, 16, 20, 10, null]);
    expect(['TMT Bar', 'Sariya', 'Steel bars', 'Wash basin'].map(conversionKind)).toEqual(['tmt', 'tmt', 'tmt', null]);
  });

  it('turns bundles read from a slip into kg, keeping the order as written', () => {
    const out = toBilledUnits(line({ quantity: 3, unit: 'bundle', spec: '12mm', total_amount: 16000 }));
    expect(out).toMatchObject({ quantity: 256, unit: 'kg', spec: '12mm', ordered_as: '3 bundles of 12 mm (weight estimated)', total_amount: 16000 });
    expect(out.unit_price).toBeCloseTo(62.5, 2);
    expect(toBilledUnits(line({ item_name: 'TMT 16mm', quantity: 4, unit: 'bars' }))).toMatchObject({ quantity: 75.9, ordered_as: '4 bars of 16 mm (weight estimated)' });
    // Already in kg, or no diameter: unchanged.
    const kg = line({ quantity: 250, unit: 'kg', spec: '12mm' });
    expect(toBilledUnits(kg)).toBe(kg);
    const noSize = line({ quantity: 3, unit: 'bundle' });
    expect(toBilledUnits(noSize)).toBe(noSize);
  });
});

describe('tiles and ACP sheets (#44, #45)', () => {
  it('works out sqft per piece and rounds pieces up', () => {
    expect(pieceSqft({ width: 600, length: 1200 })).toBeCloseTo(7.75, 2);
    expect(pieceSqft({ width: 1200, length: 2400 })).toBeCloseTo(31.0, 1);
    expect(piecesForArea(480, { width: 600, length: 1200 })).toEqual({ pieces: 62, billedSqft: 480.5, perPiece: expect.any(Number) });
    expect(piecesForArea(7.75, { width: 600, length: 1200 }).pieces).toBe(1);
    expect(piecesForArea(480, { width: 600, length: 1200 }, 5).pieces).toBe(66);
    expect(piecesForArea(0, { width: 600, length: 1200 }).pieces).toBe(0);
  });

  it('reads sizes and turns pieces into sqft', () => {
    expect(parseSize('600 X 1200 mm')).toEqual({ width: 600, length: 1200 });
    expect(parseSize('2400x1200')).toEqual({ width: 1200, length: 2400 });
    expect(conversionKind('Vitrified tiles')).toBe('tile');
    expect(conversionKind('ACP sheet')).toBe('acp');
    expect(toBilledUnits(line({ item_name: 'Floor tiles', quantity: 62, unit: 'pcs', spec: '600x1200', unit_price: 0 }))).toMatchObject({ quantity: 480.5, unit: 'sqft', ordered_as: '62 tiles of 600×1200 mm' });
    expect(toBilledUnits(line({ item_name: 'ACP sheet', quantity: 10, unit: 'sheets', spec: '1200x3000' }))).toMatchObject({ quantity: 387.5, unit: 'sqft', ordered_as: '10 sheets of 1200×3000 mm' });
    expect(toBilledUnits(line({ item_name: 'Floor tiles', quantity: 480, unit: 'Sq.ft', spec: '600x1200' })).unit).toBe('sqft');
  });
});

describe('reading slips with the AI', () => {
  it('converts bundles to kg using the bars per bundle from Settings', async () => {
    const { parseExtractionOutput } = await import('../src/index.ts');
    const out = parseExtractionOutput(
      '[{"item_name":"TMT bar","original_term":"saria","quantity":2,"unit":"bundle","spec":"10mm","total_amount":9000},{"item_name":"Tiles","quantity":480,"unit":"sqft","spec":"600x1200","unit_price":55}]',
      { ...DEFAULT_CONVERSIONS, bundleBars: { ...DEFAULT_CONVERSIONS.bundleBars, '10': 10 } },
    );
    expect(out.map((m) => [m.item_name, m.quantity, m.unit, m.ordered_as])).toEqual([
      ['TMT bar', 148.1, 'kg', '2 bundles of 10 mm (weight estimated)'],
      ['Tiles', 480, 'sqft', ''],
    ]);
  });
});
