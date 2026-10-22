'use client';

import { useState } from 'react';
import { postState } from '@/lib/client';

/** Save-for-later and mark-read toggles. Optimistic: the button flips immediately. */
export function CardActions({ articleId, saved: initialSaved, read: initialRead }: { articleId: number; saved: boolean; read: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [read, setRead] = useState(initialRead);

  const toggle = async (field: 'saved' | 'read', value: boolean, set: (v: boolean) => void) => {
    set(value);
    const ok = await postState(articleId, { [field]: value });
    if (!ok) set(!value);
  };

  return (
    <>
      <button
        type="button"
        className="btn"
        aria-pressed={saved}
        data-action="save"
        onClick={() => toggle('saved', !saved, setSaved)}
      >
        {saved ? '★ Saved' : '☆ Save'}
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={read}
        data-action="read"
        onClick={() => toggle('read', !read, setRead)}
      >
        {read ? '✓ Read' : 'Mark read'}
      </button>
    </>
  );
}
