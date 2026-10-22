/** Access and news-site signals read from a page's own HTML. No scripts run; nothing is bypassed. */

function* jsonLdNodes(html: string): Generator<Record<string, unknown>> {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(body!.trim());
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === 'object') {
        yield node as Record<string, unknown>;
        stack.push(...Object.values(node).filter((v) => v && typeof v === 'object'));
      }
    }
  }
}

const isFalse = (v: unknown) => v === false || (typeof v === 'string' && v.toLowerCase() === 'false');
const isTrue = (v: unknown) => v === true || (typeof v === 'string' && v.toLowerCase() === 'true');

/**
 * Does the publisher's own structured data say this article isn't free? Publishers set
 * schema.org isAccessibleForFree=false on paywalled articles (Google asks them to), so this
 * is the most reliable "paid" signal there is.
 */
export function detectPaidMarking(html: string): { paid: boolean; type?: string } {
  for (const node of jsonLdNodes(html)) {
    if (isFalse(node.isAccessibleForFree)) {
      return { paid: true, type: typeof node['@type'] === 'string' ? node['@type'] : undefined };
    }
  }
  return { paid: false };
}

/** Known subscription/paywall vendors whose scripts show up on metered or paid sites. */
const PAYWALL_VENDORS: [RegExp, string][] = [
  [/tinypass\.com|piano\.io|cdn\.piano\.io/i, 'Piano'],
  [/zephr/i, 'Zephr'],
  [/poool\.fr|poool\.io/i, 'Poool'],
  [/pelcro\.com/i, 'Pelcro'],
  [/laterpay/i, 'LaterPay'],
  [/memberful\.com/i, 'Memberful'],
  [/arc-subs|arcpublishing.*subscriptions/i, 'Arc XP Subscriptions'],
  [/leaky-paywall|leakypaywall/i, 'Leaky Paywall'],
];

export interface AccessSignals {
  /** schema.org isAccessibleForFree on the page: true, false, or not stated. */
  jsonLdFree: boolean | null;
  paywallVendors: string[];
  /** schema.org types that mark a news site/article (NewsArticle, NewsMediaOrganization, ...). */
  newsTypes: string[];
}

export function readAccessSignals(html: string): AccessSignals {
  let jsonLdFree: boolean | null = null;
  const newsTypes = new Set<string>();
  for (const node of jsonLdNodes(html)) {
    if (isFalse(node.isAccessibleForFree)) jsonLdFree = false;
    else if (isTrue(node.isAccessibleForFree) && jsonLdFree === null) jsonLdFree = true;
    const types = ([] as unknown[]).concat(node['@type'] ?? []);
    for (const t of types) if (typeof t === 'string' && /News|Reportage/.test(t)) newsTypes.add(t);
  }
  const paywallVendors = PAYWALL_VENDORS.filter(([re]) => re.test(html)).map(([, name]) => name);
  return { jsonLdFree, paywallVendors, newsTypes: [...newsTypes] };
}
