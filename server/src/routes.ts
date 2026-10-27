import { Router } from 'express';
import { z } from 'zod';
import { openApiDocument } from './openapi.js';
import { createRateLimit, type RatePolicy } from './rate-limits.js';
import { sendPage, sendSuccess } from './responses.js';
import { validate } from './validation.js';
import type { Pool } from 'pg';
import { createAuthRouter } from './auth/routes.js';

const paginationSchema = z.object({
  body: z.unknown(), params: z.object({}),
  query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }),
});

export function createApiRouter(pool: Pool, defaultPolicy: RatePolicy, authPolicy: RatePolicy, enableTestRoutes: boolean): Router {
  const api = Router();
  api.get('/openapi.json', (_request, response) => response.json(openApiDocument));

  const v1 = Router();
  v1.use(createRateLimit(defaultPolicy, 'api-default'));
  v1.use(createAuthRouter(pool));
  v1.get('/', (_request, response) => sendSuccess(response, { name: 'CareOrbit API', version: 'v1' }));
  v1.get('/meta/pagination', validate(paginationSchema), (_request, response) => {
    const { page, pageSize } = (response.locals.validated as { query: { page: number; pageSize: number } }).query;
    sendPage(response, [], { page, pageSize, total: 0, totalPages: 0 });
  });
  if (enableTestRoutes) v1.post('/_contract/auth-rate-limit', createRateLimit(authPolicy, 'auth-sensitive'), (_request, response) => sendSuccess(response, { accepted: true }));
  api.use('/v1', v1);
  return api;
}
