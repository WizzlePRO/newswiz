import { finishCycle } from '@newswiz/db';
import { db } from '@/lib/server';

/** "I'm caught up": start a new news cycle from now. */
export async function POST() {
  await finishCycle(db());
  return Response.json({ ok: true });
}
