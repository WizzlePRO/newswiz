import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Apply any migrations in packages/db/migrations that haven't run yet, each in its own transaction. */
/** Arbitrary constant for pg_advisory_lock, so two services deploying at once take turns. */
export const SETUP_LOCK_ID = 7_310_455;

export async function migrate(pool: pg.Pool, log: (msg: string) => void = () => {}): Promise<string[]> {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [SETUP_LOCK_ID]);
    return await migrateLocked(pool, log);
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [SETUP_LOCK_ID]).catch(() => {});
    lock.release();
  }
}

async function migrateLocked(pool: pg.Pool, log: (msg: string) => void): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(MIGRATIONS_DIR + file, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`applied ${file}`);
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
