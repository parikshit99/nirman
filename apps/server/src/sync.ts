import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  shouldReplace,
  syncPushRequestSchema,
  syncTables,
  type SyncChanges,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncTable,
} from '@nirman/shared';
import type { Pool } from './db.ts';
import { badRequest } from './errors.ts';

/** Column name → Postgres type for each synced table (excluding user_id and seq). */
const COLUMNS: Record<SyncTable, Record<string, string>> = {
  lists: {
    id: 'text', kind: 'text', status: 'text', title: 'text', address: 'text', category: 'text',
    site_date: 'text', notes: 'text', created_at: 'timestamptz', updated_at: 'timestamptz', deleted_at: 'timestamptz',
  },
  items: {
    id: 'text', list_id: 'text', item_name: 'text', original_term: 'text', quantity: 'double precision',
    unit: 'text', unit_price: 'double precision', total_amount: 'double precision', vendor: 'text', date: 'text',
    created_at: 'timestamptz', updated_at: 'timestamptz', deleted_at: 'timestamptz',
  },
  indexed_rates: {
    id: 'text', item_name: 'text', unit: 'text', date: 'text', price: 'double precision', vendor: 'text',
    indexed_at: 'timestamptz', updated_at: 'timestamptz', deleted_at: 'timestamptz',
  },
  learned_terms: {
    id: 'text', item_name: 'text', unit: 'text', updated_at: 'timestamptz', deleted_at: 'timestamptz',
  },
  categories: {
    id: 'text', name: 'text', created_at: 'timestamptz', updated_at: 'timestamptz', deleted_at: 'timestamptz',
  },
};

/**
 * Upsert a batch of rows; an existing row is only overwritten by a newer one
 * (same rule as shared `shouldReplace`). Every accepted write takes a new seq.
 */
function upsertSql(table: SyncTable): string {
  const cols = Object.keys(COLUMNS[table]);
  const recordDef = cols.map((c) => `${c} ${COLUMNS[table][c]}`).join(', ');
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  return `
    INSERT INTO ${table} (user_id, ${cols.join(', ')})
    SELECT $1, ${cols.map((c) => `r.${c}`).join(', ')}
    FROM jsonb_to_recordset($2::jsonb) AS r(${recordDef})
    ON CONFLICT (user_id, id) DO UPDATE SET ${updates}, seq = nextval('sync_seq')
    WHERE ${table}.updated_at < EXCLUDED.updated_at
       OR (${table}.updated_at = EXCLUDED.updated_at AND ${table}.deleted_at IS NULL AND EXCLUDED.deleted_at IS NOT NULL)
    RETURNING id`;
}
const UPSERT_SQL = Object.fromEntries(syncTables.map((t) => [t, upsertSql(t)])) as Record<SyncTable, string>;

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at', 'indexed_at']);

const PULL_SQL = `
  SELECT tbl, seq, data FROM (
    ${syncTables
      .map((t) => `SELECT '${t}' AS tbl, seq, to_jsonb(t) - 'user_id' - 'seq' AS data FROM ${t} t WHERE user_id = $1 AND seq > $2`)
      .join('\n    UNION ALL\n    ')}
  ) x
  ORDER BY seq
  LIMIT $3`;

const pullQuerySchema = z.object({
  since: z.string().regex(/^\d+$/).default('0'),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

type SyncRow = { id: string; updated_at: string; deleted_at: string | null };

/** Keep only the winning version when a batch contains the same id twice. */
function dedupe(rows: SyncRow[]): SyncRow[] {
  const byId = new Map<string, SyncRow>();
  for (const row of rows) {
    if (shouldReplace(row, byId.get(row.id))) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function syncRoutes(app: FastifyInstance, { pool }: { pool: Pool }) {
  app.addHook('onRequest', app.authenticate);

  app.post('/sync/push', { bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
    const body = syncPushRequestSchema.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);
    const userId = req.user.sub;

    const client = await pool.connect();
    let applied = 0;
    try {
      await client.query('BEGIN');
      // Serialise writes per user so seq values commit in order and a pull
      // can never skip over a row that commits later with a smaller seq.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
      for (const table of syncTables) {
        const rows = body.data.changes[table] as SyncRow[] | undefined;
        if (!rows?.length) continue;
        const res = await client.query(UPSERT_SQL[table], [userId, JSON.stringify(dedupe(rows))]);
        applied += res.rowCount ?? 0;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    const response: SyncPushResponse = { applied };
    return response;
  });

  app.get('/sync/pull', async (req, reply) => {
    const query = pullQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(reply, query.error);
    const { since, limit } = query.data;

    const { rows } = await pool.query<{ tbl: SyncTable; seq: string; data: Record<string, unknown> }>(PULL_SQL, [
      req.user.sub,
      since,
      limit + 1,
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const changes: SyncChanges = {};
    for (const { tbl, data } of page) {
      for (const col of TIMESTAMP_COLUMNS) {
        const v = data[col];
        if (typeof v === 'string') data[col] = new Date(v).toISOString();
      }
      ((changes[tbl] ??= []) as unknown[]).push(data);
    }
    const response: SyncPullResponse = {
      changes,
      cursor: page.length ? page[page.length - 1].seq : since,
      has_more: hasMore,
    };
    return response;
  });
}
