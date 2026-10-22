# NewsWiz

A personal news reader to replace Google News and Apple News. It ranks free and nonprofit journalism first, balances every briefing across the political spectrum, and remembers where you stopped reading.

- **Catch up.** A short, balanced briefing of everything since you were last caught up. Picks rotate across left, center and right outlets, cap any one outlet, and mix ownership types. A balance meter shows the result. Press "I'm caught up" to start a fresh cycle.
- **Bias indicator.** Each article shows its outlet's lean on a five-step scale, from AllSides ratings. You can override any outlet's rating, and you can filter Latest by lean.
- **Free first.** Every article carries an access badge: Free, Free w/ account, Mostly free, Metered, Paywalled. A "Free only" filter hides the rest.
- **Reader view for free outlets.** A clean, fast article page. Your position is saved paragraph by paragraph, and the article reopens where you left off, on any screen.
- **Saved and progress.** Save anything for later. The Saved page groups articles into in progress, not started and finished, with minutes left. For articles on a publisher's site, note roughly where you stopped.
- **Sources you control.** 63 outlets with researched access policies and evidence links. Boost or mute any of them, and check feed health at a glance.
- **Daily source discovery.** Once a day the worker looks for new outlets: sites your outlets keep linking to that publish a working, recent feed. It samples an article from each for paywall signals, and suggestions wait on the **Discover** page until you add or dismiss them.

See [SPEC.md](SPEC.md) for the full plan and [DECISIONS.md](DECISIONS.md) for choices made along the way.

## Quick start (Docker)

```sh
cp .env.example .env     # optional: set APP_PASSPHRASE, APP_TIMEZONE, INGEST_CONTACT
make up                  # Postgres + migrations + seed + ingest worker + web app
open http://localhost:3000
```

The first articles arrive within about a minute. `make logs` follows the worker and the web app; `make down` stops everything.

**Before exposing NewsWiz to the internet, set `APP_PASSPHRASE`.** Reader-view copies are meant for your own devices only.

## Local development

You need Node 22.12+, pnpm 10, and Docker (or your own Postgres 16).

```sh
make dev      # Postgres in Docker, then the ingest worker and `next dev` on :3000
```

Or step by step:

```sh
pnpm install
pnpm migrate && pnpm seed   # schema + data/sources.json + data/bias-ratings.json
pnpm ingest:once            # poll every feed once
pnpm ingest                 # ...or keep polling (every 30s it picks up feeds that are due)
pnpm dev:web
```

| Command | What it does |
|---|---|
| `pnpm test` | All tests. DB tests use `TEST_DATABASE_URL`, which is wiped on each run. |
| `pnpm typecheck` | Type-check every package |
| `pnpm verify-sources` | Fetch every feed in `data/sources.json`; report broken, stale, or undated feeds |
| `pnpm discover` | Run source discovery now (the worker also runs it once a day) |
| `pnpm build` | Production build of the web app |

## Project layout

```
apps/web          Next.js 16 app: pages, API routes, reader view, PWA manifest
packages/db       Schema migrations, queries, dedupe, reading state, news-cycle balancing
packages/net      Polite fetcher: honest user agent, robots.txt, ETags, timeouts, size caps
packages/reader   Reader-view extraction (Readability + strict HTML sanitizing)
workers/ingest    Feed polling, parsing (RSS, Atom, RDF, news sitemaps), backoff
data/             sources.json (outlet registry) and bias-ratings.json (AllSides, CC BY-NC)
```

## Adding or changing sources

Edit `data/sources.json`, then run `pnpm verify-sources` and `pnpm seed`. Each source needs an `access_model`: `free`, `registration`, `metered`, `paywalled`, `mixed` or `unknown`. Anything other than `unknown` also needs an `access_evidence_url`. If you can't verify an access policy, use `unknown`. Seeding updates registry facts but never touches your mute/boost or lean overrides.

To rate a new outlet, add an entry to `data/bias-ratings.json` with its AllSides rating page, or `"lean": "unrated"`.

## How access works

Phase 1 uses each outlet's default access model. Reader view is only for outlets classified **free**. A page is never shown or stored if its own structured data marks it subscriber-only (`isAccessibleForFree: false`), or if it looks like a teaser.

NewsWiz never spoofs crawlers, strips paywalls, or uses bypass services. A test (`packages/net/test/no-bypass.test.ts`) fails the build if any of that shows up in the code. Phase 3 adds legitimate ways in: wire originals, primary sources, your own subscriptions and library passes, gift links, and meter tracking.

## Credits

Media bias ratings: [AllSides Media Bias Ratings™](https://www.allsides.com/media-bias) by AllSides.com, licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). AllSides doesn't endorse NewsWiz. Because that license is non-commercial, `data/bias-ratings.json` can't be used commercially without AllSides' permission.
