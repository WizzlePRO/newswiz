export const MAX_BACKOFF_MINUTES = 24 * 60;

export interface ScheduleInput {
  now: Date;
  intervalMinutes: number;
  /** Failures in a row *including* the one being scheduled (0 after a success). */
  consecutiveFailures: number;
  retryAfterSeconds?: number | null;
  /** Seconds the site asks between requests (robots.txt Crawl-delay). */
  crawlDelaySeconds?: number;
  /** Returns a number in [0, 1). Injected so tests are deterministic. */
  random?: () => number;
}

/**
 * When to poll a feed next. Success: the regular interval. Failure: exponential backoff
 * (interval × 2^failures, capped at a day). Retry-After and Crawl-delay are always respected.
 * ±10% jitter keeps feeds from bunching up on the same minute.
 */
export function computeNextPoll(input: ScheduleInput): Date {
  const random = input.random ?? Math.random;
  const base = input.intervalMinutes;
  let minutes =
    input.consecutiveFailures > 0
      ? Math.min(base * 2 ** Math.min(input.consecutiveFailures, 20), MAX_BACKOFF_MINUTES)
      : base;
  minutes *= 0.9 + random() * 0.2;
  if (input.retryAfterSeconds) minutes = Math.max(minutes, Math.min(input.retryAfterSeconds / 60, MAX_BACKOFF_MINUTES));
  if (input.crawlDelaySeconds) minutes = Math.max(minutes, input.crawlDelaySeconds / 60);
  return new Date(input.now.getTime() + Math.round(minutes * 60_000));
}
