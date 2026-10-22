import { XMLParser } from 'fast-xml-parser';
import { decode } from 'he';
import type { ParsedItem } from '@newswiz/db';

export class FeedParseError extends Error {}

/** Summaries are a teaser, not the article: keep them short. */
export const SUMMARY_MAX_CHARS = 400;
const MAX_ITEMS = 500;

const ARRAY_TAGS = new Set([
  'item', 'entry', 'url', 'link', 'category', 'media:content', 'media:thumbnail', 'enclosure', 'author',
  'dc:creator', 'image:image',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown>;

/** Parse RSS 2.0, RSS 1.0 (RDF), Atom, or a Google News sitemap into items. */
export function parseFeed(xml: string, feedUrl: string): ParsedItem[] {
  const trimmed = xml.trimStart();
  if (/^<!doctype html|^<html/i.test(trimmed)) throw new FeedParseError('not a feed (got an HTML page)');
  let doc: Node;
  try {
    doc = parser.parse(trimmed) as Node;
  } catch (err) {
    throw new FeedParseError(`malformed XML: ${(err as Error).message}`);
  }

  let items: ParsedItem[];
  if (isNode(doc.rss)) items = parseRss(doc.rss, feedUrl);
  else if (isNode(doc['rdf:RDF'])) items = parseRdf(doc['rdf:RDF'], feedUrl);
  else if (isNode(doc.feed)) items = parseAtom(doc.feed, feedUrl);
  else if (isNode(doc.urlset)) items = parseNewsSitemap(doc.urlset);
  else if ('sitemapindex' in doc) throw new FeedParseError('sitemap index files are not supported; use a news sitemap');
  else throw new FeedParseError('unrecognized feed format');
  return items.slice(0, MAX_ITEMS);
}

function parseRss(rss: Node, feedUrl: string): ParsedItem[] {
  const channel = asNode(rss.channel);
  const language = text(channel.language);
  return asArray(channel.item).flatMap((raw) => {
    const it = asNode(raw);
    const url = resolveUrl(text(it.link) ?? guidLink(it.guid), feedUrl);
    const title = cleanText(text(it.title));
    if (!url || !title) return [];
    return [{
      url,
      guid: text(it.guid) ?? null,
      title,
      summary: summarize(text(it.description) ?? text(it['content:encoded']), title),
      author: cleanAuthor(firstText(it['dc:creator']) ?? firstText(it.author)),
      section: cleanText(firstText(it.category)),
      imageUrl: resolveUrl(pickImage(it), feedUrl),
      language: language ?? null,
      publishedAt: parseDate(text(it.pubDate) ?? text(it['dc:date'])),
      links: extractLinks(`${text(it.description) ?? ''} ${text(it['content:encoded']) ?? ''}`, url),
    }];
  });
}

function parseRdf(rdf: Node, feedUrl: string): ParsedItem[] {
  const language = text(asNode(rdf.channel)['dc:language']);
  return asArray(rdf.item).flatMap((raw) => {
    const it = asNode(raw);
    const url = resolveUrl(text(it.link) ?? attr(it, 'rdf:about'), feedUrl);
    const title = cleanText(text(it.title));
    if (!url || !title) return [];
    return [{
      url,
      guid: attr(it, 'rdf:about') ?? null,
      title,
      summary: summarize(text(it.description), title),
      author: cleanAuthor(firstText(it['dc:creator'])),
      section: cleanText(text(it['dc:subject'])),
      imageUrl: resolveUrl(pickImage(it), feedUrl),
      language: language ?? null,
      publishedAt: parseDate(text(it['dc:date'])),
      links: extractLinks(text(it.description), url),
    }];
  });
}

function parseAtom(feed: Node, feedUrl: string): ParsedItem[] {
  const language = attr(feed, 'xml:lang') ?? null;
  return asArray(feed.entry).flatMap((raw) => {
    const it = asNode(raw);
    const links = asArray(it.link).map(asNode);
    const alternate = links.find((l) => !attr(l, 'rel') || attr(l, 'rel') === 'alternate');
    const url = resolveUrl(alternate ? attr(alternate, 'href') : undefined, feedUrl);
    const title = cleanText(text(it.title));
    if (!url || !title) return [];
    const enclosure = links.find((l) => attr(l, 'rel') === 'enclosure' && attr(l, 'type')?.startsWith('image/'));
    return [{
      url,
      guid: text(it.id) ?? null,
      title,
      summary: summarize(text(it.summary) ?? text(it.content), title),
      author: cleanAuthor(text(asNode(asArray(it.author)[0]).name)),
      section: cleanText(attr(asNode(asArray(it.category)[0]), 'term') ?? attr(asNode(asArray(it.category)[0]), 'label')),
      imageUrl: resolveUrl((enclosure && attr(enclosure, 'href')) ?? pickImage(it), feedUrl),
      language: attr(it, 'xml:lang') ?? language,
      publishedAt: parseDate(text(it.published) ?? text(it.updated)),
      links: extractLinks(`${text(it.summary) ?? ''} ${text(it.content) ?? ''}`, url),
    }];
  });
}

function parseNewsSitemap(urlset: Node): ParsedItem[] {
  return asArray(urlset.url).flatMap((raw) => {
    const it = asNode(raw);
    const news = asNode(it['news:news']);
    const url = text(it.loc);
    const title = cleanText(text(news['news:title']));
    if (!url || !title) return [];
    const publication = asNode(news['news:publication']);
    return [{
      url,
      guid: null,
      title,
      summary: null,
      author: null,
      section: null,
      imageUrl: text(asNode(asArray(it['image:image'])[0])['image:loc']) ?? null,
      language: text(publication['news:language']) ?? null,
      publishedAt: parseDate(text(news['news:publication_date'])),
    }];
  });
}

// ---------- helpers ----------

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNode(v: unknown): Node {
  if (Array.isArray(v)) return asNode(v[0]);
  return isNode(v) ? v : {};
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Text content of a node that may be a string, a number, or an element with attributes. */
function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim();
    return s || undefined;
  }
  if (isNode(v)) return text(v['#text']);
  return undefined;
}

function firstText(v: unknown): string | undefined {
  for (const entry of asArray(v)) {
    const t = text(entry);
    if (t) return t;
  }
  return undefined;
}

function attr(node: Node, name: string): string | undefined {
  const v = node[`@_${name}`];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** RSS guids marked isPermaLink are the article URL. */
function guidLink(guid: unknown): string | undefined {
  const g = asNode(guid);
  const value = text(guid);
  if (!value || !/^https?:\/\//.test(value)) return undefined;
  return attr(g, 'isPermaLink') === 'false' ? undefined : value;
}

function resolveUrl(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function pickImage(it: Node): string | undefined {
  const media = [
    ...asArray(it['media:content']),
    ...asArray(asNode(it['media:group'])['media:content']),
  ].map(asNode);
  const images = media.filter((m) => {
    const medium = attr(m, 'medium');
    const type = attr(m, 'type');
    return attr(m, 'url') && (medium === 'image' || type?.startsWith('image/') || (!medium && !type));
  });
  images.sort((a, b) => Number(attr(b, 'width') ?? 0) - Number(attr(a, 'width') ?? 0));
  if (images[0]) return attr(images[0], 'url');
  const thumb = asArray(it['media:thumbnail']).map(asNode).find((t) => attr(t, 'url'));
  if (thumb) return attr(thumb, 'url');
  const enclosure = asArray(it.enclosure).map(asNode).find((e) => attr(e, 'type')?.startsWith('image/'));
  if (enclosure) return attr(enclosure, 'url');
  const html = text(it['content:encoded']) ?? text(it.description) ?? text(it.content);
  return html?.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
}

const MAX_LINKS_PER_ITEM = 30;

/** Absolute http(s) links in an item's HTML, resolved against the article URL. */
export function extractLinks(html: string | undefined, base: string): string[] {
  if (!html) return [];
  const out = new Set<string>();
  for (const [, href] of html.matchAll(/<a\s[^>]*href=["']([^"'#][^"']*)["']/gi)) {
    const url = resolveUrl(decode(href!), base);
    if (url) out.add(url);
    if (out.size >= MAX_LINKS_PER_ITEM) break;
  }
  return [...out];
}

/** Collapse whitespace and decode entities in a short plain-text field like a title. */
export function cleanText(s: string | undefined): string | null {
  if (!s) return null;
  const out = decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return out || null;
}

const BOILERPLATE = [
  /\s*The post .{1,300}? appeared first on .{1,200}?\.?$/s,
  /(?<![\p{L}\p{N}])Continue reading\.{0,3}\s*$/iu,
  // Only a standalone trailing phrase: "… spread." must not lose its "read."
  /(?<![\p{L}\p{N}])(Read|Keep reading|Read more)( the (full )?(story|article))?( at| on)?\s*[.…]*\s*$/iu,
  /\s*\[(…|\.\.\.|&hellip;)\]\s*$/,
];

/** Anything shorter is a caption fragment ("lead image"), not a summary. */
const MIN_SUMMARY_CHARS = 20;

/** Turn a feed description (often HTML) into a short plain-text teaser. */
export function summarize(html: string | undefined, title?: string | null): string | null {
  if (!html) return null;
  let s = html
    .replace(/<(script|style|figure|figcaption|h[1-6])[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  s = decode(s).replace(/\s+/g, ' ').trim();
  for (const pattern of BOILERPLATE) s = s.replace(pattern, '');
  if (title && s.startsWith(title)) s = s.slice(title.length);
  s = s.trim();
  if (s.length < MIN_SUMMARY_CHARS) return null;
  if (s.length <= SUMMARY_MAX_CHARS) return s;
  const cut = s.slice(0, SUMMARY_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > SUMMARY_MAX_CHARS * 0.6 ? lastSpace : SUMMARY_MAX_CHARS).replace(/[\s,;:.-]+$/, '')}…`;
}

function cleanAuthor(raw: string | undefined): string | null {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  // RSS <author> is "email (Name)".
  const paren = cleaned.match(/^\S+@\S+\s+\((.+)\)$/);
  const name = (paren ? paren[1]! : cleaned).replace(/^by\s+/i, '').trim();
  if (/^\S+@\S+$/.test(name)) return null;
  return name || null;
}

const TZ_ABBREVIATIONS: Record<string, string> = {
  UT: '+0000', UTC: '+0000', GMT: '+0000', Z: '+0000', BST: '+0100', CET: '+0100', CEST: '+0200',
  EST: '-0500', EDT: '-0400', CST: '-0600', CDT: '-0500', MST: '-0700', MDT: '-0600', PST: '-0800',
  PDT: '-0700', AEST: '+1000', AEDT: '+1100', IST: '+0530', JST: '+0900',
};

/** Parse RFC 822 or ISO 8601 dates, including common timezone abbreviations. */
export function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    const m = s.match(/^(.*\d)\s+([A-Z]{1,5})$/);
    const offset = m && TZ_ABBREVIATIONS[m[2]!];
    if (m && offset) t = Date.parse(`${m[1]} ${offset}`);
  }
  return Number.isNaN(t) ? null : new Date(t);
}
