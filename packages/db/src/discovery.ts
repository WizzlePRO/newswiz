import type pg from 'pg';
import type { AccessModel, BiasLean, OwnershipType } from './types.ts';

/** How long link mentions are kept, and the window discovery looks at. */
export const MENTION_WINDOW_DAYS = 30;
/** Invalid candidates (no usable feed) are re-checked after this long. */
const RECHECK_INVALID_DAYS = 30;

/** Remember which outside domains an outlet's articles link to. */
export async function recordLinkMentions(
  db: pg.Pool,
  sourceId: number,
  links: { domain: string; url: string }[],
): Promise<void> {
  if (!links.length) return;
  await db.query(
    `INSERT INTO link_mentions (domain, source_id, url)
     SELECT d, $1, u FROM unnest($2::text[], $3::text[]) AS t(d, u)
     ON CONFLICT DO NOTHING`,
    [sourceId, links.map((l) => l.domain), links.map((l) => l.url)],
  );
}

export interface DiscoveryLead {
  domain: string;
  cited_by: string[];
  mention_count: number;
  sample_url: string;
}

/**
 * Domains cited by at least `minOutlets` different outlets recently that aren't already a source
 * and haven't been decided on (dismissed, added, or recently found to have no feed).
 */
export async function findDiscoveryLeads(db: pg.Pool, opts: { minOutlets?: number; limit?: number } = {}): Promise<DiscoveryLead[]> {
  const { rows } = await db.query<DiscoveryLead>(
    `WITH known AS (
       SELECT regexp_replace(lower(substring(homepage from '^https?://([^/:]+)')), '^www\\.', '') AS domain FROM sources
     )
     SELECT m.domain,
            array_agg(DISTINCT s.name ORDER BY s.name) AS cited_by,
            count(*)::int AS mention_count,
            min(m.url) AS sample_url
       FROM link_mentions m JOIN sources s ON s.id = m.source_id
      WHERE m.seen_at > now() - make_interval(days => $3)
        AND NOT EXISTS (SELECT 1 FROM known k WHERE m.domain = k.domain OR m.domain LIKE '%.' || k.domain)
        AND NOT EXISTS (
          SELECT 1 FROM source_candidates c WHERE c.domain = m.domain
             AND (c.status <> 'invalid' OR c.checked_at > now() - make_interval(days => $4)))
      GROUP BY m.domain
     HAVING count(DISTINCT m.source_id) >= $1
      ORDER BY count(DISTINCT m.source_id) DESC, count(*) DESC
      LIMIT $2`,
    [opts.minOutlets ?? 2, opts.limit ?? 15, MENTION_WINDOW_DAYS, RECHECK_INVALID_DAYS],
  );
  return rows;
}

export interface CandidateInput {
  domain: string;
  name: string | null;
  homepage: string;
  feed_url: string | null;
  status: 'pending' | 'invalid';
  invalid_reason: string | null;
  cited_by: string[];
  mention_count: number;
  feed_items: number | null;
  newest_item_at: Date | null;
  sample_titles: string[];
  access_guess: AccessModel | null;
  access_evidence: Record<string, unknown> | null;
}

export async function saveCandidate(db: pg.Pool, c: CandidateInput): Promise<void> {
  await db.query(
    `INSERT INTO source_candidates (domain, name, homepage, feed_url, status, invalid_reason, cited_by, mention_count,
                                    feed_items, newest_item_at, sample_titles, access_guess, access_evidence, checked_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
     ON CONFLICT (domain) DO UPDATE SET name = EXCLUDED.name, homepage = EXCLUDED.homepage, feed_url = EXCLUDED.feed_url,
       status = EXCLUDED.status, invalid_reason = EXCLUDED.invalid_reason, cited_by = EXCLUDED.cited_by,
       mention_count = EXCLUDED.mention_count, feed_items = EXCLUDED.feed_items, newest_item_at = EXCLUDED.newest_item_at,
       sample_titles = EXCLUDED.sample_titles, access_guess = EXCLUDED.access_guess,
       access_evidence = EXCLUDED.access_evidence, checked_at = now()
     WHERE source_candidates.status IN ('pending', 'invalid')`,
    [c.domain, c.name, c.homepage, c.feed_url, c.status, c.invalid_reason, c.cited_by, c.mention_count, c.feed_items,
      c.newest_item_at, c.sample_titles, c.access_guess, c.access_evidence ? JSON.stringify(c.access_evidence) : null],
  );
}

