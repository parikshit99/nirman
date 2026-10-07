import { describe, expect, it } from 'vitest';
import { buildItemDatabase, type ItemRow, type ListRow } from '../src/index.ts';

/** A few years of one builder's purchases: 1,000 bills of 20 lines over 8 sites and 400 materials. */
function history() {
  const lists: ListRow[] = [];
  const items: ItemRow[] = [];
  for (let l = 0; l < 1000; l++) {
    const day = new Date(Date.UTC(2023, 0, 1 + l)).toISOString();
    lists.push({ id: `l${l}`, kind: 'audit', status: 'saved', title: `Bill ${l}`, address: `Site ${l % 8}`, category: 'Civil', site_date: day.slice(0, 10), notes: '', project_id: `p${l % 8}`, created_at: day, updated_at: day } as ListRow);
    for (let k = 0; k < 20; k++) {
      items.push({
        id: `i${l}-${k}`, list_id: `l${l}`, item_name: `Material ${(l * 7 + k * 13) % 400}`, original_term: '', quantity: 5, unit: 'Bag', unit_price: 300 + ((l + k) % 90),
        total_amount: 1500, vendor: `Vendor ${k % 12}`, date: day.slice(0, 10), brand: k % 3 ? 'UltraTech' : '', model: '', spec: '', color: '', delivered_at: '', ordered_as: '',
        photo_id: '', rates_excluded: 0, created_at: day, updated_at: day,
      } as ItemRow);
    }
  }
  return { lists, items };
}

describe('Rates at scale', () => {
  it('builds 20,000 lines quickly enough to redo after every change', () => {
    const { lists, items } = history();
    buildItemDatabase(lists, items, [], {}); // warm up
    const runs = Array.from({ length: 3 }, () => {
      const t = performance.now();
      buildItemDatabase(lists, items, [], {});
      return performance.now() - t;
    });
    const best = Math.min(...runs);
    console.log(`Rates for 20,000 lines: ${best.toFixed(0)} ms`);
    // About 140 ms on CI-class machines, a few times that on a phone. The budget is loose so slow CI runners
    // don't fail it, but work that grows faster than the number of lines (e.g. one pass per variant) does.
    expect(best).toBeLessThan(600);
  });
});
