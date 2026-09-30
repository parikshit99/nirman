import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from '../src/db.ts';
import { FakeExtractor, bearer, makeApp, register, resetDatabase } from './helpers.ts';

let pool: Pool;
const extractor = new FakeExtractor();
let app: Awaited<ReturnType<typeof makeApp>>;
let token: string;

beforeAll(async () => {
  pool = await resetDatabase();
  app = await makeApp(pool, extractor);
  token = (await register(app)).access_token;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const cement = { item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500, vendor: '', date: '2026-09-30' };

function extract(payload: object, auth = token) {
  return app.inject({ method: 'POST', url: '/extractions', headers: bearer(auth), payload });
}

describe('extractions', () => {
  it('passes the request to the model and caches the result by job id', async () => {
    extractor.result = [cement];
    const job_id = randomUUID();
    const payload = { job_id, text: '15 bori cement bought for 7500', capture_date: '2026-09-30', category: 'Civil', learning: { bori: { item_name: 'OPC Cement', unit: 'Bag' } } };

    const first = await extract(payload);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ items: [cement] });
    expect(extractor.calls).toHaveLength(1);
    expect(extractor.calls[0].learning.bori.item_name).toBe('OPC Cement');

    extractor.result = [];
    const retry = await extract(payload);
    expect(retry.json()).toEqual({ items: [cement] });
    expect(extractor.calls).toHaveLength(1);
  });

  it('requires text or images and a valid job id', async () => {
    expect((await extract({ job_id: randomUUID(), text: '  ', capture_date: '2026-09-30' })).statusCode).toBe(400);
    expect((await extract({ job_id: 'x', text: 'hi', capture_date: '2026-09-30' })).statusCode).toBe(400);
    expect((await extract({ job_id: randomUUID(), images: ['a', 'b', 'c', 'd', 'e', 'f'], capture_date: '2026-09-30' })).statusCode).toBe(400);
  });

  it('reports model failures as 502 without caching them', async () => {
    extractor.error = new Error('boom');
    const job_id = randomUUID();
    const res = await extract({ job_id, text: 'sand', capture_date: '2026-09-30' });
    expect(res.statusCode).toBe(502);
    extractor.error = undefined;
    extractor.result = [cement];
    expect((await extract({ job_id, text: 'sand', capture_date: '2026-09-30' })).json().items).toHaveLength(1);
  });

  it('does not share cached jobs between users', async () => {
    const other = (await register(app)).access_token;
    const job_id = randomUUID();
    extractor.result = [cement];
    await extract({ job_id, text: 'a', capture_date: '2026-09-30' });
    extractor.result = [];
    const res = await extract({ job_id, text: 'a', capture_date: '2026-09-30' }, other);
    expect(res.json().items).toEqual([]);
  });

  it('returns 503 when no model is configured', async () => {
    const bare = await makeApp(pool);
    const t = (await register(bare)).access_token;
    const res = await bare.inject({ method: 'POST', url: '/extractions', headers: bearer(t), payload: { job_id: randomUUID(), text: 'x', capture_date: '2026-09-30' } });
    expect(res.statusCode).toBe(503);
    await bare.close();
  });
});
