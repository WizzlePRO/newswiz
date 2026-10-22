import { RobotsCache } from './robots.ts';

export const USER_AGENT_PRODUCT = 'NewsWiz';

/** Honest user agent: who we are and how to reach the person running this instance. */
export function userAgent(contact = process.env.INGEST_CONTACT || 'https://github.com/your-name/newswiz'): string {
  return `${USER_AGENT_PRODUCT}/0.1 (+${contact})`;
}

export interface PoliteFetchOptions {
  etag?: string | null;
  lastModified?: string | null;
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export type PoliteFetchResult =
  | { kind: 'ok'; status: number; body: string; etag: string | null; lastModified: string | null; finalUrl: string }
  | { kind: 'not_modified'; status: 304 }
  | { kind: 'disallowed'; reason: string }
  | { kind: 'http_error'; status: number; retryAfterSeconds: number | null }
  | { kind: 'network_error'; message: string };

export class PoliteFetcher {
  readonly robots: RobotsCache;

  constructor(
    readonly ua = userAgent(),
    robots?: RobotsCache,
  ) {
    this.robots = robots ?? new RobotsCache(ua);
  }

  /** GET a URL after checking robots.txt, with conditional headers, a timeout, and a size cap. */
  async get(url: string, opts: PoliteFetchOptions = {}): Promise<PoliteFetchResult> {
    const robots = await this.robots.check(url);
    if (!robots.allowed) return { kind: 'disallowed', reason: robots.reason };

    const headers: Record<string, string> = {
      'user-agent': this.ua,
      accept: opts.accept ?? 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
    };
    if (opts.etag) headers['if-none-match'] = opts.etag;
    if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;

    let res: Response;
    try {
      res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    } catch (err) {
      const e = err as Error & { cause?: { code?: string; message?: string } };
      return { kind: 'network_error', message: e.cause?.code ?? e.cause?.message ?? e.message };
    }
    if (res.status === 304) return { kind: 'not_modified', status: 304 };
    if (!res.ok) {
      await res.body?.cancel();
      return { kind: 'http_error', status: res.status, retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')) };
    }
    try {
      const body = await readCapped(res, opts.maxBytes ?? 15 * 1024 * 1024);
      return {
        kind: 'ok',
        status: res.status,
        body,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        finalUrl: res.url || url,
      };
    } catch (err) {
      return { kind: 'network_error', message: (err as Error).message };
    }
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`response larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Retry-After is either seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((at - now) / 1000));
}
