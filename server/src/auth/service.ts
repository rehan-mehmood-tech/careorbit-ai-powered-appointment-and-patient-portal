import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { Pool } from 'pg';
import { config } from '../config.js';
import { withTransaction } from '../database.js';
import { AppError, apiErrors } from '../errors.js';
import { auditAuth } from './audit.js';
import { createRefreshCredential, hashToken, parseRefreshCredential, randomToken, safeEqual, signAccessToken } from './tokens.js';
import type { Role } from './types.js';

export type SecurityMail = { kind: 'verify-email' | 'reset-password'; email: string; token: string };
export type SecurityMailer = (mail: SecurityMail) => Promise<void>;
export type PublicUser = { id: string; email: string; role: Role; status: string; name: string; emailVerified: boolean; onboardingState: string };
export type SessionBundle = { accessToken: string; refreshToken: string; user: PublicUser };

const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.6p4SRaEyJJvzeL.NtV5q1qU6SAvvOHi';
const normalizeEmail = (email: string) => email.trim().toLowerCase();

function publicUser(row: Record<string, unknown>): PublicUser {
  const role = row.role as Role;
  const profileComplete = role === 'patient' ? Boolean(row.phone && row.date_of_birth) : row.verification_status !== 'not_submitted';
  const onboardingState = profileComplete ? (role === 'doctor' ? String(row.verification_status) : 'complete') : 'profile_required';
  return { id: String(row.id), email: String(row.email), role, status: String(row.status), name: String(row.display_name ?? 'CareOrbit member'), emailVerified: Boolean(row.email_verified_at), onboardingState };
}

const userProjection = `SELECT u.id,u.email,u.role,u.status,u.email_verified_at,
  COALESCE(pp.display_name,dp.display_name) display_name,pp.phone,pp.date_of_birth,dp.verification_status
  FROM users u LEFT JOIN patient_profiles pp ON pp.user_id=u.id LEFT JOIN doctor_profiles dp ON dp.user_id=u.id`;

export class AuthService {
  constructor(private readonly pool: Pool, private readonly mailer: SecurityMailer = async () => undefined) {}

  async register(input: { name: string; email: string; password: string; accountType: 'patient' | 'doctor' }, requestId: string): Promise<PublicUser> {
    const email = normalizeEmail(input.email); const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
    const verificationToken = randomToken();
    try {
      const user = await withTransaction(this.pool, async (client) => {
        const inserted = await client.query(`INSERT INTO users(email,password_hash,role,status) VALUES($1,$2,$3,$4) RETURNING id,email,role,status,email_verified_at`, [email, passwordHash, input.accountType, input.accountType === 'doctor' ? 'pending' : 'active']);
        const row = inserted.rows[0];
        if (input.accountType === 'patient') await client.query(`INSERT INTO patient_profiles(user_id,display_name) VALUES($1,$2)`, [row.id, input.name.trim()]);
        else await client.query(`INSERT INTO doctor_profiles(user_id,display_name) VALUES($1,$2)`, [row.id, input.name.trim()]);
        await client.query(`INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+($3 || ' minutes')::interval)`, [row.id, hashToken(verificationToken), config.AUTH_TOKEN_TTL_MINUTES]);
        await auditAuth(client, 'auth.registration_succeeded', requestId, row.id, { role: input.accountType });
        return publicUser({ ...row, display_name: input.name.trim(), verification_status: 'not_submitted' });
      });
      await this.mailer({ kind: 'verify-email', email, token: verificationToken });
      return user;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email already exists');
      throw error;
    }
  }

