import {
  findDiscoveryLeads, getSetting, knownSourceDomains, pruneLinkMentions, saveCandidate, setSetting,
} from '@newswiz/db';
import type { AccessModel, CandidateInput, DiscoveryLead, ParsedItem, Pool } from '@newswiz/db';
import { readAccessSignals } from '@newswiz/net';
import type { PoliteFetcher } from '@newswiz/net';
import { decode } from 'he';
import { normalizeDomain } from './mentions.ts';
import { parseFeed } from './parse.ts';

export const DISCOVERY_SETTING_KEY = 'discovery_last_run';
const DISCOVERY_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Candidates checked per daily run; each costs a few polite requests to that site. */
const DAILY_LIMIT = 15;
const FALLBACK_FEED_PATHS = ['/feed/', '/rss.xml', '/feed.xml'];
const MIN_FEED_ITEMS = 3;
const MAX_NEWEST_AGE_DAYS = 7;
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5';

/** RSS/Atom feeds a page advertises with <link rel="alternate">. */
export function findFeedLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    const rel = attr('rel')?.toLowerCase() ?? '';
    const type = attr('type')?.toLowerCase() ?? '';
    const href = attr('href');
    if (!href || !rel.split(/\s+/).includes('alternate')) continue;
    if (!/(rss|atom)\+xml|application\/xml|text\/xml/.test(type)) continue;
    // Comment feeds aren't the news.
    if (/comments?/i.test(attr('title') ?? '') || /\/comments\/feed/i.test(href)) continue;
    try {
      out.push(new URL(decode(href), base).toString());
    } catch {
      /* ignore bad hrefs */
    }
  }
  return [...new Set(out)];
}

/** The site's own name: og:site_name, then application-name, then the <title> minus taglines. */
export function siteName(html: string): string | null {
  const meta = (key: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'))?.[1];
  const raw = meta('og:site_name') ?? meta('application-name') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (!raw) return null;
  const name = decode(raw).split(/\s+[|–—-]\s+|:\s/)[0]!.trim();
  return name || null;
}

/** Best guess at the access model from one sample article, plus the evidence behind it. */
export function guessAccess(html: string): { guess: AccessModel; evidence: Record<string, unknown> } {
  const s = readAccessSignals(html);
  const evidence: Record<string, unknown> = { ...s };
  if (s.jsonLdFree === false) return { guess: 'paywalled', evidence: { ...evidence, reason: 'Sample article is marked isAccessibleForFree=false' } };
  if (s.paywallVendors.length) {
    return { guess: 'metered', evidence: { ...evidence, reason: `Uses a subscription/paywall service (${s.paywallVendors.join(', ')})` } };
  }
  if (s.jsonLdFree === true) return { guess: 'free', evidence: { ...evidence, reason: 'Sample article is marked isAccessibleForFree=true' } };
  return { guess: 'unknown', evidence: { ...evidence, reason: 'No paywall markers on the sample article (probably free, but unconfirmed)' } };
}

function feedIsUsable(items: ParsedItem[], now: Date): string | null {
  if (items.length < MIN_FEED_ITEMS) return `feed has only ${items.length} items`;
  const dated = items.filter((i) => i.publishedAt);
  if (!dated.length) return 'feed items have no dates';
  const newest = Math.max(...dated.map((i) => i.publishedAt!.getTime()));
  if (now.getTime() - newest > MAX_NEWEST_AGE_DAYS * 86_400_000) return 'feed has nothing from the past week';
  return null;
}

/** Check one lead: find a working, fresh feed and sample an article for access signals. */
export async function evaluateLead(fetcher: PoliteFetcher, lead: DiscoveryLead, now = new Date()): Promise<CandidateInput> {
  const homepage = `https://${lead.domain}/`;
  const base: CandidateInput = {
    domain: lead.domain, name: null, homepage, feed_url: null, status: 'invalid', invalid_reason: null,
    cited_by: lead.cited_by, mention_count: lead.mention_count, feed_items: null, newest_item_at: null,
    sample_titles: [], access_guess: null, access_evidence: null,
  };

  const home = await fetcher.get(homepage, { accept: HTML_ACCEPT, timeoutMs: 15_000, maxBytes: 8 * 1024 * 1024 });
  if (home.kind !== 'ok') {
    const why = home.kind === 'http_error' ? `HTTP ${home.status}` : home.kind === 'network_error' ? home.message : home.kind === 'disallowed' ? home.reason : home.kind;
    return { ...base, invalid_reason: `homepage unavailable: ${why}` };
  }
  const name = siteName(home.body);
  const candidates = [
    ...findFeedLinks(home.body, home.finalUrl),
    ...FALLBACK_FEED_PATHS.map((p) => new URL(p, home.finalUrl).toString()),
  ];

  let lastProblem = 'no RSS or Atom feed found';
  for (const feedUrl of [...new Set(candidates)].slice(0, 5)) {
    const res = await fetcher.get(feedUrl, { timeoutMs: 15_000 });
    if (res.kind !== 'ok') continue;
    let items: ParsedItem[];
    try {
      items = parseFeed(res.body, res.finalUrl);
    } catch {
      continue;
    }
    const problem = feedIsUsable(items, now);
    if (problem) {
      lastProblem = problem;
      continue;
    }
    const newest = items.filter((i) => i.publishedAt).sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime());
    let access: ReturnType<typeof guessAccess> = { guess: 'unknown', evidence: { reason: 'Sample article could not be fetched' } };
    const sample = newest[0];
    if (sample) {
      const page = await fetcher.get(sample.url, { accept: HTML_ACCEPT, timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024 });
      if (page.kind === 'ok') access = guessAccess(page.body);
      access.evidence.sample_url = sample.url;
    }
    return {
      ...base,
      name: name ?? lead.domain,
      homepage: home.finalUrl,
      feed_url: res.finalUrl,
      status: 'pending',
      feed_items: items.length,
      newest_item_at: newest[0]?.publishedAt ?? null,
      sample_titles: newest.slice(0, 3).map((i) => i.title),
      access_guess: access.guess,
      access_evidence: access.evidence,
    };
  }
  return { ...base, name, invalid_reason: lastProblem };
}

