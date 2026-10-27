import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireInternalServiceAuth(expectedToken: string): RequestHandler {
  return (request, _response, next) => {
    const bearer = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!equalSecret(bearer, expectedToken)) return next(new AppError(401, 'SERVICE_UNAUTHENTICATED', 'Service authentication required'));
    next();
  };
}

export function createAiServiceClient(baseUrl: string, token: string) {
  return async (path: string, init: RequestInit = {}): Promise<Response> => fetch(new URL(path, baseUrl), {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}`, 'x-internal-service-token': token },
    signal: init.signal ?? AbortSignal.timeout(5000),
  });
}

export const requireTls: RequestHandler = (request, _response, next) => {
  if (!request.secure) return next(new AppError(400, 'HTTPS_REQUIRED', 'HTTPS is required'));
  next();
};
