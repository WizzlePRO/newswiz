/**
 * Build-time check of every feed in data/sources.json: does it respond, parse, and carry recent
 * items? Prints a table and exits non-zero if any enabled feed is broken. Doesn't touch the database.
 */
import { fileURLToPath } from 'node:url';
import { loadSeedFile } from '@newswiz/db/admin';
import { PoliteFetcher } from '@newswiz/net';
import { parseFeed } from './parse.ts';

const path = process.argv[2] ?? fileURLToPath(new URL('../../../data/sources.json', import.meta.url));
const sources = await loadSeedFile(path);
const fetcher = new PoliteFetcher();
const rows: string[][] = [];
let broken = 0;

const jobs = sources.flatMap((s) => s.feeds.map((f) => ({ s, f })));
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const { s, f } = job;
      const res = await fetcher.get(f.url, { timeoutMs: 25_000 });
      let status: string;
      let detail = '';
      if (res.kind === 'ok') {
        try {
          const items = parseFeed(res.body, res.finalUrl);
          const newest = items.reduce<number>((m, i) => Math.max(m, i.publishedAt?.getTime() ?? 0), 0);
          const ageHours = newest ? Math.round((Date.now() - newest) / 3_600_000) : null;
          // Undated feeds are unusable: their old items would look brand new on the first poll.
          status = !items.length || ageHours === null ? 'stale' : ageHours < 24 * 7 ? 'ok' : 'stale';
          detail = `${items.length} items, newest ${ageHours === null ? 'undated' : `${ageHours}h ago`}`;
        } catch (err) {
          status = 'unparseable';
          detail = (err as Error).message;
        }
      } else {
        status = res.kind;
        detail = res.kind === 'http_error' ? `HTTP ${res.status}` : res.kind === 'network_error' ? res.message : res.kind === 'disallowed' ? res.reason : '';
      }
      if (status !== 'ok') broken++;
      rows.push([s.slug, status, detail, f.url]);
    }
  }),
);

rows.sort((a, b) => (a[1] === b[1] ? a[0]!.localeCompare(b[0]!) : a[1] === 'ok' ? 1 : -1));
for (const r of rows) console.log(`${r[1]!.padEnd(12)} ${r[0]!.padEnd(22)} ${r[2]!.padEnd(34)} ${r[3]}`);
const noFeeds = sources.filter((s) => s.feeds.length === 0).map((s) => s.slug);
console.log(`\n${rows.length - broken}/${rows.length} feeds healthy.${noFeeds.length ? ` Sources without feeds: ${noFeeds.join(', ')}` : ''}`);
process.exitCode = broken ? 1 : 0;
