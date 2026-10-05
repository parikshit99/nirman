/**
 * Minimal async SQL interface over SQLite. On Android it is backed by
 * @capacitor-community/sqlite; in the browser (dev server) and in tests by
 * sql.js, optionally persisted to IndexedDB.
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

interface RawDriver {
  all(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params: SqlValue[]): Promise<void>;
  exec(script: string): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  /** Called after each committed write outside a transaction, and after each commit. */
  afterWrite?(): void;
  close(): Promise<void>;
}

function wrap(driver: RawDriver): Db {
  const mutex = new Mutex();
  const raw: SqlExecutor = {
    all: async <T,>(sql: string, params: SqlValue[] = []) => (await driver.all(sql, params)) as T[],
    run: (sql, params = []) => driver.run(sql, params),
  };
  return {
    all: (sql, params) => mutex.lock(() => raw.all(sql, params)),
    run: (sql, params) =>
      mutex.lock(async () => {
        await raw.run(sql, params);
        driver.afterWrite?.();
      }),
    exec: (script) =>
      mutex.lock(async () => {
        await driver.exec(script);
        driver.afterWrite?.();
      }),
    transaction: (fn) =>
      mutex.lock(async () => {
        await driver.begin();
        try {
          const result = await fn(raw);
          await driver.commit();
          driver.afterWrite?.();
          return result;
        } catch (err) {
          // Throw the original error even if the rollback fails too (SQLite may already have ended the transaction).
          await driver.rollback().catch(() => {});
          throw err;
        }
      }),
    close: () => mutex.lock(() => driver.close()),
  };
}

// ---------------------------------------------------------------------------
// sql.js (browser + tests)
// ---------------------------------------------------------------------------

export interface SqlJsOptions {
  /** URL or loader for sql-wasm.wasm; not needed in Node. */
  locateFile?: (file: string) => string;
  /** Persist the database image to IndexedDB under this key. */
  persistKey?: string;
}

export async function openSqlJs({ locateFile, persistKey }: SqlJsOptions = {}): Promise<Db> {
  const { default: initSqlJs } = await import('sql.js');
  const SQL = await initSqlJs(locateFile ? { locateFile } : undefined);
  const saved = persistKey ? await idbGet(persistKey) : undefined;
  const db = new SQL.Database(saved);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    if (!persistKey) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void idbSet(persistKey, db.export()), 300);
  };

  return wrap({
    async all(sql, params) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    async run(sql, params) {
      db.run(sql, params);
    },
    async exec(script) {
      db.exec(script);
    },
    async begin() {
      db.run('BEGIN');
    },
    async commit() {
      db.run('COMMIT');
    },
    async rollback() {
      db.run('ROLLBACK');
    },
    afterWrite: persist,
    async close() {
      clearTimeout(saveTimer);
      if (persistKey) await idbSet(persistKey, db.export());
      db.close();
    },
  });
}

const IDB_NAME = 'nirmaan';
const IDB_STORE = 'sqlite';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<Uint8Array | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: Uint8Array): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Native SQLite on Android via @capacitor-community/sqlite
// ---------------------------------------------------------------------------

export async function openCapacitorSqlite(name: string): Promise<Db> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => {});
  const exists = (await sqlite.isConnection(name, false)).result;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();

  return wrap({
    async all(sql, params) {
      return ((await conn.query(sql, params)).values ?? []) as Record<string, unknown>[];
    },
    async run(sql, params) {
      // transaction=false: we manage transactions ourselves.
      await conn.run(sql, params, false);
    },
    async exec(script) {
      await conn.execute(script, false);
    },
    async begin() {
      await conn.beginTransaction();
    },
    async commit() {
      await conn.commitTransaction();
    },
    async rollback() {
      await conn.rollbackTransaction();
    },
    async close() {
      await sqlite.closeConnection(name, false);
    },
  });
}
