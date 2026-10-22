import { BIAS_LEANS, listArticles } from '@newswiz/db';
import type { BiasLean } from '@newswiz/db';
import { toClient } from '@/lib/briefing';
import { db } from '@/lib/server';

/**
 * GET /api/articles: newest first. Query: free=1, unread=1, source=slug, lean=left|lean_left|...,
 * limit (max 200), before=<sort_at ms>_<id> for the next page (returned as next_before).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lean = sp.get('lean') as BiasLean | null;
  const [ts, id] = (sp.get('before') ?? '').split('_');
  const before = ts && Number(id) > 0 ? { sortAt: new Date(Number(ts)), id: Number(id) } : undefined;
  const articles = await listArticles(db(), {
    limit: Number(sp.get('limit') ?? 50) || 50,
    freeOnly: sp.get('free') === '1',
    unreadOnly: sp.get('unread') === '1',
    sourceSlug: sp.get('source') ?? undefined,
    lean: lean && BIAS_LEANS.includes(lean) ? lean : undefined,
    before,
  });
  const last = articles.at(-1);
  return Response.json({
    articles: articles.map(toClient),
    next_before: last ? `${new Date(last.sort_at).getTime()}_${last.id}` : null,
  });
}
