import 'server-only';
import {
  balanceCycle, getCycleStart, listInProgress, loadCycleCandidates, summarizeBalance,
} from '@newswiz/db';
import type { FeedArticle } from '@newswiz/db';
import { readerViewAllowed } from '@newswiz/reader';
import { db } from './server';

export const BRIEFING_SIZE = 40;

/** The current Catch-up briefing. Shared by the home page and the mobile API so both agree. */
export async function loadBriefing(opts: { longer?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const since = await getCycleStart(db(), now);
  const [candidates, inProgress] = await Promise.all([loadCycleCandidates(db(), since), listInProgress(db(), 3)]);
  const briefing = balanceCycle(candidates, { now, limit: opts.longer ? BRIEFING_SIZE * 3 : BRIEFING_SIZE });
  return {
    now,
    since,
    candidates,
    briefing,
    inProgress,
    picked: summarizeBalance(briefing),
    pool: summarizeBalance(candidates),
    outlets: new Set(candidates.map((c) => c.source_slug)).size,
  };
}

/** Article JSON for API clients: the row plus whether it opens in the in-app reader. */
export function toClient<T extends FeedArticle>(a: T): T & { reader_view: boolean } {
  return { ...a, reader_view: readerViewAllowed(a) };
}
