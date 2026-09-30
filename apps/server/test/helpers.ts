import type { AuthResponse, ExtractedMaterial, ExtractionRequest } from '@nirman/shared';
import { buildApp } from '../src/app.ts';
import { createPool, migrate, type Pool } from '../src/db.ts';
import type { Extractor } from '../src/extract.ts';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://nirman:nirman@localhost:5432/nirman_test';

export async function resetDatabase(): Promise<Pool> {
  const pool = createPool(TEST_DATABASE_URL);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  return pool;
}

export class FakeExtractor implements Extractor {
  calls: ExtractionRequest[] = [];
  result: ExtractedMaterial[] = [];
  error?: Error;
  async extract(req: ExtractionRequest) {
    this.calls.push(req);
    if (this.error) throw this.error;
    return this.result;
  }
}

export async function makeApp(pool: Pool, extractor?: Extractor) {
  return buildApp({
    config: { jwtSecret: 'test-secret-that-is-at-least-32-characters', corsOrigins: [] },
    pool,
    extractor,
    logger: false,
    rateLimit: false,
  });
}

type App = Awaited<ReturnType<typeof makeApp>>;

let counter = 0;
export async function register(app: App, email = `user${++counter}@example.com`): Promise<AuthResponse> {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  return res.json();
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
