import type pg from 'pg';
import { ARTICLE_CARD_COLUMNS, ARTICLE_CARD_FROM } from './queries.ts';
import type { FeedArticle } from './types.ts';

export type ContentStatus = 'ok' | 'not_free' | 'marked_paid' | 'too_short' | 'blocked' | 'failed';

export interface ArticleContent {
  article_id: number;
  status: ContentStatus;
  html: string | null;
  word_count: number | null;
  block_count: number | null;
  error: string | null;
  fetched_at: Date;
}

export interface ReaderArticle extends FeedArticle {
  progress_block: number | null;
  progress_source: 'reader' | 'manual' | null;
}

export async function getReaderArticle(db: pg.Pool, articleId: number): Promise<ReaderArticle | null> {
  const { rows } = await db.query<ReaderArticle>(
    `SELECT ${ARTICLE_CARD_COLUMNS}, r.progress_block, r.progress_source
       FROM ${ARTICLE_CARD_FROM} WHERE a.id = $1`,
    [articleId],
  );
  return rows[0] ?? null;
}

export async function getArticleContent(db: pg.Pool, articleId: number): Promise<ArticleContent | null> {
  const { rows } = await db.query<ArticleContent>('SELECT * FROM article_content WHERE article_id = $1', [articleId]);
  return rows[0] ?? null;
}

export async function saveArticleContent(
  db: pg.Pool,
  c: Omit<ArticleContent, 'fetched_at'>,
): Promise<void> {
  await db.query(
    `INSERT INTO article_content (article_id, status, html, word_count, block_count, error, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (article_id) DO UPDATE SET status = EXCLUDED.status, html = EXCLUDED.html,
       word_count = EXCLUDED.word_count, block_count = EXCLUDED.block_count, error = EXCLUDED.error,
       fetched_at = now()`,
    [c.article_id, c.status, c.html, c.word_count, c.block_count, c.error],
  );
}

/** Record that the publisher's own page marks this article as not free (schema.org isAccessibleForFree). */
export async function markArticlePaywalled(db: pg.Pool, articleId: number, evidence: Record<string, unknown>): Promise<void> {
  await db.query(
    `UPDATE articles SET access_status = 'paywalled', access_evidence = $2, updated_at = now() WHERE id = $1`,
    [articleId, JSON.stringify(evidence)],
  );
}

/** Remember (or clear) that an outlet refuses reader-view fetches. */
export async function setReaderBlocked(db: pg.Pool, articleId: number, blocked: boolean, hours = 24): Promise<void> {
  await db.query(
    `UPDATE sources SET reader_blocked_until = CASE WHEN $2 THEN now() + make_interval(hours => $3) ELSE NULL END
      WHERE id = (SELECT source_id FROM articles WHERE id = $1)`,
    [articleId, blocked, hours],
  );
}
