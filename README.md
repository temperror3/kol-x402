# x402 KOL Finder

Automated tool to discover, analyze, and categorize x402-related accounts on Twitter/X.

## Features

- **Discovery**: Search Twitter for x402-related content and discover relevant accounts
- **Scoring**: Calculate engagement, technical depth, and x402 relevance scores
- **Categorization**: Automatically classify accounts as KOL, Developer, or Active User
- **API**: REST API for querying and managing discovered accounts
- **Export**: CSV export for outreach campaigns

## Categories

| Category | Description | Use Case |
|----------|-------------|----------|
| **KOL** | High-engagement influencers with x402 content | Promotional partnerships |
| **DEVELOPER** | Technical users with code/GitHub presence | API hosting invitations |
| **ACTIVE_USER** | Users engaging with x402 content | Platform onboarding |

## Scoring Model

### Engagement Score (0-100)
```
engagementRate = (likes + retweets + replies) / followers
engagementScore = min(100, engagementRate * 1000)
```
A 5% engagement rate = score of 50

### Tech Score (0-100)
- +20 → GitHub link detected
- +10 → Each code snippet tweet (max 30 points)
- +2 → Each technical keyword occurrence

### x402 Relevance (0-100)
- +15 → Primary keyword per tweet (x402, #x402, x402 protocol, HTTP 402)
- +8 → Secondary keyword per tweet (402 payment, crypto payments API, web monetization)
- +5 → Engagement with x402 content

### Confidence Score
```
confidence = (engagement * 0.3) + (tech * 0.3) + (x402Relevance * 0.4)
```

## Category Rules

### KOL
- engagementScore >= 50
- followers >= 1000
- x402Relevance >= 30
- x402 tweets in 30 days >= 3

### DEVELOPER
- techScore >= 50
- Has GitHub link
- Uses technical terms
- Posts code snippets

### ACTIVE_USER
- x402Relevance >= 20
- Does not meet KOL or Developer thresholds

## Quick Start

### Prerequisites

- Node.js 20+
- Supabase account
- Twitter API access (Basic tier recommended - $100/mo)
- Redis (for job queue)

### 1. Clone and Install

```bash
cd kol-finding-x402
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Run the SQL schema in the SQL Editor:

```sql
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
  engagement_score REAL DEFAULT 0,
  tech_score REAL DEFAULT 0,
  x402_relevance REAL DEFAULT 0,
  confidence REAL DEFAULT 0,
  category TEXT DEFAULT 'UNCATEGORIZED' CHECK (category IN ('KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED')),
  x402_tweet_count_30d INTEGER DEFAULT 0,
  has_github BOOLEAN DEFAULT FALSE,
  uses_technical_terms BOOLEAN DEFAULT FALSE,
  posts_code_snippets BOOLEAN DEFAULT FALSE,
  last_active_at TIMESTAMPTZ,
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tweets table
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

-- Search queries
CREATE TABLE IF NOT EXISTS search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_category ON accounts(category);
CREATE INDEX IF NOT EXISTS idx_accounts_confidence ON accounts(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON tweets(account_id);
```

### 3. Get Twitter API Access

1. Go to https://developer.twitter.com
2. Create a project and app
3. Subscribe to Basic tier ($100/mo) for search API access
4. Generate Bearer Token

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Twitter
TWITTER_BEARER_TOKEN=your_bearer_token

# Redis (optional, for job queue)
REDIS_URL=redis://localhost:6379
```

### 5. Run

```bash
# Start API server
npm run dev

# OR run a one-time crawl
npm run crawl
```

## API Endpoints

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List accounts with filtering |
| GET | `/api/accounts/:id` | Get account details |
| PATCH | `/api/accounts/:id` | Update account category |
| DELETE | `/api/accounts/:id` | Delete account |

**Query Parameters for list:**
- `category`: KOL, DEVELOPER, ACTIVE_USER, UNCATEGORIZED
- `minConfidence`: 0-100
- `minEngagementScore`: 0-100
- `minTechScore`: 0-100
- `minX402Relevance`: 0-100
- `hasGithub`: true/false
- `orderBy`: confidence, engagement_score, tech_score, x402_relevance, followers_count
- `orderDir`: asc, desc
- `page`: page number
- `limit`: results per page (max 100)

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search/run` | Trigger new search |
| GET | `/api/search/status` | Get job queue status |
| GET | `/api/search/keywords` | Get search keywords |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/summary` | Category stats & top accounts |
| GET | `/api/analytics/export` | Export CSV |
| GET | `/api/analytics/outreach` | Outreach recommendations |

## Example Usage

### List top KOLs
```bash
curl "http://localhost:3000/api/accounts?category=KOL&orderBy=confidence&limit=10"
```

### Export developers to CSV
```bash
curl "http://localhost:3000/api/analytics/export?category=DEVELOPER" > developers.csv
```

### Trigger new search
```bash
curl -X POST "http://localhost:3000/api/search/run" \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["x402", "#x402"]}'
```

### Get outreach recommendations
```bash
curl "http://localhost:3000/api/analytics/outreach?limit=20"
```

## Project Structure

```
src/
├── api/
│   ├── routes/
│   │   ├── accounts.ts    # Account CRUD
│   │   ├── search.ts      # Search jobs
│   │   └── analytics.ts   # Stats & export
│   └── index.ts           # Express app
├── collectors/
│   ├── twitterClient.ts   # Twitter API wrapper
│   ├── searchCollector.ts # Search discovery
│   ├── userCollector.ts   # User data fetch
│   └── engagementCollector.ts
├── analyzers/
│   ├── engagementAnalyzer.ts
│   ├── techAnalyzer.ts
│   └── x402Analyzer.ts
├── scorers/
│   └── scoreCalculator.ts
├── categorizer/
│   └── categoryAssigner.ts
├── jobs/
│   ├── crawlQueue.ts      # BullMQ jobs
│   └── runCrawl.ts        # Manual crawl script
├── db/
│   ├── supabase.ts        # Supabase client
│   └── account.model.ts   # Data models
├── config/
│   └── index.ts
├── types/
│   └── index.ts
├── utils/
│   └── logger.ts
└── index.ts               # Entry point
```

## Configuration

### Thresholds (via environment)

```env
KOL_MIN_FOLLOWERS=1000
KOL_MIN_ENGAGEMENT_SCORE=50
KOL_MIN_X402_RELEVANCE=30
KOL_MIN_X402_TWEETS_30D=3
DEV_MIN_TECH_SCORE=50
USER_MIN_X402_RELEVANCE=20
```

### Search Keywords

Default keywords are configured in `src/config/index.ts`:

**Primary** (high weight):
- x402
- #x402
- x402 protocol
- HTTP 402

**Secondary** (medium weight):
- 402 payment
- crypto payments API
- web monetization

## Outputs

1. **Ranked KOL list** → Promotion targets
2. **Qualified developer leads** → API hosting candidates
3. **Active users** → Platform onboarding
4. **CSV exports** → Outreach automation

## License

MIT
