# Build Instructions: Open News Reader (Google News / Apple News replacement)

> **How to use this file:** Put it in an empty repo as `SPEC.md` (or `CLAUDE.md`) and tell Claude:
> *"Read SPEC.md. Build Phase 1, run the tests, and stop for my review before Phase 2."*
> Fill in the **Decisions** section first. If you leave it as is, Claude uses the defaults.

---

## 0. Decisions (fill these in, or keep the defaults)

| Decision | Default |
|---|---|
| App name | `NewsWiz` |
| Platforms | Installable PWA (iPhone, Android, desktop) from one codebase. Native apps can come later. |
| Hosting | Single small VPS or home server, run with Docker Compose |
| Users | Just me / my household (no public sign-up in v1) |
| Region / local news | US, with local news by ZIP code |
| AI features | Story clustering with a local embedding model. LLM summaries are off by default. |

---

## 1. Mission

Build a personal news aggregator that replaces Google News and Apple News. It has one guiding rule:

**For every story, get the reader to a version they can actually read.**

When a story is behind a paywall, the app finds a legitimate way to read it. When it can't, the app shows free reporting on the same story instead. Free, nonprofit, and public-interest journalism gets ranked first.

### What "sidestepping" means in this app (and what it doesn't)

**Do build these access routes, in priority order:**

1. **The same story from a free outlet.** Group coverage of the same event across outlets (see §4) and make the best free article the headline link.
2. **The wire original.** Many paywalled papers run AP copy. Detect syndicated wire stories (bylines like "Associated Press" or "By The Associated Press", plus near-duplicate text from the RSS summary) and link to the free original on apnews.com.
3. **The primary source.** If the story is about a court ruling, bill, government report, earnings release, or scientific paper, find and link the source document. For papers, use the Unpaywall API to find legal open-access copies.
4. **Access the user already has.** In Settings, the user lists their subscriptions. Those outlets count as "free for me", and their links open in the system browser, where the user is logged in.
5. **Library access.** Many public libraries give free digital passes to NYT, WSJ, WaPo, and others, plus PressReader. Settings records which ones the user has. Paywalled links from those outlets show an "Open via library" action with instructions or a deep link.
6. **Publisher-sanctioned free articles.** Respect and surface pages the publisher marks as free: `isAccessibleForFree: true` in schema.org JSON-LD, unlocked public-interest coverage, and gift links. Users can paste gift links and the app stores them.
7. **Metered paywall awareness.** Track how many articles from each metered outlet the user has opened this month, against that outlet's known free limit. Prefer outlets where the user still has free reads left.
8. **Existing public archive copy (optional, off by default).** If the Internet Archive's Wayback Availability API already has a snapshot, show a secondary "Archived copy" link. Only link to it. Never trigger new captures to get around a paywall.

**Do NOT build these** (copyright, DMCA, and terms-of-service exposure; they would also get the app rejected from app stores, and publishers break them within weeks anyway):

- Spoofing Googlebot or other crawler user agents, or faking referrers
- Stripping paywall scripts or overlays, or blocking paywall JavaScript to reveal hidden text
- Automatically clearing cookies or rotating identities to reset meters
- Integrating bypass services (12ft-style, archive.today submissions, etc.)
- Fetching paywalled full text on a server and showing or storing it

If an article can't be reached through routes 1–8, show the paywall honestly and put the free coverage next to it.

---

## 2. Core features (feature parity target)

| Google / Apple News feature | Our version |
|---|---|
| Top Stories | Story **clusters** ranked by importance (number of independent outlets, recency, original reporting), not by engagement |
| For You | Topic and source preferences. Transparent, with no hidden engagement optimization. A "Why am I seeing this?" note on every card. |
| Full Coverage | Cluster page: every outlet's take, grouped into **Free**, **Free for you**, **Metered**, and **Paywalled**, plus primary sources and the wire original |
| Following / Topics | Follow topics, outlets, people, and places. Keyword alerts. |
| Local | Local news by ZIP code. Seed it from local nonprofit newsrooms (INN and LION member directories) and local TV/public radio RSS feeds. |
| Search | Full-text search over headlines and summaries (Postgres FTS). Filters: free only, date range, outlet. |
| Saved / Read later | Save articles and work offline. Reader view **only for content that is freely accessible**. |
| Notifications | Breaking news (a cluster that jumps past a threshold of outlets within N minutes) and followed-topic alerts. Quiet hours. |
| Hide / mute | Mute outlets, topics, and keywords. "Show fewer like this." |

