import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export async function parameterizedQuery<T extends QueryResultRow>(pool: Pool, text: string, values: readonly unknown[] = []): Promise<QueryResult<T>> {
  return pool.query<T>(text, [...values]);
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>, isolation: IsolationLevel = 'READ COMMITTED'): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
