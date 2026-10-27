import { config as loadEnvironment } from 'dotenv';
import { z } from 'zod';

loadEnvironment({ path: new URL('../.env', import.meta.url), quiet: true });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_HOST: z.string().min(1).default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'DATABASE_URL must use PostgreSQL'),
  AI_SERVICE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(32),
  REQUEST_BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i).default('1mb'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
  REQUIRE_TLS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_DEFAULT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid server environment: ${details}`);
}

export const config = {
  ...parsed.data,
  clientOrigins: parsed.data.CLIENT_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
};