**Global toggle: "Free only"** hides every cluster that has no readable version.

**Badges on every article link:** 🟢 Free · 🔵 Free for you (subscription or library) · 🟡 Metered (N left) · 🔴 Paywalled · ⚪ Free with registration

---

## 2b. News cycles, reading progress, and bias (added during Phase 1)

**News cycles: the default way to read.** The home screen is **Catch up**: a short briefing of what was published since you last said "I'm caught up". The first visit looks back 24 hours, and it never looks back more than 48.
- **Balanced by construction.** Each pick goes to whichever side (left / center / right / unrated outlets) is furthest behind its share. Each outlet is capped at 3 articles (5 if boosted), and back-to-back picks from the same outlet or ownership type are penalized. Muted outlets never appear.
- **Balance meter.** A bar on the briefing shows the left/center/right/unrated breakdown and the ownership mix. It says so when one side has too few new articles to fill an equal share.
- **Fast.** Server-rendered, 40 items by default with a "longer briefing" option, keyboard shortcuts (j/k/o/s/m), and one tap to finish the cycle.
- **Phase 2 upgrade:** briefing cards become story clusters, and each cluster shows coverage by lean and flags "blindspot" stories that only one side covers.

**Reading state.** Every article tracks opened / saved / finished / progress.
- **Reader view (free outlets only).** Progress is tracked exactly and saved per paragraph (`data-block` index), so resuming survives screen-size changes. It saves on scroll pauses and when the page is hidden, and shows a "Picked up where you left off" message with a Start-over option. Progress only moves forward from scrolling; it is marked finished at 97%.
- **Publisher's site.** The app can't see scrolling there. Opens are recorded through `/go/:id`, and the reader sets where they stopped by hand (¼, ½, ¾, finished).
- **Saved page:** in progress, then not started, then finished, with minutes left. **Continue reading** appears at the top of Catch up.

**Bias indicator.**
- **Outlet-level lean** from AllSides Media Bias Ratings (CC BY-NC 4.0, credited on the Sources page). It is stored in `data/bias-ratings.json`, which is licensed separately from the code. Outlets AllSides doesn't rate show "Unrated". MBFC and Ad Fontes data are not used: their terms forbid redistribution.
- **Every card** shows a five-step lean scale plus a label, with a tooltip that says it describes the outlet, not the article.
- **The reader can override** any outlet's lean. The override is used everywhere, including balancing.
- **Latest** can be filtered by lean.
- **Source list balance:** right-of-center outlets were added (Free Beacon, Just the News, Daily Caller, Washington Times, National Review news, The Dispatch, RealClearInvestigations, Deseret News) so balancing has enough to work with.

**Daily source discovery.**
- **Signal.** During ingestion the worker records outbound links in feed items (`link_mentions`, kept 30 days). Social, video, shopping, aggregator-portal and other platform domains are skipped, as are .gov/.edu/.mil/.int.
- **Daily run.** The worker checks up to 15 domains cited by **2 or more** different outlets that aren't already sources and haven't been decided on. For each it fetches the homepage, finds its feed (`<link rel=alternate>`, then `/feed/`, `/rss.xml`, `/feed.xml`), and requires at least 3 dated items with one from the past week. It samples the newest article for `isAccessibleForFree` and paywall-vendor scripts.
- **Aliases** of outlets already followed (redirects) are rejected.
- **Review.** Suggestions appear on **Discover** with who cited them, sample headlines, news-site markers and the access evidence. The reader confirms access model, ownership and lean, then Adds or Dismisses. Nothing is added automatically, and dismissed sites are never suggested again. `pnpm discover` runs it on demand.

## 3. Sources and ingestion

