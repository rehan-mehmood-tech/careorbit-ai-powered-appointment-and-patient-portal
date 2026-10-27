# CareOrbit Express API

The Express service is the trusted public API boundary. Public contracts live under `/api/v1`; `/health/live`, `/health/ready`, and `/api/openapi.json` are deliberately outside the versioned business surface.

## Commands

```powershell
npm.cmd run typecheck --workspace @careorbit/server
npm.cmd test --workspace @careorbit/server
npm.cmd run dev:server
```

## Response contracts

Successful single-resource responses use `{ data, meta: { requestId } }`. Collections also include `meta.pagination` with `page`, `pageSize`, `total`, and `totalPages`. Errors use `{ error: { code, message, requestId, details? } }` and never include stack traces or database/provider messages.

Validation is `422`, conflicts are `409`, missing authentication is `401`, authorization is `403` (or privacy-preserving `404`), oversized payloads are `413`, and throttling is `429`.

## Request safety

- All database access uses positional parameters; multi-step writes use `withTransaction`.
- Mutation clients may send `Idempotency-Key` (8–128 safe characters). Records expire after 24 hours.
- Idempotency responses are constrained by PostgreSQL to reject clinical, document, note, and chat body fields.
- Logs contain request IDs, route templates, status, duration, and hashed abuse fingerprints only.
- `REQUIRE_TLS=true` is required behind a correctly configured production proxy; set `TRUST_PROXY` to the exact proxy hop count.
- Internal calls use a constant-time verified Bearer credential. The outbound AI client sets both Bearer and compatibility headers until the FastAPI contract is migrated.

OpenAPI describes the R1 surface but does not imply that later-phase business handlers are implemented.

## Authentication

Access JWTs are short lived and kept in browser memory. Refresh credentials are opaque, hashed in PostgreSQL, rotated on every use, and delivered only through an HttpOnly `SameSite=Strict` cookie. A readable CSRF cookie is cryptographically bound to the refresh credential and must match `X-CSRF-Token` on refresh/logout.

`JWT_SIGNING_KEYS` is an ordered comma-separated key ring (`kid:secret`). Put the new signing key first while retaining prior verification keys through the maximum access-token and refresh/CSRF transition window. Production startup rejects local-development key names.

Public registration accepts only `patient` or `doctor`; administrator provisioning has no public endpoint. Authorization middleware rechecks session revocation, account status, server-owned roles, email verification, ownership, and appointment relationship as appropriate.
