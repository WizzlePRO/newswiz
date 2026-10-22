import type pg from 'pg';
import { ARTICLE_CARD_COLUMNS, ARTICLE_CARD_FROM } from './queries.ts';
import type { FeedArticle } from './types.ts';

/** Reader view marks an article finished once this much of it has scrolled past. */
export const FINISHED_AT_PROGRESS = 0.97;

export interface ReadingState {
  article_id: number;
  opened_at: Date | null;
  saved_at: Date | null;
  read_at: Date | null;
  progress: number;
  progress_block: number | null;
  progress_source: 'reader' | 'manual' | null;
}

export interface ReadingPatch {
  opened?: boolean;
  saved?: boolean;
  /** true marks finished (progress 1); false marks unread again (progress reset). */
  read?: boolean;
  progress?: number;
  block?: number | null;
  progressSource?: 'reader' | 'manual';
}

export async function getReadingState(db: pg.Pool, articleId: number): Promise<ReadingState | null> {
  const { rows } = await db.query<ReadingState>('SELECT * FROM reading_state WHERE article_id = $1', [articleId]);
  return rows[0] ?? null;
}

/**
 * Apply a change to an article's reading state, creating it if needed. Progress only moves
 * forward from reader-view scrolling (scrolling back up to re-read a paragraph shouldn't lose
 * your place), but a manual setting or "mark unread" can move it anywhere.
 */
export async function updateReadingState(db: pg.Pool, articleId: number, patch: ReadingPatch): Promise<ReadingState | null> {
  const current = await getReadingState(db, articleId);
  const now = new Date();
  const next: ReadingState = current ?? {
    article_id: articleId,
    opened_at: null,
    saved_at: null,
    read_at: null,
    progress: 0,
    progress_block: null,
    progress_source: null,
  };

  if (patch.opened && !next.opened_at) next.opened_at = now;
  if (patch.saved !== undefined) next.saved_at = patch.saved ? (next.saved_at ?? now) : null;

  if (patch.progress !== undefined) {
    const p = Math.min(Math.max(patch.progress, 0), 1);
    const manual = patch.progressSource === 'manual';
    if (manual || p >= next.progress || next.read_at) {
      next.progress = p;
      next.progress_block = patch.block ?? next.progress_block;
      next.progress_source = patch.progressSource ?? 'reader';
    }
    if (!next.opened_at) next.opened_at = now;
    if (p >= FINISHED_AT_PROGRESS && !next.read_at) next.read_at = now;
    if (manual && p < FINISHED_AT_PROGRESS) next.read_at = null;
  }

  if (patch.read === true) {
    next.read_at = next.read_at ?? now;
    next.progress = 1;
    next.opened_at = next.opened_at ?? now;
  } else if (patch.read === false) {
    next.read_at = null;
    next.progress = 0;
    next.progress_block = null;
  }

  const { rows } = await db.query<ReadingState>(
    `INSERT INTO reading_state (article_id, opened_at, saved_at, read_at, progress, progress_block, progress_source, updated_at)
     SELECT $1, $2, $3, $4, $5, $6, $7, now() WHERE EXISTS (SELECT 1 FROM articles WHERE id = $1)
     ON CONFLICT (article_id) DO UPDATE SET opened_at = EXCLUDED.opened_at, saved_at = EXCLUDED.saved_at,
       read_at = EXCLUDED.read_at, progress = EXCLUDED.progress, progress_block = EXCLUDED.progress_block,
       progress_source = EXCLUDED.progress_source, updated_at = now()
     RETURNING *`,
    [articleId, next.opened_at, next.saved_at, next.read_at, next.progress, next.progress_block, next.progress_source],
  );
  return rows[0] ?? null;
}

export interface SavedArticle extends FeedArticle {
  progress_block: number | null;
  progress_source: 'reader' | 'manual' | null;
  word_count: number | null;
  reader_status: string | null;
}

const SAVED_COLUMNS = `${ARTICLE_CARD_COLUMNS}, r.progress_block, r.progress_source,
  c.word_count, c.status AS reader_status`;

/** The reading list: everything saved, in-progress first, finished last. */
export async function listSaved(db: pg.Pool): Promise<SavedArticle[]> {
  const { rows } = await db.query<SavedArticle>(
    `SELECT ${SAVED_COLUMNS}
       FROM ${ARTICLE_CARD_FROM} LEFT JOIN article_content c ON c.article_id = a.id
      WHERE r.saved_at IS NOT NULL
      ORDER BY (r.read_at IS NOT NULL), (r.progress > 0) DESC, r.updated_at DESC`,
  );
  return rows;
}

/** Articles started but not finished, most recently touched first ("Continue reading"). */
export async function listInProgress(db: pg.Pool, limit = 5): Promise<SavedArticle[]> {
  const { rows } = await db.query<SavedArticle>(
    `SELECT ${SAVED_COLUMNS}
       FROM ${ARTICLE_CARD_FROM} LEFT JOIN article_content c ON c.article_id = a.id
      WHERE r.read_at IS NULL AND r.progress > 0 AND r.progress < 1
      ORDER BY r.updated_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows;
}
