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
  // 4: brand, model / item code, size/spec and colour, where the price depends on them.
  `
  ALTER TABLE items ADD COLUMN brand TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN model TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN spec TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN color TEXT NOT NULL DEFAULT '';
  ALTER TABLE indexed_rates ADD COLUMN brand TEXT NOT NULL DEFAULT '';
  ALTER TABLE indexed_rates ADD COLUMN model TEXT NOT NULL DEFAULT '';
  ALTER TABLE indexed_rates ADD COLUMN spec TEXT NOT NULL DEFAULT '';
  ALTER TABLE indexed_rates ADD COLUMN color TEXT NOT NULL DEFAULT '';
  ALTER TABLE quote_lines ADD COLUMN brand TEXT NOT NULL DEFAULT '';
  ALTER TABLE quote_lines ADD COLUMN model TEXT NOT NULL DEFAULT '';
  ALTER TABLE quote_lines ADD COLUMN spec TEXT NOT NULL DEFAULT '';
  ALTER TABLE quote_lines ADD COLUMN color TEXT NOT NULL DEFAULT '';
  `,
  // 5: work category and site on rates from confirmed vendor quotes, filled in from their BOQ.
  `
  ALTER TABLE indexed_rates ADD COLUMN category TEXT NOT NULL DEFAULT '';
  ALTER TABLE indexed_rates ADD COLUMN address TEXT NOT NULL DEFAULT '';
  UPDATE indexed_rates SET
    category = COALESCE((SELECT l.category FROM quotes q JOIN lists l ON l.id = q.boq_id
      WHERE q.status = 'confirmed' AND q.quote_date = indexed_rates.date AND (q.vendor = indexed_rates.vendor OR (q.vendor = '' AND indexed_rates.vendor = 'Unknown'))
      ORDER BY q.updated_at DESC LIMIT 1), ''),
    address = COALESCE((SELECT l.address FROM quotes q JOIN lists l ON l.id = q.boq_id
      WHERE q.status = 'confirmed' AND q.quote_date = indexed_rates.date AND (q.vendor = indexed_rates.vendor OR (q.vendor = '' AND indexed_rates.vendor = 'Unknown'))
      ORDER BY q.updated_at DESC LIMIT 1), '');
  `,
  // 6: when a purchase line was delivered to the site; blank = not marked.
  `
  ALTER TABLE items ADD COLUMN delivered_at TEXT NOT NULL DEFAULT '';
  `,
  // 7: how a line was ordered when it is billed in another unit (TMT bundles billed per kg, tiles per sqft).
  `
  ALTER TABLE items ADD COLUMN ordered_as TEXT NOT NULL DEFAULT '';
  `,
  // 8: no new columns. Rates indexed from an unsaved purchase list had no site; take it from the saved list with the same line.
  `
  UPDATE indexed_rates SET
    address = COALESCE((SELECT l.address FROM items i JOIN lists l ON l.id = i.list_id
      WHERE l.kind = 'audit' AND l.status = 'saved' AND l.address != ''
        AND LOWER(TRIM(i.item_name)) = LOWER(TRIM(indexed_rates.item_name)) AND i.unit_price = indexed_rates.price
        AND (i.date = indexed_rates.date OR i.date = '') AND LOWER(CASE WHEN i.vendor = '' THEN 'Unknown' ELSE i.vendor END) = LOWER(indexed_rates.vendor)
      ORDER BY l.updated_at DESC LIMIT 1), ''),
    category = CASE WHEN category != '' THEN category ELSE COALESCE((SELECT l.category FROM items i JOIN lists l ON l.id = i.list_id
      WHERE l.kind = 'audit' AND l.status = 'saved' AND l.category != ''
        AND LOWER(TRIM(i.item_name)) = LOWER(TRIM(indexed_rates.item_name)) AND i.unit_price = indexed_rates.price
        AND (i.date = indexed_rates.date OR i.date = '') AND LOWER(CASE WHEN i.vendor = '' THEN 'Unknown' ELSE i.vendor END) = LOWER(indexed_rates.vendor)
      ORDER BY l.updated_at DESC LIMIT 1), '') END
  WHERE address = ''
  `,
  // 9: labour contracts and what happens on them (work measured, payments, deductions).
  `
  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    contractor TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    work TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    rate REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    est_quantity REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    retention_pct REAL NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    retention_released_at TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contract_entries (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS contract_entries_contract_idx ON contract_entries (contract_id);
  `,
  // 10: opt-in training data: bill photos (JSON array of base64 JPEGs) and the items they became. Not in backups.
  `
  CREATE TABLE IF NOT EXISTS training_samples (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    engine TEXT NOT NULL DEFAULT '',
    ocr_text TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    item_ids TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT ''
  );
  `,
  // 11: the bill photos purchase and BOQ lines were read from (JSON array of base64 JPEGs), to check them later. Not in backups.
  `
  CREATE TABLE IF NOT EXISTS bill_photos (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    images TEXT NOT NULL DEFAULT '[]'
  );
  ALTER TABLE items ADD COLUMN photo_id TEXT NOT NULL DEFAULT '';
  `,
  // 12: saved lines whose price was cleared from Rates for good (Settings → Deleted from Rates → Clear).
  `
  ALTER TABLE items ADD COLUMN rates_excluded INTEGER NOT NULL DEFAULT 0;
  `,
  // 13: projects. Every list and contract belongs to one; existing ones are sorted into projects by site address (ensureProjects).
  `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ALTER TABLE lists ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE contracts ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE indexed_rates ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
  CREATE INDEX IF NOT EXISTS lists_project_idx ON lists (project_id);
  CREATE INDEX IF NOT EXISTS contracts_project_idx ON contracts (project_id);
  `,
  // 7.1: a line matched to a material in Rates keeps what it was read as, so the match can be undone.
  `
  ALTER TABLE items ADD COLUMN read_as TEXT NOT NULL DEFAULT '';
  `,
  // 7.15: rate changes on rate contracts. Work dated on or after from_date is valued at rate; one change per contract and date.
  `
  CREATE TABLE IF NOT EXISTS contract_rates (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    rate REAL NOT NULL CHECK (rate > 0),
    from_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS contract_rates_contract_date_idx ON contract_rates (contract_id, from_date);
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
      // The driver runs the script as SQLite parses it: a ';' inside a trigger or a text value is safe.
      await tx.exec(script);
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
