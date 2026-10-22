import { SESSION_COOKIE, sessionToken, timingSafeEqual } from '@/lib/auth';

export async function POST(req: Request) {
  const passphrase = process.env.APP_PASSPHRASE;
  const form = await req.formData();
  const given = String(form.get('passphrase') ?? '');
  const next = String(form.get('next') ?? '/');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (!passphrase || !timingSafeEqual(await sessionToken(given), await sessionToken(passphrase))) {
    return new Response(null, { status: 303, headers: { location: `/login?error=1&next=${encodeURIComponent(safeNext)}` } });
  }
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return new Response(null, {
    status: 303,
    headers: {
      location: safeNext,
      'set-cookie': `${SESSION_COOKIE}=${await sessionToken(passphrase)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
    },
  });
}
