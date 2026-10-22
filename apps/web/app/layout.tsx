import type { Metadata, Viewport } from 'next';
import { Nav } from '@/components/Nav';
import './globals.css';

// Every page reads live data from Postgres; nothing is prerendered.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'NewsWiz', template: '%s · NewsWiz' },
  description: 'Balanced news, free journalism first.',
  appleWebApp: { capable: true, title: 'NewsWiz', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#141412' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="topbar-inner">
            <a className="brand" href="/">
              News<span>Wiz</span>
            </a>
            <Nav />
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
