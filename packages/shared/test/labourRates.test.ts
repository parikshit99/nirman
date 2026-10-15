import { describe, expect, it } from 'vitest';
import { contractTrade, describeLabourRate, describeLabourRateRow, formatDay, guessTrade, labourRates, type ContractRow } from '../src/index.ts';

const ts = '2026-10-01T00:00:00.000Z';
const base: ContractRow = {
  id: 'c1', project_id: 'p1', contractor: 'Ramesh', phone: '', address: 'Sector 44', category: 'Civil', work: 'Internal plaster, 2nd floor', kind: 'rate', rate: 18, unit: 'sqft',
  est_quantity: 0, amount: 0, retention_pct: 0, start_date: '2026-09-03', status: 'active', retention_released_at: '', notes: '', created_at: ts, updated_at: ts,
};
const contract = (id: string, extra: Partial<ContractRow>): ContractRow => ({ ...base, id, ...extra });
const projects = [
  { id: 'p1', name: 'Sharma house' },
  { id: 'p2', name: 'Gupta villa' },
];

describe('guessTrade', () => {
  it('finds the trade from whole words, English and Hinglish', () => {
    expect(guessTrade('Internal plaster, 2nd floor')).toBe('Plaster');
    expect(guessTrade('Tiles fixing')).toBe('Tiling');
    expect(guessTrade('Brick work, ground floor')).toBe('Masonry');
    expect(guessTrade('Brickwork')).toBe('Masonry');
    expect(guessTrade('Chinai')).toBe('Masonry');
    expect(guessTrade('Kota stone')).toBe('Flooring');
    expect(guessTrade('Putty and primer')).toBe('Painting');
    expect(guessTrade('Centering for slab')).toBe('Shuttering');
    expect(guessTrade('Sariya bandhai')).toBe('Bar bending');
    expect(guessTrade('Bar-bending, columns')).toBe('Bar bending');
    expect(guessTrade('Roof dhalai')).toBe('Concrete');
    expect(guessTrade('RCC / slab casting')).toBe('Concrete');
    expect(guessTrade('Terrace waterproofing')).toBe('Waterproofing');
    expect(guessTrade('POP / false ceiling')).toBe('POP and false ceiling');
    expect(guessTrade('Electrical wiring')).toBe('Electrical');
    expect(guessTrade('Plumber')).toBe('Plumbing');
    expect(guessTrade('Woodwork, doors')).toBe('Carpentry');
    expect(guessTrade('Staircase railing')).toBe('Fabrication');
    expect(guessTrade('Foundation khudai')).toBe('Excavation');
  });

  it('matches whole words only, and nothing when no trade is named', () => {
    expect(guessTrade('Plastic sheet laying')).toBeNull();
    expect(guessTrade('Mistri kaam')).toBeNull();
    expect(guessTrade('Popcorn ceiling')).toBeNull();
    expect(guessTrade('')).toBeNull();
  });

  it('takes the trade named first when the work names several', () => {
    expect(guessTrade('Brick work and plaster')).toBe('Masonry');
    expect(guessTrade('Plaster and brick work')).toBe('Plaster');
  });

  it("falls back to the contract's work type", () => {
    expect(contractTrade({ work: 'Internal plaster, 2nd floor', category: 'Civil' })).toBe('Plaster');
    expect(contractTrade({ work: 'Mistri kaam', category: 'Civil' })).toBe('Civil, other work');
    expect(contractTrade({ work: '', category: '' })).toBe('Uncategorised, other work');
  });
});

