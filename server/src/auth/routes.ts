import { createHash } from 'node:crypto';
import { Router, type RequestHandler, type Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { privacySafeClientKey } from '../logger.js';
import { createRateLimit } from '../rate-limits.js';
import { sendSuccess } from '../responses.js';
import { validate } from '../validation.js';
import { AuthService } from './service.js';
import { authenticate } from './middleware.js';
import { csrfForRefresh, verifyCsrfForRefresh } from './tokens.js';
import type { AuthenticatedRequest, Role } from './types.js';

const password = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const envelope = <T extends z.ZodType>(body: T) => z.object({ body, query: z.unknown(), params: z.record(z.string(), z.string()) });
const registration = envelope(z.object({ name: z.string().trim().min(2).max(120), email: z.email().max(320), password, accountType: z.enum(['patient','doctor']) }).strip());
const login = envelope(z.object({ email: z.email().max(320), password: z.string().min(1).max(128), expectedRole: z.enum(['patient','doctor','admin']).optional() }).strip());
const emailOnly = envelope(z.object({ email: z.email().max(320) }).strip());
const tokenPassword = envelope(z.object({ token: z.string().min(32).max(256), password }).strip());
const tokenOnly = envelope(z.object({ token: z.string().min(32).max(256) }).strip());
const passwordChange = envelope(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strip());

function values<T>(response: Response): T { return (response.locals.validated as { body: T }).body; }
const cookieBase = { secure: config.NODE_ENV === 'production', sameSite: 'strict' as const, domain: config.COOKIE_DOMAIN || undefined };
function setSessionCookies(response: Response, refresh: string): void {
  response.cookie('careorbit_refresh', refresh, { ...cookieBase, httpOnly: true, path: '/api/v1/auth', maxAge: config.REFRESH_TOKEN_DAYS * 86400000 });
  response.cookie('careorbit_csrf', csrfForRefresh(refresh), { ...cookieBase, httpOnly: false, path: '/', maxAge: config.REFRESH_TOKEN_DAYS * 86400000 });
}
function clearSessionCookies(response: Response): void {
  response.clearCookie('careorbit_refresh', { ...cookieBase, httpOnly: true, path: '/api/v1/auth' });
  response.clearCookie('careorbit_csrf', { ...cookieBase, httpOnly: false, path: '/' });
}

const requireCsrf: RequestHandler = (request, _response, next) => {
  const refresh = request.cookies?.careorbit_refresh as string | undefined;
  const header = request.header('x-csrf-token') ?? '';
  if (!refresh || !verifyCsrfForRefresh(header, refresh)) return next(new AppError(403, 'CSRF_VALIDATION_FAILED', 'CSRF validation failed'));
  next();
};

function credentialThrottle(pool: Pool, action: 'register'|'login'|'refresh'|'verify'|'reset', limit: number): RequestHandler {
  return async (request, _response, next) => {
    try {
      const identifier = String(request.body?.email ?? request.body?.token ?? request.cookies?.careorbit_refresh ?? request.ip ?? 'unknown').trim().toLowerCase();
      const hash = createHash('sha256').update(identifier).digest('hex');
      const count = await pool.query(`SELECT count(*)::int count FROM auth_throttle_events WHERE action=$1 AND identifier_hash=$2 AND occurred_at>now()-interval '15 minutes'`, [action,hash]);
      if (count.rows[0].count >= limit) return next(new AppError(429,'RATE_LIMITED','Too many requests'));
      await pool.query(`INSERT INTO auth_throttle_events(action,identifier_hash) VALUES($1,$2)`,[action,hash]); next();
    } catch(error){next(error);}
  };
}

export function createAuthRouter(pool: Pool): Router {
  const router=Router(); const service=new AuthService(pool);
  const ipLimit=createRateLimit({windowMs:15*60_000,limit:50},'auth-ip');
  router.use('/auth',ipLimit);
  router.post('/auth/register',credentialThrottle(pool,'register',5),validate(registration),async(request,response,next)=>{try{const user=await service.register(values(response),response.locals.requestId);sendSuccess(response,{user},201);}catch(e){next(e);}});
  router.post('/auth/login',credentialThrottle(pool,'login',10),validate(login),async(request,response,next)=>{try{const bundle=await service.login(values(response),{requestId:response.locals.requestId,userAgent:request.header('user-agent'),ipHash:privacySafeClientKey(request.ip??'unknown')});setSessionCookies(response,bundle.refreshToken);sendSuccess(response,{accessToken:bundle.accessToken,user:bundle.user});}catch(e){next(e);}});
  router.post('/auth/refresh',credentialThrottle(pool,'refresh',30),requireCsrf,async(request,response,next)=>{try{const bundle=await service.refresh(request.cookies.careorbit_refresh,response.locals.requestId);setSessionCookies(response,bundle.refreshToken);sendSuccess(response,{accessToken:bundle.accessToken,user:bundle.user});}catch(e){clearSessionCookies(response);next(e);}});
  router.post('/auth/logout',requireCsrf,authenticate(pool),async(request,response,next)=>{try{const auth=(request as AuthenticatedRequest).auth;await service.revokeSession(auth.userId,auth.sessionId,response.locals.requestId);clearSessionCookies(response);response.status(204).end();}catch(e){next(e);}});
  router.post('/auth/forgot-password',credentialThrottle(pool,'reset',5),validate(emailOnly),async(_request,response,next)=>{try{await service.requestReset(values<{email:string}>(response).email,response.locals.requestId);sendSuccess(response,{message:'If an eligible account exists, reset instructions will be sent.'});}catch(e){next(e);}});
  router.post('/auth/reset-password',credentialThrottle(pool,'reset',5),validate(tokenPassword),async(_request,response,next)=>{try{const body=values<{token:string;password:string}>(response);await service.resetPassword(body.token,body.password,response.locals.requestId);sendSuccess(response,{message:'Password reset complete.'});}catch(e){next(e);}});
  router.post('/auth/verify-email',credentialThrottle(pool,'verify',10),validate(tokenOnly),async(_request,response,next)=>{try{await service.verifyEmail(values<{token:string}>(response).token,response.locals.requestId);sendSuccess(response,{message:'Email verified.'});}catch(e){next(e);}});
  router.get('/me',authenticate(pool),async(request,response,next)=>{try{sendSuccess(response,{user:await service.currentUser((request as AuthenticatedRequest).auth.userId)});}catch(e){next(e);}});
  router.patch('/me/password',authenticate(pool),validate(passwordChange),async(request,response,next)=>{try{const auth=(request as AuthenticatedRequest).auth;const body=values<{currentPassword:string;newPassword:string}>(response);await service.changePassword(auth.userId,body.currentPassword,body.newPassword,auth.sessionId,response.locals.requestId);sendSuccess(response,{changed:true});}catch(e){next(e);}});
  router.get('/me/sessions',authenticate(pool),async(request,response,next)=>{try{const auth=(request as AuthenticatedRequest).auth;sendSuccess(response,{sessions:await service.sessions(auth.userId)});}catch(e){next(e);}});
  router.delete('/me/sessions/current',authenticate(pool),async(request,response,next)=>{try{const auth=(request as AuthenticatedRequest).auth;await service.revokeSession(auth.userId,auth.sessionId,response.locals.requestId);clearSessionCookies(response);response.status(204).end();}catch(e){next(e);}});
  router.delete('/me/sessions/others',authenticate(pool),async(request,response,next)=>{try{const auth=(request as AuthenticatedRequest).auth;await service.revokeOtherSessions(auth.userId,auth.sessionId,response.locals.requestId);response.status(204).end();}catch(e){next(e);}});
  router.delete('/me/sessions/:id',authenticate(pool),async(request,response,next)=>{try{const auth=(request as AuthenticatedRequest).auth;const target=z.uuid().parse(request.params.id);await service.revokeSession(auth.userId,target,response.locals.requestId,target===auth.sessionId?'user_logout':'user_revoked_session');if(target===auth.sessionId)clearSessionCookies(response);response.status(204).end();}catch(e){next(e);}});
  return router;
}
