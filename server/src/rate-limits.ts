import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { safeLog, privacySafeClientKey } from './logger.js';

export type RatePolicy = { windowMs: number; limit: number };

export function createRateLimit(policy: RatePolicy, name: string): RequestHandler {
  return rateLimit({
    windowMs: policy.windowMs,
    limit: policy.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (request, response) => {
      safeLog('warn', 'abuse.rate_limit', {
        requestId: response.locals.requestId,
        policy: name,
        method: request.method,
        route: request.path,
        clientKey: privacySafeClientKey(request.ip ?? 'unknown'),
      });
      response.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: response.locals.requestId } });
    },
  });
}
