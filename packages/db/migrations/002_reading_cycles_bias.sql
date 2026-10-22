-- Per-article reading state for the (single) reader.
CREATE TABLE reading_state (
  article_id     bigint PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  opened_at      timestamptz,
  saved_at       timestamptz,
  read_at        timestamptz,
  -- How far through the article, 0..1. Exact in reader view; self-reported for publisher sites.
  progress       real NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
  -- Index of the paragraph (data-block) the reader was at, so resuming survives screen-size changes.
  progress_block integer,
  progress_source text CHECK (progress_source IN ('reader', 'manual')),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reading_state_saved_idx ON reading_state (saved_at DESC) WHERE saved_at IS NOT NULL;
CREATE INDEX reading_state_updated_idx ON reading_state (updated_at DESC);

-- Reader-view copies of FREE articles only, kept for the reader's own devices.
CREATE TABLE article_content (
  article_id  bigint PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  -- ok: extracted. not_free: source isn't free, never fetched. marked_paid: page says
  -- isAccessibleForFree=false. too_short: looked like a teaser. blocked/failed: couldn't fetch.
  status      text NOT NULL CHECK (status IN ('ok', 'not_free', 'marked_paid', 'too_short', 'blocked', 'failed')),
  html        text,
  word_count  integer,
  block_count integer,
  error       text,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

-- Small key/value store for app-wide settings, e.g. when the current news cycle started.
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Outlet-level political lean from a published rater, plus the reader's own override.
ALTER TABLE sources
  ADD COLUMN bias_lean text NOT NULL DEFAULT 'unrated'
    CHECK (bias_lean IN ('left', 'lean_left', 'center', 'lean_right', 'right', 'mixed', 'unrated')),
  ADD COLUMN bias_rater text,
  ADD COLUMN bias_rating_url text,
  ADD COLUMN bias_rated_on date,
  ADD COLUMN bias_note text,
  ADD COLUMN user_bias_lean text
    CHECK (user_bias_lean IN ('left', 'lean_left', 'center', 'lean_right', 'right', 'mixed', 'unrated'));
