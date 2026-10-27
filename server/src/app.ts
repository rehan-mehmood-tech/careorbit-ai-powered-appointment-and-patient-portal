import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Pool } from 'pg';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createHealthRouter } from './health.js';
import { idempotency } from './idempotency.js';
import { requestLogger } from './logger.js';
import { createApiRouter } from './routes.js';
import { requireTls } from './security.js';

export type AppOptions = {
  bodyLimit?: string;
  origins?: string[];
  requireTls?: boolean;
  trustProxy?: number;
  rateWindowMs?: number;
  defaultRateMax?: number;
  authRateMax?: number;
  enableTestRoutes?: boolean;
};

export function createApp(pool: Pool, options: AppOptions = {}) {
  const app = express();
  const origins = options.origins ?? config.clientOrigins;
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? config.TRUST_PROXY);
  app.use((request, response, next) => {
    const candidate = request.header('x-request-id');
    const requestId = candidate && /^[A-Za-z0-9_.:-]{1,128}$/.test(candidate) ? candidate : randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || origins.includes(origin)), credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'] }));
  app.use(compression());
  if (options.requireTls ?? config.REQUIRE_TLS) app.use(requireTls);
  app.use(express.json({ limit: options.bodyLimit ?? config.REQUEST_BODY_LIMIT, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: options.bodyLimit ?? config.REQUEST_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use('/health', createHealthRouter(pool));
  app.use(idempotency(pool));
  app.use('/api', createApiRouter(pool,
    { windowMs: options.rateWindowMs ?? config.RATE_LIMIT_WINDOW_MS, limit: options.defaultRateMax ?? config.RATE_LIMIT_DEFAULT_MAX },
    { windowMs: options.rateWindowMs ?? config.RATE_LIMIT_WINDOW_MS, limit: options.authRateMax ?? config.RATE_LIMIT_AUTH_MAX },
    options.enableTestRoutes ?? false,
  ));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
