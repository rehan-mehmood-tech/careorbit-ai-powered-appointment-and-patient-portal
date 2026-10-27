import { createServer } from 'node:http';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { config } from './config.js';

const pool = new Pool({ connectionString: config.DATABASE_URL, max: 5 });
const server = createServer(createApp(pool));
let shuttingDown = false;

server.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
  console.log(JSON.stringify({ level: 'info', message: 'CareOrbit API listening', host: config.SERVER_HOST, port: config.SERVER_PORT }));
});

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', message: 'Graceful shutdown started', signal }));
  const forceExit = setTimeout(() => process.exit(1), config.SHUTDOWN_TIMEOUT_MS).unref();
  server.close(async () => {
    await pool.end().catch(() => undefined);
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({ level: 'fatal', message: error.message }));
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ level: 'fatal', message: reason instanceof Error ? reason.message : 'Unhandled rejection' }));
  void shutdown('unhandledRejection');
});
