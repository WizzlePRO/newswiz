import { listSaved } from '@newswiz/db';
import { toClient } from '@/lib/briefing';
import { db } from '@/lib/server';

/** GET /api/saved: the reading list, in-progress first, finished last. */
export async function GET() {
  return Response.json({ items: (await listSaved(db())).map(toClient) });
}
