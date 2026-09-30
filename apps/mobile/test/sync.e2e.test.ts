/**
 * Two simulated phones (separate SQLite databases) syncing through the real
 * server and Postgres. Needs TEST_DATABASE_URL (see apps/server/test).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../server/src/app.ts';
import { createPool, migrate } from '../../server/src/db.ts';
import { DRAFT_IDS, addItems, deleteItem, enqueueJob, loadSnapshot, saveDraftToHistory, updateItem } from '../src/data/repo.ts';
import { ApiClient } from '../src/lib/api.ts';
import { SyncEngine } from '../src/sync/engine.ts';
import { freshDb, memorySessionStore } from './helpers.ts';

const DB_URL = process.env.TEST_DATABASE_URL;
const extracted = [{ item_name: 'Cement', original_term: 'bori', quantity: 15, unit: 'Bag', unit_price: 500, total_amount: 7500, vendor: '', date: '2026-09-30' }];

describe.skipIf(!DB_URL)('offline sync between two devices', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let pool: ReturnType<typeof createPool>;
  let url: string;
  const extractorCalls: string[] = [];

  beforeAll(async () => {
    pool = createPool(DB_URL!);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
    app = await buildApp({
      config: { jwtSecret: 'test-secret-that-is-at-least-32-characters', corsOrigins: [] },
      pool,
      logger: false,
      rateLimit: false,
      extractor: { extract: async (req) => (extractorCalls.push(req.text), extracted) },
    });
    url = await app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  async function device() {
    const db = await freshDb();
    const api = new ApiClient(memorySessionStore());
    const engine = new SyncEngine(db, api, () => {});
    return { db, api, engine };
  }

  it('merges offline edits from two phones, including deletes and queued AI jobs', async () => {
    const phone = await device();
    const tablet = await device();
    await phone.api.authenticate('register', url, 'site@example.com', 'password123');
    await tablet.api.authenticate('login', url, 'site@example.com', 'password123');

    // Phone works offline: adds items and queues a photo for extraction.
    await addItems(phone.db, DRAFT_IDS.audit, [{ ...extracted[0], item_name: 'Sand', original_term: 'reti' }]);
    await enqueueJob(phone.db, { listId: DRAFT_IDS.audit, text: '15 bori cement', images: [], category: 'Civil', captureDate: '2026-09-30' });
    await saveDraftToHistory(phone.db, 'audit', { title: 'Day 1', address: 'Sector 44', category: 'Civil', site_date: '2026-09-30' });

    // Back online: the job runs, then everything is pushed.
    await phone.engine.run();
    let p = await loadSnapshot(phone.db);
    expect(p.jobs).toHaveLength(0);
    expect(p.unsynced).toBe(0);
    expect(extractorCalls).toEqual(['15 bori cement']);
    expect(p.items.filter((i) => i.list_id === DRAFT_IDS.audit).map((i) => i.item_name).sort()).toEqual(['Cement', 'Sand']);

    // The tablet pulls it all down.
    await tablet.engine.run();
    let t = await loadSnapshot(tablet.db);
    expect(t.lists.find((l) => l.title === 'Day 1')?.address).toBe('Sector 44');
    expect(t.items.filter((i) => i.list_id === DRAFT_IDS.audit)).toHaveLength(2);

    // Both edit offline: tablet changes Sand, phone deletes Cement later.
    const sandId = t.items.find((i) => i.item_name === 'Sand' && i.list_id === DRAFT_IDS.audit)!.id;
    const cementId = p.items.find((i) => i.item_name === 'Cement')!.id;
    await updateItem(tablet.db, sandId, { quantity: 3 });
    await deleteItem(phone.db, cementId);

    await tablet.engine.run();
    await phone.engine.run();
    await tablet.engine.run();

    p = await loadSnapshot(phone.db);
    t = await loadSnapshot(tablet.db);
    const draft = (s: typeof p) => s.items.filter((i) => i.list_id === DRAFT_IDS.audit).map((i) => [i.item_name, i.quantity]);
    expect(draft(p)).toEqual([['Sand', 3]]);
    expect(draft(t)).toEqual([['Sand', 3]]);
    expect(p.unsynced + t.unsynced).toBe(0);
  });

  it('keeps jobs queued while the server is unreachable', async () => {
    const phone = await device();
    await phone.api.authenticate('register', url, 'offline@example.com', 'password123');
    // Point the session at a dead port to simulate no connectivity.
    (phone.api.current as { server_url: string }).server_url = 'http://127.0.0.1:9';
    await enqueueJob(phone.db, { listId: DRAFT_IDS.boq, text: 'reti 2 truck', images: [], category: '', captureDate: '2026-09-30' });
    await phone.engine.run();
    const snap = await loadSnapshot(phone.db);
    expect(snap.jobs).toMatchObject([{ status: 'pending', attempts: 1 }]);
    expect(phone.engine.status.lastError).toBe('Server unreachable');
  });
});
