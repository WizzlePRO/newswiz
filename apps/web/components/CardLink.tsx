'use client';

import { useState } from 'react';

/** Title link that dims its card as soon as it's opened, without waiting for a reload. */
export function CardLink({
  href,
  external,
  articleId,
  children,
}: {
  href: string;
  external: boolean;
  articleId: number;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <a
      href={href}
      data-open-link={articleId}
      {...(external ? { target: '_blank', rel: 'noopener' } : {})}
      onClick={() => setOpened(true)}
      style={opened ? { color: 'var(--muted)' } : undefined}
    >
      {children}
    </a>
  );
}