- **Main input:** RSS/Atom feeds and Google News–format news sitemaps (`news:news` sitemap entries). Respect `robots.txt`, cache with ETag/Last-Modified, and use an honest user agent: `NewsWiz/1.0 (+contact URL)`.
- **Polling:** every 5–10 minutes for major outlets and every 30–60 minutes for others, with backoff on errors.
- **Optional enrichers:** GDELT (free global event data) to discover outlets and cluster signals; Unpaywall for papers; the Wayback Availability API (optional route 8).
- **Store per article:** url, canonical url, outlet, title, RSS summary, author/byline, published time, section, image URL, language, access status, access evidence, cluster id, and embedding.
- **Never store** full text from paywalled pages. For free pages, you may cache extracted text for offline reader view, but don't redistribute it beyond the user's own devices.

### Source registry (`sources` table, editable in an admin screen)

Fields: name, homepage, feeds[], country, region/ZIP coverage, ownership type (nonprofit / public media / commercial / wire / government), **default access model** (free / registration / metered N per month / hard paywall / mixed), quality flags (does original reporting, aggregator only, opinion-heavy), and a user boost or mute setting.

**Seed list of generally free outlets. Verify each one at build time, because access policies change often.** AP News, NPR, PBS NewsHour, The Guardian, ProPublica, The Conversation, KFF Health News, CalMatters, The Texas Tribune, The 19th, Grist, Inside Climate News, Chalkbeat, Votebeat, Al Jazeera English, Axios, member newsrooms in the INN directory, plus government and primary sources (congress.gov, federalregister.gov, courtlistener.com, sec.gov EDGAR, agency press rooms).

Also seed the major paywalled outlets (NYT, WSJ, WaPo, Bloomberg, FT, The Atlantic, etc.). Their headlines still matter for clustering and importance. They just shouldn't be the primary link unless the reader has access.

---

## 4. Story clustering (the key to sidestepping)

Goal: group articles about the same event so the app can pick the best readable version.

1. Embed `title + summary` with a local sentence-embedding model (for example `all-MiniLM-L6-v2` or `bge-small` via ONNX or sentence-transformers). Run it in the worker. No API cost.
2. Add a candidate article to a cluster when cosine similarity to the cluster centroid is ≥ threshold (start at ~0.78 and tune it) **and** it was published within 48h of the cluster's latest article. Boost the score when named entities overlap (spaCy NER).
3. Clusters can merge and split. Re-evaluate them every ingestion cycle.
4. **Pick the lead article** in each cluster with this scoring function, kept in one well-tested module:
   - Access for this user: Free / Free-for-you > Registration > Metered with reads left > Archived copy > Paywalled
   - Original reporting > wire > rewrite or aggregation (prefer the outlet that broke it, or the wire original)
   - Source quality and user boost
   - Recency and depth (summary length or word count when known)
5. Cluster importance = number of distinct outlets × outlet-diversity factor × recency decay. This drives Top Stories.
6. Build an evaluation set of 200 hand-labeled article pairs (same story / not the same) and report precision and recall for the clustering. Target ≥ 0.9 precision.

---

## 5. Paywall / access detection

Classify each article as `free | registration | metered | paywalled | unknown`, and record the evidence. Detect it **as a normal browser would see it, with no spoofing**:

1. **Per-user overrides:** subscription or library access means `free_for_user`.
2. **Article signal:** schema.org JSON-LD `isAccessibleForFree` and `hasPart.cssSelector` (publishers set these for Google). This is the most reliable signal.
3. **Page signals:** known paywall vendor scripts (Piano/Tinypass, Zephr, Poool, Arc XP subscriptions, Pelcro, Laterpay), meta tags, and truncated body text compared with the expected length.
4. **Source default** from the registry.
5. **Crowd and user feedback:** an "I hit a paywall" or "This was free" button on each article updates the source's stats.

Run detection lazily: only on lead candidates and when a user opens a cluster. Cache results per URL. Rate-limit per domain.

---

## 6. Architecture (default stack)

