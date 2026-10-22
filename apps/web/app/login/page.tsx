export const metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <form className="login" method="post" action="/api/login">
      <h1>NewsWiz</h1>
      <label htmlFor="passphrase">Passphrase</label>
      <input id="passphrase" name="passphrase" type="password" autoComplete="current-password" autoFocus required />
      <input type="hidden" name="next" value={next ?? '/'} />
      {error && <p style={{ color: 'var(--paywalled)', margin: 0 }}>That passphrase didn&apos;t match.</p>}
      <button className="btn primary big" type="submit">
        Sign in
      </button>
    </form>
  );
}
