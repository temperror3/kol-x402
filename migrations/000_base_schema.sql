-- Base schema for KOL Discovery (accounts, tweets, search_queries)
-- Run this migration FIRST in Supabase SQL Editor, then run 001_campaigns.sql

-- 1. Accounts table
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

    -- AI categorization (used by campaigns; legacy global categorization)
    ai_category TEXT DEFAULT 'UNCATEGORIZED' CHECK (ai_category IN ('KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED')),
    ai_confidence REAL DEFAULT 0,
    ai_reasoning TEXT,
    ai_categorized_at TIMESTAMP WITH TIME ZONE,

    -- Campaign-style scores (optional on base account; campaign_accounts has per-campaign values)
    topic_consistency_score DECIMAL(5,2),
    content_depth_score DECIMAL(5,2),
    topic_focus_score DECIMAL(5,2),
    red_flags JSONB DEFAULT '[]',
    primary_topics TEXT[],

    -- Metadata
    x402_tweet_count_30d INTEGER DEFAULT 0,
    has_github BOOLEAN DEFAULT FALSE,
    uses_technical_terms BOOLEAN DEFAULT FALSE,
    posts_code_snippets BOOLEAN DEFAULT FALSE,

    -- Timestamps
    last_active_at TIMESTAMP WITH TIME ZONE,
    last_enriched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_ai_category ON accounts(ai_category);
CREATE INDEX IF NOT EXISTS idx_accounts_confidence ON accounts(ai_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_engagement_score ON accounts(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_twitter_id ON accounts(twitter_id);


-- 2. Tweets table
CREATE TABLE IF NOT EXISTS tweets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    twitter_id TEXT UNIQUE NOT NULL,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    quotes INTEGER DEFAULT 0,
    bookmarks INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    has_code BOOLEAN DEFAULT FALSE,
    has_github BOOLEAN DEFAULT FALSE,
    x402_keywords_found TEXT[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON tweets(account_id);
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at DESC);


-- 3. Search queries (global; campaign-specific ones are in campaign_search_queries)
CREATE TABLE IF NOT EXISTS search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    last_run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 4. updated_at trigger for accounts
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_updated_at ON accounts;
CREATE TRIGGER accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Verify
SELECT 'Base schema ready. Accounts:' AS info, COUNT(*) AS count FROM accounts;
SELECT 'Tweets:' AS info, COUNT(*) AS count FROM tweets;
