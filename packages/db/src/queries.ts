import type pg from 'pg';
import { READABLE_ACCESS } from './types.ts';
import type { BiasLean, FeedArticle, SourceHealth } from './types.ts';

/** Columns every article card needs: the article, its outlet (access + bias), and reading state. */
export const ARTICLE_CARD_COLUMNS = `
  a.id, a.url, a.title, a.summary, a.author, a.image_url, a.section,
  coalesce(a.published_at, a.first_seen_at) AS sort_at,
  s.slug AS source_slug, s.name AS source_name, s.ownership_type, s.access_model,
  s.metered_limit, s.metered_period, s.donate_url, s.country, s.user_weight,
  coalesce(s.user_bias_lean, s.bias_lean) AS bias_lean, s.bias_rater,
  (s.user_bias_lean IS NOT NULL) AS bias_overridden,
  coalesce(s.reader_blocked_until > now(), false) AS reader_blocked,
  r.opened_at, r.saved_at, r.read_at, coalesce(r.progress, 0) AS progress`;

export const ARTICLE_CARD_FROM = `
  articles a JOIN sources s ON s.id = a.source_id
  LEFT JOIN reading_state r ON r.article_id = a.id`;

export interface ArticleQuery {
  limit?: number;
  /** Keyset cursor: return articles strictly older than this one. */
  before?: { sortAt: Date; id: number };
  freeOnly?: boolean;
  unreadOnly?: boolean;
  sourceSlug?: string;
  lean?: BiasLean;
}

/** Chronological feed, newest first. Muted and disabled sources never appear. */
export async function listArticles(db: pg.Pool, q: ArticleQuery = {}): Promise<FeedArticle[]> {
  const params: unknown[] = [];
  const where = ['s.enabled', 's.user_weight > -1'];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (q.freeOnly) add('s.access_model = ANY(?)', READABLE_ACCESS);
  if (q.sourceSlug) add('s.slug = ?', q.sourceSlug);
  if (q.lean) add('coalesce(s.user_bias_lean, s.bias_lean) = ?', q.lean);
  if (q.unreadOnly) where.push('r.read_at IS NULL');
  if (q.before) {
    params.push(q.before.sortAt, q.before.id);
    where.push(`(coalesce(a.published_at, a.first_seen_at), a.id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(Math.min(Math.max(q.limit ?? 50, 1), 200));

  const { rows } = await db.query<FeedArticle>(
    `SELECT ${ARTICLE_CARD_COLUMNS}
       FROM ${ARTICLE_CARD_FROM}
      WHERE ${where.join(' AND ')}
      ORDER BY coalesce(a.published_at, a.first_seen_at) DESC, a.id DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/** Every source with its feed health and bias rating, for the Sources page. */
export async function listSources(db: pg.Pool): Promise<SourceHealth[]> {
  const { rows } = await db.query<SourceHealth>(
    `SELECT s.id, s.slug, s.name, s.homepage, s.country, s.ownership_type, s.access_model,
            s.metered_limit, s.metered_period, s.access_notes, s.access_evidence_url,
            to_char(s.access_verified_on, 'YYYY-MM-DD') AS access_verified_on, s.donate_url,
            s.user_weight, s.enabled,
            coalesce(s.user_bias_lean, s.bias_lean) AS bias_lean, s.bias_lean AS rater_bias_lean,
            s.user_bias_lean, s.bias_rater, s.bias_rating_url,
            to_char(s.bias_rated_on, 'YYYY-MM-DD') AS bias_rated_on, s.bias_note,
            coalesce(f.feed_count, 0)::int AS feed_count,
            coalesce(f.healthy_feed_count, 0)::int AS healthy_feed_count,
            f.last_success_at, f.last_error,
            coalesce(a.articles_24h, 0)::int AS articles_24h, a.latest_article_at
       FROM sources s
       LEFT JOIN LATERAL (
         SELECT count(*) AS feed_count,
                count(*) FILTER (WHERE consecutive_failures = 0 AND last_success_at IS NOT NULL) AS healthy_feed_count,
                max(last_success_at) AS last_success_at,
                (array_agg(last_error ORDER BY last_polled_at DESC NULLS LAST)
                   FILTER (WHERE consecutive_failures > 0))[1] AS last_error
           FROM feeds WHERE source_id = s.id AND enabled
       ) f ON true
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE first_seen_at > now() - interval '24 hours') AS articles_24h,
                max(coalesce(published_at, first_seen_at)) AS latest_article_at
           FROM articles WHERE source_id = s.id
       ) a ON true
      ORDER BY s.name`,
  );
  return rows;
}

/** Mute (-1), reset (0), or boost (1) a source. */
export async function setSourceWeight(db: pg.Pool, slug: string, weight: -1 | 0 | 1): Promise<boolean> {
  const { rowCount } = await db.query('UPDATE sources SET user_weight = $2, updated_at = now() WHERE slug = $1', [
    slug,
    weight,
  ]);
  return (rowCount ?? 0) > 0;
}

/** Override the rater's lean with the reader's own judgment; null restores the rater's. */
export async function setSourceBiasOverride(db: pg.Pool, slug: string, lean: BiasLean | null): Promise<boolean> {
  const { rowCount } = await db.query(
    'UPDATE sources SET user_bias_lean = $2, updated_at = now() WHERE slug = $1',
    [slug, lean],
  );
  return (rowCount ?? 0) > 0;
}
