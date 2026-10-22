import robotsParser from 'robots-parser';

type Robots = ReturnType<typeof robotsParser>;

interface Entry {
  /** null means "everything allowed" (no robots.txt). */
  robots: Robots | null;
  /** Set when robots.txt was unreachable: treat the whole site as off-limits until it expires. */
  unavailable: boolean;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE_TTL_MS = 30 * 60 * 1000;

/**
 * Per-origin robots.txt cache. Follows Google's conventions: a 4xx robots.txt means no
 * restrictions; a 5xx or network failure means stay away for now.
 */
export class RobotsCache {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<Entry>>();

  constructor(
    private readonly ua: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async check(url: string): Promise<{ allowed: true } | { allowed: false; reason: string }> {
    const origin = new URL(url).origin;
    const entry = await this.load(origin);
    if (entry.unavailable) return { allowed: false, reason: `robots.txt unreachable for ${origin}` };
    if (!entry.robots) return { allowed: true };
    // robots-parser returns undefined for URLs on other hosts; treat as allowed.
    return entry.robots.isAllowed(url, this.ua) === false
      ? { allowed: false, reason: `disallowed by ${origin}/robots.txt` }
      : { allowed: true };
  }

  /** Seconds the site asks crawlers to wait between requests, if any. */
  async crawlDelay(url: string): Promise<number | undefined> {
    const entry = await this.load(new URL(url).origin);
    return entry.robots?.getCrawlDelay(this.ua);
  }

  private async load(origin: string): Promise<Entry> {
    const cached = this.entries.get(origin);
    if (cached && cached.expiresAt > Date.now()) return cached;
    let pending = this.inflight.get(origin);
    if (!pending) {
      pending = this.fetchRobots(origin).finally(() => this.inflight.delete(origin));
      this.inflight.set(origin, pending);
    }
    const entry = await pending;
    this.entries.set(origin, entry);
    return entry;
  }

  private async fetchRobots(origin: string): Promise<Entry> {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await this.fetchImpl(robotsUrl, {
        headers: { 'user-agent': this.ua },
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 500) {
        return { robots: null, unavailable: true, expiresAt: Date.now() + UNAVAILABLE_TTL_MS };
      }
      if (!res.ok) return { robots: null, unavailable: false, expiresAt: Date.now() + TTL_MS };
      const text = await res.text();
      return { robots: robotsParser(robotsUrl, text), unavailable: false, expiresAt: Date.now() + TTL_MS };
    } catch {
      return { robots: null, unavailable: true, expiresAt: Date.now() + UNAVAILABLE_TTL_MS };
    }
  }
}
