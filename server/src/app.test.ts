import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from './app.js';
import { errorHandler } from './errors.js';
import { requireInternalServiceAuth } from './security.js';

function pool(query: (text: string, values?: unknown[]) => Promise<unknown> = async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 })): Pool {
  return { query } as unknown as Pool;
}

const options = { origins: ['http://127.0.0.1:3000'], rateWindowMs: 60_000, defaultRateMax: 100, authRateMax: 2, enableTestRoutes: true };

test('success envelope propagates a safe request ID', async () => {
  const response = await request(createApp(pool(), options)).get('/api/v1').set('x-request-id', 'contract-request-1').expect(200);
  assert.equal(response.headers['x-request-id'], 'contract-request-1');
  assert.equal(response.body.meta.requestId, 'contract-request-1');
  assert.equal(response.body.data.version, 'v1');
});

test('invalid request IDs are replaced and unknown routes are privacy preserving', async () => {
  const response = await request(createApp(pool(), options)).get('/private/patient/secret').set('x-request-id', 'unsafe request id').expect(404);
  assert.match(String(response.headers['x-request-id']), /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(response.body.error).sort(), ['code', 'message', 'requestId']);
  assert.equal(response.body.error.message, 'The requested resource was not found');
  assert.doesNotMatch(JSON.stringify(response.body), /private|patient|secret/i);
});

test('validation errors use 422 envelope and pagination metadata is stable', async () => {
  const app = createApp(pool(), options);
  const invalid = await request(app).get('/api/v1/meta/pagination?page=0&pageSize=500').expect(422);
  assert.equal(invalid.body.error.code, 'VALIDATION_FAILED');
  assert.ok(Array.isArray(invalid.body.error.details));
  const valid = await request(app).get('/api/v1/meta/pagination?page=2&pageSize=25').expect(200);
  assert.deepEqual(valid.body.meta.pagination, { page: 2, pageSize: 25, total: 0, totalPages: 0 });
});

test('oversized JSON maps to 413 without echoing content', async () => {
  const response = await request(createApp(pool(), { ...options, bodyLimit: '1kb' })).post('/api/v1/anything').send({ value: 'x'.repeat(2048) }).expect(413);
  assert.equal(response.body.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(JSON.stringify(response.body).includes('xxxx'), false);
});

test('sensitive route rate policy returns a 429 error envelope', async () => {
  const app = createApp(pool(), options);
  await request(app).post('/api/v1/_contract/auth-rate-limit').expect(200);
  await request(app).post('/api/v1/_contract/auth-rate-limit').expect(200);
  const limited = await request(app).post('/api/v1/_contract/auth-rate-limit').expect(429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.ok(limited.body.error.requestId);
});

test('dependency failures degrade readiness to 503 without leaking details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('provider-secret-and-host'); };
  try {
    const response = await request(createApp(pool(async () => { throw new Error('postgres-password'); }), options)).get('/health/ready').expect(503);
    assert.equal(response.body.status, 'not_ready');
    assert.equal(response.body.checks.database.detail, 'Unavailable');
    assert.equal(response.body.checks.aiService.detail, 'Unavailable');
    assert.doesNotMatch(JSON.stringify(response.body), /password|secret|provider/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('database conflicts map to 409 with no internal database detail', async () => {
  const app = express();
  app.use((_request, _response, next) => next(Object.assign(new Error('sensitive constraint name'), { code: '23P01' })));
  app.use(errorHandler);
  const response = await request(app).get('/').expect(409);
  assert.equal(response.body.error.code, 'RESOURCE_CONFLICT');
  assert.doesNotMatch(JSON.stringify(response.body), /constraint|sensitive/i);
});

test('internal service authentication requires a constant-time bearer credential', async () => {
  const app = express();
  app.use((request, response, next) => { response.locals.requestId = 'service-auth-test'; next(); });
  app.get('/internal', requireInternalServiceAuth('a'.repeat(32)), (_request, response) => response.json({ ok: true }));
  app.use(errorHandler);
  const denied = await request(app).get('/internal').expect(401);
  assert.equal(denied.body.error.code, 'SERVICE_UNAUTHENTICATED');
  await request(app).get('/internal').set('authorization', `Bearer ${'a'.repeat(32)}`).expect(200);
});

test('OpenAPI publishes the versioned R1 contract surface', async () => {
  const response = await request(createApp(pool(), options)).get('/api/openapi.json').expect(200);
  assert.equal(response.body.openapi, '3.1.0');
  assert.ok(response.body.paths['/appointments/{id}/reschedule']);
  assert.ok(response.body.paths['/documents/{id}/grants']);
  assert.ok(response.body.paths['/admin/audit-events']);
  assert.equal(response.body.servers[0].url, '/api/v1');
});
