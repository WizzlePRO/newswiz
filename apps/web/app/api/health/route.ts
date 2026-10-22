import { db } from '@/lib/server';

export async function GET() {
  try {
    const { rows } = await db().query<{ articles: number; newest: Date | null }>(
      'SELECT count(*)::int AS articles, max(first_seen_at) AS newest FROM articles',
    );
    return Response.json({ ok: true, ...rows[0] });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
