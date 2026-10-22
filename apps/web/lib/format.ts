import type { AccessModel, BiasLean, OwnershipType } from '@newswiz/db';

export function timeAgo(date: Date | string, now = new Date()): string {
  const ms = now.getTime() - new Date(date).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

/** Clock times are shown in APP_TIMEZONE (an IANA name like America/Chicago), else the server's zone. */
export function formatClock(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: process.env.APP_TIMEZONE || undefined,
  });
}

export const ACCESS_LABELS: Record<AccessModel, { label: string; title: string }> = {
  free: { label: 'Free', title: 'Free to read, no account needed' },
  registration: { label: 'Free w/ account', title: 'Free, but the outlet asks you to sign up' },
  mixed: { label: 'Mostly free', title: 'Most articles are free; some are for subscribers' },
  metered: { label: 'Metered', title: 'A few free articles, then a paywall' },
  paywalled: { label: 'Paywalled', title: 'Subscription required' },
  unknown: { label: 'Unverified', title: 'Access policy not verified yet' },
};

export const LEAN_LABELS: Record<BiasLean, { label: string; short: string }> = {
  left: { label: 'Left', short: 'L' },
  lean_left: { label: 'Lean left', short: 'LL' },
  center: { label: 'Center', short: 'C' },
  lean_right: { label: 'Lean right', short: 'LR' },
  right: { label: 'Right', short: 'R' },
  mixed: { label: 'Mixed', short: 'M' },
  unrated: { label: 'Unrated', short: '?' },
};

export const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  public_media: 'Public media',
  nonprofit: 'Nonprofit',
  commercial: 'Commercial',
  wire: 'Wire service',
  government: 'Government',
};

export function meterDetail(limit: number | null, period: 'week' | 'month' | null): string | null {
  if (limit && period) return `${limit} free/${period}`;
  return null;
}
