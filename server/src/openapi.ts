const r1Contracts: Record<string, string[]> = {
  '/auth/register': ['post'], '/auth/login': ['post'], '/auth/logout': ['post'], '/auth/refresh': ['post'], '/auth/verify-email': ['post'], '/auth/forgot-password': ['post'], '/auth/reset-password': ['post'],
  '/me': ['get', 'patch'], '/me/password': ['patch'], '/me/sessions': ['get'], '/me/sessions/{id}': ['delete'], '/me/notification-preferences': ['get', 'patch'],
  '/doctors': ['get'], '/doctors/{id}': ['get'], '/doctors/{id}/slots': ['get'], '/specialties': ['get'],
  '/appointments': ['get', 'post'], '/appointments/{id}': ['get'], '/appointments/{id}/cancel': ['post'], '/appointments/{id}/reschedule': ['post'], '/appointments/{id}/confirm': ['post'], '/appointments/{id}/decline': ['post'], '/appointments/{id}/complete': ['post'], '/appointments/{id}/no-show': ['post'], '/appointments/{id}/encounter': ['get'],
  '/doctor/dashboard': ['get'], '/doctor/profile': ['get', 'patch'], '/doctor/availability': ['get', 'post'], '/doctor/availability/{id}': ['patch', 'delete'], '/doctor/availability/exceptions': ['post'],
  '/documents': ['get', 'post'], '/documents/{id}': ['get', 'delete'], '/documents/{id}/download-url': ['post'], '/documents/{id}/grants': ['post'], '/documents/{id}/grants/{grantId}': ['delete'], '/documents/{id}/summaries': ['post'], '/summaries/{id}': ['get'],
  '/encounters/{id}/notes': ['post', 'patch'], '/notes/{id}/finalize': ['post'], '/notes/{id}/amend': ['post'],
  '/conversations': ['get'], '/conversations/{id}/messages': ['get', 'post'], '/conversations/{id}/read': ['post'],
  '/notifications': ['get'], '/notifications/{id}/read': ['post'],
  '/admin/dashboard': ['get'], '/admin/patients': ['get'], '/admin/doctors': ['get'], '/admin/doctors/{id}/verification': ['post'], '/admin/users/{id}/status': ['post'], '/admin/appointments': ['get'], '/admin/reports': ['get'], '/admin/audit-events': ['get'], '/admin/jobs': ['get'], '/admin/specialties': ['get', 'post'], '/admin/specialties/{id}': ['patch', 'delete'], '/admin/clinics': ['get', 'post'], '/admin/clinics/{id}': ['patch', 'delete'], '/admin/settings': ['get', 'patch'],
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'CareOrbit R1 API', version: '1.0.0', description: 'Contract surface only; implementation status is tracked independently in phases.md.' },
  servers: [{ url: '/api/v1' }],
  paths: Object.fromEntries(Object.entries(r1Contracts).map(([path, methods]) => [path, Object.fromEntries(methods.map((method) => [method, {
      operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
      responses: {
        200: { description: 'Successful response', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } },
        401: { $ref: '#/components/responses/Unauthenticated' },
        422: { $ref: '#/components/responses/ValidationFailed' },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    }]))])),
  components: {
    schemas: {
      SuccessEnvelope: { type: 'object', required: ['data', 'meta'], properties: { data: {}, meta: { type: 'object', required: ['requestId'], properties: { requestId: { type: 'string', format: 'uuid' }, pagination: { $ref: '#/components/schemas/Pagination' } } } } },
      Pagination: { type: 'object', required: ['page', 'pageSize', 'total', 'totalPages'], properties: { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 }, total: { type: 'integer', minimum: 0 }, totalPages: { type: 'integer', minimum: 0 } } },
      ErrorEnvelope: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message', 'requestId'], properties: { code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' }, details: {} } } } },
    },
    responses: Object.fromEntries([
      ['Unauthenticated', 401, 'UNAUTHENTICATED'], ['ValidationFailed', 422, 'VALIDATION_FAILED'], ['RateLimited', 429, 'RATE_LIMITED'],
    ].map(([name, status, code]) => [name, { description: String(code), content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' }, example: { error: { code, message: String(code), requestId: '00000000-0000-4000-8000-000000000000' } } } } }])),
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, idempotencyKey: { type: 'apiKey', in: 'header', name: 'Idempotency-Key' } },
  },
};
