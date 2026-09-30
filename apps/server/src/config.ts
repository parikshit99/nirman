import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3-flash-preview'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default(''),
});

export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  geminiApiKey?: string;
  geminiModel: string;
  port: number;
  host: string;
  corsOrigins: string[];
}

/** Origins the app itself runs on: Capacitor's Android/iOS WebViews and the Vite dev server. */
const DEFAULT_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'http://localhost:3000', 'http://127.0.0.1:3000'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server configuration: ${problems}`);
  }
  const e = parsed.data;
  const extra = e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    geminiApiKey: e.GEMINI_API_KEY && e.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? e.GEMINI_API_KEY : undefined,
    geminiModel: e.GEMINI_MODEL,
    port: e.PORT,
    host: e.HOST,
    corsOrigins: [...DEFAULT_ORIGINS, ...extra],
  };
}
