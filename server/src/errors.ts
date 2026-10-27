import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { safeLog } from './logger.js';

export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
  }
}

export const apiErrors = {
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Authentication required'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'You are not permitted to perform this action'),
  privateNotFound: () => new AppError(404, 'NOT_FOUND', 'The requested resource was not found'),
  conflict: () => new AppError(409, 'RESOURCE_CONFLICT', 'The request conflicts with current resource state'),
};

type PgLikeError = Error & { code?: string; type?: string; position?: string };

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code, message: issue.message })));
  const candidate = error as PgLikeError;
  if (candidate?.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds the allowed size');
  if (candidate?.code === '23505' || candidate?.code === '23P01' || candidate?.code === '40001') return new AppError(409, 'RESOURCE_CONFLICT', 'The request conflicts with current resource state');
  if (candidate?.code === '23503' || candidate?.code === '23514') return new AppError(422, 'INTEGRITY_VALIDATION_FAILED', 'The request violates a data constraint');
  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found'));
};

export const errorHandler: ErrorRequestHandler = (source, _request, response, _next) => {
  const error = normalizeError(source);
  const requestId = response.locals.requestId as string;
  if (error.status >= 500) safeLog('error', 'http.failure', { requestId, errorType: source instanceof Error ? source.name : 'UnknownError', errorCode: (source as PgLikeError)?.code ?? 'UNCLASSIFIED', errorPosition:(source as PgLikeError)?.position??'none' });
  response.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
      requestId,
    },
  });
};
