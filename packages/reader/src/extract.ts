import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import sanitizeHtml from 'sanitize-html';

/** Fewer words than this is a teaser, a video page, or a paywall stub — not something to read here. */
export const MIN_READER_WORDS = 150;

/** Block-level elements that get a data-block index, so a reading position can be saved per paragraph. */
const BLOCK_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'li', 'blockquote', 'pre', 'figure', 'table']);

export interface ExtractedArticle {
  html: string;
  wordCount: number;
  blockCount: number;
  title: string | null;
  byline: string | null;
}

export { detectPaidMarking } from '@newswiz/net';

/** Pull the readable article out of a page and reduce it to safe, numbered, minimal HTML. */
export function extractArticle(pageHtml: string, url: string): ExtractedArticle | null {
  // Scripts never run and no resources load; console noise from bad CSS is dropped.
  const dom = new JSDOM(pageHtml, { url, virtualConsole: new VirtualConsole() });
  const parsed = new Readability(dom.window.document, { charThreshold: 300 }).parse();
  dom.window.close();
  if (!parsed?.content) return null;

  let block = 0;
  const numbered = (tagName: string, attribs: sanitizeHtml.Attributes) => ({
    tagName,
    attribs: { ...attribs, 'data-block': String(block++) },
  });
  const transformTags: Record<string, sanitizeHtml.Transformer> = {
    h1: (_t, attribs) => numbered('h2', attribs),
    h5: (_t, attribs) => numbered('h4', attribs),
    h6: (_t, attribs) => numbered('h4', attribs),
    a: (_t, attribs) => ({
      tagName: 'a',
      attribs: { href: attribs.href ?? '', target: '_blank', rel: 'noopener noreferrer nofollow' },
    }),
    img: (_t, attribs) => ({
      tagName: 'img',
      attribs: {
        src: attribs.src ?? '',
        alt: attribs.alt ?? '',
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
      },
    }),
  };
  for (const tag of BLOCK_TAGS) transformTags[tag] = (tagName, attribs) => numbered(tagName, attribs);

  const html = sanitizeHtml(parsed.content, {
    allowedTags: [
      'p', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i', 'figure',
      'figcaption', 'img', 'pre', 'code', 'br', 'hr', 'sup', 'sub', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      '*': ['data-block'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'loading', 'decoding', 'referrerpolicy'],
    },
    allowedSchemes: ['https', 'http'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags,
    exclusiveFilter: (frame) =>
      (frame.tag === 'img' && !frame.attribs.src) ||
      (frame.tag === 'p' && !frame.text.trim() && !frame.mediaChildren.length),
  });

  const text = (parsed.textContent ?? '').replace(/\s+/g, ' ').trim();
  const wordCount = text ? text.split(' ').length : 0;
  return { html, wordCount, blockCount: block, title: parsed.title ?? null, byline: parsed.byline ?? null };
}

/** Typical silent reading speed for news prose. */
export const WORDS_PER_MINUTE = 230;

export function minutesToRead(wordCount: number, progress = 0): number {
  return Math.max(1, Math.round((wordCount * (1 - Math.min(Math.max(progress, 0), 1))) / WORDS_PER_MINUTE));
}
