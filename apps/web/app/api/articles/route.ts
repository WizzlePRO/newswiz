import { listArticles } from '@newswiz/db';
import { db } from '@/lib/server';

/** JSON feed for other clients: GET /api/articles?free=1&unread=1&source=slug&limit=50 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const articles = await listArticles(db(), {
    limit: Number(sp.get('limit') ?? 50) || 50,
    freeOnly: sp.get('free') === '1',
    unreadOnly: sp.get('unread') === '1',
    sourceSlug: sp.get('source') ?? undefined,
  });
  return Response.json({ articles });
}
