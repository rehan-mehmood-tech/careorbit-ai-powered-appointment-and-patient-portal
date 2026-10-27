import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import express from 'express';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../app.js';
import { errorHandler } from '../errors.js';
import { AuthService, type SecurityMail } from './service.js';
import { requireAppointmentRelationship, requireOwner, requireRoles } from './middleware.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = Date.now().toString(36);
const password = 'StrongPassword42';
const sent: SecurityMail[] = [];
const service = new AuthService(pool, async mail => { sent.push(mail); });
const app = createApp(pool, { origins: ['http://127.0.0.1:3000'], defaultRateMax: 1000, authRateMax: 1000 });

before(async () => { await pool.query('SELECT 1'); });
after(async () => { await pool.end(); });

test('registration normalizes email, hashes password, rejects duplicate, and ignores forged role', async () => {
  const email=`Case-${suffix}@Example.COM`;
  const created=await service.register({name:'Phase Four Patient',email,password,accountType:'patient'},'test-register');
  assert.equal(created.email,email.toLowerCase()); assert.equal(created.role,'patient');
  const stored=await pool.query(`SELECT password_hash FROM users WHERE id=$1`,[created.id]);
  assert.notEqual(stored.rows[0].password_hash,password); assert.equal(await bcrypt.compare(password,stored.rows[0].password_hash),true);
  await assert.rejects(()=>service.register({name:'Duplicate Patient',email:`  ${email.toLowerCase()}  `,password,accountType:'patient'},'test-duplicate'),/already exists/);
  const forged=await request(app).post('/api/v1/auth/register').send({name:'Forged Role',email:`forged-${suffix}@example.com`,password,accountType:'patient',role:'admin'}).expect(201);
  assert.equal(forged.body.data.user.role,'patient');
  await request(app).post('/api/v1/auth/register/admin').send({name:'Admin',email:`admin-public-${suffix}@example.com`,password}).expect(404);
});

test('verification and reset tokens are single-use, expiring, and reset lookup is non-enumerating', async () => {
  const email=`tokens-${suffix}@example.com`; const created=await service.register({name:'Token Patient',email,password,accountType:'patient'},'test-tokens');
  const verification=sent.find(item=>item.kind==='verify-email'&&item.email===email)!;
  await service.verifyEmail(verification.token,'test-verify');
  await assert.rejects(()=>service.verifyEmail(verification.token,'test-reuse'),/invalid or expired/i);
  await service.requestReset(email,'test-reset-known'); await service.requestReset(`missing-${suffix}@example.com`,'test-reset-missing');
  const reset=[...sent].reverse().find((item:SecurityMail)=>item.kind==='reset-password'&&item.email===email)!;
  await service.resetPassword(reset.token,'DifferentPassword42','test-reset-complete');
  await assert.rejects(()=>service.resetPassword(reset.token,'ThirdPassword42','test-reset-reuse'),/invalid or expired/i);
  await pool.query(`INSERT INTO email_verification_tokens(user_id,token_hash,expires_at,created_at) VALUES($1,encode(digest('expired-token','sha256'),'hex'),now()-interval '1 minute',now()-interval '2 minutes')`,[created.id]);
  await assert.rejects(()=>service.verifyEmail('expired-token','test-expired'),/invalid or expired/i);
  const user=await pool.query(`SELECT email_verified_at FROM users WHERE id=$1`,[created.id]); assert.ok(user.rows[0].email_verified_at);
});

