'use client';

import { useState } from 'react';
import { postState } from '@/lib/client';

const STEPS = [
  { value: 0, label: 'Not started' },
  { value: 0.25, label: 'About ¼ through' },
  { value: 0.5, label: 'About halfway' },
  { value: 0.75, label: 'About ¾ through' },
  { value: 1, label: 'Finished' },
];

/**
 * For articles read on the publisher's site, where the app can't see scrolling: let the
 * reader note roughly where they stopped.
 */
export function ManualProgress({ articleId, progress }: { articleId: number; progress: number }) {
  const nearest = STEPS.reduce((best, s) => (Math.abs(s.value - progress) < Math.abs(best.value - progress) ? s : best));
  const [value, setValue] = useState(nearest.value);
  return (
    <label className="state-note" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      Where I stopped:
      <select
        value={value}
        onChange={async (e) => {
          const v = Number(e.target.value);
          setValue(v);
          await postState(articleId, v === 1 ? { read: true } : { progress: v, progressSource: 'manual' });
        }}
        style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', background: 'var(--surface)' }}
      >
        {STEPS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
