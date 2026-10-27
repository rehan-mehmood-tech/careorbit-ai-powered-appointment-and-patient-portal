import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Pool } from 'pg';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createHealthRouter } from './health.js';
import type { RequestWithId } from './types.js';

export function createApp(pool: Pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
  app.use((request, response, next) => {
    const requestId = request.header('x-request-id')?.slice(0, 128) || randomUUID();
    (request as RequestWithId).id = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  });
  app.use('/health', createHealthRouter(pool));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
