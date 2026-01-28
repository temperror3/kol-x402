-- Migration: Make KOL Finder Extensible with Custom Search Configurations
-- This migration transforms the system from x402-specific to support user-defined topics
-- Run this SQL in your Supabase SQL editor

-- ============================================================================
-- STEP 1: Create search_configurations table
-- ============================================================================
CREATE TABLE IF NOT EXISTS search_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Configuration metadata
  name TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Search keywords
  primary_keywords TEXT[] NOT NULL,
  secondary_keywords TEXT[] DEFAULT '{}',

  -- AI prompt context (replaces hardcoded x402 descriptions)
  topic_context TEXT NOT NULL,

  -- Quality thresholds (per-config overrides)
  min_followers INTEGER DEFAULT 1000,
  min_relevance_score REAL DEFAULT 30,
  min_tweet_count_30d INTEGER DEFAULT 3,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one default configuration
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_configs_default
  ON search_configurations(is_default)
  WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_search_configs_active ON search_configurations(is_active);
CREATE INDEX IF NOT EXISTS idx_search_configs_name ON search_configurations(name);

-- ============================================================================
-- STEP 2: Create account_configurations junction table (many-to-many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES search_configurations(id) ON DELETE CASCADE,

  -- Configuration-specific relevance metrics
  relevance_score REAL DEFAULT 0,
  tweet_count_30d INTEGER DEFAULT 0,
  keywords_found TEXT[] DEFAULT '{}',

  -- Discovery metadata
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_analyzed_at TIMESTAMPTZ,

  UNIQUE(account_id, config_id)
);

CREATE INDEX IF NOT EXISTS idx_account_configs_account ON account_configurations(account_id);
CREATE INDEX IF NOT EXISTS idx_account_configs_config ON account_configurations(config_id);
CREATE INDEX IF NOT EXISTS idx_account_configs_relevance ON account_configurations(relevance_score DESC);

-- ============================================================================
-- STEP 3: Rename x402-specific column to topic-agnostic in tweets table
-- ============================================================================
DO $$
BEGIN
  -- Only rename if the old column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tweets' AND column_name = 'x402_keywords_found'
  ) THEN
    ALTER TABLE tweets RENAME COLUMN x402_keywords_found TO keywords_found;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Add config tracking to search_queries table
-- ============================================================================
DO $$
BEGIN
  -- Only add if column doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'search_queries' AND column_name = 'config_id'
  ) THEN
    ALTER TABLE search_queries ADD COLUMN config_id UUID REFERENCES search_configurations(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_search_queries_config ON search_queries(config_id);

-- ============================================================================
-- STEP 5: Add config tracking to accounts table
-- ============================================================================
DO $$
BEGIN
  -- Only add if column doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'last_analyzed_config_id'
  ) THEN
    ALTER TABLE accounts ADD COLUMN last_analyzed_config_id UUID REFERENCES search_configurations(id);
  END IF;
END $$;

-- ============================================================================
-- STEP 6: Remove deprecated x402-specific columns from accounts table
-- ============================================================================
-- Note: We're keeping these for now as they might contain data
-- Run the DROP commands after verifying data migration is complete

DO $$
BEGIN
  -- Add deprecation comments
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'x402_relevance'
  ) THEN
    COMMENT ON COLUMN accounts.x402_relevance IS 'DEPRECATED: Use account_configurations.relevance_score. Will be removed in next version.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'x402_tweet_count_30d'
  ) THEN
    COMMENT ON COLUMN accounts.x402_tweet_count_30d IS 'DEPRECATED: Use account_configurations.tweet_count_30d. Will be removed in next version.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'engagement_score'
  ) THEN
    COMMENT ON COLUMN accounts.engagement_score IS 'DEPRECATED: No longer used. Will be removed in next version.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'tech_score'
  ) THEN
    COMMENT ON COLUMN accounts.tech_score IS 'DEPRECATED: No longer used. Will be removed in next version.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'confidence'
  ) THEN
    COMMENT ON COLUMN accounts.confidence IS 'DEPRECATED: Use ai_confidence instead. Will be removed in next version.';
  END IF;
END $$;

-- To actually remove deprecated columns (run after migration validation):
-- ALTER TABLE accounts
--   DROP COLUMN IF EXISTS x402_relevance,
--   DROP COLUMN IF EXISTS x402_tweet_count_30d,
--   DROP COLUMN IF EXISTS engagement_score,
--   DROP COLUMN IF EXISTS tech_score,
--   DROP COLUMN IF EXISTS confidence;

-- ============================================================================
-- STEP 7: Add updated_at trigger for search_configurations
-- ============================================================================
DROP TRIGGER IF EXISTS search_configurations_updated_at ON search_configurations;
CREATE TRIGGER search_configurations_updated_at
  BEFORE UPDATE ON search_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Uncomment to verify migration:

-- Check tables exist:
-- \dt search_configurations
-- \dt account_configurations

-- Check indexes:
-- \di account_configurations_*
-- \di search_configurations_*

-- Verify column rename:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'tweets' AND column_name LIKE '%keywords%';

-- Check deprecated columns:
-- SELECT column_name, col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position)
-- FROM information_schema.columns
-- WHERE table_name = 'accounts' AND column_name IN ('x402_relevance', 'x402_tweet_count_30d', 'engagement_score', 'tech_score', 'confidence');
