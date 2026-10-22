/** Run source discovery now (the worker also runs it once a day): `pnpm discover`. */
import { closePool, getPool } from '@newswiz/db';
import { PoliteFetcher } from '@newswiz/net';
import { runDiscovery } from './discover.ts';

const limit = Number(process.argv[2] ?? 15);
const report = await runDiscovery(getPool(), new PoliteFetcher(), { limit });
for (const c of report.found) {
  console.log(`found   ${c.domain.padEnd(28)} ${c.name} — cited by ${c.cited_by.length} outlets, ${c.feed_items} items, access guess: ${c.access_guess}`);
}
for (const c of report.invalid) console.log(`skipped ${c.domain.padEnd(28)} ${c.invalid_reason}`);
console.log(`\nchecked ${report.checked} sites: ${report.found.length} new outlets to review at /discover`);
await closePool();
