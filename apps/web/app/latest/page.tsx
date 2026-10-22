import { BIAS_LEANS, listArticles } from '@newswiz/db';
import type { BiasLean } from '@newswiz/db';
import { ArticleCard } from '@/components/ArticleCard';
import { KeyboardNav } from '@/components/KeyboardNav';
import { LEAN_LABELS } from '@/lib/format';
import { db } from '@/lib/server';

export const metadata = { title: 'Latest' };

type Search = { free?: string; unread?: string; source?: string; lean?: string; before?: string };

function hrefWith(current: Search, change: Partial<Search>): string {
  const next = { ...current, ...change, before: undefined };
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
  return qs.size ? `/latest?${qs}` : '/latest';
}

/** Everything, newest first, with quick filters. */
export default async function Latest({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const lean = BIAS_LEANS.includes(sp.lean as BiasLean) ? (sp.lean as BiasLean) : undefined;
  let before: { sortAt: Date; id: number } | undefined;
  if (sp.before) {
    const [ts, id] = sp.before.split('_');
    const sortAt = new Date(Number(ts));
    if (!Number.isNaN(sortAt.getTime()) && Number(id) > 0) before = { sortAt, id: Number(id) };
  }
  const articles = await listArticles(db(), {
    limit: 50,
    before,
    freeOnly: sp.free === '1',
    unreadOnly: sp.unread === '1',
    sourceSlug: sp.source,
    lean,
  });
  const now = new Date();
  const last = articles.at(-1);

  return (
    <>
      <h1>{sp.source && articles[0] ? articles[0].source_name : 'Latest'}</h1>
      <p className="lede">Every article as it arrives, newest first.</p>
      <div className="filters" role="group" aria-label="Filters">
        <a className="chip" aria-current={sp.free === '1'} href={hrefWith(sp, { free: sp.free === '1' ? undefined : '1' })}>
          Free only
        </a>
        <a className="chip" aria-current={sp.unread === '1'} href={hrefWith(sp, { unread: sp.unread === '1' ? undefined : '1' })}>
          Unread
        </a>
        {(['left', 'lean_left', 'center', 'lean_right', 'right'] as const).map((l) => (
          <a key={l} className="chip" aria-current={lean === l} href={hrefWith(sp, { lean: lean === l ? undefined : l })}>
            {LEAN_LABELS[l].label}
          </a>
        ))}
        {sp.source && (
          <a className="chip" aria-current href={hrefWith(sp, { source: undefined })}>
            {sp.source} ✕
          </a>
        )}
      </div>
      {articles.length === 0 ? (
        <div className="empty">No articles match these filters.</div>
      ) : (
        <ul className="cards">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} now={now} />
          ))}
        </ul>
      )}
      {last && articles.length === 50 && (
        <div className="pager">
          <a className="btn" href={`${hrefWith(sp, {})}${hrefWith(sp, {}).includes('?') ? '&' : '?'}before=${new Date(last.sort_at).getTime()}_${last.id}`}>
            Older →
          </a>
        </div>
      )}
      <KeyboardNav />
    </>
  );
}
