import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionToken, timingSafeEqual } from './lib/auth';

/** If APP_PASSPHRASE is set, every page and API call needs the session cookie. */
export async function proxy(req: NextRequest) {
  const passphrase = process.env.APP_PASSPHRASE;
  if (!passphrase) return NextResponse.next();
  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  if (timingSafeEqual(cookie, await sessionToken(passphrase))) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return Response.json({ error: 'sign in required' }, { status: 401 });
  const login = new URL('/login', req.url);
  login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!login|api/login|api/health|_next/static|_next/image|manifest.webmanifest|icon.svg|apple-icon.png).*)'],
};
