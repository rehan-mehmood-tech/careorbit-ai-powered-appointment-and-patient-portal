import { createServer } from 'node:http';

const port = Number(process.env.WORKER_HEALTH_PORT ?? 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WORKER_HEALTH_PORT must be a valid port');

const server = createServer((request, response) => {
  if (request.url === '/health/live' || request.url === '/health/ready') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: request.url.endsWith('ready') ? 'ready' : 'ok', service: 'careorbit-worker', jobsRegistered: 0 }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
});

server.listen(port, '127.0.0.1', () => console.log(`CareOrbit worker scaffold listening on 127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
