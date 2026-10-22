-- Outbound links seen in feed items: which outlets cite which other sites. Feeds source discovery.
CREATE TABLE link_mentions (
  domain     text NOT NULL,
  source_id  integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url        text NOT NULL,
  seen_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (domain, source_id, url)
);
CREATE INDEX link_mentions_seen_idx ON link_mentions (seen_at);

-- Outlets found by the daily discovery job, waiting for the reader to add or dismiss them.
CREATE TABLE source_candidates (
  id               serial PRIMARY KEY,
  domain           text NOT NULL UNIQUE,
  name             text,
  homepage         text NOT NULL,
  feed_url         text,
  -- pending: valid, awaiting review. approved/rejected: the reader decided. invalid: no usable feed.
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'invalid')),
  invalid_reason   text,
  cited_by         text[] NOT NULL DEFAULT '{}',
  mention_count    integer NOT NULL DEFAULT 0,
  feed_items       integer,
  newest_item_at   timestamptz,
  sample_titles    text[] NOT NULL DEFAULT '{}',
  access_guess     text CHECK (access_guess IN ('free', 'registration', 'metered', 'paywalled', 'mixed', 'unknown')),
  access_evidence  jsonb,
  checked_at       timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  source_id        integer REFERENCES sources(id) ON DELETE SET NULL
);
CREATE INDEX source_candidates_status_idx ON source_candidates (status, mention_count DESC);
