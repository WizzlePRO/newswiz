import pg from 'pg';
import { loadRootEnv } from './env.ts';

// Return timestamptz as Date and bigint ids as numbers (article ids stay well below 2^53).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) loadRootEnv();
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set (see .env.example)');
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

/** Point the shared pool at a different database (used by tests). */
export function setPool(next: pg.Pool): void {
  pool = next;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export type Queryable = pg.Pool | pg.PoolClient;
