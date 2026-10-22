'use client';

import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Catch up' },
  { href: '/latest', label: 'Latest' },
  { href: '/saved', label: 'Saved' },
  { href: '/sources', label: 'Sources' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} aria-current={(l.href === '/' ? path === '/' : path.startsWith(l.href)) ? 'page' : undefined}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
