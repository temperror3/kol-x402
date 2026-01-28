-- Campaign-Based KOL Discovery System
-- Run in Supabase SQL Editor AFTER 000_base_schema.sql (base schema must exist first).

-- 1. Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    search_terms TEXT[] NOT NULL,
    topic_description TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_name_unique ON campaigns(name);

-- Index for active campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active) WHERE is_active = true;

-- Index for default campaign
CREATE INDEX IF NOT EXISTS idx_campaigns_default ON campaigns(is_default) WHERE is_default = true;


-- 2. Create campaign_accounts table (campaign-specific categorization results)
CREATE TABLE IF NOT EXISTS campaign_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    ai_category VARCHAR(50),
    ai_confidence DECIMAL(5,2),
    ai_reasoning TEXT,
    ai_categorized_at TIMESTAMP WITH TIME ZONE,
    topic_consistency_score DECIMAL(5,2),
    content_depth_score DECIMAL(5,2),
    topic_focus_score DECIMAL(5,2),
    red_flags JSONB DEFAULT '[]',
    primary_topics TEXT[],
    keywords_found TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(campaign_id, account_id)
);

-- Indexes for campaign_accounts
CREATE INDEX IF NOT EXISTS idx_campaign_accounts_campaign ON campaign_accounts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_accounts_account ON campaign_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_accounts_category ON campaign_accounts(campaign_id, ai_category);
CREATE INDEX IF NOT EXISTS idx_campaign_accounts_confidence ON campaign_accounts(campaign_id, ai_confidence DESC);


-- 3. Create campaign_tweets table (campaign-specific tweet associations)
CREATE TABLE IF NOT EXISTS campaign_tweets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tweet_id UUID NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    keywords_found TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(campaign_id, tweet_id)
);

-- Indexes for campaign_tweets
CREATE INDEX IF NOT EXISTS idx_campaign_tweets_campaign ON campaign_tweets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_tweets_account ON campaign_tweets(campaign_id, account_id);


-- 4. Create campaign_search_queries table (search query history per campaign)
CREATE TABLE IF NOT EXISTS campaign_search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    query VARCHAR(500) NOT NULL,
    results_count INTEGER DEFAULT 0,
    last_run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for campaign search queries
CREATE INDEX IF NOT EXISTS idx_campaign_search_queries_campaign ON campaign_search_queries(campaign_id);


-- 5. Create or replace trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_accounts_updated_at ON campaign_accounts;
CREATE TRIGGER update_campaign_accounts_updated_at
    BEFORE UPDATE ON campaign_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 6. Insert default x402 campaign
INSERT INTO campaigns (name, description, search_terms, topic_description, is_default, is_active)
VALUES (
    'x402 Protocol',
    'HTTP 402 Payment Required protocol for API monetization',
    ARRAY['x402', '#x402', 'x402 protocol', 'HTTP 402'],
    'x402 is a crypto payment protocol that enables HTTP 402 Payment Required responses for API monetization. The x402 protocol allows developers to monetize APIs using cryptocurrency payments.',
    true,
    true
)
ON CONFLICT (name) DO NOTHING;


-- 7. Migrate existing accounts to campaign_accounts (for default campaign)
-- This links existing categorized accounts to the default x402 campaign
INSERT INTO campaign_accounts (
    campaign_id,
    account_id,
    ai_category,
    ai_confidence,
    ai_reasoning,
    ai_categorized_at,
    topic_consistency_score,
    content_depth_score,
    topic_focus_score,
    red_flags,
    primary_topics,
    keywords_found
)
SELECT
    (SELECT id FROM campaigns WHERE is_default = true),
    a.id,
    a.ai_category,
    a.ai_confidence,
    a.ai_reasoning,
    a.ai_categorized_at,
    COALESCE(a.topic_consistency_score, 0),
    COALESCE(a.content_depth_score, 0),
    COALESCE(a.topic_focus_score, 0),
    COALESCE(a.red_flags, '[]'::jsonb),
    COALESCE(a.primary_topics, ARRAY[]::TEXT[]),
    ARRAY[]::TEXT[]
FROM accounts a
WHERE a.ai_category IS NOT NULL
  AND (SELECT id FROM campaigns WHERE is_default = true) IS NOT NULL
ON CONFLICT (campaign_id, account_id) DO NOTHING;


-- 8. Migrate existing tweets to campaign_tweets (for default campaign)
INSERT INTO campaign_tweets (campaign_id, tweet_id, account_id, keywords_found)
SELECT
    (SELECT id FROM campaigns WHERE is_default = true),
    t.id,
    t.account_id,
    COALESCE(t.x402_keywords_found, ARRAY[]::TEXT[])
FROM tweets t
WHERE (SELECT id FROM campaigns WHERE is_default = true) IS NOT NULL
ON CONFLICT (campaign_id, tweet_id) DO NOTHING;


-- Verify migration
SELECT 'Campaigns created:' as info, COUNT(*) as count FROM campaigns;
SELECT 'Campaign accounts migrated:' as info, COUNT(*) as count FROM campaign_accounts;
SELECT 'Campaign tweets migrated:' as info, COUNT(*) as count FROM campaign_tweets;
