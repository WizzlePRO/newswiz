import { getReaderArticle } from '@newswiz/db';
import { getOrFetchContent, readerViewAllowed } from '@newswiz/reader';
import { toClient } from '@/lib/briefing';
import { db, fetcher, parseId } from '@/lib/server';

/**
 * GET /api/articles/:id: one article with its reading state and, for free outlets, the
 * reader-view HTML (sanitized, every block tagged data-block="N" for position saving).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const article = id ? await getReaderArticle(db(), id) : null;
  if (!article) return Response.json({ error: 'not found' }, { status: 404 });
  const content = readerViewAllowed(article) ? await getOrFetchContent(db(), fetcher(), article) : null;
  return Response.json({
    article: toClient(article),
    content: content && {
      status: content.status,
      html: content.status === 'ok' ? content.html : null,
      word_count: content.word_count,
      block_count: content.block_count,
    },
  });
}
