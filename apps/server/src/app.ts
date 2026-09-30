import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { authRoutes } from './auth.ts';
import type { Config } from './config.ts';
import type { Pool } from './db.ts';
import { sendError } from './errors.ts';
import { extractRoutes, type Extractor } from './extract.ts';
import { syncRoutes } from './sync.ts';

export interface AppDeps {
  config: Pick<Config, 'jwtSecret' | 'corsOrigins'>;
  pool: Pool;
  extractor?: Extractor;
  logger?: FastifyServerOptions['logger'];
  /** Tests turn this off; route-level `config.rateLimit` is then ignored. */
  rateLimit?: boolean;
}

export async function buildApp({ config, pool, extractor, logger = true, rateLimit: limitRates = true }: AppDeps) {
  const app = Fastify({ logger, bodyLimit: 1024 * 1024, trustProxy: true });

  await app.register(cors, { origin: config.corsOrigins });
  if (limitRates) await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(jwt, { secret: config.jwtSecret });

  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return sendError(reply, 401, 'unauthorized', 'Missing or expired access token');
    }
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return sendError(reply, status, err.code ?? 'error', status >= 500 ? 'Internal server error' : err.message);
  });

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  await app.register(authRoutes, { pool });
  await app.register(syncRoutes, { pool });
  await app.register(extractRoutes, { pool, extractor });
  return app;
}
