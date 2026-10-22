'use client';

import { useState } from 'react';
import type { BiasLean } from '@newswiz/db';
import { LEAN_LABELS } from '@/lib/format';

const LEANS: BiasLean[] = ['left', 'lean_left', 'center', 'lean_right', 'right', 'mixed', 'unrated'];

/** Mute/boost an outlet and optionally override its lean rating with your own. */
export function SourceControls({
  slug,
  weight: initialWeight,
  userLean: initialUserLean,
  raterLean,
}: {
  slug: string;
  weight: number;
  userLean: BiasLean | null;
  raterLean: BiasLean;
}) {
  const [weight, setWeight] = useState(initialWeight);
  const [userLean, setUserLean] = useState<BiasLean | null>(initialUserLean);
  const save = (body: object) =>
    fetch(`/api/sources/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const setW = async (w: number) => {
    const next = weight === w ? 0 : w;
    setWeight(next);
    await save({ weight: next });
  };

  return (
    <div className="source-controls">
      <button type="button" className="btn" aria-pressed={weight === 1} onClick={() => setW(1)}>
        ▲ Boost
      </button>
      <button type="button" className="btn" aria-pressed={weight === -1} onClick={() => setW(-1)}>
        Mute
      </button>
      <label>
        My rating:{' '}
        <select
          value={userLean ?? ''}
          onChange={async (e) => {
            const v = (e.target.value || null) as BiasLean | null;
            setUserLean(v);
            await save({ userLean: v });
          }}
        >
          <option value="">Use rater ({LEAN_LABELS[raterLean].label})</option>
          {LEANS.map((l) => (
            <option key={l} value={l}>
              {LEAN_LABELS[l].label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
