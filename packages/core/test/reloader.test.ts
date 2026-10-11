import { describe, expect, it } from 'vitest';
import { createReloader } from '../src/data/reloader.ts';
import { openSqlJs } from './helpers.ts';

/** A load that finishes only when the test says so, with the value it was started for. */
function controlledLoads() {
  const loads: { value: number; finish: () => void }[] = [];
  let version = 0;
  const load = () =>
    new Promise<number>((resolve) => {
      const value = version;
      loads.push({ value, finish: () => resolve(value) });
    });
  return { loads, load, bump: () => version++ };
}

/** Let pending promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('db.onWrite', () => {
  it('fires after each committed write, not after reads or a rolled-back transaction', async () => {
    const db = await openSqlJs();
    let n = 0;
    const off = db.onWrite(() => n++);
    await db.exec('CREATE TABLE t (x INTEGER)');
    expect(n).toBe(1);
    await db.run('INSERT INTO t (x) VALUES (1)');
    expect(n).toBe(2);
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (x) VALUES (2)');
      await tx.run('INSERT INTO t (x) VALUES (3)');
    });
    expect(n).toBe(3);
    await db.transaction((tx) => tx.all('SELECT * FROM t'));
    await db.all('SELECT * FROM t');
    expect(n).toBe(3);
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t (x) VALUES (4)');
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(n).toBe(3);
    off();
    await db.run('INSERT INTO t (x) VALUES (5)');
    expect(n).toBe(3);
  });

  it('keeps a committed write when a listener throws', async () => {
    const db = await openSqlJs();
    db.onWrite(() => {
      throw new Error('listener');
    });
    await db.exec('CREATE TABLE t (x INTEGER)');
    await db.run('INSERT INTO t (x) VALUES (1)');
    expect(await db.all('SELECT * FROM t')).toEqual([{ x: 1 }]);
  });
});

describe('createReloader', () => {
  it('never lets an older read replace a newer one', async () => {
    const { loads, load, bump } = controlledLoads();
    const shown: number[] = [];
    const r = createReloader(load, (v) => shown.push(v));
    const first = r.reload();
    bump();
    const second = r.wrote();
    // The second read waits for the first, so it cannot finish before it.
    expect(loads).toHaveLength(1);
    loads[0].finish();
    await first;
    await settle();
    expect(loads).toHaveLength(2);
    loads[1].finish();
    await second;
    expect(shown).toEqual([0, 1]);
  });

  it('joins the reload in progress when nothing was written since it started', async () => {
    const { loads, load } = controlledLoads();
    const r = createReloader(load, () => {});
    const a = r.wrote();
    const b = r.reload();
    expect(b).toBe(a);
    loads[0].finish();
    await a;
    expect(loads).toHaveLength(1);
  });

  it('shares one follow-up reload among all calls made while one is running', async () => {
    const { loads, load, bump } = controlledLoads();
    const shown: number[] = [];
    const r = createReloader(load, (v) => shown.push(v));
    void r.reload();
    bump();
    const b = r.wrote();
    bump();
    const c = r.wrote();
    expect(c).toBe(b);
    loads[0].finish();
    await settle();
    loads[1].finish();
    await c;
    expect(loads).toHaveLength(2);
    expect(shown).toEqual([0, 2]);
  });

  it('reloads again after a failed load', async () => {
    let fail = true;
    const shown: string[] = [];
    const r = createReloader(async () => {
      if (fail) throw new Error('read failed');
      return 'ok';
    }, (v) => shown.push(v));
    await expect(r.reload()).rejects.toThrow('read failed');
    fail = false;
    await r.reload();
    expect(shown).toEqual(['ok']);
  });
});
