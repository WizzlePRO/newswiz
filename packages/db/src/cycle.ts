import type pg from 'pg';
import { ARTICLE_CARD_COLUMNS, ARTICLE_CARD_FROM } from './queries.ts';
import { getSetting, setSetting } from './settings.ts';
import type { BiasLean, FeedArticle, OwnershipType } from './types.ts';

/**
 * A "cycle" is everything published since the reader last said "I'm caught up". The Catch-up
 * view shows a short, balanced selection of it instead of an endless chronological river.
 */
export const CYCLE_SETTING_KEY = 'cycle_started_at';
/** First visit, or a long absence: never look back further than this. */
export const MAX_CYCLE_LOOKBACK_HOURS = 48;
const DEFAULT_CYCLE_HOURS = 24;
const CANDIDATE_LIMIT = 2000;

export type Side = 'left' | 'center' | 'right' | 'unrated';

export function sideOf(lean: BiasLean): Side {
  if (lean === 'left' || lean === 'lean_left') return 'left';
  if (lean === 'right' || lean === 'lean_right') return 'right';
  if (lean === 'center') return 'center';
  return 'unrated';
}

export interface BalanceOptions {
  now: Date;
  limit: number;
  /** Max picks from one outlet (boosted outlets get boostedCap). */
  perSourceCap?: number;
  boostedCap?: number;
  /** Relative share each side should get. Unrated outlets count, but less. */
  sideWeights?: Record<Side, number>;
  /** Hours for an article's freshness score to halve. */
  halfLifeHours?: number;
}

const DEFAULT_SIDE_WEIGHTS: Record<Side, number> = { left: 1, center: 1, right: 1, unrated: 0.5 };

/**
 * Pick a balanced, varied selection from a cycle's articles.
 *
 * Each step chooses the side (left / center / right / unrated) furthest behind its target
 * share, then the best article on that side: fresher is better, boosted outlets get a nudge,
 * and each extra article from the same outlet is penalized, as is repeating the previous
 * pick's ownership type. If a side runs out, the others fill in. The output order is the pick
 * order, so sides and outlets are interleaved from the top.
 */
export function balanceCycle<T extends FeedArticle>(candidates: T[], opts: BalanceOptions): T[] {
  const perSourceCap = opts.perSourceCap ?? 3;
  const boostedCap = opts.boostedCap ?? 5;
  const weights = opts.sideWeights ?? DEFAULT_SIDE_WEIGHTS;
  const halfLifeMs = (opts.halfLifeHours ?? 6) * 3_600_000;

  const remaining = new Map<Side, T[]>();
  for (const c of candidates) {
    if (c.user_weight < 0) continue;
    const side = sideOf(c.bias_lean);
    remaining.set(side, [...(remaining.get(side) ?? []), c]);
  }
  const fromSource = new Map<string, number>();
  const sideCounts: Record<Side, number> = { left: 0, center: 0, right: 0, unrated: 0 };
  const picks: T[] = [];
  let lastOwnership: OwnershipType | null = null;

  const capFor = (c: T) => (c.user_weight > 0 ? boostedCap : perSourceCap);
  const score = (c: T) => {
    const age = Math.max(0, opts.now.getTime() - new Date(c.sort_at).getTime());
    let s = Math.pow(0.5, age / halfLifeMs);
    if (c.user_weight > 0) s += 0.15;
    if (c.summary) s += 0.05;
    s -= 0.35 * (fromSource.get(c.source_slug) ?? 0);
    if (c.ownership_type === lastOwnership) s -= 0.1;
    return s;
  };

  while (picks.length < opts.limit) {
    // Drop articles whose outlet has hit its cap; then find sides that still have something.
    for (const [side, list] of remaining) {
      const open = list.filter((c) => (fromSource.get(c.source_slug) ?? 0) < capFor(c));
      if (open.length) remaining.set(side, open);
      else remaining.delete(side);
    }
    if (remaining.size === 0) break;

    const activeWeight = [...remaining.keys()].reduce((sum, side) => sum + weights[side], 0);
    let bestSide: Side | null = null;
    let bestDeficit = -Infinity;
    for (const side of remaining.keys()) {
      const deficit = (weights[side] / activeWeight) * (picks.length + 1) - sideCounts[side];
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        bestSide = side;
      }
    }
    const list = remaining.get(bestSide!)!;
    let bestIdx = 0;
    let bestScore = -Infinity;
    list.forEach((c, i) => {
      const s = score(c);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    });
    const [pick] = list.splice(bestIdx, 1);
    picks.push(pick!);
    sideCounts[bestSide!]++;
    fromSource.set(pick!.source_slug, (fromSource.get(pick!.source_slug) ?? 0) + 1);
    lastOwnership = pick!.ownership_type;
  }
  return picks;
}

export interface BalanceSummary {
  articles: number;
  outlets: number;
  bySide: Record<Side, number>;
  byOwnership: Partial<Record<OwnershipType, number>>;
  international: number;
}

export function summarizeBalance(articles: FeedArticle[], homeCountry = 'US'): BalanceSummary {
  const bySide: Record<Side, number> = { left: 0, center: 0, right: 0, unrated: 0 };
  const byOwnership: Partial<Record<OwnershipType, number>> = {};
  for (const a of articles) {
    bySide[sideOf(a.bias_lean)]++;
    byOwnership[a.ownership_type] = (byOwnership[a.ownership_type] ?? 0) + 1;
  }
  return {
    articles: articles.length,
    outlets: new Set(articles.map((a) => a.source_slug)).size,
    bySide,
    byOwnership,
    international: articles.filter((a) => a.country !== homeCountry).length,
  };
}

/** When the current cycle began, clamped so a long absence doesn't produce a week of backlog. */
export async function getCycleStart(db: pg.Pool, now = new Date()): Promise<Date> {
  const stored = await getSetting<string>(db, CYCLE_SETTING_KEY);
  const floor = new Date(now.getTime() - MAX_CYCLE_LOOKBACK_HOURS * 3_600_000);
  const start = stored ? new Date(stored) : new Date(now.getTime() - DEFAULT_CYCLE_HOURS * 3_600_000);
  return start < floor ? floor : start;
}

/** "I'm caught up": the next cycle starts now. */
export async function finishCycle(db: pg.Pool, at = new Date()): Promise<void> {
  await setSetting(db, CYCLE_SETTING_KEY, at.toISOString());
}

/** Unread, unopened articles from enabled, unmuted outlets since the cycle began. */
export async function loadCycleCandidates(db: pg.Pool, since: Date): Promise<FeedArticle[]> {
  const { rows } = await db.query<FeedArticle>(
    `SELECT ${ARTICLE_CARD_COLUMNS}
       FROM ${ARTICLE_CARD_FROM}
      WHERE s.enabled AND s.user_weight > -1
        AND coalesce(a.published_at, a.first_seen_at) > $1
        AND r.opened_at IS NULL AND r.read_at IS NULL
      ORDER BY coalesce(a.published_at, a.first_seen_at) DESC
      LIMIT $2`,
    [since, CANDIDATE_LIMIT],
  );
  return rows;
}
