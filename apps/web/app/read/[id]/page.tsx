import { notFound, redirect } from 'next/navigation';
import { getReaderArticle } from '@newswiz/db';
import { getOrFetchContent, minutesToRead, readerViewAllowed } from '@newswiz/reader';
import { AccessBadge } from '@/components/AccessBadge';
import { CardActions } from '@/components/CardActions';
import { LeanChip } from '@/components/LeanChip';
import { ManualProgress } from '@/components/ManualProgress';
import { ProgressTracker } from '@/components/ProgressTracker';
import { timeAgo } from '@/lib/format';
import { db, fetcher, parseId } from '@/lib/server';

const UNAVAILABLE: Record<string, string> = {
  marked_paid: "The publisher marks this article as subscriber-only, so it isn't shown here.",
  too_short: 'Only a short teaser is available here. It may be a video, a live page, or partly paywalled.',
  blocked: "This publisher doesn't allow automated readers to fetch its pages.",
  failed: "We couldn't load a readable version of this article right now.",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const a = id ? await getReaderArticle(db(), id) : null;
  return { title: a?.title ?? 'Article' };
}

/** Reader view for free articles, with saved reading position. */
export default async function Read({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const a = await getReaderArticle(db(), id);
  if (!a) notFound();
  if (!readerViewAllowed(a)) redirect(`/go/${a.id}`);

  const content = await getOrFetchContent(db(), fetcher(), a);
  const header = (
    <header className="reader-head">
      <div className="card-meta">
        <a className="card-source" href={`/latest?source=${a.source_slug}`}>
          {a.source_name}
        </a>
        <LeanChip lean={a.bias_lean} rater={a.bias_rater} overridden={a.bias_overridden} sourceSlug={a.source_slug} />
        <AccessBadge access={a.access_model} />
      </div>
      <h1>{a.title}</h1>
      <div className="reader-byline">
        {[a.author, timeAgo(a.sort_at), content.word_count && content.status === 'ok' ? `${minutesToRead(content.word_count)} min read` : null]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </header>
  );
  const footer = (
    <footer className="reader-foot">
      <div className="card-foot" style={{ marginTop: 0 }}>
        <CardActions articleId={a.id} saved={Boolean(a.saved_at)} read={Boolean(a.read_at)} />
        <a className="btn" href={`/go/${a.id}`} target="_blank" rel="noopener">
          Read on {a.source_name} ↗
        </a>
      </div>
      {a.donate_url && (
        <p className="state-note">
          {a.source_name} is free to read because readers support it.{' '}
          <a href={a.donate_url} target="_blank" rel="noopener">
            Support their journalism ↗
          </a>
        </p>
      )}
    </footer>
  );

  if (content.status !== 'ok' || !content.html) {
    return (
      <article>
        {header}
        <div className="notice">
          <p style={{ marginTop: 0 }}>{UNAVAILABLE[content.status] ?? UNAVAILABLE.failed}</p>
          <a className="btn primary big" href={`/go/${a.id}`} target="_blank" rel="noopener">
            Open on {a.source_name} ↗
          </a>
          {!a.read_at && (
            <p>
              <ManualProgress articleId={a.id} progress={a.progress} />
            </p>
          )}
        </div>
        {footer}
      </article>
    );
  }

  return (
    <article>
      {header}
      {/* Sanitized at extraction time (allowlisted tags/attributes only, no scripts or styles). */}
      <div id="reader-body" className="reader-body" dangerouslySetInnerHTML={{ __html: content.html }} />
      <ProgressTracker
        articleId={a.id}
        initialBlock={a.progress_block}
        initialProgress={a.progress}
        wordCount={content.word_count ?? 0}
        finished={Boolean(a.read_at)}
      />
      {footer}
    </article>
  );
}
