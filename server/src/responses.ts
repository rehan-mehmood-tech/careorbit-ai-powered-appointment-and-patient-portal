import type { Response } from 'express';
import type { PaginationMeta } from './types.js';

export function sendSuccess<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ data, meta: { requestId: response.locals.requestId } });
}

export function sendPage<T>(response: Response, data: T[], pagination: PaginationMeta): void {
  response.json({ data, meta: { requestId: response.locals.requestId, pagination } });
}
