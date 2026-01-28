-- ============================================================================
-- KOL Finder – full schema (run on empty DB)
-- Run this in Supabase SQL editor after deleting / creating a new project.
-- Requires PostgreSQL 11+ (EXECUTE FUNCTION). On PG 10 use EXECUTE PROCEDURE.
-- ============================================================================

-- Helper: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. Search configurations (no dependencies)
-- ============================================================================
CREATE TABLE search_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  primary_keywords TEXT[] NOT NULL,
  secondary_keywords TEXT[] DEFAULT '{}',
  topic_context TEXT NOT NULL,
  min_followers INTEGER DEFAULT 1000,
  min_relevance_score REAL DEFAULT 30,
  min_tweet_count_30d INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_search_configs_default
  ON search_configurations(is_default) WHERE is_default = TRUE;
CREATE INDEX idx_search_configs_active ON search_configurations(is_active);
CREATE INDEX idx_search_configs_name ON search_configurations(name);

CREATE TRIGGER search_configurations_updated_at
  BEFORE UPDATE ON search_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. Accounts (depends on search_configurations for last_analyzed_config_id)
-- ============================================================================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  tweet_count INTEGER DEFAULT 0,
  profile_image_url TEXT,

  has_github BOOLEAN DEFAULT FALSE,
  uses_technical_terms BOOLEAN DEFAULT FALSE,
  posts_code_snippets BOOLEAN DEFAULT FALSE,

  ai_category TEXT DEFAULT 'UNCATEGORIZED'
    CHECK (ai_category IN ('KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED')),
  ai_reasoning TEXT,
  ai_confidence REAL DEFAULT 0,
  ai_categorized_at TIMESTAMPTZ,

  topic_consistency_score REAL,
  content_depth_score REAL,
  topic_focus_score REAL,
  red_flags JSONB,
  primary_topics JSONB,

  last_analyzed_config_id UUID REFERENCES search_configurations(id),

  last_active_at TIMESTAMPTZ,
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_ai_category ON accounts(ai_category);
CREATE INDEX idx_accounts_ai_confidence ON accounts(ai_confidence DESC);
CREATE INDEX idx_accounts_twitter_id ON accounts(twitter_id);

CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 3. Account–configuration junction (many-to-many)
-- ============================================================================
CREATE TABLE account_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES search_configurations(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 0,
  tweet_count_30d INTEGER DEFAULT 0,
  keywords_found TEXT[] DEFAULT '{}',
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_analyzed_at TIMESTAMPTZ,
  UNIQUE(account_id, config_id)
);

CREATE INDEX idx_account_configs_account ON account_configurations(account_id);
CREATE INDEX idx_account_configs_config ON account_configurations(config_id);
CREATE INDEX idx_account_configs_relevance ON account_configurations(relevance_score DESC);

-- ============================================================================
-- 4. Tweets (depends on accounts)
-- ============================================================================
CREATE TABLE tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_id TEXT UNIQUE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  quotes INTEGER DEFAULT 0,
  views TEXT,
  bookmarks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  has_code BOOLEAN DEFAULT FALSE,
  has_github BOOLEAN DEFAULT FALSE,
  keywords_found TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_tweets_account_id ON tweets(account_id);
CREATE INDEX idx_tweets_created_at ON tweets(created_at DESC);

-- ============================================================================
-- 5. Search queries (depends on search_configurations)
-- ============================================================================
CREATE TABLE search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  config_id UUID REFERENCES search_configurations(id),
  last_run_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_queries_config ON search_queries(config_id);

-- ============================================================================
-- 6. Seed one default configuration (optional)
-- ============================================================================
INSERT INTO search_configurations (
  name,
  description,
  primary_keywords,
  secondary_keywords,
  topic_context,
  is_default,
  is_active
) VALUES (
  'Default',
  'Default topic – add keywords and context in Configurations.',
  ARRAY['KOL', 'thought leader', 'influencer'],
  ARRAY['analyst', 'commentary'],
  'Key Opinion Leaders and influential voices. Update this configuration or create new ones in the dashboard.',
  TRUE,
  TRUE
);
