import { getSetting, listCandidates } from '@newswiz/db';
import { AccessBadge } from '@/components/AccessBadge';
import { CandidateCard } from '@/components/CandidateCard';
import { formatClock, timeAgo } from '@/lib/format';
import { db } from '@/lib/server';

export const metadata = { title: 'Discover' };

/** Outlets found by the daily discovery job, for the reader to add or dismiss. */
export default async function Discover() {
  const [pending, invalid, lastRun] = await Promise.all([
    listCandidates(db(), 'pending'),
    listCandidates(db(), 'invalid'),
    getSetting<string>(db(), 'discovery_last_run'),
  ]);

  return (
    <>
      <h1>Discover</h1>
      <p className="lede">
        Once a day NewsWiz looks at which sites your outlets keep linking to, checks that they publish a working, recent
        feed, and samples an article for paywall signals. Nothing is added until you say so.{' '}
        {lastRun ? `Last checked ${formatClock(new Date(lastRun))}.` : 'The first check runs within a day of starting the worker (or run `pnpm discover`).'}
      </p>

      {pending.length === 0 ? (
        <div className="empty">No new outlets to review right now.</div>
      ) : (
        <ul className="sources">
          {pending.map((c) => {
            const evidence = (c.access_evidence ?? {}) as { reason?: string; sample_url?: string; newsTypes?: string[] };
            return (
              <li key={c.id} className="source">
                <div className="source-head">
                  <a className="source-name" href={c.homepage} target="_blank" rel="noopener">
                    {c.name ?? c.domain}
                  </a>
                  <span className="state-note">{c.domain}</span>
                  {c.access_guess && <AccessBadge access={c.access_guess} />}
                </div>
                <p className="source-notes">
                  Cited by {c.cited_by.length} of your outlets: {c.cited_by.join(', ')} ({c.mention_count} links in 30 days)
                </p>
                <p className="source-notes">
                  Feed: {c.feed_items} items{c.newest_item_at ? `, newest ${timeAgo(c.newest_item_at)}` : ''}.{' '}
                  {evidence.newsTypes?.length ? `Marks itself as news (${evidence.newsTypes.join(', ')}).` : 'No news-site markers — may be a research group, company, or blog.'}
                </p>
                {c.sample_titles.length > 0 && (
                  <ul className="source-notes" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {c.sample_titles.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
                <p className="source-notes">
                  Access: {evidence.reason ?? 'not checked'}
                  {evidence.sample_url && (
                    <>
                      {' '}
                      (<a href={evidence.sample_url} target="_blank" rel="noopener">sample article</a>)
                    </>
                  )}
                </p>
                <CandidateCard id={c.id} name={c.name ?? c.domain} accessGuess={c.access_guess ?? 'unknown'} />
              </li>
            );
          })}
        </ul>
      )}

      {invalid.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary className="section-title" style={{ cursor: 'pointer' }}>
            Checked but skipped ({invalid.length})
          </summary>
          <ul className="source-notes" style={{ paddingLeft: 18 }}>
            {invalid.map((c) => (
              <li key={c.id}>
                {c.domain}: {c.invalid_reason} (cited by {c.cited_by.length})
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
