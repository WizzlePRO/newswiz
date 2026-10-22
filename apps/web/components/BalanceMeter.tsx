import type { BalanceSummary, Side } from '@newswiz/db';
import { OWNERSHIP_LABELS } from '@/lib/format';

const SIDES: { side: Side; label: string }[] = [
  { side: 'left', label: 'Left' },
  { side: 'center', label: 'Center' },
  { side: 'right', label: 'Right' },
  { side: 'unrated', label: 'Unrated' },
];

const THIN_LABELS = { left: 'left-leaning', center: 'center', right: 'right-leaning' } as const;

/** Where this briefing's articles come from, by outlet lean and by ownership. */
export function BalanceMeter({ picked, pool }: { picked: BalanceSummary; pool: BalanceSummary }) {
  const total = picked.articles || 1;
  const thin = (['left', 'center', 'right'] as const).filter((s) => pool.bySide[s] < 5);
  return (
    <section className="balance" aria-labelledby="balance-title">
      <strong id="balance-title" style={{ fontSize: 14 }}>
        Balance of this briefing
      </strong>
      <div className="balance-bar" role="img" aria-label={SIDES.map((s) => `${s.label} ${picked.bySide[s.side]}`).join(', ')}>
        {SIDES.map(({ side }) =>
          picked.bySide[side] ? <span key={side} className={side} style={{ width: `${(picked.bySide[side] / total) * 100}%` }} /> : null,
        )}
      </div>
      <ul className="balance-legend">
        {SIDES.map(({ side, label }) => (
          <li key={side}>
            <span className={`dot ${side}`} aria-hidden="true" />
            {label} <b>{picked.bySide[side]}</b>
          </li>
        ))}
      </ul>
      <p className="balance-note">
        {picked.outlets} outlets ·{' '}
        {Object.entries(picked.byOwnership)
          .map(([k, v]) => `${OWNERSHIP_LABELS[k as keyof typeof OWNERSHIP_LABELS]} ${v}`)
          .join(' · ')}{' '}
        · International {picked.international}
      </p>
      {thin.length > 0 && (
        <p className="balance-note">
          Only a few new articles from {thin.map((s) => THIN_LABELS[s]).join(' and ')} outlets this cycle, so they
          can&apos;t fill an equal share. Add outlets on the <a href="/sources">Sources</a> page to widen it.
        </p>
      )}
      <p className="balance-note">Lean ratings describe outlets, not individual articles.</p>
    </section>
  );
}
