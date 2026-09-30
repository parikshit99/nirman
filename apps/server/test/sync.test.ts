import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItemRow, ListRow, SyncPullResponse } from '@nirman/shared';
import type { Pool } from '../src/db.ts';
import { bearer, makeApp, register, resetDatabase } from './helpers.ts';

let pool: Pool;
let app: Awaited<ReturnType<typeof makeApp>>;

beforeAll(async () => {
  pool = await resetDatabase();
  app = await makeApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 10, minute)).toISOString();

function list(id: string, over: Partial<ListRow> = {}): ListRow {
  return {
    id, kind: 'audit', status: 'draft', title: 'Draft', address: '', category: 'Civil', site_date: null, notes: '',
    created_at: at(0), updated_at: at(0), deleted_at: null, ...over,
  };
}
function item(id: string, over: Partial<ItemRow> = {}): ItemRow {
  return {
    id, list_id: 'L1', item_name: 'Cement', original_term: 'bori', quantity: 10, unit: 'Bag', unit_price: 400,
    total_amount: 4000, vendor: '', date: '2026-01-01', created_at: at(0), updated_at: at(0), deleted_at: null, ...over,
  };
}

async function push(token: string, changes: object) {
  return app.inject({ method: 'POST', url: '/sync/push', headers: bearer(token), payload: { changes } });
}
async function pull(token: string, since = '0', limit?: number): Promise<SyncPullResponse> {
  const qs = new URLSearchParams({ since, ...(limit ? { limit: String(limit) } : {}) });
  const res = await app.inject({ method: 'GET', url: `/sync/pull?${qs}`, headers: bearer(token) });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('sync', () => {
  it('round-trips rows and pages through changes with a cursor', async () => {
    const { access_token: token } = await register(app);
    const res = await push(token, { lists: [list('L1')], items: [item('I1'), item('I2'), item('I3')] });
    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(4);

    const all = await pull(token);
    expect(all.changes.lists).toEqual([list('L1')]);
    expect(all.changes.items).toHaveLength(3);
    expect(all.has_more).toBe(false);

    const page1 = await pull(token, '0', 2);
    expect(page1.has_more).toBe(true);
    const page2 = await pull(token, page1.cursor, 2);
    expect(page2.has_more).toBe(false);
    const ids = [...Object.values(page1.changes), ...Object.values(page2.changes)].flat().map((r) => r!.id);
    expect(ids.sort()).toEqual(['I1', 'I2', 'I3', 'L1']);

    const nothing = await pull(token, all.cursor);
    expect(nothing.changes).toEqual({});
    expect(nothing.cursor).toBe(all.cursor);
  });

  it('keeps the newest write and lets deletions win ties', async () => {
    const { access_token: token } = await register(app);
    await push(token, { items: [item('X', { quantity: 1, updated_at: at(5) })] });
    const { cursor } = await pull(token);

    // Older edit from another device loses.
    const stale = await push(token, { items: [item('X', { quantity: 2, updated_at: at(3) })] });
    expect(stale.json().applied).toBe(0);
    expect((await pull(token, cursor)).changes).toEqual({});

    // Newer edit wins and shows up for the other device.
    await push(token, { items: [item('X', { quantity: 3, updated_at: at(7) })] });
    const newer = await pull(token, cursor);
    expect(newer.changes.items?.[0].quantity).toBe(3);

    // A delete with the same timestamp as the current edit wins.
    await push(token, { items: [item('X', { quantity: 3, updated_at: at(7), deleted_at: at(7) })] });
    const deleted = await pull(token, newer.cursor);
    expect(deleted.changes.items?.[0].deleted_at).toBe(at(7));

    // Duplicate ids inside one batch collapse to the newest.
    const dup = await push(token, { items: [item('Y', { quantity: 1, updated_at: at(9) }), item('Y', { quantity: 9, updated_at: at(8) })] });
    expect(dup.statusCode).toBe(200);
    const y = (await pull(token, deleted.cursor)).changes.items?.find((r) => r.id === 'Y');
    expect(y?.quantity).toBe(1);
  });

  it('isolates users from each other', async () => {
    const a = await register(app);
    const b = await register(app);
    await push(a.access_token, { lists: [list('SAME', { title: 'A' })] });
    await push(b.access_token, { lists: [list('SAME', { title: 'B' })] });
    expect((await pull(a.access_token)).changes.lists?.[0].title).toBe('A');
    expect((await pull(b.access_token)).changes.lists?.[0].title).toBe('B');
  });

  it('rejects malformed rows', async () => {
    const { access_token: token } = await register(app);
    const res = await push(token, { lists: [{ ...list('L'), kind: 'invoice' }] });
    expect(res.statusCode).toBe(400);
  });
});
