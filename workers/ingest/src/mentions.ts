/**
 * Turning article links into "outlet X cited site Y" mentions for source discovery. Platforms,
 * shops, and official sites are not news outlets, so they're filtered out up front.
 */

const PLATFORM_DOMAINS = [
  'twitter.com', 'x.com', 't.co', 'facebook.com', 'fb.com', 'instagram.com', 'threads.net', 'bsky.app',
  'tiktok.com', 'linkedin.com', 'reddit.com', 'pinterest.com', 'tumblr.com', 'mastodon.social', 'truthsocial.com',
  'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'rumble.com', 'spotify.com', 'soundcloud.com',
  'google.com', 'goo.gl', 'apple.com', 'amazon.com', 'amzn.to', 'ebay.com', 'microsoft.com', 'bit.ly', 'ow.ly',
  'tinyurl.com', 'linktr.ee', 'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'archive.org', 'github.com',
  'medium.com', 'substack.com', 'patreon.com', 'gofundme.com', 'eventbrite.com', 'list-manage.com',
  'campaign-archive.com', 'mailchi.mp', 'wordpress.com', 'wp.com', 'gravatar.com', 'feedburner.com',
  'gettyimages.com', 'shutterstock.com', 'imgur.com', 'flickr.com', 'giphy.com', 'doi.org', 'dropbox.com',
  'scribd.com', 'documentcloud.org', 'apnews.com', 'reuters.com', 'zoom.us', 'paypal.com', 'venmo.com',
  // Portals that mostly republish other outlets' stories.
  'yahoo.com', 'msn.com', 'aol.com', 'newsbreak.com', 'flipboard.com', 'smartnews.com', 'ground.news',
  'disqus.com', 'addtoany.com', 'sharethis.com', 'creativecommons.org', 'w3.org', 'schema.org',
];

/** Official and academic sites are primary sources (Phase 3), not outlets to follow. */
const NON_OUTLET_TLDS = /\.(gov|mil|edu|int)(\.[a-z]{2})?$|\.gov\.[a-z]{2}$|\.ac\.[a-z]{2}$/;

export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^(www\d?|m|amp|mobile)\./, '');
}

/** Is this domain (or a parent of it) on the platform list? */
export function isPlatformDomain(domain: string): boolean {
  return PLATFORM_DOMAINS.some((p) => domain === p || domain.endsWith(`.${p}`));
}

export function isCandidateDomain(domain: string): boolean {
  return domain.includes('.') && !isPlatformDomain(domain) && !NON_OUTLET_TLDS.test(domain) && !/^\d+\.\d+\.\d+\.\d+$/.test(domain);
}

/** Links from one article that point at other sites worth considering as outlets. */
export function mentionsFrom(articleUrl: string, links: string[] | undefined, feedUrl: string): { domain: string; url: string }[] {
  const own = new Set<string>();
  for (const u of [articleUrl, feedUrl]) {
    try {
      own.add(normalizeDomain(new URL(u).hostname));
    } catch {
      /* ignore */
    }
  }
  const out: { domain: string; url: string }[] = [];
  for (const link of links ?? []) {
    let domain: string;
    try {
      domain = normalizeDomain(new URL(link).hostname);
    } catch {
      continue;
    }
    // Skip the outlet's own pages, including its subdomains (cdn.x.com, video.x.com).
    if ([...own].some((o) => domain === o || domain.endsWith(`.${o}`) || o.endsWith(`.${domain}`))) continue;
    if (!isCandidateDomain(domain)) continue;
    out.push({ domain, url: link.split('#')[0]! });
  }
  return out;
}
