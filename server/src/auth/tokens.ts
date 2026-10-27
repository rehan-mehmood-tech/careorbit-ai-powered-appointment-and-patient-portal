import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT, decodeProtectedHeader } from 'jose';
import { config } from '../config.js';

export type AccessClaims = { sub: string; role: 'patient' | 'doctor' | 'admin'; sessionId: string; emailVerified: boolean };

const encodedKeys = new Map(config.jwtKeys.map((key) => [key.kid, new TextEncoder().encode(key.secret)]));

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const current = config.jwtKeys[0]!;
  return new SignJWT({ role: claims.role, sid: claims.sessionId, ev: claims.emailVerified })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: current.kid })
    .setSubject(claims.sub).setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE)
    .setIssuedAt().setExpirationTime(`${config.ACCESS_TOKEN_MINUTES}m`).sign(encodedKeys.get(current.kid)!);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const kid = decodeProtectedHeader(token).kid;
  const key = kid ? encodedKeys.get(kid) : undefined;
  if (!key) throw new Error('Unknown signing key');
  const { payload } = await jwtVerify(token, key, { issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, algorithms: ['HS256'] });
  if (!payload.sub || !payload.sid || !['patient', 'doctor', 'admin'].includes(String(payload.role))) throw new Error('Invalid access claims');
  return { sub: payload.sub, sessionId: String(payload.sid), role: payload.role as AccessClaims['role'], emailVerified: payload.ev === true };
}

export function randomToken(bytes = 32): string { return randomBytes(bytes).toString('base64url'); }
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function createRefreshCredential(sessionId: string): { raw: string; hash: string } {
  const secret = randomToken(48); return { raw: `${sessionId}.${secret}`, hash: hashToken(secret) };
}
export function parseRefreshCredential(raw: string): { sessionId: string; secretHash: string } | null {
  const separator = raw.indexOf('.');
  if (separator < 1) return null;
  return { sessionId: raw.slice(0, separator), secretHash: hashToken(raw.slice(separator + 1)) };
}
export function csrfForRefresh(refresh: string): string {
  return createHmac('sha256', config.jwtKeys[0]!.secret).update(`csrf:${refresh}`).digest('base64url');
}
export function verifyCsrfForRefresh(value: string, refresh: string): boolean {
  return config.jwtKeys.some(key => safeEqual(value, createHmac('sha256', key.secret).update(`csrf:${refresh}`).digest('base64url')));
}
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b);
}
