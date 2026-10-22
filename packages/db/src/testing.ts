import pg from 'pg';
import { loadRootEnv } from './env.ts';
import { migrate } from './migrate.ts';
import { closePool, setPool } from './pool.ts';

/**
 * A pool on TEST_DATABASE_URL with a freshly migrated, empty schema. The test database is
 * wiped every time, so it must never be the real one.
 */
export async function freshTestDb(): Promise<pg.Pool> {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  if (url === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  setPool(pool);
  return pool;
}

export async function closeTestDb(): Promise<void> {
  await closePool();
}

/** Insert a source and one feed; returns their ids. */
export async function makeSource(
  pool: pg.Pool,
  overrides: Partial<{ slug: string; access_model: string; bias_lean: string; ownership_type: string; feedUrl: string }> = {},
): Promise<{ sourceId: number; feedId: number }> {
  const slug = overrides.slug ?? `src-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sources (slug, name, homepage, ownership_type, access_model, bias_lean)
     VALUES ($1, $1, 'https://example.com', $2, $3, $4) RETURNING id`,
    [slug, overrides.ownership_type ?? 'commercial', overrides.access_model ?? 'free', overrides.bias_lean ?? 'unrated'],
  );
  const sourceId = rows[0]!.id;
  const feed = await pool.query<{ id: number }>(
    'INSERT INTO feeds (source_id, url) VALUES ($1, $2) RETURNING id',
    [sourceId, overrides.feedUrl ?? `https://example.com/${slug}/feed.xml`],
  );
  return { sourceId, feedId: feed.rows[0]!.id };
}
