import type { FeedArticle } from '@newswiz/db';
import { readerViewAllowed } from '@newswiz/reader';
import { timeAgo } from '@/lib/format';
import { AccessBadge } from './AccessBadge';
import { CardActions } from './CardActions';
import { CardLink } from './CardLink';
import { LeanChip } from './LeanChip';

export function articleHref(a: Pick<FeedArticle, 'id' | 'access_model'>): { href: string; external: boolean } {
  return readerViewAllowed(a) ? { href: `/read/${a.id}`, external: false } : { href: `/go/${a.id}`, external: true };
}

export function ArticleCard({ article: a, now }: { article: FeedArticle; now: Date }) {
  const { href, external } = articleHref(a);
  const read = Boolean(a.read_at);
  const inProgress = !read && a.progress > 0;
  return (
    <li className={`card${read ? ' is-read' : ''}`} data-card={a.id} tabIndex={-1}>
      <div className="card-meta">
        <a className="card-source" href={`/latest?source=${a.source_slug}`}>
          {a.source_name}
        </a>
        <LeanChip lean={a.bias_lean} rater={a.bias_rater} overridden={a.bias_overridden} sourceSlug={a.source_slug} />
        <AccessBadge access={a.access_model} meteredLimit={a.metered_limit} meteredPeriod={a.metered_period} />
        <time dateTime={new Date(a.sort_at).toISOString()}>{timeAgo(a.sort_at, now)}</time>
      </div>
      <h2 className="card-title">
        <CardLink href={href} external={external} articleId={a.id}>
          {a.title}
        </CardLink>
      </h2>
      {a.image_url && <img className="card-thumb" src={a.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      {a.summary && <p className="card-summary">{a.summary}</p>}
      <div className="card-foot">
        <CardActions articleId={a.id} saved={Boolean(a.saved_at)} read={read} />
        {inProgress && (
          <>
            <span className="progress" aria-label={`${Math.round(a.progress * 100)}% read`}>
              <span style={{ width: `${Math.round(a.progress * 100)}%` }} />
            </span>
            <span className="state-note">{Math.round(a.progress * 100)}% read</span>
          </>
        )}
        {!read && !inProgress && a.opened_at && <span className="state-note">Opened</span>}
        {external && <span className="state-note">Opens {a.source_name} ↗</span>}
      </div>
    </li>
  );
}
