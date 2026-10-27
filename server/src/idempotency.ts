import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { AppError } from './errors.js';

const keyPattern = /^[A-Za-z0-9_.:-]{8,128}$/;

export function idempotency(pool: Pool): RequestHandler {
  return async (request, response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
    const key = request.header('idempotency-key');
    if (!key) return next();
    if (!keyPattern.test(key)) return next(new AppError(422, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-128 safe characters'));
    const requestHash = createHash('sha256').update(JSON.stringify({ method: request.method, path: request.path, body: request.body ?? null })).digest('hex');
    try {
      const inserted = await pool.query(
        `INSERT INTO api_idempotency_records (idempotency_key, method, request_path, request_hash, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '24 hours') ON CONFLICT DO NOTHING RETURNING id`,
        [key, request.method, request.path, requestHash],
      );
      if (inserted.rowCount === 0) {
        const existing = await pool.query(
          `SELECT request_hash, response_status, response_body FROM api_idempotency_records
           WHERE idempotency_key = $1 AND method = $2 AND request_path = $3 AND expires_at > now()`,
          [key, request.method, request.path],
        );
        const record = existing.rows[0];
        if (!record || record.request_hash !== requestHash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different request');
        if (record.response_status === null) throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'An identical request is already in progress');
        response.setHeader('idempotency-replayed', 'true');
        return response.status(record.response_status).json(record.response_body);
      }
      const originalJson = response.json.bind(response);
      response.json = ((body: unknown) => {
        if (response.statusCode < 500) void pool.query(
          `UPDATE api_idempotency_records SET response_status = $4, response_body = $5, completed_at = now()
           WHERE idempotency_key = $1 AND method = $2 AND request_path = $3`,
          [key, request.method, request.path, response.statusCode, body],
        );
        return originalJson(body);
      }) as typeof response.json;
      next();
    } catch (error) {
      next(error);
    }
  };
}
