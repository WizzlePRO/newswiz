import { READER_VIEW_ACCESS, getArticleContent, markArticlePaywalled, saveArticleContent, setReaderBlocked } from '@newswiz/db';
import type { ArticleContent, FeedArticle, Pool } from '@newswiz/db';
import type { PoliteFetcher } from '@newswiz/net';
import { detectPaidMarking } from '@newswiz/net';
import { MIN_READER_WORDS, extractArticle } from './extract.ts';

/** Failed fetches are retried after this long; other outcomes are final. */
const RETRY_FAILED_AFTER_MS = 6 * 60 * 60 * 1000;

/** Free outlets only, and not while the outlet is refusing our fetches. */
export function readerViewAllowed(article: Pick<FeedArticle, 'access_model'> & { reader_blocked?: boolean }): boolean {
  return READER_VIEW_ACCESS.includes(article.access_model) && !article.reader_blocked;
}

/**
 * Get the reader-view copy of an article, fetching and extracting it on first use.
 *
 * Only articles from sources classified "free" are ever fetched. If the page itself says it's
 * not free (isAccessibleForFree=false) or the extract looks like a teaser, nothing is stored and
 * the reader is sent to the publisher instead.
 */
export async function getOrFetchContent(
  db: Pool,
  fetcher: PoliteFetcher,
  article: Pick<FeedArticle, 'id' | 'url' | 'access_model'> & { reader_blocked?: boolean },
): Promise<ArticleContent> {
  const existing = await getArticleContent(db, article.id);
  const retryable = existing && (existing.status === 'failed' || existing.status === 'blocked');
  if (existing && !(retryable && Date.now() - existing.fetched_at.getTime() > RETRY_FAILED_AFTER_MS)) {
    return existing;
  }

  const save = async (c: Omit<ArticleContent, 'article_id' | 'fetched_at'>): Promise<ArticleContent> => {
    const row = { article_id: article.id, ...c };
    await saveArticleContent(db, row);
    return { ...row, fetched_at: new Date() };
  };
  const empty = { html: null, word_count: null, block_count: null };

  if (!readerViewAllowed(article)) return save({ status: 'not_free', ...empty, error: null });

  const res = await fetcher.get(article.url, {
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    timeoutMs: 15_000,
    maxBytes: 5 * 1024 * 1024,
  });
  if (res.kind === 'disallowed') {
    await setReaderBlocked(db, article.id, true);
    return save({ status: 'blocked', ...empty, error: res.reason });
  }
  if (res.kind === 'http_error') {
    const blocked = res.status === 401 || res.status === 403 || res.status === 451;
    if (blocked) await setReaderBlocked(db, article.id, true);
    return save({ status: blocked ? 'blocked' : 'failed', ...empty, error: `HTTP ${res.status}` });
  }
  if (res.kind === 'network_error') return save({ status: 'failed', ...empty, error: res.message });
  if (res.kind === 'not_modified') return save({ status: 'failed', ...empty, error: 'unexpected 304' });

  const paid = detectPaidMarking(res.body);
  if (paid.paid) {
    await markArticlePaywalled(db, article.id, { signal: 'jsonld_isAccessibleForFree', type: paid.type, at: new Date() });
    return save({ status: 'marked_paid', ...empty, error: null });
  }
  const extracted = extractArticle(res.body, res.finalUrl);
  if (!extracted) return save({ status: 'failed', ...empty, error: 'no readable article found' });
  if (extracted.wordCount < MIN_READER_WORDS) {
    return save({ status: 'too_short', ...empty, word_count: extracted.wordCount, error: null });
  }
  await setReaderBlocked(db, article.id, false);
  return save({
    status: 'ok',
    html: extracted.html,
    word_count: extracted.wordCount,
    block_count: extracted.blockCount,
    error: null,
  });
}
