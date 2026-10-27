import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validate(schema: ZodType): RequestHandler {
  return (request, response, next) => {
    try {
      const parsed = schema.parse({ body: request.body, query: request.query, params: request.params });
      response.locals.validated = parsed;
      next();
    } catch (error) {
      next(error);
    }
  };
}
