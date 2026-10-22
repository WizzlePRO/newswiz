import { describe, expect, it } from 'vitest';
import { computeNextPoll, MAX_BACKOFF_MINUTES } from '../src/schedule.ts';

const now = new Date('2026-10-22T12:00:00Z');
const minutesUntil = (d: Date) => (d.getTime() - now.getTime()) / 60_000;
const noJitter = () => 0.5; // 0.9 + 0.5 * 0.2 = 1.0

describe('computeNextPoll', () => {
  it('uses the regular interval after a success', () => {
    expect(minutesUntil(computeNextPoll({ now, intervalMinutes: 15, consecutiveFailures: 0, random: noJitter }))).toBe(15);
  });

  it('backs off exponentially on consecutive failures', () => {
    const delays = [1, 2, 3, 4].map((f) =>
      minutesUntil(computeNextPoll({ now, intervalMinutes: 15, consecutiveFailures: f, random: noJitter })),
    );
    expect(delays).toEqual([30, 60, 120, 240]);
  });

  it('caps backoff at one day', () => {
    expect(minutesUntil(computeNextPoll({ now, intervalMinutes: 15, consecutiveFailures: 40, random: noJitter }))).toBe(
      MAX_BACKOFF_MINUTES,
    );
  });

  it('honors Retry-After when it is longer than the backoff', () => {
    const next = computeNextPoll({ now, intervalMinutes: 10, consecutiveFailures: 1, retryAfterSeconds: 3600, random: noJitter });
    expect(minutesUntil(next)).toBe(60);
  });

  it('honors robots.txt Crawl-delay', () => {
    const next = computeNextPoll({ now, intervalMinutes: 5, consecutiveFailures: 0, crawlDelaySeconds: 900, random: noJitter });
    expect(minutesUntil(next)).toBe(15);
  });

  it('jitters within ±10%', () => {
    const lo = minutesUntil(computeNextPoll({ now, intervalMinutes: 60, consecutiveFailures: 0, random: () => 0 }));
    const hi = minutesUntil(computeNextPoll({ now, intervalMinutes: 60, consecutiveFailures: 0, random: () => 0.9999 }));
    expect(lo).toBeCloseTo(54);
    expect(hi).toBeCloseTo(66, 0);
  });
});
