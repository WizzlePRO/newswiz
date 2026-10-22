import { describe, expect, it } from 'vitest';
import { detectPaidMarking, extractArticle, minutesToRead } from '../src/extract.ts';

const paragraph = (i: number) =>
  `<p>Paragraph ${i}: the city council met on Thursday to debate the transit plan, and residents filled the room to speak for and against the proposal over several hours.</p>`;
const page = (body: string, head = '') => `<!doctype html><html><head><title>Transit plan</title>${head}</head>
<body><nav><a href="/">Home</a></nav><article><h1>Transit plan advances</h1>${body}</article>
<aside>Subscribe to our newsletter</aside><script>window.evil = 1</script></body></html>`;

describe('extractArticle', () => {
  const html = page(
    `${Array.from({ length: 10 }, (_, i) => paragraph(i)).join('')}
     <p><img src="https://cdn.example.com/a.jpg" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>
     <a href="/related">related</a></p>
     <iframe src="https://evil.example"></iframe>`,
  );
  const out = extractArticle(html, 'https://news.example.com/transit')!;

  it('keeps the article text and numbers every block for position saving', () => {
    expect(out.wordCount).toBeGreaterThan(200);
    expect(out.blockCount).toBeGreaterThanOrEqual(10);
    expect(out.html).toContain('data-block="0"');
    expect(out.html).toContain('Paragraph 9');
  });

  it('removes scripts, iframes, event handlers and javascript: links', () => {
    expect(out.html).not.toMatch(/<script|<iframe|onerror|javascript:/i);
  });

  it('makes links absolute and opens them in a new tab; images lazy-load without a referrer', () => {
    expect(out.html).toContain('href="https://news.example.com/related"');
    expect(out.html).toContain('target="_blank"');
    expect(out.html).toMatch(/<img[^>]+loading="lazy"[^>]+referrerpolicy="no-referrer"/);
  });
});

describe('detectPaidMarking', () => {
  it('finds isAccessibleForFree=false, including inside @graph and as a string', () => {
    const graph = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","isAccessibleForFree":"False"}]}</script>`;
    expect(detectPaidMarking(page('', graph))).toEqual({ paid: true, type: 'NewsArticle' });
  });

  it('ignores free articles and broken JSON-LD', () => {
    const free = `<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":true}</script>
      <script type="application/ld+json">{not json</script>`;
    expect(detectPaidMarking(page('', free))).toEqual({ paid: false });
  });
});

describe('minutesToRead', () => {
  it('estimates remaining time and never says zero', () => {
    expect(minutesToRead(2300)).toBe(10);
    expect(minutesToRead(2300, 0.5)).toBe(5);
    expect(minutesToRead(2300, 1)).toBe(1);
  });
});
