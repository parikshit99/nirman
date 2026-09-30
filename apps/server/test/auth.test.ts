import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from '../src/db.ts';
import { bearer, makeApp, register, resetDatabase } from './helpers.ts';

let pool: Pool;
let app: Awaited<ReturnType<typeof makeApp>>;

beforeAll(async () => {
  pool = await resetDatabase();
  app = await makeApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('auth', () => {
  it('registers, rejects duplicates and normalises email', async () => {
    const auth = await register(app, 'Site.Manager@Example.com');
    expect(auth.user.email).toBe('site.manager@example.com');
    const dup = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'site.manager@example.com', password: 'password123' } });
    expect(dup.statusCode).toBe(409);
  });

  it('validates input', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'nope', password: 'short' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
  });

  it('logs in with the right password only', async () => {
    await register(app, 'login@example.com');
    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'login@example.com', password: 'wrongpassword' } });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'login@example.com', password: 'password123' } });
    expect(good.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: bearer(good.json().access_token) });
    expect(me.json().email).toBe('login@example.com');
  });

  it('protects routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/sync/pull' });
    expect(res.statusCode).toBe(401);
    const forged = await app.inject({ method: 'GET', url: '/sync/pull', headers: bearer('abc.def.ghi') });
    expect(forged.statusCode).toBe(401);
  });

  it('rotates refresh tokens with a short grace window, and logout revokes', async () => {
    const auth = await register(app);
    const r1 = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refresh_token: auth.refresh_token } });
    expect(r1.statusCode).toBe(200);
    const rotated = r1.json().refresh_token;
    expect(rotated).not.toBe(auth.refresh_token);

    // Replaying the old token right away (lost response) still works...
    const replay = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refresh_token: auth.refresh_token } });
    expect(replay.statusCode).toBe(200);
    // ...but not once the grace window has passed.
    await pool.query(`UPDATE refresh_tokens SET revoked_at = now() - interval '1 hour' WHERE revoked_at IS NOT NULL`);
    const stale = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refresh_token: auth.refresh_token } });
    expect(stale.statusCode).toBe(401);

    const out = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refresh_token: rotated } });
    expect(out.statusCode).toBe(204);
    await pool.query(`UPDATE refresh_tokens SET revoked_at = now() - interval '1 hour' WHERE revoked_at IS NOT NULL`);
    const after = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refresh_token: rotated } });
    expect(after.statusCode).toBe(401);
  });
});
