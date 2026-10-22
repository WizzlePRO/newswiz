/** Session cookie for the optional single-user passphrase (APP_PASSPHRASE). */
export const SESSION_COOKIE = 'nw_session';

/** The cookie holds a hash of the passphrase, so changing the passphrase signs everyone out. */
export async function sessionToken(passphrase: string): Promise<string> {
  const data = new TextEncoder().encode(`newswiz-session:${passphrase}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(digest).toString('base64url');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
