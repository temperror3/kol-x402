# x402 KOL Finder

A tool to discover, analyze, and categorize x402-related accounts on Twitter/X for outreach and engagement campaigns.

## Features

- **Discovery**: Search Twitter for x402-related content using RapidAPI
- **Scoring**: Calculate engagement, technical depth, and x402 relevance scores
- **Rule-Based Categorization**: Automatically classify accounts as KOL, Developer, or Active User based on configurable thresholds
- **Dashboard**: Modern React frontend to browse and analyze accounts
- **REST API**: Full API for querying and managing discovered accounts
- **Export**: CSV export for outreach campaigns

## Tech Stack

### Backend
- **Node.js** + **Express.js** - REST API server
- **TypeScript** - Type safety
- **Supabase** - PostgreSQL database
- **RapidAPI** - Twitter/X data access
- **BullMQ** + **Redis** - Job queue (optional)

### Frontend
- **React 19** + **Vite** - Modern frontend
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **React Router** - Navigation

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
- Supabase account (free tier works)
- RapidAPI account with Twitter API subscription

### 1. Clone and Install

```bash
git clone https://github.com/your-repo/kol-finding-x402.git
cd kol-finding-x402
npm install
cd frontend && npm install && cd ..
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
  ai_category TEXT DEFAULT 'UNCATEGORIZED' CHECK (ai_category IN ('KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED')),
  ai_confidence REAL DEFAULT 0,
  ai_reasoning TEXT,
  ai_categorized_at TIMESTAMPTZ,
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
  bookmarks INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_accounts_category ON accounts(ai_category);
CREATE INDEX IF NOT EXISTS idx_accounts_confidence ON accounts(ai_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON tweets(account_id);
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at DESC);
```

### 3. Get RapidAPI Access

1. Go to https://rapidapi.com
2. Subscribe to [Twitter API](https://rapidapi.com/omarmhaimdat/api/twitter-api45)
3. Copy your API key

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Server
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# RapidAPI Twitter
RAPIDAPI_KEY=your_rapidapi_key
RAPIDAPI_HOST=twitter-api45.p.rapidapi.com

# Search Keywords
SEARCH_KEYWORDS_PRIMARY=x402

# Redis (optional)
REDIS_URL=redis://localhost:6379
ENABLE_WORKERS=false
```

### 5. Run Locally

```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start frontend
cd frontend && npm run dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173

## Deployment (Vercel)

Both backend and frontend can be deployed to Vercel.

### Deploy Backend

1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Import your GitHub repository
3. Configure:
   - **Root Directory:** `/` (leave empty)
   - **Framework:** `Other`
4. Add environment variables (see `.env.example`)
5. Deploy

### Deploy Frontend

1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Import the same GitHub repository
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework:** `Vite`
4. Add environment variable:
   - `VITE_API_URL` = `https://your-backend.vercel.app/api`
5. Deploy

### Update CORS

After deploying frontend, update backend's `ALLOWED_ORIGINS` environment variable with your frontend URL.

## API Endpoints

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List accounts with filtering |
| GET | `/api/accounts/:id` | Get account details with tweets |
| PATCH | `/api/accounts/:id` | Update account category |
| DELETE | `/api/accounts/:id` | Delete account |

**Query Parameters:**
- `category`: KOL, DEVELOPER, ACTIVE_USER, UNCATEGORIZED
- `minConfidence`: 0-1 (e.g., 0.8 for 80%)
- `hasGithub`: true/false
- `orderBy`: ai_confidence, followers_count, created_at
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
| GET | `/api/analytics/confidence-distribution` | Confidence score distribution |
| GET | `/api/analytics/export` | Export CSV |
| GET | `/api/analytics/outreach` | Outreach recommendations |

## Example Usage

### List top KOLs
```bash
curl "http://localhost:3000/api/accounts?category=KOL&orderBy=ai_confidence&limit=10"
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

## Project Structure

```
kol-finding-x402/
├── api/
│   └── index.ts              # Vercel serverless entry
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── accounts.ts   # Account CRUD
│   │   │   ├── search.ts     # Search jobs
│   │   │   └── analytics.ts  # Stats & export
│   │   └── index.ts          # Express app
│   ├── collectors/
│   │   ├── rapidApiClient.ts # RapidAPI Twitter client
│   │   └── searchCollector.ts
│   ├── services/
│   │   └── openRouterClient.ts
│   ├── jobs/
│   │   ├── crawlQueue.ts     # BullMQ jobs
│   │   └── runCrawl.ts       # Manual crawl
│   ├── db/
│   │   ├── supabase.ts       # Supabase client
│   │   └── account.model.ts  # Data models
│   ├── config/
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── logger.ts
│   └── index.ts              # Local dev entry
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts     # API client
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── AccountsList.tsx
│   │   │   ├── AccountDetail.tsx
│   │   │   ├── Analytics.tsx
│   │   │   └── Outreach.tsx
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── AccountTable.tsx
│   │   │   └── ...
│   │   └── types/
│   │       └── index.ts
│   ├── vercel.json
│   └── package.json
├── vercel.json               # Backend Vercel config
├── package.json
└── tsconfig.json
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

Configure in `.env`:

```env
SEARCH_KEYWORDS_PRIMARY=x402,#x402,x402 protocol
SEARCH_KEYWORDS_SECONDARY=402 payment,crypto payments API
```

## Outputs

1. **Ranked KOL list** → Promotion targets
2. **Qualified developer leads** → API hosting candidates
3. **Active users** → Platform onboarding
4. **CSV exports** → Outreach automation

## License

MIT
