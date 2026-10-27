import { Router } from 'express';
import type { Pool } from 'pg';
import { config } from './config.js';
import type { HealthCheck } from './types.js';

async function timedCheck(action: () => Promise<void>): Promise<HealthCheck> {
  const started = performance.now();
  try {
    await action();
    return { status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { status: 'down', latencyMs: Math.round(performance.now() - started), detail: 'Unavailable' };
  }
}

export function createHealthRouter(pool: Pool): Router {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.json({ status: 'ok', service: 'careorbit-server', uptimeSeconds: Math.round(process.uptime()) });
  });

  router.get('/ready', async (_request, response) => {
    const [database, aiService] = await Promise.all([
      timedCheck(async () => { await pool.query('SELECT 1'); }),
      timedCheck(async () => {
        const result = await fetch(`${config.AI_SERVICE_URL}/health/ready`, {
          headers: { 'x-internal-service-token': config.INTERNAL_SERVICE_TOKEN },
          signal: AbortSignal.timeout(3000),
        });
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
      }),
    ]);
    const ready = database.status === 'up' && aiService.status === 'up';
    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks: { database, aiService } });
  });

  return router;
}
