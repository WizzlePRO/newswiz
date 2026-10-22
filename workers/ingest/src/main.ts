import { closePool, getPool } from '@newswiz/db';
import { PoliteFetcher } from '@newswiz/net';
import { maybeRunDailyDiscovery } from './discover.ts';
import { runCycle } from './ingest.ts';
import type { PollReport } from './ingest.ts';

const once = process.argv.includes('--once');
const concurrency = Number(process.env.INGEST_CONCURRENCY ?? 6);
const TICK_MS = 30_000;

const pool = getPool();
const fetcher = new PoliteFetcher();
let stopping = false;

const log = (r: PollReport) => {
  const u = r.upsert;
  const detail = r.ok
    ? r.status === 304
      ? 'not modified'
      : `${r.items} items, ${u?.inserted ?? 0} new, ${u?.updated ?? 0} updated`
    : r.error;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.url} — ${detail} (next ${r.nextPollAt.toISOString()})`);
};

async function tick(): Promise<void> {
  const reports = await runCycle(pool, fetcher, { concurrency, onReport: log });
  if (reports.length) {
    const inserted = reports.reduce((n, r) => n + (r.upsert?.inserted ?? 0), 0);
    const failed = reports.filter((r) => !r.ok).length;
    console.log(`cycle: ${reports.length} feeds polled, ${inserted} new articles, ${failed} failed`);
  }
  if (once) return;
  // Once a day, look for new outlets that the current ones keep citing.
  const discovery = await maybeRunDailyDiscovery(pool, fetcher).catch((err) => {
    console.error('discovery failed:', err);
    return null;
  });
  if (discovery) {
    console.log(`discovery: checked ${discovery.checked} sites, ${discovery.found.length} new outlets to review at /discover`);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, finishing current cycle`);
    stopping = true;
  });
}

console.log(`${fetcher.ua} starting (${once ? 'single cycle' : `every ${TICK_MS / 1000}s`}, concurrency ${concurrency})`);
do {
  try {
    await tick();
  } catch (err) {
    console.error('cycle failed:', err);
  }
  if (once) break;
  for (let waited = 0; waited < TICK_MS && !stopping; waited += 1000) await new Promise((r) => setTimeout(r, 1000));
} while (!stopping);
await closePool();
