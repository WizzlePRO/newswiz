import { describe, expect, it } from 'vitest';
import { canonicalUrl, titleKey } from '../src/canonical.ts';

describe('canonicalUrl', () => {
  it('drops tracking parameters, fragments, www, and trailing slashes', () => {
    expect(canonicalUrl('http://WWW.Example.com/news/story/?utm_source=rss&utm_medium=x&fbclid=abc#comments')).toBe(
      'https://example.com/news/story',
    );
  });

  it('keeps meaningful parameters, sorted', () => {
    expect(canonicalUrl('https://example.com/article?page=2&id=55&smid=tw')).toBe('https://example.com/article?id=55&page=2');
  });

  it('treats AMP copies as the same article', () => {
    expect(canonicalUrl('https://example.com/story/amp')).toBe('https://example.com/story');
    expect(canonicalUrl('https://example.com/story.amp.html')).toBe('https://example.com/story.html');
  });

  it('leaves unparseable input alone', () => {
    expect(canonicalUrl('  not a url ')).toBe('not a url');
  });
});

describe('titleKey', () => {
  it('ignores case, accents, and punctuation', () => {
    expect(titleKey('Café owners “win” court fight!')).toBe(titleKey('cafe owners win court fight'));
  });
});