- **Monorepo**, TypeScript end to end, plus one Python worker for embeddings and NER.
- `apps/web`: Next.js (App Router) PWA with offline support (service worker, IndexedDB for saved articles), installable on iOS and Android, with dark mode and accessible components.
- `apps/api`: Next.js route handlers or Fastify. REST/JSON API.
- `workers/ingest`: Node. Feed polling, sitemap parsing, normalization, dedupe by canonical URL, access detection.
- `workers/nlp`: Python with FastAPI. Embeddings, NER, clustering.
- **Postgres** with `pgvector` for embeddings and built-in full-text search for search. Redis or pg-boss for job queues.
- **Docker Compose** for the whole stack. A one-command `make dev` and `make up`.
- **Auth:** a simple single-user passphrase or magic link in v1.
- **Config:** everything in `.env`. No secrets in the repo.

---

## 7. Optional AI layer (off by default)

- Summarize a **cluster** using only the RSS summaries and the free articles in it, and cite which outlets each claim came from. Never summarize paywalled text the app didn't legitimately get.
- "What's different between outlets": highlight factual disagreements across the cluster.
- If enabled, use the Claude API. Ask the builder to check the current model IDs and pricing at build time, and cap monthly spend in config.

---

## 8. Privacy and ethics

- No third-party analytics or ad SDKs. Reading history stays on the user's server.
- An honest user agent, robots.txt compliance, and per-domain rate limits.
- Show headlines, short summaries, and links. Don't republish articles.
- A "Support this outlet" link on free nonprofit sources (donate or membership page). The app exists to route readers to journalism that's free, not to starve it.

---

## 9. Build phases (stop for review after each one)

**Phase 1: Ingestion and a basic feed** — ✅ done, plus §2b (news cycles, reading progress, bias indicator)
- Docker Compose stack, DB schema, migrations, a source registry seeded with about 40 outlets
- RSS ingestion with dedupe, and a chronological feed in the web app with badges using the source default access model
- Tests: feed parsing fixtures, dedupe, scheduler backoff

**Phase 2: Clustering and Full Coverage** (includes cluster-level lean coverage and blindspot flags from §2b)
- NLP worker, embeddings, clustering, lead-article scoring, Top Stories, and the cluster page grouped by access
- Clustering eval set plus a precision/recall report in CI

**Phase 3: Access routes**
- Per-article access detection, subscription and library settings, a meter tracker, wire-original detection, primary-source linking, Unpaywall, gift link storage, and the "Free only" toggle
- Tests: a lead-picker unit test matrix (every access tier × source type combination), and detection fixtures saved from real HTML

**Phase 4: Parity features**
- For You, Topics and Following, Local by ZIP, search, offline reading (saved and reader view already exist), notifications, "Why am I seeing this?" (mute/boost already exist)

**Phase 5: Polish**
- Optional AI summaries, Wayback fallback (opt-in), admin screen for sources, an import/export of settings, performance pass (Top Stories loads in under 1s on mobile), and an accessibility audit (WCAG AA)

---

## 10. Acceptance criteria (whole app)

- [ ] On a typical day, ≥ 85% of Top Stories clusters have a lead link that's readable for free by this user.
- [ ] Every article link shows an access badge. A wrong badge can be reported in one tap.
- [ ] When a big paywalled outlet has an exclusive and no free coverage exists, the card says so plainly. It's never silently hidden, unless "Free only" is on.
- [ ] No code path spoofs crawlers, strips paywalls, or stores paywalled full text. Add a test that greps the codebase for crawler user-agent strings and fails the build if it finds one.
- [ ] `make up` on a fresh machine brings up the working app with seeded sources in under 10 minutes.
- [ ] README covers setup, adding sources, tuning clustering, and how access tiers work.

---

## 11. Working rules for Claude while building

- Work one phase at a time. Commit in small, logical steps, and run the tests before each commit.
- Before seeding the source registry, check each feed URL and the outlet's current access model. Mark anything you couldn't verify as `unknown`. Don't guess.
- When a design choice isn't covered here, pick the simplest option, write it down in `DECISIONS.md`, and keep going.
- If a requested feature would need any item from the "Do NOT build" list, stop and explain instead of building it.
