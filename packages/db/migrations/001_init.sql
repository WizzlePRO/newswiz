-- Source registry: one row per outlet.
CREATE TABLE sources (
  id                  serial PRIMARY KEY,
  slug                text NOT NULL UNIQUE,
  name                text NOT NULL,
  homepage            text NOT NULL,
  country             text NOT NULL DEFAULT 'US',
  -- ZIP prefixes or region names for local outlets (used for Local news in Phase 4).
  coverage_regions    text[] NOT NULL DEFAULT '{}',
  ownership_type      text NOT NULL CHECK (ownership_type IN
                        ('nonprofit', 'public_media', 'commercial', 'wire', 'government')),
  -- Default access model. Per-article detection (Phase 3) can override it.
  access_model        text NOT NULL DEFAULT 'unknown' CHECK (access_model IN
                        ('free', 'registration', 'metered', 'paywalled', 'mixed', 'unknown')),
  metered_limit       integer,
  metered_period      text CHECK (metered_period IN ('week', 'month')),
  access_notes        text,
  access_evidence_url text,
  access_verified_on  date,
  original_reporting  boolean NOT NULL DEFAULT true,
  opinion_heavy       boolean NOT NULL DEFAULT false,
  is_aggregator       boolean NOT NULL DEFAULT false,
  donate_url          text,
  -- User preference: -1 muted, 0 neutral, 1 boosted. Never overwritten by the seed.
  user_weight         smallint NOT NULL DEFAULT 0 CHECK (user_weight BETWEEN -1 AND 1),
  enabled             boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- A source can have several feeds (sections, or a news sitemap instead of RSS).
CREATE TABLE feeds (
  id                    serial PRIMARY KEY,
  source_id             integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url                   text NOT NULL UNIQUE,
  kind                  text NOT NULL DEFAULT 'rss' CHECK (kind IN ('rss', 'news_sitemap')),
  section               text,
  poll_interval_minutes integer NOT NULL DEFAULT 15 CHECK (poll_interval_minutes >= 5),
  enabled               boolean NOT NULL DEFAULT true,
  etag                  text,
  last_modified         text,
  next_poll_at          timestamptz NOT NULL DEFAULT now(),
  last_polled_at        timestamptz,
  last_success_at       timestamptz,
  last_status           integer,
  last_error            text,
  consecutive_failures  integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feeds_due_idx ON feeds (next_poll_at) WHERE enabled;

CREATE TABLE articles (
  id               bigserial PRIMARY KEY,
  source_id        integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  feed_id          integer REFERENCES feeds(id) ON DELETE SET NULL,
  -- The link we send readers to, exactly as the publisher gave it.
  url              text NOT NULL,
  -- Normalized form used only as a dedupe key (never shown or linked).
  canonical_url    text NOT NULL UNIQUE,
  guid             text,
  title            text NOT NULL,
  -- Lowercased, punctuation-free title used to catch the same story re-published under a new URL.
  title_key        text NOT NULL,
  -- Short publisher-provided summary only; full article text is never stored.
  summary          text,
  author           text,
  section          text,
  image_url        text,
  language         text,
  published_at     timestamptz,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Phase 3 fills these in with per-article detection.
  access_status    text NOT NULL DEFAULT 'unknown' CHECK (access_status IN
                     ('free', 'registration', 'metered', 'paywalled', 'mixed', 'unknown')),
  access_evidence  jsonb
);
CREATE UNIQUE INDEX articles_source_guid_idx ON articles (source_id, guid) WHERE guid IS NOT NULL;
CREATE INDEX articles_source_title_idx ON articles (source_id, title_key);
-- Feed ordering: newest first, falling back to when we first saw it.
CREATE INDEX articles_sort_idx ON articles ((coalesce(published_at, first_seen_at)) DESC, id DESC);
