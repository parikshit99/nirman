import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { credentialsSchema, refreshRequestSchema, type AuthResponse } from '@nirman/shared';
import type { Pool } from './db.ts';
import { badRequest, sendError } from './errors.ts';

export const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 180;
/**
 * A refresh token that was just rotated may still be presented again if the
 * phone lost the response on a flaky connection. Accept it for a short window
 * instead of logging the user out.
 */
const ROTATION_GRACE_SECONDS = 120;

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function issueTokens(app: FastifyInstance, pool: Pool, user: { id: string; email: string }): Promise<AuthResponse> {
  const refresh = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [user.id, sha256(refresh), REFRESH_TOKEN_TTL_DAYS],
  );
  const access = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: ACCESS_TOKEN_TTL });
  return { user, access_token: access, refresh_token: refresh };
}

export async function authRoutes(app: FastifyInstance, { pool }: { pool: Pool }) {
  const rateLimit = { max: 10, timeWindow: '1 minute' };

  app.post('/auth/register', { config: { rateLimit } }, async (req, reply) => {
    const body = credentialsSchema.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);
    const { email, password } = body.data;

    const passwordHash = await hash(password);
    const { rows } = await pool.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING RETURNING id, email`,
      [email, passwordHash],
    );
    if (rows.length === 0) return sendError(reply, 409, 'email_taken', 'An account with this email already exists');
    return reply.code(201).send(await issueTokens(app, pool, rows[0]));
  });

  app.post('/auth/login', { config: { rateLimit } }, async (req, reply) => {
    const body = credentialsSchema.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);
    const { email, password } = body.data;

    const { rows } = await pool.query<{ id: string; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    if (!user || !(await verify(user.password_hash, password))) {
      return sendError(reply, 401, 'invalid_credentials', 'Email or password is incorrect');
    }
    return issueTokens(app, pool, { id: user.id, email: user.email });
  });

  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = refreshRequestSchema.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);

    const { rows } = await pool.query<{ id: string; user_id: string; email: string }>(
      `UPDATE refresh_tokens t SET revoked_at = COALESCE(t.revoked_at, now())
       FROM users u
       WHERE t.token_hash = $1 AND u.id = t.user_id
         AND t.expires_at > now()
         AND (t.revoked_at IS NULL OR t.revoked_at > now() - make_interval(secs => $2))
       RETURNING t.id, t.user_id, u.email`,
      [sha256(body.data.refresh_token), ROTATION_GRACE_SECONDS],
    );
    if (rows.length === 0) return sendError(reply, 401, 'invalid_refresh_token', 'Session expired, please sign in again');
    return issueTokens(app, pool, { id: rows[0].user_id, email: rows[0].email });
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = refreshRequestSchema.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);
    await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
      sha256(body.data.refresh_token),
    ]);
    return reply.code(204).send();
  });

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (req) => ({ id: req.user.sub, email: req.user.email }));
}
