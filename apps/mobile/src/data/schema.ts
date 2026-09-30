import { DEFAULT_CATEGORIES } from '@nirman/shared';
import type { Db, SqlExecutor } from './sql.ts';

/**
 * Local schema. Synced tables mirror the server (apps/server/migrations) plus a
 * `dirty` flag marking rows that still need to be pushed. `jobs` and
 * `job_images` hold AI extractions queued while offline and never sync.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE lists (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    site_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    item_name TEXT NOT NULL DEFAULT '',
    original_term TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    unit_price REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    vendor TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX items_list_idx ON items (list_id);
  CREATE TABLE indexed_rates (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    vendor TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE learned_terms (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    capture_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE job_images (
    job_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (job_id, idx)
  );
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

/** Seed rows use an old timestamp so any real edit or delete from another device wins. */
export const SEED_TIMESTAMP = '2000-01-01T00:00:00.000Z';

export async function migrateLocal(db: Db): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const rows = await db.all<{ version: number }>('SELECT version FROM schema_version');
  let version = rows[0]?.version ?? 0;
  if (rows.length === 0) await db.run('INSERT INTO schema_version (version) VALUES (0)');

  for (; version < MIGRATIONS.length; version++) {
    const script = MIGRATIONS[version];
    const next = version + 1;
    await db.transaction(async (tx) => {
      for (const stmt of splitStatements(script)) await tx.run(stmt);
      await tx.run('UPDATE schema_version SET version = ?', [next]);
      if (next === 1) await seedCategories(tx);
    });
  }
}

export async function seedCategories(tx: SqlExecutor) {
  for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
    const createdAt = new Date(Date.parse(SEED_TIMESTAMP) + i).toISOString();
    await tx.run(
      'INSERT OR IGNORE INTO categories (id, name, created_at, updated_at, deleted_at, dirty) VALUES (?, ?, ?, ?, NULL, 0)',
      [name.toLowerCase(), name, createdAt, SEED_TIMESTAMP],
    );
  }
}

function splitStatements(script: string): string[] {
  return script.split(';').map((s) => s.trim()).filter(Boolean);
}
