import { DEFAULT_CATEGORIES } from '@nirman/shared';
import type { Db, SqlExecutor } from './sql.ts';

/**
 * The phone's database. `jobs` and `job_images` hold AI extractions queued
 * until the phone is online; `quotes`/`quote_lines` hold vendor quotes for
 * saved BOQs. Add new migrations to the end of the list; never edit one that
 * has shipped.
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
    updated_at TEXT NOT NULL
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
    updated_at TEXT NOT NULL
  );
  CREATE INDEX items_list_idx ON items (list_id);
  CREATE TABLE indexed_rates (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    vendor TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL
  );
  CREATE TABLE learned_terms (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
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
  `,
  // 2: vendor quotes for saved BOQs. A job with a quote_id reads that quote.
  `
  CREATE TABLE quotes (
    id TEXT PRIMARY KEY,
    boq_id TEXT NOT NULL,
    vendor TEXT NOT NULL DEFAULT '',
    quote_date TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX quotes_boq_idx ON quotes (boq_id);
  CREATE TABLE quote_lines (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    boq_item_id TEXT,
    original_term TEXT NOT NULL DEFAULT '',
    item_name TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    unit_price REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX quote_lines_quote_idx ON quote_lines (quote_id);
  ALTER TABLE jobs ADD COLUMN quote_id TEXT;
  `,
  // 3: materials hidden from the price database; id is the material key.
  `
  CREATE TABLE hidden_materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    hidden_at TEXT NOT NULL
  );
  `,
];

/** Default categories sort before anything the user adds. */
const SEED_TIMESTAMP = '2000-01-01T00:00:00.000Z';

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
      'INSERT OR IGNORE INTO categories (id, name, created_at) VALUES (?, ?, ?)',
      [name.toLowerCase(), name, createdAt],
    );
  }
}

function splitStatements(script: string): string[] {
  return script.split(';').map((s) => s.trim()).filter(Boolean);
}
