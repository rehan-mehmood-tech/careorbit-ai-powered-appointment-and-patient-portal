import type { Pool, PoolClient } from 'pg';

export async function auditAuth(db: Pool | PoolClient, action: string, requestId: string, actorId?: string, metadata: Record<string, unknown> = {}, reason?: string): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, request_id, metadata, reason)
     VALUES ($1, $2, 'authentication', $1, $3, $4, $5)`,
    [actorId ?? null, action, requestId, metadata, reason ?? null],
  );
}
