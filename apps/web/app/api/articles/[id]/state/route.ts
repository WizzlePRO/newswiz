import { getReaderArticle, updateReadingState } from '@newswiz/db';
import type { ReadingPatch } from '@newswiz/db';
import { getOrFetchContent, readerViewAllowed } from '@newswiz/reader';
import { db, fetcher, parseId } from '@/lib/server';

function parsePatch(body: unknown): ReadingPatch | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const patch: ReadingPatch = {};
  for (const key of ['opened', 'saved', 'read'] as const) {
    if (key in b) {
      if (typeof b[key] !== 'boolean') return null;
      patch[key] = b[key] as boolean;
    }
  }
  if ('progress' in b) {
    if (typeof b.progress !== 'number' || !Number.isFinite(b.progress)) return null;
    patch.progress = b.progress;
  }
  if ('block' in b) {
    if (b.block !== null && !(Number.isInteger(b.block) && (b.block as number) >= 0)) return null;
    patch.block = b.block as number | null;
  }
  if ('progressSource' in b) {
    if (b.progressSource !== 'reader' && b.progressSource !== 'manual') return null;
    patch.progressSource = b.progressSource;
  }
  return Object.keys(patch).length ? patch : null;
}

/** Update reading state: opened / saved / read / progress. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: 'bad id' }, { status: 400 });
  const patch = parsePatch(await req.json().catch(() => null));
  if (!patch) return Response.json({ error: 'bad body' }, { status: 400 });
  const state = await updateReadingState(db(), id, patch);
  if (!state) return Response.json({ error: 'not found' }, { status: 404 });

  // Saving a free article prefetches its reader view so it opens instantly later.
  if (patch.saved) {
    const article = await getReaderArticle(db(), id);
    if (article && readerViewAllowed(article)) void getOrFetchContent(db(), fetcher(), article).catch(() => {});
  }
  return Response.json(state);
}