export interface DiscoveryReport {
  checked: number;
  found: CandidateInput[];
  invalid: CandidateInput[];
}

/** Check today's top leads and store the results for review on the Discover page. */
export async function runDiscovery(db: Pool, fetcher: PoliteFetcher, opts: { limit?: number; now?: Date } = {}): Promise<DiscoveryReport> {
  await pruneLinkMentions(db);
  const leads = await findDiscoveryLeads(db, { limit: opts.limit ?? DAILY_LIMIT });
  const report: DiscoveryReport = { checked: 0, found: [], invalid: [] };
  const known = await knownSourceDomains(db);
  const isKnown = (url: string | null) => {
    if (!url) return false;
    const d = normalizeDomain(new URL(url).hostname);
    return [...known].some((k) => d === k || d.endsWith(`.${k}`));
  };
  for (const lead of leads) {
    let result = await evaluateLead(fetcher, lead, opts.now);
    // abcnews.com → abcnews.go.com: an alias of an outlet already followed.
    if (result.status === 'pending' && (isKnown(result.homepage) || isKnown(result.feed_url))) {
      result = { ...result, status: 'invalid', invalid_reason: `already a source (redirects to ${new URL(result.homepage).hostname})` };
    }
    await saveCandidate(db, result);
    report.checked++;
    (result.status === 'pending' ? report.found : report.invalid).push(result);
  }
  await setSetting(db, DISCOVERY_SETTING_KEY, (opts.now ?? new Date()).toISOString());
  return report;
}

/** Run discovery if it hasn't run in the last 24 hours. Called from the worker loop. */
export async function maybeRunDailyDiscovery(db: Pool, fetcher: PoliteFetcher, now = new Date()): Promise<DiscoveryReport | null> {
  const last = await getSetting<string>(db, DISCOVERY_SETTING_KEY);
  if (last && now.getTime() - new Date(last).getTime() < DISCOVERY_INTERVAL_MS) return null;
  return runDiscovery(db, fetcher, { now });
}
