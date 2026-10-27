import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { apiErrors, AppError } from '../errors.js';
import { verifyAccessToken } from './tokens.js';
import type { AuthenticatedRequest, Role } from './types.js';

export function authenticate(pool: Pool): RequestHandler {
  return async (request, _response, next) => {
    try {
      const raw = request.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!raw) throw apiErrors.unauthenticated();
      const claims = await verifyAccessToken(raw);
      const result = await pool.query(
        `SELECT u.status, u.role, u.email_verified_at, s.revoked_at, s.expires_at
         FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2`,
        [claims.sub, claims.sessionId],
      );
      const row = result.rows[0];
      if (!row || row.revoked_at || new Date(row.expires_at) <= new Date()) throw apiErrors.unauthenticated();
      if (row.status === 'suspended' || row.status === 'closed') throw new AppError(403, 'ACCOUNT_UNAVAILABLE', 'This account cannot perform this action');
      if (row.role !== claims.role) throw apiErrors.unauthenticated();
      request.auth = { userId: claims.sub, sessionId: claims.sessionId, role: claims.role, emailVerified: Boolean(row.email_verified_at), status: row.status };
      next();
    } catch (error) { next(error instanceof AppError ? error : apiErrors.unauthenticated()); }
  };
}

export function requireRoles(...roles: Role[]): RequestHandler {
  return (request, _response, next) => request.auth && roles.includes(request.auth.role) ? next() : next(apiErrors.forbidden());
}

export const requireClinicalAccess: RequestHandler = (request, _response, next) => {
  if (!request.auth) return next(apiErrors.unauthenticated());
  if (!request.auth.emailVerified) return next(new AppError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email before accessing clinical actions'));
  if (request.auth.role === 'doctor' && request.auth.status !== 'active') return next(new AppError(403, 'DOCTOR_NOT_VERIFIED', 'Doctor verification is required'));
  next();
};

export function requireOwner(param = 'id'): RequestHandler {
  return (request, _response, next) => request.auth?.userId === request.params[param] ? next() : next(apiErrors.privateNotFound());
}

export function requireAppointmentRelationship(pool: Pool, parameter = 'id'): RequestHandler {
  return async (request, _response, next) => {
    if (!request.auth) return next(apiErrors.unauthenticated());
    if (request.auth.role === 'admin') return next(apiErrors.privateNotFound());
    const column = request.auth.role === 'patient' ? 'patient_id' : 'doctor_id';
    const result = await pool.query(`SELECT 1 FROM appointments WHERE id=$1 AND ${column}=$2`, [request.params[parameter], request.auth.userId]);
    return result.rowCount ? next() : next(apiErrors.privateNotFound());
  };
}
