'use client';

import { useEffect } from 'react';

/**
 * Keyboard shortcuts for card lists: j/k move, o or Enter opens, s saves, m marks read.
 * Ignored while typing in a field or when a modifier key is held.
 */
export function KeyboardNav() {
  useEffect(() => {
    let index = -1;
    const cards = () => [...document.querySelectorAll<HTMLElement>('[data-card]')];
    const activate = (i: number) => {
      const list = cards();
      if (!list.length) return;
      index = Math.max(0, Math.min(i, list.length - 1));
      list.forEach((c, n) => c.classList.toggle('is-active', n === index));
      list[index]!.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const card = cards()[index];
      switch (e.key) {
        case 'j':
          activate(index + 1);
          break;
        case 'k':
          activate(index - 1);
          break;
        case 'o':
        case 'Enter':
          if (card && t === document.body) card.querySelector<HTMLAnchorElement>('[data-open-link]')?.click();
          else return;
          break;
        case 's':
          card?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
          break;
        case 'm':
          card?.querySelector<HTMLButtonElement>('[data-action="read"]')?.click();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <p className="kbd-help">
      <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>o</kbd> open · <kbd>s</kbd> save · <kbd>m</kbd> mark read
    </p>
  );
}
