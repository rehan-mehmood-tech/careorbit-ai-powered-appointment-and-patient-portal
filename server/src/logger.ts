import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';

const blockedKeys = /authorization|cookie|token|secret|password|body|content|document|message|note|patient|doctor|user.?id/i;

export function safeLog(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  const safeFields = Object.fromEntries(Object.entries(fields).filter(([key]) => !blockedKeys.test(key)));
  const output = JSON.stringify({ level, event, ...safeFields, timestamp: new Date().toISOString() });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(output);
}

export const requestLogger: RequestHandler = (request, response, next) => {
  const started = performance.now();
  response.on('finish', () => safeLog('info', 'http.request', {
    requestId: response.locals.requestId,
    method: request.method,
    route: sanitizeRoute(request.route?.path ?? request.path),
    status: response.statusCode,
    durationMs: Math.round(performance.now() - started),
  }));
  next();
};

export function privacySafeClientKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function sanitizeRoute(route: string): string {
  return route.split('/').map(segment =>
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^\d{6,}$/.test(segment) || (segment.length >= 24 && /\d/.test(segment)) ? ':id' : segment,
  ).join('/');
}