test('login, CSRF, rotation, reuse detection, logout invalidation, and suspension are enforced', async () => {
  const email=`session-${suffix}@example.com`; const created=await service.register({name:'Session Patient',email,password,accountType:'patient'},'test-session');
  await request(app).post('/api/v1/auth/login').send({email,password:'wrong'}).expect(401);
  const agent=request.agent(app); const login=await agent.post('/api/v1/auth/login').send({email,password,expectedRole:'patient'}).expect(200);
  const access=login.body.data.accessToken as string;
  await agent.post('/api/v1/auth/refresh').expect(403);
  const cookies=login.headers['set-cookie'] as unknown as string[];
  const oldRefresh=cookies.find(value=>value.startsWith('careorbit_refresh='))!.split(';')[0]!;
  const oldCsrf=decodeURIComponent(cookies.find(value=>value.startsWith('careorbit_csrf='))!.split(';')[0]!.split('=')[1]!);
  const rotated=await agent.post('/api/v1/auth/refresh').set('x-csrf-token',oldCsrf);
  assert.equal(rotated.status,200,JSON.stringify(rotated.body));
  assert.notEqual(rotated.body.data.accessToken,access);
  await request(app).post('/api/v1/auth/refresh').set('Cookie',oldRefresh).set('x-csrf-token',oldCsrf).expect(401);
  const currentCookies=rotated.headers['set-cookie'] as unknown as string[];
  const currentCsrf=decodeURIComponent(currentCookies.find(value=>value.startsWith('careorbit_csrf='))!.split(';')[0]!.split('=')[1]!);
  await agent.post('/api/v1/auth/refresh').set('x-csrf-token',currentCsrf).expect(401);
  const relogin=await agent.post('/api/v1/auth/login').send({email,password,expectedRole:'patient'}).expect(200);
  const logoutCsrf=decodeURIComponent((relogin.headers['set-cookie'] as unknown as string[]).find(value=>value.startsWith('careorbit_csrf='))!.split(';')[0]!.split('=')[1]!);
  await agent.post('/api/v1/auth/logout').set('authorization',`Bearer ${relogin.body.data.accessToken}`).set('x-csrf-token',logoutCsrf).expect(204);
  await request(app).get('/api/v1/me').set('authorization',`Bearer ${relogin.body.data.accessToken}`).expect(401);
  await pool.query(`UPDATE users SET status='suspended' WHERE id=$1`,[created.id]);
  await request(app).post('/api/v1/auth/login').send({email,password,expectedRole:'patient'}).expect(403);
  assert.equal((await pool.query(`SELECT count(*)::int count FROM users WHERE id=$1`,[created.id])).rows[0].count,1);
  await pool.query(`UPDATE users SET status='active' WHERE id=$1`,[created.id]);
  const expired=await service.login({email,password,expectedRole:'patient'},{requestId:'test-expired-session'});
  const expiredId=expired.refreshToken.split('.')[0];
  await pool.query(`UPDATE sessions SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1`,[expiredId]);
  await assert.rejects(()=>service.refresh(expired.refreshToken,'test-expired-refresh'));
});

test('password changes revoke other sessions while keeping the authenticated session', async()=>{
  const email=`password-${suffix}@example.com`;const created=await service.register({name:'Password Patient',email,password,accountType:'patient'},'test-password');
  const current=await service.login({email,password},{requestId:'test-current'});const other=await service.login({email,password},{requestId:'test-other'});
  const currentId=current.refreshToken.split('.')[0]!;const otherId=other.refreshToken.split('.')[0]!;
  await service.changePassword(created.id,password,'ChangedPassword42',currentId,'test-password-change');
  const sessions=await pool.query(`SELECT id,revoked_at FROM sessions WHERE id=ANY($1::uuid[])`,[[currentId,otherId]]);
  assert.equal(Boolean(sessions.rows.find(row=>row.id===currentId).revoked_at),false);
  assert.equal(Boolean(sessions.rows.find(row=>row.id===otherId).revoked_at),true);
  await assert.rejects(()=>service.login({email,password},{requestId:'old-password'}),/incorrect/i);
  await service.revokeSession(created.id,currentId,'test-current-revoke');
  await assert.rejects(()=>service.refresh(current.refreshToken,'test-revoked-refresh'));
});

test('RBAC matrix and tampered owner/relationship IDs fail closed', async () => {
  const roles=['patient','doctor','admin'] as const;
  for(const actual of roles)for(const required of roles){
    const mini=express();mini.use((req,res,next)=>{res.locals.requestId='rbac';req.auth={userId:'11111111-1111-4111-8111-111111111111',sessionId:'s',role:actual,emailVerified:true,status:'active'};next();});
    mini.get('/',requireRoles(required),(_req,res)=>res.json({ok:true}));mini.use(errorHandler);
    await request(mini).get('/').expect(actual===required?200:403);
  }
  const owner=express();owner.use((req,res,next)=>{res.locals.requestId='owner';req.auth={userId:'11111111-1111-4111-8111-111111111111',sessionId:'s',role:'patient',emailVerified:true,status:'active'};next();});owner.get('/:id',requireOwner(),(_req,res)=>res.json({ok:true}));owner.use(errorHandler);
  await request(owner).get('/22222222-2222-4222-8222-222222222222').expect(404);
  const relationshipPool={query:async()=>({rowCount:0,rows:[]})} as unknown as Pool;
  const relation=express();relation.use((req,res,next)=>{res.locals.requestId='relation';req.auth={userId:'11111111-1111-4111-8111-111111111111',sessionId:'s',role:'doctor',emailVerified:true,status:'active'};next();});relation.get('/:id',requireAppointmentRelationship(relationshipPool),(_req,res)=>res.json({ok:true}));relation.use(errorHandler);
  await request(relation).get('/99999999-9999-4999-8999-999999999999').expect(404);
});
