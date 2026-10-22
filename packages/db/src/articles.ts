import type pg from 'pg';
import type { ParsedItem } from './types.ts';

export interface NormalizedItem extends ParsedItem {
  canonicalUrl: string;
  titleKey: string;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

/** Titles shorter than this ("Live updates", "The Morning") repeat too often to dedupe on. */
const MIN_TITLE_KEY_LENGTH = 25;
/** A same-titled story from the same outlet within this window is treated as a re-post. */
const TITLE_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

interface ExistingRow {
  id: number;
  canonical_url: string;
  guid: string | null;
  title_key: string;
  title: string;
  summary: string | null;
  author: string | null;
  image_url: string | null;
  section: string | null;
  published_at: Date | null;
  sort_at: Date;
}

/**
 * Insert new articles and refresh changed ones. An item is a duplicate of an existing article when
 * any of these match: canonical URL (any outlet), the outlet's guid, or the outlet's normalized
 * title within 24 hours (outlets often re-publish a story under a new URL slug).
 */
export async function upsertArticles(
  db: pg.Pool,
  feed: { id: number; source_id: number; section: string | null },
  items: NormalizedItem[],
  now = new Date(),
): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, unchanged: 0 };
  if (items.length === 0) return result;

  // Collapse duplicates inside the batch itself first.
  const batch = new Map<string, NormalizedItem>();
  for (const item of items) if (!batch.has(item.canonicalUrl)) batch.set(item.canonicalUrl, item);
  const unique = [...batch.values()];

  const { rows: existing } = await db.query<ExistingRow>(
    `SELECT id, canonical_url, guid, title_key, title, summary, author, image_url, section, published_at,
            coalesce(published_at, first_seen_at) AS sort_at
       FROM articles
      WHERE canonical_url = ANY($1)
         OR (source_id = $2 AND guid = ANY($3))
         OR (source_id = $2 AND title_key = ANY($4) AND coalesce(published_at, first_seen_at) > $5)`,
    [
      unique.map((i) => i.canonicalUrl),
      feed.source_id,
      unique.flatMap((i) => (i.guid ? [i.guid] : [])),
      unique.map((i) => i.titleKey).filter((k) => k.length >= MIN_TITLE_KEY_LENGTH),
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    ],
  );
  const byUrl = new Map(existing.map((r) => [r.canonical_url, r]));
  const byGuid = new Map(existing.filter((r) => r.guid).map((r) => [r.guid!, r]));

  const findMatch = (item: NormalizedItem): ExistingRow | undefined => {
    const hit = byUrl.get(item.canonicalUrl) ?? (item.guid ? byGuid.get(item.guid) : undefined);
    if (hit || item.titleKey.length < MIN_TITLE_KEY_LENGTH) return hit;
    const when = (item.publishedAt ?? now).getTime();
    return existing.find(
      (r) => r.title_key === item.titleKey && Math.abs(r.sort_at.getTime() - when) <= TITLE_MATCH_WINDOW_MS,
    );
  };

  const toInsert: NormalizedItem[] = [];
  for (const item of unique) {
    const match = findMatch(item);
    if (!match) {
      toInsert.push(item);
      continue;
    }
    const next = {
      title: item.title,
      summary: item.summary ?? match.summary,
      author: item.author ?? match.author,
      image_url: item.imageUrl ?? match.image_url,
      section: item.section ?? match.section,
      published_at: match.published_at ?? item.publishedAt,
    };
    const changed =
      next.title !== match.title ||
      next.summary !== match.summary ||
      next.author !== match.author ||
      next.image_url !== match.image_url ||
      next.section !== match.section ||
      next.published_at?.getTime() !== match.published_at?.getTime();
    if (!changed) {
      result.unchanged++;
      continue;
    }
    await db.query(
      `UPDATE articles SET title = $2, summary = $3, author = $4, image_url = $5, section = $6,
              published_at = $7, updated_at = now()
        WHERE id = $1`,
      [match.id, next.title, next.summary, next.author, next.image_url, next.section, next.published_at],
    );
    result.updated++;
  }

  // Titles can also repeat inside one batch under different URLs; keep the first.
  const seenTitles = new Set<string>();
  const fresh = toInsert.filter((i) => {
    if (i.titleKey.length < MIN_TITLE_KEY_LENGTH) return true;
    if (seenTitles.has(i.titleKey)) return false;
    seenTitles.add(i.titleKey);
    return true;
  });
  result.unchanged += toInsert.length - fresh.length;

  if (fresh.length) {
    const { rowCount } = await db.query(
      `INSERT INTO articles (source_id, feed_id, url, canonical_url, guid, title, title_key, summary,
                             author, section, image_url, language, published_at, first_seen_at)
       SELECT $1::int, $2::int, u.*, $13::timestamptz FROM unnest(
         $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
         $9::text[], $10::text[], $11::text[], $12::text[], $14::timestamptz[]) AS u
       ON CONFLICT DO NOTHING`,
      [
        feed.source_id,
        feed.id,
        fresh.map((i) => i.url),
        fresh.map((i) => i.canonicalUrl),
        fresh.map((i) => i.guid),
        fresh.map((i) => i.title),
        fresh.map((i) => i.titleKey),
        fresh.map((i) => i.summary),
        fresh.map((i) => i.author),
        fresh.map((i) => i.section ?? feed.section),
        fresh.map((i) => i.imageUrl),
        fresh.map((i) => i.language),
        now,
        fresh.map((i) => i.publishedAt),
      ],
    );
    result.inserted += rowCount ?? 0;
    result.unchanged += fresh.length - (rowCount ?? 0);
  }
  return result;
}
