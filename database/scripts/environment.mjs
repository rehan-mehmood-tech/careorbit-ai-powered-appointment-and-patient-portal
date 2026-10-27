import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: new URL('../../server/.env', import.meta.url), quiet: true });
loadEnvironment({ path: new URL('../.env', import.meta.url), override: true, quiet: true });

export function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value || !(value.startsWith('postgresql://') || value.startsWith('postgres://'))) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  return value;
}
