# CareOrbit

CareOrbit is a responsive healthcare appointment and patient portal built as a multi-service TypeScript/Python application. The current R1 foundation includes JWT authentication, RBAC, verified-provider discovery, timezone-safe scheduling, transactional appointments, patient profile/history workflows, and an encrypted medical-document pipeline.

> CareOrbit is not an emergency service, certified medical device, or production clinical system. Jurisdiction, retention rules, clinical governance, incident response, vendor agreements, and compliance controls must be approved before processing real patient data.

## Architecture

| Service | Technology | Default port | Responsibility |
| --- | --- | ---: | --- |
| `client/` | React, Vite, TypeScript | 3000 | Responsive patient, doctor, and administrator interfaces |
| `server/` | Express, TypeScript | 3001 | REST API, JWT sessions, RBAC, scheduling, appointments, profiles, documents |
| `ai-service/` | FastAPI, Python | 8000 | Isolated AI/intake workflows with service authentication |
| `worker/` | Node.js, TypeScript | 3002 | Durable background-job processing and health checks |
| `database/` | PostgreSQL migrations | 5432 | Relational schema, constraints, seeds, and integrity verification |
| MinIO | S3-compatible private storage | 9000 | Private encrypted medical-document objects |

PostgreSQL exclusion constraints prevent doctor and patient double-booking. Medical files use non-guessable keys, encrypted quarantine, server-side validation, malware-signature checks, clean-object promotion, short-lived download capabilities, and authorization revalidation after grant revocation.

## Implemented R1 capabilities

- Patient and doctor registration, email verification, password reset, short-lived access JWTs, rotating refresh sessions, CSRF protection, session revocation, suspension enforcement, and server-side RBAC.
- Persisted patient/doctor profiles, doctor verification workflows, clinics, specialties, languages, and administrative review.
- Verified-provider discovery with filters, pagination, real availability, fee/experience sorting, and public-field allowlists.
- DST-safe weekly availability, exceptions, buffers, booking horizons, minimum notice, overlap prevention, and affected-booking resolution.
- Idempotent appointment booking, strict state transitions, append-only events, cancellation, expiry, and atomic rescheduling.
- Patient dashboard, appointments, visit history with deliberately published summaries, preferences, sessions, and retention-aware data requests.
- Secure PDF/JPEG/PNG uploads with size, MIME, signature, polyglot, encryption, readability, malware, and page-limit checks.
- Purpose-bound document grants, expiry/revocation, protected preview/download, appointment association, and secure attachment registration without automatic AI processing.

## Prerequisites

- Node.js 22.12–24 and npm
- Python 3.11–3.13
- PostgreSQL 17, or Docker Desktop/Engine with Compose
- MinIO or another private S3-compatible service for deployed document storage

Version hints are provided in `.nvmrc` and `.python-version`.

## Local setup

1. Create ignored environment files from the checked-in templates:

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env.local
Copy-Item ai-service/.env.example ai-service/.env
Copy-Item database/.env.example database/.env
```

Generate unique development secrets; never reuse example values or expose server secrets through `VITE_*` variables. The browser may contain only intentionally public configuration such as the API origin and Firebase web configuration.

2. Install dependencies:

```powershell
npm.cmd ci
npm.cmd run ai:install
```

3. Start PostgreSQL, Redis, and private MinIO storage:

```powershell
npm.cmd run infra:up
```

The Compose configuration requires explicit `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, and `S3_BUCKET` values from the ignored root `.env`.

4. Apply migrations and deterministic synthetic seeds:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:verify
```

5. Start all services:

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:3000`. Health endpoints are available at `/health/live` and `/health/ready` for Express, FastAPI, and the worker.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run test --workspaces --if-present
npm.cmd run db:verify
npm.cmd run build
npm.cmd audit --omit=dev
```

Focused backend suites are also available:

```powershell
npm.cmd run test:auth --workspace server
npm.cmd run test:profiles --workspace server
npm.cmd run test:discovery --workspace server
npm.cmd run test:scheduling --workspace server
npm.cmd run test:appointments --workspace server
npm.cmd run test:patient --workspace server
npm.cmd run test:documents --workspace server
```

The repository currently has no dedicated lint script; TypeScript strict checks, Python compilation/tests, contract tests, database verification, and production builds are the enforced checks until ESLint/Ruff are added.

## Deployment

### Client (Vercel or static host)

- Root directory: `client`
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` to the public HTTPS Express origin.
- Never define database, JWT, S3 secret, AI-provider, or service-account credentials with a `VITE_` prefix.

### Express and worker (Render or container host)

- Use Node.js 22 LTS.
- Install with `npm ci --omit=dev` after building in a separate build stage.
- Build with `npm run build --workspace @careorbit/server` and start with `npm run start --workspace @careorbit/server`.
- Run the worker as a separate persistent service.
- Set `NODE_ENV=production`, require HTTPS/proxy headers, use unique JWT/document/service secrets, and restrict CORS to deployed client origins.
- Run migrations as a one-off release command before serving traffic.

### Database and storage

- Use managed PostgreSQL with TLS, backups, point-in-time recovery, separate migrator/application roles, and least privilege.
- Use a private S3-compatible bucket with public access blocked, versioning, lifecycle policies, restricted service credentials, and encryption enabled.
- Do not mount development `.runtime`, `.pgdata`, or MinIO volumes into source-control or immutable application images.

### AI service

- Deploy separately from the public API and require the internal service bearer credential.
- Store provider keys in the platform secret manager.
- Restrict outbound providers and retain no clinical prompts or responses in general application logs.

## Security notes

- `.env`, `.env.local`, nested environment files, service-account files, private keys, local databases, storage volumes, logs, caches, and `phases.md` are ignored.
- Environment examples contain placeholders only.
- Production startup rejects local/placeholder signing and storage secrets.
- A previously present Groq-looking credential was removed from `ai-service/.env.example`; it must be revoked at the provider because Git history or prior clones may still contain it.
- Run a history-aware scanner such as Gitleaks before publishing and purge exposed credentials from history where required. Rotation remains mandatory even after history rewriting.

## Future Improvements & Extended Roadmap

Upcoming roadmap areas include:

- Source-grounded AI document extraction and summarization with explicit consent, structured validation, citations, review, and withdrawal handling.
- Doctor clinical workspace, finalized encounter notes, versioning, amendments, and deliberately published patient summaries.
- Persistent Socket.IO messaging, delivery/read receipts, relationship-aware rooms, and secure attachment selection.
- Durable worker orchestration for malware scans, extraction, AI jobs, notifications, retries, expiry, cleanup, and dead-letter handling.
- Notification preference enforcement and production email/SMS/push delivery providers.
- Administrative reporting, audit review, job operations, and privacy-preserving analytics.
- Accessibility, localization, observability, disaster recovery, performance testing, and formal security/compliance hardening.
- R2 intelligent appointment clarification and assisted doctor suggestions.
- R3 provider-hosted payments, external calendar synchronization, video consultations, and jurisdiction-controlled digital prescriptions.

`phases.md` is intentionally local-only and ignored because it is an execution tracker rather than a deployment artifact.
