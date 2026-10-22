import 'server-only';
import { getPool } from '@newswiz/db';
import { PoliteFetcher } from '@newswiz/net';

// Keep one pool and one robots cache per server process (and across dev hot reloads).
const globals = globalThis as unknown as { __nwFetcher?: PoliteFetcher };

export const db = () => getPool();
export const fetcher = () => (globals.__nwFetcher ??= new PoliteFetcher());

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
