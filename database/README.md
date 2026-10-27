# CareOrbit database

The database layer uses `node-postgres` for parameterized TypeScript queries and transactions, and `node-pg-migrate` for reversible SQL-first migrations. PostgreSQL-specific integrity features—GiST exclusion constraints, generated ranges, immutable triggers, and partial indexes—remain explicit in migrations.

## Local workflow

Start PostgreSQL from the repository root:

```powershell
npm.cmd run infra:up
```

Apply migrations, load deterministic synthetic data, and run database integrity checks:

```powershell
npm.cmd run db:setup
```

Individual commands:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:verify
npm.cmd run db:rollback
```

`db:rollback` reverts one migration. In a disposable database, run it twice to remove both Phase 2 migrations, then rerun `db:migrate` to verify forward recovery. Never roll back a production migration without a reviewed data-preservation plan and backup.

## Deployment procedure

1. Back up the target database and confirm restore readiness.
2. Run migrations with a dedicated migration role based on `roles.example.sql`.
3. Run application processes with the least-privilege application role.
4. Apply migrations before starting code that requires the new schema.
5. Run `db:verify` against staging; use only synthetic data outside approved environments.
6. Prefer a corrective forward migration in production. Use `down` only when its data-loss implications have been explicitly reviewed.

The seed is deterministic and idempotent. It uses fixed UUIDs and fictional CareOrbit identities; it must never contain real patient data.
