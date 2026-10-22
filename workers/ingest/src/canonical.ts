/** Query parameters that only track where a click came from; they never change the article. */
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'cmpid', 'smid', 'smtyp', 'taid',
  'ito', 'ocid', 'rss', 'rssfeed', 'feed', 'src', 'source', 'ref', 'referrer', 'share', 'sh',
  'partner', 'traffic_source', 'xtor', 'guccounter', 'guce_referrer', 'guce_referrer_sig', 'at_medium',
  'at_campaign', 'at_custom1', 'at_custom2', 'at_custom3', 'at_custom4', 'utm',
]);

/**
 * Normalize a URL into a dedupe key: https, no "www.", no fragment, no tracking parameters,
 * sorted query, no trailing slash. The result is only a key — readers get the original URL.
 */
export function canonicalUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.port = '';
  u.hash = '';
  u.username = '';
  u.password = '';
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(k.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = new URLSearchParams(kept).toString();
  let path = u.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  // AMP copies are the same article.
  path = path.replace(/\/amp$/, '').replace(/\.amp(\.html)?$/, '$1') || '/';
  u.pathname = path;
  return u.toString();
}

/** Lowercased, accent-free, punctuation-free title for spotting re-posts of the same story. */
export function titleKey(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
