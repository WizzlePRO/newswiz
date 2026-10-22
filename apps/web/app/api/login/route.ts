import { SESSION_COOKIE, sessionToken, timingSafeEqual } from '@/lib/auth';

/**
 * Sign in with the passphrase.
 * - Browser form post: sets the session cookie and redirects.
 * - JSON post ({ "passphrase": "..." }), used by the mobile apps: returns { token } to send as
 *   `Authorization: Bearer <token>`.
 */
export async function POST(req: Request) {
  const passphrase = process.env.APP_PASSPHRASE;
  const isJson = req.headers.get('content-type')?.includes('application/json');
  let given = '';
  let next = '/';
  if (isJson) {
    const body = (await req.json().catch(() => ({}))) as { passphrase?: unknown };
    given = typeof body.passphrase === 'string' ? body.passphrase : '';
  } else {
    const form = await req.formData();
    given = String(form.get('passphrase') ?? '');
    next = String(form.get('next') ?? '/');
  }
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  // No passphrase configured means the app is open; hand out a token anyway so clients work the same.
  const expected = passphrase ?? '';
  const ok = !passphrase || timingSafeEqual(await sessionToken(given), await sessionToken(expected));

  if (isJson) {
    return ok
      ? Response.json({ token: await sessionToken(expected), protected: Boolean(passphrase) })
      : Response.json({ error: 'wrong passphrase' }, { status: 401 });
  }
  if (!ok) {
    return new Response(null, { status: 303, headers: { location: `/login?error=1&next=${encodeURIComponent(safeNext)}` } });
  }
  // Behind Railway's proxy the app sees http; the original scheme is in x-forwarded-proto.
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  const secure = proto === 'https' ? '; Secure' : '';
  return new Response(null, {
    status: 303,
    headers: {
      location: safeNext,
      'set-cookie': `${SESSION_COOKIE}=${await sessionToken(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
    },
  });
}
