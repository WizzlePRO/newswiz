import { loadBriefing, toClient } from '@/lib/briefing';

/** GET /api/catchup[?longer=1]: the balanced briefing for the current news cycle. */
export async function GET(req: Request) {
  const b = await loadBriefing({ longer: new URL(req.url).searchParams.get('longer') === '1' });
  return Response.json({
    since: b.since,
    new_articles: b.candidates.length,
    outlets: b.outlets,
    briefing: b.briefing.map(toClient),
    in_progress: b.inProgress.map(toClient),
    balance: { briefing: b.picked, all_new: b.pool },
  });
}
