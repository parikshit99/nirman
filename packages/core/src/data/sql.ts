/**
 * Minimal async SQL interface over SQLite. The app provides the driver
 * (`wrapDriver` around its SQLite plugin); the tests use sql.js.
 */
export type SqlValue = string | number | null;

export interface SqlExecutor {
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
}

export interface Db extends SqlExecutor {
  /** Run `fn` atomically. Other callers wait until it finishes. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  /** Execute a script of several statements (used for migrations). */
  exec(script: string): Promise<void>;
  close(): Promise<void>;
  /**
   * Call `fn` after every committed write: a `run`, an `exec`, or a transaction that wrote something
   * (not one that only read, nor one rolled back). Whoever changes the data, the screens hear of it.
   */
  onWrite(fn: () => void): () => void;
}

/** Serialises access so a transaction never interleaves with other statements. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  lock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => {});
    return result;
  }
}

export interface RawDriver {
  all(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params: SqlValue[]): Promise<void>;
  exec(script: string): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

export function wrapDriver(driver: RawDriver): Db {
  const mutex = new Mutex();
  const listeners = new Set<() => void>();
  const wrote = () => {
    for (const fn of listeners) {
      // A listener's mistake must not make the write look failed: it is already committed.
      try {
        fn();
      } catch {
        // ignored
      }
    }
  };
  const all = async <T,>(sql: string, params: SqlValue[] = []) => (await driver.all(sql, params)) as T[];
  return {
    all: (sql, params) => mutex.lock(() => all(sql, params)),
    run: (sql, params = []) =>
      mutex.lock(async () => {
        await driver.run(sql, params);
        wrote();
      }),
    exec: (script) =>
      mutex.lock(async () => {
        await driver.exec(script);
        wrote();
      }),
    transaction: (fn) =>
      mutex.lock(async () => {
        let changed = false;
        const tx: SqlExecutor = {
          all,
          run: (sql, params = []) => ((changed = true), driver.run(sql, params)),
        };
        await driver.begin();
        try {
          const result = await fn(tx);
          await driver.commit();
          if (changed) wrote();
          return result;
        } catch (err) {
          // Throw the original error even if the rollback fails too (SQLite may already have ended the transaction).
          await driver.rollback().catch(() => {});
          throw err;
        }
      }),
    close: () => mutex.lock(() => driver.close()),
    onWrite(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
