import { listSaved } from '@newswiz/db';
import type { SavedArticle } from '@newswiz/db';
import { readerViewAllowed, minutesToRead } from '@newswiz/reader';
import { ArticleCard } from '@/components/ArticleCard';
import { KeyboardNav } from '@/components/KeyboardNav';
import { ManualProgress } from '@/components/ManualProgress';
import { db } from '@/lib/server';

export const metadata = { title: 'Saved' };

function SavedItem({ a, now }: { a: SavedArticle; now: Date }) {
  const inReader = readerViewAllowed(a) && a.reader_status !== 'blocked' && a.reader_status !== 'marked_paid';
  return (
    <div>
      <ArticleCard article={a} now={now} />
      <div className="state-note" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '4px 14px 0' }}>
        {inReader && a.word_count ? (
          <span>
            {a.read_at ? `${minutesToRead(a.word_count)} min read` : `${minutesToRead(a.word_count, a.progress)} min left`}
            {a.progress > 0 && !a.read_at && (
              <>
                {' · '}
                <a href={`/read/${a.id}`}>Resume</a>
              </>
            )}
          </span>
        ) : null}
        {!inReader && !a.read_at && <ManualProgress articleId={a.id} progress={a.progress} />}
      </div>
    </div>
  );
}

/** The reading list: started first, then not started, then finished. */
export default async function Saved() {
  const items = await listSaved(db());
  const now = new Date();
  const started = items.filter((a) => !a.read_at && a.progress > 0);
  const unstarted = items.filter((a) => !a.read_at && a.progress === 0);
  const finished = items.filter((a) => a.read_at);

  return (
    <>
      <h1>Saved</h1>
      <p className="lede">
        Articles you saved for later. In reader view your place is saved automatically; for articles on the
        publisher&apos;s site, note where you stopped.
      </p>
      {items.length === 0 && <div className="empty">Nothing saved yet. Tap ☆ Save on any article.</div>}
      {[
        { title: 'In progress', list: started },
        { title: 'Not started', list: unstarted },
      ].map(
        ({ title, list }) =>
          list.length > 0 && (
            <section key={title}>
              <h2 className="section-title">
                {title} ({list.length})
              </h2>
              <ul className="cards">
                {list.map((a) => (
                  <SavedItem key={a.id} a={a} now={now} />
                ))}
              </ul>
            </section>
          ),
      )}
      {finished.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary className="section-title" style={{ cursor: 'pointer' }}>
            Finished ({finished.length})
          </summary>
          <ul className="cards">
            {finished.map((a) => (
              <SavedItem key={a.id} a={a} now={now} />
            ))}
          </ul>
        </details>
      )}
      {items.length > 0 && <KeyboardNav />}
    </>
  );
}