describe('labourRates', () => {
  it('puts every rate contract of every project, closed ones too, on one card per trade and unit', () => {
    const cards = labourRates(
      [
        contract('a', { rate: 18, start_date: '2026-06-01' }),
        contract('b', { rate: 24, project_id: 'p2', contractor: 'Sunil', start_date: '2026-07-01', status: 'closed' }),
        contract('c', { rate: 22, unit: 'sft', work: 'External plastering', start_date: '2026-09-03' }),
        contract('d', { rate: 20, start_date: '2026-08-01' }),
      ],
      projects,
    );
    expect(cards).toHaveLength(1);
    const [plaster] = cards;
    expect(plaster).toMatchObject({ trade: 'Plaster', unit: 'sqft', min: 18, max: 24, count: 4 });
    // Newest first, by start date.
    expect(plaster.rows.map((r) => r.contract.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(plaster.rows.find((r) => r.contract.id === 'b')).toMatchObject({ project: 'Gupta villa', closed: true });
    expect(plaster.last).toMatchObject({ rate: 22, project: 'Sharma house', date: '2026-09-03' });
  });

  it('converts units of one kind (sqm to sqft) onto one card; other units get their own', () => {
    const cards = labourRates(
      [
        contract('a', { rate: 18 }),
        contract('b', { rate: 22 }),
        contract('c', { rate: 200, unit: 'sqm' }),
        contract('d', { rate: 900, unit: 'day' }),
      ],
      projects,
    );
    expect(cards.map((c) => `${c.trade} per ${c.unit}`)).toEqual(['Plaster per day', 'Plaster per sqft']);
    const sqft = cards[1];
    expect(sqft.count).toBe(3);
    // ₹200 per sqm is ₹18.58 per sqft (1 sqm = 10.7639 sqft).
    expect(sqft.rows.find((r) => r.contract.id === 'c')!.rate).toBe(18.58);
    expect(sqft).toMatchObject({ min: 18, max: 22 });
  });

  it('leaves out lump sums and contracts without a rate', () => {
    const cards = labourRates(
      [contract('a', { kind: 'lump_sum', rate: 0, unit: '', amount: 250000 }), contract('b', { rate: 0 }), contract('c', { work: 'Tile fixing', rate: 30 })],
      projects,
    );
    expect(cards.map((c) => c.trade)).toEqual(['Tiling']);
  });

  it('files work it cannot name under its work type, after the named trades', () => {
    const cards = labourRates([contract('a', { work: 'Mistri kaam', rate: 800, unit: 'day' }), contract('b', { work: 'Wall painting', category: 'Finishing', rate: 12 })], projects);
    expect(cards.map((c) => c.trade)).toEqual(['Painting', 'Civil, other work']);
  });

  it('orders by the day (IST) the contract was added when it has no start date', () => {
    const cards = labourRates(
      [contract('a', { start_date: '', created_at: '2026-08-10T05:00:00.000Z' }), contract('b', { start_date: '2026-08-01' }), contract('c', { start_date: '', created_at: '2026-07-01T20:00:00.000Z' })],
      projects,
    );
    // 8 pm UTC on 1 Jul is 1:30 am on 2 Jul in India.
    expect(cards[0].rows.map((r) => [r.contract.id, r.date])).toEqual([
      ['a', '2026-08-10'],
      ['b', '2026-08-01'],
      ['c', '2026-07-02'],
    ]);
  });

  it('describes a card and a contract in words', () => {
    const cards = labourRates(
      [
        contract('a', { rate: 18, start_date: '2026-06-01' }),
        contract('b', { rate: 24, start_date: '2026-07-01' }),
        contract('c', { rate: 20, start_date: '2026-08-01' }),
        contract('d', { rate: 22, start_date: '2026-09-03' }),
      ],
      projects,
    );
    expect(describeLabourRate(cards[0], '2026-10-15')).toEqual({ range: '₹18 to ₹24 per sqft · 4 contracts', last: 'Last ₹22 · Ramesh, Sharma house, 3 Sep' });
    // An older year is shown.
    expect(describeLabourRate(cards[0], '2027-01-02').last).toBe('Last ₹22 · Ramesh, Sharma house, 3 Sep 2026');
    const one = labourRates([contract('a', { rate: 22 })], projects)[0];
    expect(describeLabourRate(one, '2026-10-15').range).toBe('₹22 per sqft · 1 contract');
    expect(describeLabourRateRow(cards[0].rows[0], 'sqft')).toBe('₹22 per sqft · Ramesh · Sharma house · 3 Sep 2026');
    // A converted rate also shows the contract's own terms.
    const mixed = labourRates([contract('a', { rate: 18 }), contract('b', { rate: 18 }), contract('c', { rate: 200, unit: 'sqm', contractor: 'Sunil', project_id: 'p2' })], projects)[0];
    expect(describeLabourRateRow(mixed.rows.find((r) => r.contract.id === 'c')!, mixed.unit)).toBe('₹18.58 per sqft (₹200 per sqm) · Sunil · Gupta villa · 3 Sep 2026');
  });

  it('formats a day as "3 Sep" or "3 Sep 2026"', () => {
    expect(formatDay('2026-09-03')).toBe('3 Sep 2026');
    expect(formatDay('2026-09-03', { year: false })).toBe('3 Sep');
    expect(formatDay('')).toBe('');
  });
});
