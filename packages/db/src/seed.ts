import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { ACCESS_MODELS, BIAS_LEANS, FEED_KINDS, OWNERSHIP_TYPES } from './types.ts';
import type { AccessModel, BiasLean, FeedKind, OwnershipType } from './types.ts';

export interface SeedFeed {
  url: string;
  kind?: FeedKind;
  section?: string;
  poll_interval_minutes?: number;
}

export interface SeedSource {
  slug: string;
  name: string;
  homepage: string;
  country?: string;
  coverage_regions?: string[];
  ownership_type: OwnershipType;
  access_model: AccessModel;
  metered_limit?: number;
  metered_period?: 'week' | 'month';
  access_notes?: string;
  access_evidence_url?: string;
  access_verified_on?: string;
  original_reporting?: boolean;
  opinion_heavy?: boolean;
  is_aggregator?: boolean;
  donate_url?: string;
  feeds: SeedFeed[];
}

export async function loadSeedFile(path: string): Promise<SeedSource[]> {
  const data = JSON.parse(await readFile(path, 'utf8')) as { sources: SeedSource[] };
  const errors = validateSeed(data.sources);
  if (errors.length) throw new Error(`invalid seed file ${path}:\n  ${errors.join('\n  ')}`);
  return data.sources;
}

export function validateSeed(sources: SeedSource[]): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  const urls = new Set<string>();
  for (const s of sources) {
    const at = `source "${s.slug ?? '?'}"`;
    if (!s.slug || !/^[a-z0-9-]+$/.test(s.slug)) errors.push(`${at}: slug must be lowercase letters, digits, dashes`);
    if (slugs.has(s.slug)) errors.push(`${at}: duplicate slug`);
    slugs.add(s.slug);
    if (!s.name) errors.push(`${at}: missing name`);
    if (!s.homepage?.startsWith('https://')) errors.push(`${at}: homepage must be an https URL`);
    if (!OWNERSHIP_TYPES.includes(s.ownership_type)) errors.push(`${at}: bad ownership_type ${s.ownership_type}`);
    if (!ACCESS_MODELS.includes(s.access_model)) errors.push(`${at}: bad access_model ${s.access_model}`);
    if (s.access_model !== 'unknown' && !s.access_evidence_url) {
      errors.push(`${at}: access_model "${s.access_model}" needs access_evidence_url (use "unknown" if unverified)`);
    }
    for (const f of s.feeds ?? []) {
      if (!/^https?:\/\//.test(f.url)) errors.push(`${at}: bad feed url ${f.url}`);
      if (urls.has(f.url)) errors.push(`${at}: duplicate feed url ${f.url}`);
      urls.add(f.url);
      if (f.kind && !FEED_KINDS.includes(f.kind)) errors.push(`${at}: bad feed kind ${f.kind}`);
    }
  }
  return errors;
}

/**
 * Upsert sources and feeds from the seed file. Registry facts (name, access model, ...) come
 * from the file; user choices (user_weight, enabled) and feed polling state are left alone.
 * Feeds of a seeded source that are no longer in the file get disabled.
 */
export async function applySeed(pool: pg.Pool, sources: SeedSource[]): Promise<{ sources: number; feeds: number }> {
  const client = await pool.connect();
  let feedCount = 0;
  try {
    await client.query('BEGIN');
    for (const s of sources) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO sources (slug, name, homepage, country, coverage_regions, ownership_type, access_model,
           metered_limit, metered_period, access_notes, access_evidence_url, access_verified_on,
           original_reporting, opinion_heavy, is_aggregator, donate_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name, homepage = EXCLUDED.homepage, country = EXCLUDED.country,
           coverage_regions = EXCLUDED.coverage_regions, ownership_type = EXCLUDED.ownership_type,
           access_model = EXCLUDED.access_model, metered_limit = EXCLUDED.metered_limit,
           metered_period = EXCLUDED.metered_period, access_notes = EXCLUDED.access_notes,
           access_evidence_url = EXCLUDED.access_evidence_url, access_verified_on = EXCLUDED.access_verified_on,
           original_reporting = EXCLUDED.original_reporting, opinion_heavy = EXCLUDED.opinion_heavy,
           is_aggregator = EXCLUDED.is_aggregator, donate_url = EXCLUDED.donate_url, updated_at = now()
         RETURNING id`,
        [
          s.slug, s.name, s.homepage, s.country ?? 'US', s.coverage_regions ?? [], s.ownership_type,
          s.access_model, s.metered_limit ?? null, s.metered_period ?? null, s.access_notes ?? null,
          s.access_evidence_url ?? null, s.access_verified_on ?? null, s.original_reporting ?? true,
          s.opinion_heavy ?? false, s.is_aggregator ?? false, s.donate_url ?? null,
        ],
      );
      const sourceId = rows[0]!.id;
      for (const f of s.feeds) {
        await client.query(
          `INSERT INTO feeds (source_id, url, kind, section, poll_interval_minutes)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (url) DO UPDATE SET source_id = EXCLUDED.source_id, kind = EXCLUDED.kind,
             section = EXCLUDED.section, poll_interval_minutes = EXCLUDED.poll_interval_minutes, enabled = true`,
          [sourceId, f.url, f.kind ?? 'rss', f.section ?? null, f.poll_interval_minutes ?? 15],
        );
        feedCount++;
      }
      await client.query('UPDATE feeds SET enabled = false WHERE source_id = $1 AND NOT (url = ANY($2))', [
        sourceId,
        s.feeds.map((f) => f.url),
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { sources: sources.length, feeds: feedCount };
}

export interface BiasRating {
  slug: string;
  lean: BiasLean;
  rater?: string;
  rating_url?: string;
  rated_on?: string;
  note?: string;
}

export async function loadBiasFile(path: string): Promise<BiasRating[]> {
  const data = JSON.parse(await readFile(path, 'utf8')) as { ratings: BiasRating[] };
  const errors = data.ratings.flatMap((r) => {
    if (!BIAS_LEANS.includes(r.lean)) return [`${r.slug}: bad lean ${r.lean}`];
    if (r.lean !== 'unrated' && (!r.rater || !r.rating_url)) return [`${r.slug}: a rating needs rater and rating_url`];
    return [];
  });
  if (errors.length) throw new Error(`invalid bias file ${path}:\n  ${errors.join('\n  ')}`);
  return data.ratings;
}

/** Store rater-provided leans. The reader's own overrides (user_bias_lean) are never touched. */
export async function applyBiasRatings(pool: pg.Pool, ratings: BiasRating[]): Promise<number> {
  let updated = 0;
  for (const r of ratings) {
    const { rowCount } = await pool.query(
      `UPDATE sources SET bias_lean = $2, bias_rater = $3, bias_rating_url = $4, bias_rated_on = $5,
              bias_note = $6, updated_at = now()
        WHERE slug = $1`,
      [r.slug, r.lean, r.rater ?? null, r.rating_url ?? null, r.rated_on ?? null, r.note ?? null],
    );
    updated += rowCount ?? 0;
  }
  return updated;
}
