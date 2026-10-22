import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Policy guard (SPEC §1 "Do NOT build"): fail the build if any shipped code impersonates a
 * search-engine crawler or wires in a paywall-bypass service. Tests and docs are excluded so
 * they can name what's forbidden.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'test', 'coverage']);
const CODE = /\.(ts|tsx|js|mjs|cjs|json|ya?ml|sh)$|^Dockerfile$/;

const FORBIDDEN: [RegExp, string][] = [
  [/googlebot|bingbot|duckduckbot|baiduspider|yandex(bot)?|slurp|applebot|facebookexternalhit|twitterbot/i, 'crawler user agent'],
  [/12ft\.io|archive\.(ph|is|today|li|md)|removepaywall|bypass-paywalls|paywallbuster|smry\.ai/i, 'paywall bypass service'],
  [/x-forwarded-for|['"]referer['"]\s*:\s*['"]https?:\/\/(www\.)?(google|facebook|t\.co|twitter)/i, 'spoofed request origin'],
];

function* codeFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* codeFiles(path);
    } else if (CODE.test(name) && name !== 'pnpm-lock.yaml') {
      yield path;
    }
  }
}

describe('no paywall circumvention', () => {
  it('ships no crawler impersonation or bypass services', () => {
    const hits: string[] = [];
    for (const file of codeFiles(ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const [pattern, what] of FORBIDDEN) {
        const m = text.match(pattern);
        if (m) hits.push(`${relative(ROOT, file)}: ${what} ("${m[0]}")`);
      }
    }
    expect(hits).toEqual([]);
  });
});
