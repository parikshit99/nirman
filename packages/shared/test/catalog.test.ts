import { describe, expect, it } from 'vitest';
import { cleanUnit, findBrand, nameSimilarity, namesForReading, standardizeLine, unitFactor, unmatchLine, type MatchableLine } from '../src/index.ts';

const line = (item_name: string, unit: string, quantity = 1, unit_price = 0, over: Partial<MatchableLine> = {}): MatchableLine => ({
  item_name,
  original_term: '',
  unit,
  quantity,
  unit_price,
  brand: '',
  spec: '',
  ordered_as: '',
  ...over,
});

describe('units', () => {
  it('reads the ways units are written', () => {
    expect(['Bags', 'KGS', 'cu.m', 'Sq Ft', 'qtl', 'Tonne'].map(cleanUnit)).toEqual(['Bag', 'kg', 'cum', 'sqft', 'Quintal', 'MT']);
    expect(cleanUnit('trip')).toBe('trip');
  });

  it('converts within a kind only', () => {
    expect(unitFactor('MT', 'kg')).toBe(1000);
    expect(unitFactor('Quintal', 'kg')).toBe(100);
    expect(unitFactor('brass', 'cft')).toBe(100);
    expect(unitFactor('cum', 'cft')).toBeCloseTo(35.3147);
    expect(unitFactor('pcs', 'nos')).toBe(1);
    expect(unitFactor('Bag', 'kg')).toBeNull();
  });
});

describe('nameSimilarity', () => {
  it('treats the same letters spaced differently as the same name (#89)', () => {
    expect(nameSimilarity('Mount air', 'Mountair')).toBe(1);
    expect(nameSimilarity('Mount aire', 'Mountair')).toBeGreaterThanOrEqual(0.8);
    expect(nameSimilarity('Wash Basin', 'Wash Basin Diverter')).toBeLessThan(0.8);
  });
});

describe('standardizeLine', () => {
  const known = [
    { name: 'Mountair', unit: 'piece', uses: 4 },
    { name: 'Cement', unit: 'Bag', uses: 10 },
  ];

  it('gives a misspaced name the name already in Rates, and can be undone', () => {
    const read = line('Mount air', 'pcs', 3, 250);
    const { line: out, readAs } = standardizeLine(read, known);
    expect(out).toMatchObject({ item_name: 'Mountair', unit: 'piece', quantity: 3, unit_price: 250, original_term: 'Mount air' });
    expect(readAs).toMatchObject({ item_name: 'Mount air', unit: 'pcs' });
    expect(unmatchLine(out, readAs!)).toMatchObject({ item_name: 'Mount air', unit: 'pcs', quantity: 3, unit_price: 250 });
  });

  it('reads brand and grade out of cement names written differently', () => {
    const a = standardizeLine(line('Ultratech PPC 50kg', 'bags', 10, 380), known).line;
    const b = standardizeLine(line('Cement - UT', 'Bag', 5, 385), known).line;
    expect(a).toMatchObject({ item_name: 'Cement', unit: 'Bag', brand: 'UltraTech', spec: 'PPC' });
    expect(b).toMatchObject({ item_name: 'Cement', unit: 'Bag', brand: 'UltraTech' });
  });

  it('does not give a catalog name to another product that shares a word', () => {
    for (const name of ['Sand paper', 'Conduit bend 25mm', 'Cement paint', 'Pop up waste', 'CPVC elbow', 'Putty knife', 'Brick tiles']) {
      expect(standardizeLine(line(name, 'nos', 1, 10), []).line.item_name).toBe(name);
    }
    expect(standardizeLine(line('Red bricks', 'nos', 1000, 8), []).line.item_name).toBe('Bricks');
    expect(standardizeLine(line('River sand', 'cft', 100, 50), []).line.item_name).toBe('Sand');
  });

  it('does not take a brand for the material when something else is named', () => {
    const { line: out } = standardizeLine(line('ACC block 600x200', 'nos', 100, 60), []);
    expect(out.item_name).toBe('ACC block 600x200');
  });

  it('converts to the catalog unit, keeping the total and how it was billed', () => {
    const { line: out, readAs } = standardizeLine(line('Saria 12mm Fe500D', 'MT', 2, 56000), []);
    expect(out).toMatchObject({ item_name: 'TMT bar', unit: 'kg', quantity: 2000, unit_price: 56, spec: '12 mm Fe500D', ordered_as: '2 MT' });
    expect(readAs?.unit).toBe('MT');
    const sand = standardizeLine(line('Reti', 'brass', 1, 5200), []).line;
    expect(sand).toMatchObject({ item_name: 'Sand', unit: 'cft', quantity: 100, unit_price: 52 });
  });

  it('prefers the unit in Rates to the catalog unit', () => {
    const { line: out } = standardizeLine(line('Sand', 'Brass', 1, 5200), [{ name: 'Sand', unit: 'brass' }]);
    expect(out).toMatchObject({ item_name: 'Sand', unit: 'brass', quantity: 1, unit_price: 5200 });
  });

  it('never matches across units that do not convert', () => {
    const { line: out, readAs } = standardizeLine(line('Mount air', 'kg', 1, 10), [{ name: 'Mountair', unit: 'piece' }]);
    expect(out.item_name).toBe('Mount air');
    expect(readAs).toBeUndefined();
  });

  it('leaves unknown materials alone apart from the unit spelling', () => {
    const { line: out, readAs } = standardizeLine(line('Door closer', 'Nos.', 2, 900), known);
    expect(out).toMatchObject({ item_name: 'Door closer', unit: 'nos' });
    expect(readAs).toBeUndefined();
  });

  it('leaves words the owner already merged to their learned name', () => {
    const read = line('Mount air', 'pcs', 1, 250, { original_term: 'mount air' });
    const { line: out, readAs } = standardizeLine(read, known, { 'mount air': { item_name: 'Mount Air Pro', unit: 'piece' } });
    expect(out).toBe(read);
    expect(readAs).toBeUndefined();
  });
});

describe('findBrand', () => {
  it('finds short forms as whole words only', () => {
    expect(findBrand('Cement - UT')?.brand).toBe('UltraTech');
    expect(findBrand('Utility box')).toBeNull();
  });
});

describe('namesForReading', () => {
  it('lists Rates names by use, then the catalog, once each', () => {
    const names = namesForReading([{ name: 'Sand', unit: 'brass', uses: 1 }, { name: 'Mountair', unit: 'piece', uses: 9 }]);
    expect(names.slice(0, 2)).toEqual([{ name: 'Mountair', unit: 'piece' }, { name: 'Sand', unit: 'brass' }]);
    expect(names.filter((n) => n.name === 'Sand')).toHaveLength(1);
  });
});
