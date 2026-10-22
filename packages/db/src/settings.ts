import type pg from 'pg';

export async function getSetting<T>(db: pg.Pool, key: string): Promise<T | undefined> {
  const { rows } = await db.query<{ value: T }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value;
}

export async function setSetting(db: pg.Pool, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
