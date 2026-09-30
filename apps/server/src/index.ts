import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPool, migrate } from './db.ts';
import { createGeminiExtractor } from './extract.ts';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);

const extractor = config.geminiApiKey ? createGeminiExtractor(config.geminiApiKey, config.geminiModel) : undefined;
const app = await buildApp({ config, pool, extractor });
if (!extractor) app.log.warn('GEMINI_API_KEY is not set: /extractions will return 503');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
