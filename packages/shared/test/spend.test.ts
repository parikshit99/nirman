import { describe, expect, it } from 'vitest';
import { istDay, todaySpend } from '../src/spend.ts';

// 15 Oct 2026, 2:00 pm IST.
const now = new Date('2026-10-15T08:30:00Z');

const lists = [
  { id: 'open', kind: 'audit' as const, project_id: 'p1' },
  { id: 'saved', kind: 'audit' as const, project_id: 'p1' },
  { id: 'boq', kind: 'boq' as const, project_id: 'p1' },
  { id: 'other', kind: 'audit' as const, project_id: 'p2' },
];

let n = 0;
const line = (list_id: string, total_amount: number, vendor = 'Sharma Traders', date = '2026-10-15', created_at = '2026-10-15T05:00:00Z') => ({
  id: `i${++n}`,
  list_id,
  vendor,
  date,
  total_amount,
  created_at,
});

describe('todaySpend', () => {
  it('adds up the project’s purchase lines dated today, open and saved, and leaves out BOQs, other projects and other days', () => {
    const items = [line('open', 1500), line('saved', 2500.5), line('boq', 99999), line('other', 7000), line('open', 400, 'Sharma Traders', '2026-10-14')];
    expect(todaySpend(lists, items, 'p1', { now })).toEqual({ day: '2026-10-15', spent: 4000.5, bills: 2 });
  });

  it('counts one bill per list, vendor and date', () => {
    const items = [line('open', 100), line('open', 200, ' sharma traders '), line('open', 300, 'Gupta Hardware'), line('saved', 400), line('open', 500, 'Gupta Hardware', '2026-10-14')];
    expect(todaySpend(lists, items, 'p1', { now })).toMatchObject({ spent: 1000, bills: 3 });
  });

  it('uses the day a line was added when it has no bill date, and the bill date over the day added', () => {
    const items = [line('open', 100, 'A', ''), line('open', 200, 'B', '', '2026-10-14T05:00:00Z'), line('open', 300, 'C', '2026-10-14', '2026-10-15T05:00:00Z')];
    expect(todaySpend(lists, items, 'p1', { now })).toEqual({ day: '2026-10-15', spent: 100, bills: 1 });
  });

  it('leaves out lines and lists waiting for Undo', () => {
    const items = [line('open', 100), line('open', 200, 'B'), line('saved', 300)];
    expect(todaySpend(lists, items, 'p1', { now, pending: new Set([items[1].id, 'saved']) })).toEqual({ day: '2026-10-15', spent: 100, bills: 1 });
  });

  it('goes by the day in India: 11:50 pm IST is still that day, 12:10 am IST is the next', () => {
    // 11:50 pm IST on 15 Oct is 6:20 pm UTC; 12:10 am IST on 16 Oct is still 15 Oct in UTC.
    const late = line('open', 800, 'A', '', '2026-10-15T18:20:00Z');
    const afterMidnight = line('open', 900, 'B', '', '2026-10-15T18:40:00Z');
    expect(todaySpend(lists, [late, afterMidnight], 'p1', { now: new Date('2026-10-15T18:25:00Z') })).toEqual({ day: '2026-10-15', spent: 800, bills: 1 });
    expect(todaySpend(lists, [late, afterMidnight], 'p1', { now: new Date('2026-10-15T18:45:00Z') })).toEqual({ day: '2026-10-16', spent: 900, bills: 1 });
  });

  it('is nothing on a day with no bills', () => {
    expect(todaySpend(lists, [], 'p1', { now })).toEqual({ day: '2026-10-15', spent: 0, bills: 0 });
  });
});

describe('istDay', () => {
  it('gives the date in India of a moment or timestamp', () => {
    expect(istDay(new Date('2026-10-15T18:29:59Z'))).toBe('2026-10-15');
    expect(istDay('2026-10-15T18:30:00Z')).toBe('2026-10-16');
    expect(istDay('2026-10-16T00:10:00+05:30')).toBe('2026-10-16');
    expect(istDay('not a date')).toBe('');
  });
});
