import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { RequestWithId } from './types.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${request.method} ${request.path} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const known = error instanceof AppError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'INTERNAL_ERROR';
  const message = known ? error.message : 'An unexpected error occurred';
  const requestId = (request as RequestWithId).id;

  if (!known) console.error(JSON.stringify({ level: 'error', requestId, error: error instanceof Error ? error.message : 'Unknown error' }));

  response.status(status).json({
    error: { code, message, requestId },
  });
};
