import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { databaseUrl } from './environment.mjs';

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const directory = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

await runner({
  databaseUrl: databaseUrl(),
  dir: directory,
  direction,
  count: direction === 'down' ? 1 : Infinity,
  migrationsTable: 'careorbit_migrations',
  checkOrder: true,
  verbose: false,
});
