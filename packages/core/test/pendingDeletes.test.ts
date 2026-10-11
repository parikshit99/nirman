import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingDeletes } from '../src/data/pendingDeletes.ts';

describe('createPendingDeletes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const done: string[] = [];
    let shown: ReadonlySet<string> = new Set();
    const p = createPendingDeletes(10_000, (ids) => (shown = ids));
    const add = (id: string) => p.add(id, async () => void done.push(id));
    return { p, add, done, shown: () => [...shown] };
  };

  it('deletes after the wait unless undone', async () => {
    const { add, p, done, shown } = setup();
    add('a');
    add('b');
    expect(shown()).toEqual(['a', 'b']);
    p.undo('b');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(done).toEqual(['a']);
    expect(shown()).toEqual([]);
  });

  it('carries out every waiting delete at once on flush, and only once', async () => {
    const { add, p, done } = setup();
    add('a');
    add('a');
    add('b');
    await p.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(done).toEqual(['a', 'b']);
  });

  it('forgets waiting deletes on cancelAll, so they never touch data restored later', async () => {
    const { add, p, done, shown } = setup();
    add('a');
    p.cancelAll();
    expect(shown()).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    await p.flush();
    expect(done).toEqual([]);
  });
});