  async login(input: { email: string; password: string; expectedRole?: Role }, context: { requestId: string; userAgent?: string; ipHash?: string }): Promise<SessionBundle> {
    const result = await this.pool.query(`${userProjection} WHERE u.email_normalized=$1`, [normalizeEmail(input.email)]);
    const row = result.rows[0];
    let authenticated = false;
    if (row) {
      const password = await this.pool.query(`SELECT password_hash FROM users WHERE id=$1`, [row.id]);
      authenticated = await bcrypt.compare(input.password, password.rows[0].password_hash);
    } else await bcrypt.compare(input.password, dummyHash).catch(() => undefined);
    if (!row || !authenticated || (input.expectedRole && input.expectedRole !== row.role)) {
      await auditAuth(this.pool, 'auth.login_failed', context.requestId, undefined, { reasonCode: 'invalid_credentials' });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    if (row.status === 'suspended' || row.status === 'closed') {
      await auditAuth(this.pool, 'auth.login_blocked', context.requestId, row.id, { reasonCode: 'account_unavailable' });
      throw new AppError(403, 'ACCOUNT_UNAVAILABLE', 'This account cannot start a session');
    }
    return withTransaction(this.pool, async (client) => {
      const sessionId = randomUUID(); const familyId = randomUUID(); const credential = createRefreshCredential(sessionId);
      await client.query(`INSERT INTO sessions(id,user_id,refresh_token_hash,family_id,user_agent,ip_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+($7 || ' days')::interval)`, [sessionId, row.id, credential.hash, familyId, context.userAgent?.slice(0, 500), context.ipHash, config.REFRESH_TOKEN_DAYS]);
      await client.query(`UPDATE users SET last_login_at=now() WHERE id=$1`, [row.id]);
      await auditAuth(client, 'auth.login_succeeded', context.requestId, row.id, { sessionId });
      return { accessToken: await signAccessToken({ sub: row.id, role: row.role, sessionId, emailVerified: Boolean(row.email_verified_at) }), refreshToken: credential.raw, user: publicUser(row) };
    });
  }

  async refresh(raw: string, requestId: string): Promise<SessionBundle> {
    const parsed = parseRefreshCredential(raw); if (!parsed) throw apiErrors.unauthenticated();
    const outcome = await withTransaction(this.pool, async (client): Promise<SessionBundle | { reuseDetected: true }> => {
      const result = await client.query(`SELECT u.id,u.email,u.role,u.status,u.email_verified_at,
        COALESCE(pp.display_name,dp.display_name) display_name,pp.phone,pp.date_of_birth,dp.verification_status,
        s.id source_session_id,s.refresh_token_hash,s.family_id,s.rotated_at,s.revoked_at,s.expires_at,s.user_agent,s.ip_hash
        FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN patient_profiles pp ON pp.user_id=u.id
        LEFT JOIN doctor_profiles dp ON dp.user_id=u.id WHERE s.id=$1 FOR UPDATE OF s`, [parsed.sessionId]);
      const row = result.rows[0];
      if (!row || !safeEqual(parsed.secretHash, row.refresh_token_hash)) throw apiErrors.unauthenticated();
      if (row.rotated_at || row.revoked_at) {
        await client.query(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),revocation_reason='refresh_reuse' WHERE family_id=$1 AND revoked_at IS NULL`, [row.family_id]);
        await auditAuth(client, 'auth.refresh_reuse_detected', requestId, row.id, { familyRevoked: true });
        return { reuseDetected: true };
      }
      if (new Date(row.expires_at) <= new Date() || ['suspended', 'closed'].includes(row.status)) throw apiErrors.unauthenticated();
      const sessionId = randomUUID(); const credential = createRefreshCredential(sessionId);
      await client.query(`INSERT INTO sessions(id,user_id,refresh_token_hash,family_id,parent_session_id,user_agent,ip_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [sessionId, row.id, credential.hash, row.family_id, row.source_session_id, row.user_agent, row.ip_hash, row.expires_at]);
      await client.query(`UPDATE sessions SET rotated_at=now(),replaced_by_session_id=$2,last_used_at=now() WHERE id=$1`, [row.source_session_id, sessionId]);
      await auditAuth(client, 'auth.refresh_rotated', requestId, row.id, { sessionId });
      return { accessToken: await signAccessToken({ sub: row.id, role: row.role, sessionId, emailVerified: Boolean(row.email_verified_at) }), refreshToken: credential.raw, user: publicUser(row) };
    });
    if ('reuseDetected' in outcome) throw new AppError(401, 'REFRESH_REUSE_DETECTED', 'Session family has been revoked');
    return outcome;
  }

  async revokeSession(userId: string, sessionId: string, requestId: string, reason = 'user_logout'): Promise<void> {
    await this.pool.query(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),revocation_reason=COALESCE(revocation_reason,$3) WHERE id=$1 AND user_id=$2`, [sessionId, userId, reason]);
    await auditAuth(this.pool, 'auth.session_revoked', requestId, userId, { current: reason === 'user_logout' });
  }

  async revokeOtherSessions(userId: string, currentSessionId: string, requestId: string): Promise<void> {
    await this.pool.query(`UPDATE sessions SET revoked_at=now(),revocation_reason='revoke_others' WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`, [userId, currentSessionId]);
    await auditAuth(this.pool, 'auth.other_sessions_revoked', requestId, userId);
  }

  async requestReset(emailInput: string, requestId: string): Promise<void> {
    const email = normalizeEmail(emailInput); const result = await this.pool.query(`SELECT id,email FROM users WHERE email_normalized=$1 AND status NOT IN ('closed')`, [email]); const row = result.rows[0];
    if (row) {
      const token = randomToken();
      await this.pool.query(`UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`, [row.id]);
      await this.pool.query(`INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+($3 || ' minutes')::interval)`, [row.id, hashToken(token), config.AUTH_TOKEN_TTL_MINUTES]);
      await this.mailer({ kind: 'reset-password', email: row.email, token });
    }
    await auditAuth(this.pool, 'auth.password_reset_requested', requestId, row?.id);
  }

  async resetPassword(token: string, password: string, requestId: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    await withTransaction(this.pool, async (client) => {
      const result = await client.query(`SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`, [hashToken(token)]); const row=result.rows[0];
      if (!row) throw new AppError(422, 'INVALID_OR_EXPIRED_TOKEN', 'Token is invalid or expired');
      await client.query(`UPDATE password_reset_tokens SET used_at=now() WHERE id=$1`, [row.id]);
      await client.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [row.user_id,passwordHash]);
      await client.query(`UPDATE sessions SET revoked_at=now(),revocation_reason='password_reset' WHERE user_id=$1 AND revoked_at IS NULL`, [row.user_id]);
      await auditAuth(client,'auth.password_reset_completed',requestId,row.user_id);
    });
  }

  async verifyEmail(token: string, requestId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const result=await client.query(`SELECT id,user_id FROM email_verification_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[hashToken(token)]); const row=result.rows[0];
      if(!row) throw new AppError(422,'INVALID_OR_EXPIRED_TOKEN','Token is invalid or expired');
      await client.query(`UPDATE email_verification_tokens SET used_at=now() WHERE id=$1`,[row.id]);
      await client.query(`UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1`,[row.user_id]);
      await auditAuth(client,'auth.email_verified',requestId,row.user_id);
    });
  }

  async changePassword(userId:string,current:string,next:string,currentSessionId:string,requestId:string):Promise<void>{
    const result=await this.pool.query(`SELECT password_hash FROM users WHERE id=$1`,[userId]);
    if(!result.rows[0]||!await bcrypt.compare(current,result.rows[0].password_hash)) throw new AppError(401,'INVALID_CREDENTIALS','Current password is incorrect');
    const hash=await bcrypt.hash(next,config.BCRYPT_ROUNDS);
    await withTransaction(this.pool,async(client)=>{await client.query(`UPDATE users SET password_hash=$2 WHERE id=$1`,[userId,hash]);await client.query(`UPDATE sessions SET revoked_at=now(),revocation_reason='password_change' WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`,[userId,currentSessionId]);await auditAuth(client,'auth.password_changed',requestId,userId);});
  }

  async currentUser(userId:string):Promise<PublicUser>{const result=await this.pool.query(`${userProjection} WHERE u.id=$1`,[userId]);if(!result.rows[0])throw apiErrors.unauthenticated();return publicUser(result.rows[0]);}
  async sessions(userId:string){const result=await this.pool.query(`SELECT id,created_at,last_used_at,expires_at,revoked_at,user_agent FROM sessions WHERE user_id=$1 ORDER BY created_at DESC`,[userId]);return result.rows;}
}
