# Decisions

Choices made while building that the spec didn't settle. Newest at the bottom.

## Phase 1

- **No separate job queue.** The ingest worker claims due feeds straight from the `feeds` table (`UPDATE … FOR UPDATE SKIP LOCKED` plus a 10-minute lease). That's enough for one household and leaves nothing extra to run. Redis or pg-boss can come later if fan-out grows.
- **Plain SQL migrations and a small runner** (`packages/db/migrations`, `schema_migrations` table) instead of an ORM. Queries are readable SQL in `packages/db/src`.
- **TypeScript runs through `tsx`, with no compile step,** for the worker and the CLIs. Next.js transpiles the workspace packages itself.
- **Setup code lives in a separate entry, `@newswiz/db/admin`.** Migrations and seeding import from it, so the web bundler never tries to resolve the migrations folder.
- **Dedupe keys:** a normalized canonical URL (globally unique), the outlet's guid, or the outlet's normalized title within 24 hours (titles of 25+ characters only, so "Live updates" never merges). The original URL is always what readers get.
- **Only short summaries are stored** (at most 400 characters, from the publisher's own description). Full text from `content:encoded` is never stored. A promo paragraph repeated across a feed (Chalkbeat, Votebeat) is dropped.
- **Items older than 7 days are skipped,** and publish dates in the future are clamped to now.
- **robots.txt follows Google's conventions.** 4xx means allow-all; 5xx or unreachable means stay away for 30 minutes. Crawl-delay is respected, and each host gets one request at a time.
- **Sources blocked on 2026-10-22.** robots.txt turns away general crawlers at Reuters, Axios and CNBC, and AP returns 403 to every automated request, so those four outlets are in the registry with no feed. CNN's RSS is abandoned (2023 items, no dates). The Washington Post, CBC and Washington Times feeds failed from a cloud server and may work from a home connection; feed health shows on the Sources page.
- **Wire copy.** AP isn't directly ingestible, so AP stories arrive via outlets that syndicate them (ABC News carries a lot). NBC uses a "Reuters" byline on wire copy. Phase 3 can use both signals.
- **Reader view only for outlets classified `free`.** A page that says `isAccessibleForFree: false` is never stored or shown; the article is marked paywalled with that evidence. Extracts under 150 words count as teasers. An outlet that refuses fetches (401/403/451 or robots.txt) is skipped for 24 hours, and its links go straight to the publisher.
- **Reading progress** is the viewport bottom's position in the article body, saved with the topmost visible paragraph index. Reader-view progress only moves forward; manual settings can move it anywhere. Finished means at least 97%.
- **"Free only" includes `free`, `registration` and `mixed`.** Each is readable without paying, at least mostly. Phase 3 per-article detection will tighten `mixed`.
- **Bias ratings come from AllSides only** (CC BY-NC 4.0, with attribution). Ad Fontes and MBFC terms forbid redistribution. allsides.com blocks scripts, so the ratings were collected from search-engine copies of each outlet's page and should be spot-checked (each has a link). The ratings file is licensed separately from the code, and non-commercial use only.
- **Balancing targets equal left/center/right shares** (unrated outlets weighted ½). Even after adding eight right-of-center outlets, the registry is 29 left-leaning, 18 center and 9 right-leaning, so right-leaning outlets get up to 5 slots if boosted. The meter says when a side runs short.
- **One user, no accounts.** Reading state has no `user_id`. An optional passphrase (`APP_PASSPHRASE`) protects everything when the app is exposed to the internet. Set it before exposing the app: reader-view copies are for your own devices.
- **Clock times use `APP_TIMEZONE`.**
- **Next.js 16 conventions:** `proxy.ts` instead of middleware, `force-dynamic` in the root layout, and promise-typed `params`/`searchParams`.
- **Dev mode:** the first visit to each route can trigger one or two full-page reloads while Turbopack compiles it. Production (`next start` / Docker) doesn't do this.
- **Source discovery is citation-driven and human-approved.** Candidates are sites that 2 or more of your outlets link to in their feed items. That favors original reporting your sources rely on, and needs no third-party directory. Search-engine results and news-aggregator apps are deliberately not used: scraping them breaks their terms. Auto-adding was rejected because it would undermine both free-first ranking and balance. Detected access is a suggestion; the reader confirms it.
- **Discovery limits:** 15 sites a day, at most 5 feed URLs tried per site, homepages capped at 8 MB, every request through the same polite fetcher (robots.txt, honest user agent). Sites with no usable feed are re-checked after 30 days.
- **"News aggregators" in the request** was read as "new news sources". Portals that mostly republish others (Yahoo, MSN, AOL, NewsBreak, Flipboard, SmartNews, Ground News) are on the skip list, so discovery leads toward original outlets.
