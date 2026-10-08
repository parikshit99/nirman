// The database a 6.x phone has after restoring e2e/sample-backup.json: made with core's own migrations and restore,
// for CI's upgrade test (pushed into the 6.x app, then 7.0 is installed over it).
// Run from the repo root: npx vite-node apps/native/e2e/make-6x-db.ts <out.db>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { migrateLocal, parseBackup, restoreBackup, wrapDriver } from '@nirman/core';

const out = process.argv[2];
if (!out) throw new Error('Usage: make-6x-db.ts <out.db>');

const SQL = await initSqlJs();
const sqlite = new SQL.Database();
const db = wrapDriver({
  async all(sql, params) {
    const stmt = sqlite.prepare(sql);
    try {
      stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  },
  run: async (sql, params) => void sqlite.run(sql, params),
  exec: async (script) => void sqlite.exec(script),
  begin: async () => void sqlite.run('BEGIN'),
  commit: async () => void sqlite.run('COMMIT'),
  rollback: async () => void sqlite.run('ROLLBACK'),
  close: async () => sqlite.close(),
});

await migrateLocal(db);
await restoreBackup(db, parseBackup(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sample-backup.json'), 'utf8')));
writeFileSync(out, sqlite.export());
console.log(`Wrote ${out}`);
