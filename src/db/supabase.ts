import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }
  return supabase;
}

// SQL to create tables in Supabase
export const SCHEMA_SQL = `
-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  tweet_count INTEGER DEFAULT 0,
  profile_image_url TEXT,

  -- Scores (0-100)
  engagement_score REAL DEFAULT 0,
  tech_score REAL DEFAULT 0,
  x402_relevance REAL DEFAULT 0,
  confidence REAL DEFAULT 0,

  -- Category
  category TEXT DEFAULT 'UNCATEGORIZED' CHECK (category IN ('KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED')),

  -- Metadata
  x402_tweet_count_30d INTEGER DEFAULT 0,
  has_github BOOLEAN DEFAULT FALSE,
  uses_technical_terms BOOLEAN DEFAULT FALSE,
  posts_code_snippets BOOLEAN DEFAULT FALSE,

  -- Timestamps
  last_active_at TIMESTAMPTZ,
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tweets table for analysis
CREATE TABLE IF NOT EXISTS tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_id TEXT UNIQUE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  quotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  has_code BOOLEAN DEFAULT FALSE,
  has_github BOOLEAN DEFAULT FALSE,
  x402_keywords_found TEXT[] DEFAULT '{}'
);

-- Search queries tracking
CREATE TABLE IF NOT EXISTS search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_category ON accounts(category);
CREATE INDEX IF NOT EXISTS idx_accounts_engagement_score ON accounts(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_confidence ON accounts(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_twitter_id ON accounts(twitter_id);
CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON tweets(account_id);
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at DESC);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_updated_at ON accounts;
CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
`;
