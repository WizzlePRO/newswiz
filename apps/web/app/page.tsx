import { ArticleCard } from '@/components/ArticleCard';
import { BalanceMeter } from '@/components/BalanceMeter';
import { CaughtUpButton } from '@/components/CaughtUpButton';
import { KeyboardNav } from '@/components/KeyboardNav';
import { loadBriefing } from '@/lib/briefing';
import { formatClock } from '@/lib/format';

export default async function CatchUp({ searchParams }: { searchParams: Promise<{ more?: string; done?: string }> }) {
  const { more, done } = await searchParams;
  const { now, since, candidates, briefing, inProgress, picked, pool, outlets } = await loadBriefing({ longer: Boolean(more) });
  const remaining = candidates.length - briefing.length;

  return (
    <>
      <h1>Catch up</h1>
      <p className="lede">
        Since {formatClock(since)} · {candidates.length.toLocaleString()} new from{' '}
        {outlets} outlets. Here&apos;s a balanced {briefing.length}.
      </p>

      {inProgress.length > 0 && (
        <>
          <h2 className="section-title">Continue reading</h2>
          <ul className="cards" style={{ marginBottom: 8 }}>
            {inProgress.map((a) => (
              <ArticleCard key={a.id} article={a} now={now} />
            ))}
          </ul>
        </>
      )}

      {briefing.length === 0 ? (
        <div className="empty">
          {done ? "You're caught up. New stories will collect here as they're published." : 'Nothing new since your last cycle.'}
        </div>
      ) : (
        <>
          <BalanceMeter picked={picked} pool={pool} />
          <ul className="cards">
            {briefing.map((a) => (
              <ArticleCard key={a.id} article={a} now={now} />
            ))}
          </ul>
          <div className="caught-up">
            {!more && remaining > 0 && (
              <a className="btn" href="/?more=1">
                Show a longer briefing
              </a>
            )}
            <CaughtUpButton />
            <span>Starts a fresh cycle from now. Saved and in-progress articles stay where they are.</span>
          </div>
          <KeyboardNav />
        </>
      )}
    </>
  );
}
