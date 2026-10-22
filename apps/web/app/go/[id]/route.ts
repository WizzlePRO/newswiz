import { getReaderArticle, updateReadingState } from '@newswiz/db';
import { db, parseId } from '@/lib/server';

/** Record that the article was opened, then send the reader to the publisher. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const article = id ? await getReaderArticle(db(), id) : null;
  if (!article) return new Response('Not found', { status: 404 });
  await updateReadingState(db(), article.id, { opened: true });
  return new Response(null, { status: 302, headers: { location: article.url, 'referrer-policy': 'no-referrer' } });
}
