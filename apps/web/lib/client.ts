'use client';

export interface StatePatch {
  opened?: boolean;
  saved?: boolean;
  read?: boolean;
  progress?: number;
  block?: number | null;
  progressSource?: 'reader' | 'manual';
}

export async function postState(articleId: number, patch: StatePatch): Promise<boolean> {
  try {
    const res = await fetch(`/api/articles/${articleId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fire-and-forget save that survives the page closing (tab switch, app backgrounded). */
export function beaconState(articleId: number, patch: StatePatch): void {
  const body = new Blob([JSON.stringify(patch)], { type: 'application/json' });
  if (!navigator.sendBeacon?.(`/api/articles/${articleId}/state`, body)) void postState(articleId, patch);
}
