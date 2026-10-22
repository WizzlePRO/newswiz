'use client';

import { useState } from 'react';
import type { AccessModel, BiasLean, OwnershipType } from '@newswiz/db';
import { ACCESS_LABELS, LEAN_LABELS, OWNERSHIP_LABELS } from '@/lib/format';

const ACCESS: AccessModel[] = ['free', 'registration', 'mixed', 'metered', 'paywalled', 'unknown'];
const LEANS: BiasLean[] = ['left', 'lean_left', 'center', 'lean_right', 'right', 'mixed'];
const OWNERSHIP: OwnershipType[] = ['commercial', 'nonprofit', 'public_media', 'wire', 'government'];

/** Review form for one discovered outlet: confirm its access model, ownership, and lean, then add or dismiss. */
export function CandidateCard({
  id,
  name: initialName,
  accessGuess,
}: {
  id: number;
  name: string;
  accessGuess: AccessModel;
}) {
  const [name, setName] = useState(initialName);
  const [access, setAccess] = useState<AccessModel>(accessGuess);
  const [ownership, setOwnership] = useState<OwnershipType>('commercial');
  const [lean, setLean] = useState<BiasLean | ''>('');
  const [state, setState] = useState<'idle' | 'busy' | 'added' | 'dismissed' | 'error'>('idle');

  const send = async (body: object, done: 'added' | 'dismissed') => {
    setState('busy');
    const res = await fetch(`/api/candidates/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    setState(res?.ok ? done : 'error');
  };

  if (state === 'added') return <p className="state-note">✓ Added. Its articles will appear after the next feed poll.</p>;
  if (state === 'dismissed') return <p className="state-note">Dismissed. It won&apos;t be suggested again.</p>;

  const select = { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px', background: 'var(--surface)' };
  return (
    <div className="source-controls" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <label className="state-note">
        Name{' '}
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...select, borderRadius: 8, width: '100%', maxWidth: 320 }} />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label className="state-note">
          Access{' '}
          <select value={access} onChange={(e) => setAccess(e.target.value as AccessModel)} style={select}>
            {ACCESS.map((a) => (
              <option key={a} value={a}>
                {ACCESS_LABELS[a].label}
                {a === accessGuess ? ' (detected)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="state-note">
          Type{' '}
          <select value={ownership} onChange={(e) => setOwnership(e.target.value as OwnershipType)} style={select}>
            {OWNERSHIP.map((o) => (
              <option key={o} value={o}>
                {OWNERSHIP_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="state-note">
          Lean{' '}
          <select value={lean} onChange={(e) => setLean(e.target.value as BiasLean | '')} style={select}>
            <option value="">Unrated</option>
            {LEANS.map((l) => (
              <option key={l} value={l}>
                {LEAN_LABELS[l].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn primary"
          disabled={state === 'busy'}
          onClick={() => send({ action: 'approve', name, access_model: access, ownership_type: ownership, lean: lean || null }, 'added')}
        >
          + Add to my sources
        </button>
        <button type="button" className="btn" disabled={state === 'busy'} onClick={() => send({ action: 'reject' }, 'dismissed')}>
          Dismiss
        </button>
      </div>
      {state === 'error' && <p className="state-note" style={{ color: 'var(--paywalled)' }}>That didn&apos;t work. Try again.</p>}
    </div>
  );
}
