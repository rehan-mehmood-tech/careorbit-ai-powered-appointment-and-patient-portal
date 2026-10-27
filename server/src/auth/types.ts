import type { Request } from 'express';

export type Role = 'patient' | 'doctor' | 'admin';
export type AuthPrincipal = { userId: string; sessionId: string; role: Role; emailVerified: boolean; status: string; doctorVerificationStatus?: string };
export type AuthenticatedRequest = Request & { auth: AuthPrincipal };

declare global {
  namespace Express {
    interface Request { auth?: AuthPrincipal }
  }
}
