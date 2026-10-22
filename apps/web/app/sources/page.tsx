import { countPendingCandidates, listSources } from '@newswiz/db';
import type { SourceHealth } from '@newswiz/db';
import { AccessBadge } from '@/components/AccessBadge';
import { LeanChip } from '@/components/LeanChip';
import { SourceControls } from '@/components/SourceControls';
import { OWNERSHIP_LABELS, timeAgo } from '@/lib/format';
import { db } from '@/lib/server';

export const metadata = { title: 'Sources' };

function Health({ s }: { s: SourceHealth }) {
  if (s.feed_count === 0) return <span className="health bad">No feed — {s.access_notes?.match(/[^.]*no feed[^.]*\./i)?.[0] ?? 'not ingested'}</span>;
  const bad = s.healthy_feed_count < s.feed_count;
  return (
    <span className={`health ${bad ? 'bad' : 'ok'}`} title={s.last_error ?? undefined}>
      {bad ? `⚠ ${s.feed_count - s.healthy_feed_count} of ${s.feed_count} feeds failing${s.last_error ? ` (${s.last_error})` : ''}` : '● Feeds healthy'}
      {' · '}
      {s.articles_24h} new in 24h{s.latest_article_at ? ` · latest ${timeAgo(s.latest_article_at)}` : ''}
    </span>
  );
}

export default async function Sources() {
  const [sources, suggestions] = await Promise.all([listSources(db()), countPendingCandidates(db())]);
  const sides = { left: 0, center: 0, right: 0, other: 0 };
  for (const s of sources) {
    if (s.user_weight < 0) continue;
    if (s.bias_lean === 'left' || s.bias_lean === 'lean_left') sides.left++;
    else if (s.bias_lean === 'right' || s.bias_lean === 'lean_right') sides.right++;
    else if (s.bias_lean === 'center') sides.center++;
    else sides.other++;
  }

  return (
    <>
      <h1>Sources</h1>
      <p className="lede">
        {sources.length} outlets · {sides.left} left-leaning, {sides.center} center, {sides.right} right-leaning,{' '}
        {sides.other} unrated. Boost outlets you want more of, mute ones you don&apos;t, and override any lean rating with
        your own.
      </p>
      <p className="balance-note" style={{ marginTop: -6, marginBottom: 16 }}>
        <a className="btn" href="/discover">
          {suggestions > 0 ? `✦ ${suggestions} new outlet${suggestions === 1 ? '' : 's'} suggested — review` : 'Discover new outlets'}
        </a>
      </p>
      <ul className="sources">
        {sources.map((s) => (
          <li key={s.slug} id={s.slug} className="source" style={s.user_weight < 0 ? { opacity: 0.6 } : undefined}>
            <div className="source-head">
              <a className="source-name" href={s.homepage} target="_blank" rel="noopener">
                {s.name}
              </a>
              <LeanChip lean={s.bias_lean} rater={s.bias_rater} overridden={s.user_bias_lean !== null} />
              <AccessBadge access={s.access_model} meteredLimit={s.metered_limit} meteredPeriod={s.metered_period} />
              <span className="state-note">
                {OWNERSHIP_LABELS[s.ownership_type]}
                {s.country !== 'US' ? ` · ${s.country}` : ''}
              </span>
            </div>
            <p className="source-notes">
              {s.access_notes}{' '}
              {s.access_evidence_url && (
                <a href={s.access_evidence_url} target="_blank" rel="noopener">
                  Access evidence{s.access_verified_on ? ` (checked ${s.access_verified_on})` : ''}
                </a>
              )}
            </p>
            <p className="source-notes">
              Lean:{' '}
              {s.bias_rating_url ? (
                <a href={s.bias_rating_url} target="_blank" rel="noopener">
                  {s.bias_rater} rating
                </a>
              ) : (
                'not rated'
              )}
              {s.bias_note ? ` — ${s.bias_note}` : ''}
            </p>
            <p className="source-notes">
              <Health s={s} />
            </p>
            <SourceControls slug={s.slug} weight={s.user_weight} userLean={s.user_bias_lean} raterLean={s.rater_bias_lean} />
          </li>
        ))}
      </ul>
      <p className="attribution">
        Media bias ratings: <a href="https://www.allsides.com/media-bias">AllSides Media Bias Ratings™</a> by AllSides.com,
        licensed <a href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a>, reduced to one lean per outlet.
        AllSides doesn&apos;t endorse NewsWiz. Ratings describe outlets overall, not individual articles.
      </p>
    </>
  );
}
