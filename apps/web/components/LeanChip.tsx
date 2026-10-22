import type { BiasLean } from '@newswiz/db';
import { LEAN_LABELS } from '@/lib/format';

const SCALE: BiasLean[] = ['left', 'lean_left', 'center', 'lean_right', 'right'];

/**
 * Outlet-level political lean: a five-step scale with the outlet's position lit, plus a label.
 * It describes the outlet overall (per its rater), never the individual article.
 */
export function LeanChip({
  lean,
  rater,
  overridden = false,
  sourceSlug,
}: {
  lean: BiasLean;
  rater: string | null;
  overridden?: boolean;
  sourceSlug?: string;
}) {
  const { label } = LEAN_LABELS[lean];
  const by = overridden ? 'your rating' : rater ? `rated by ${rater}` : 'no rating';
  const title =
    lean === 'unrated'
      ? 'This outlet has no bias rating yet. You can set your own on the Sources page.'
      : `Outlet lean: ${label} (${by}). This describes the outlet overall, not this article.`;
  const body = (
    <>
      <span className="lean-scale" aria-hidden="true">
        {SCALE.map((step) => (
          <i key={step} className={step === lean ? 'on' : ''} />
        ))}
      </span>
      {label}
      {overridden && <span className="override">(yours)</span>}
    </>
  );
  return sourceSlug ? (
    <a className={`lean ${lean}`} title={title} href={`/sources#${sourceSlug}`} aria-label={title}>
      {body}
    </a>
  ) : (
    <span className={`lean ${lean}`} title={title} aria-label={title}>
      {body}
    </span>
  );
}
