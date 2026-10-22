export const ACCESS_MODELS = ['free', 'registration', 'metered', 'paywalled', 'mixed', 'unknown'] as const;
export type AccessModel = (typeof ACCESS_MODELS)[number];

export const OWNERSHIP_TYPES = ['nonprofit', 'public_media', 'commercial', 'wire', 'government'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const FEED_KINDS = ['rss', 'news_sitemap'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export const BIAS_LEANS = ['left', 'lean_left', 'center', 'lean_right', 'right', 'mixed', 'unrated'] as const;
export type BiasLean = (typeof BIAS_LEANS)[number];

/** Only articles from sources with these access models are fetched for reader view. */
export const READER_VIEW_ACCESS: readonly AccessModel[] = ['free'];

/** Access models a reader can get through without paying. "mixed" counts: most of it is free. */
export const READABLE_ACCESS: readonly AccessModel[] = ['free', 'registration', 'mixed'];

/** One article as parsed from a feed, before it touches the database. */
export interface ParsedItem {
  url: string;
  guid: string | null;
  title: string;
  summary: string | null;
  author: string | null;
  section: string | null;
  imageUrl: string | null;
  language: string | null;
  publishedAt: Date | null;
  /** Outbound links found in the item's description/content (for source discovery). */
  links?: string[];
}

export interface Feed {
  id: number;
  source_id: number;
  url: string;
  kind: FeedKind;
  section: string | null;
  poll_interval_minutes: number;
  etag: string | null;
  last_modified: string | null;
  consecutive_failures: number;
}

export interface FeedArticle {
  id: number;
  url: string;
  title: string;
  summary: string | null;
  author: string | null;
  image_url: string | null;
  section: string | null;
  sort_at: Date;
  source_slug: string;
  source_name: string;
  ownership_type: OwnershipType;
  access_model: AccessModel;
  metered_limit: number | null;
  metered_period: 'week' | 'month' | null;
  donate_url: string | null;
  country: string;
  user_weight: number;
  /** Effective lean: the reader's override if set, else the rater's. */
  bias_lean: BiasLean;
  bias_rater: string | null;
  bias_overridden: boolean;
  /** The outlet recently refused reader-view fetches; link straight to the publisher. */
  reader_blocked: boolean;
  opened_at: Date | null;
  saved_at: Date | null;
  read_at: Date | null;
  progress: number;
}

export interface SourceHealth {
  id: number;
  slug: string;
  name: string;
  homepage: string;
  country: string;
  ownership_type: OwnershipType;
  access_model: AccessModel;
  metered_limit: number | null;
  metered_period: 'week' | 'month' | null;
  access_notes: string | null;
  access_evidence_url: string | null;
  access_verified_on: string | null;
  donate_url: string | null;
  user_weight: number;
  enabled: boolean;
  bias_lean: BiasLean;
  rater_bias_lean: BiasLean;
  user_bias_lean: BiasLean | null;
  bias_rater: string | null;
  bias_rating_url: string | null;
  bias_rated_on: string | null;
  bias_note: string | null;
  feed_count: number;
  healthy_feed_count: number;
  last_success_at: Date | null;
  last_error: string | null;
  articles_24h: number;
  latest_article_at: Date | null;
}
