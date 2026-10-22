import type pg from 'pg';
import type { Feed } from './types.ts';

/** How long a claimed feed stays reserved, so a crashed worker doesn't strand it forever. */
const CLAIM_LEASE_MINUTES = 10;

/**
 * Claim up to `limit` feeds whose next poll time has passed. SKIP LOCKED plus a lease lets several
 * workers share the table without fetching the same feed twice.
 */
export async function claimDueFeeds(db: pg.Pool, limit: number): Promise<Feed[]> {
  const { rows } = await db.query<Feed>(
    `UPDATE feeds f SET next_poll_at = now() + make_interval(mins => $2)
      WHERE f.id IN (
        SELECT f2.id FROM feeds f2 JOIN sources s ON s.id = f2.source_id
         WHERE f2.enabled AND s.enabled AND f2.next_poll_at <= now()
         ORDER BY f2.next_poll_at
         LIMIT $1
         FOR UPDATE OF f2 SKIP LOCKED)
      RETURNING f.id, f.source_id, f.url, f.kind, f.section, f.poll_interval_minutes, f.etag,
                f.last_modified, f.consecutive_failures`,
    [limit, CLAIM_LEASE_MINUTES],
  );
  return rows;
}

export interface FeedOutcome {
  ok: boolean;
  status: number | null;
  error: string | null;
  etag?: string | null;
  lastModified?: string | null;
  nextPollAt: Date;
  polledAt: Date;
}

export async function recordFeedResult(db: pg.Pool, feedId: number, o: FeedOutcome): Promise<void> {
  if (o.ok) {
    await db.query(
      `UPDATE feeds SET last_polled_at = $2, last_success_at = $2, last_status = $3, last_error = NULL,
              consecutive_failures = 0, next_poll_at = $4,
              etag = coalesce($5, etag), last_modified = coalesce($6, last_modified)
        WHERE id = $1`,
      [feedId, o.polledAt, o.status, o.nextPollAt, o.etag ?? null, o.lastModified ?? null],
    );
  } else {
    await db.query(
      `UPDATE feeds SET last_polled_at = $2, last_status = $3, last_error = $4,
              consecutive_failures = consecutive_failures + 1, next_poll_at = $5
        WHERE id = $1`,
      [feedId, o.polledAt, o.status, o.error, o.nextPollAt],
    );
  }
}