export interface SourceCandidate extends CandidateInput {
  id: number;
  checked_at: Date;
}

export async function listCandidates(db: pg.Pool, status: 'pending' | 'invalid' | 'rejected' = 'pending'): Promise<SourceCandidate[]> {
  const { rows } = await db.query<SourceCandidate>(
    `SELECT * FROM source_candidates WHERE status = $1 ORDER BY cardinality(cited_by) DESC, mention_count DESC, id`,
    [status],
  );
  return rows;
}

export async function countPendingCandidates(db: pg.Pool): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM source_candidates WHERE status = 'pending'`);
  return rows[0]!.n;
}

export interface ApproveInput {
  name: string;
  access_model: AccessModel;
  ownership_type: OwnershipType;
  user_bias_lean: BiasLean | null;
}

/**
 * Turn a candidate into a real source with its feed. Its access model is whatever the reader
 * chose; the detection evidence is kept in the notes so it can be double-checked later.
 */
export async function approveCandidate(db: pg.Pool, id: number, input: ApproveInput): Promise<{ slug: string } | null> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<SourceCandidate>(
      `SELECT * FROM source_candidates WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [id],
    );
    const c = rows[0];
    if (!c?.feed_url) {
      await client.query('ROLLBACK');
      return null;
    }
    const base = c.domain.replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
    const { rows: taken } = await client.query<{ slug: string }>('SELECT slug FROM sources WHERE slug LIKE $1', [`${base}%`]);
    const slugs = new Set(taken.map((t) => t.slug));
    let slug = base;
    for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;

    const notes = `Found by discovery (cited by ${c.cited_by.join(', ')}). Access chosen on review; detector guessed ${
      c.access_guess ?? 'unknown'
    }.`;
    const src = await client.query<{ id: number }>(
      `INSERT INTO sources (slug, name, homepage, ownership_type, access_model, access_notes, access_verified_on,
                            user_bias_lean)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'unknown' THEN NULL ELSE current_date END, $7) RETURNING id`,
      [slug, input.name || c.name || c.domain, c.homepage, input.ownership_type, input.access_model, notes, input.user_bias_lean],
    );
    const sourceId = src.rows[0]!.id;
    await client.query(
      `INSERT INTO feeds (source_id, url, poll_interval_minutes) VALUES ($1, $2, 30) ON CONFLICT (url) DO NOTHING`,
      [sourceId, c.feed_url],
    );
    await client.query(
      `UPDATE source_candidates SET status = 'approved', decided_at = now(), source_id = $2 WHERE id = $1`,
      [id, sourceId],
    );
    await client.query('COMMIT');
    return { slug };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectCandidate(db: pg.Pool, id: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE source_candidates SET status = 'rejected', decided_at = now() WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

/** Domains (without www.) of every source homepage and feed, to spot aliases of outlets already followed. */
export async function knownSourceDomains(db: pg.Pool): Promise<Set<string>> {
  const { rows } = await db.query<{ d: string }>(
    `SELECT DISTINCT regexp_replace(lower(substring(u from '^https?://([^/:]+)')), '^www\\.', '') AS d
       FROM (SELECT homepage AS u FROM sources UNION ALL SELECT url FROM feeds) x`,
  );
  return new Set(rows.map((r) => r.d).filter(Boolean));
}

export async function pruneLinkMentions(db: pg.Pool): Promise<void> {
  await db.query(`DELETE FROM link_mentions WHERE seen_at < now() - make_interval(days => $1)`, [MENTION_WINDOW_DAYS]);
}
