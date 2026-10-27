import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export type Database = Pool;
export type Transaction = PoolClient;

export function createDatabasePool(connectionString = process.env.DATABASE_URL): Database {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const maximum = Number(process.env.DATABASE_POOL_MAX ?? 10);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 50) throw new Error('DATABASE_POOL_MAX must be between 1 and 50');
  const options: PoolConfig = {
    connectionString,
    max: maximum,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  };
  return new Pool(options);
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  database: Database | Transaction,
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return database.query<Row>(text, [...values]);
}

export async function withTransaction<T>(
  database: Database,
  action: (transaction: Transaction) => Promise<T>,
  isolation: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' = 'READ COMMITTED',
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
