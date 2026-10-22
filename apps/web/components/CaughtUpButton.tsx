'use client';

import { useState } from 'react';

/** Ends the current news cycle: the next Catch up starts from now. */
export function CaughtUpButton({ label = "I'm caught up" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn primary big"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch('/api/cycle', { method: 'POST' }).catch(() => null);
        if (res?.ok) window.location.assign('/?done=1');
        else setBusy(false);
      }}
    >
      {busy ? 'Saving…' : `✓ ${label}`}
    </button>
  );
}
