# x402 KOL Finder

A tool to discover, analyze, and categorize x402-related accounts on Twitter/X using AI for outreach and engagement campaigns.

## Features

- **Discovery**: Search Twitter for x402-related content using RapidAPI
- **AI-Powered Categorization**: Uses OpenRouter AI to analyze tweets and classify accounts
- **Smart Analysis**: AI considers engagement metrics, content quality, and technical depth
- **Dashboard**: Modern React frontend to browse and analyze accounts
- **REST API**: Full API for querying and managing discovered accounts
- **Export**: CSV export for outreach campaigns

## Tech Stack

### Backend
- **Node.js** + **Express.js** - REST API server
- **TypeScript** - Type safety
- **Supabase** - PostgreSQL database
- **RapidAPI** - Twitter/X data access
- **OpenRouter AI** - AI-powered categorization
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

## How AI Categorization Works

The system uses OpenRouter AI to analyze each user's x402-related tweets and engagement metrics.

### What AI Analyzes

1. **User Profile**: Username, bio, follower count
2. **Tweet Content**: All x402-related tweets
3. **Engagement Metrics**:
   - Views, Likes, Retweets
   - Replies, Quotes, Bookmarks
   - Engagement rate (engagements / views)

### AI Categorization Criteria

**KOL (Key Opinion Leader)**
- Significant influence (1000+ followers)
- Creates original content about x402
- High engagement: many views, likes, retweets
- Content gets bookmarked (valuable insights)

**DEVELOPER**
- Discusses technical implementation
- Shares code snippets or GitHub links
- Asks/answers technical questions
- Shows evidence of building with x402

**ACTIVE_USER**
- Engages with x402 content (replies, retweets)
- Shows interest but not technical depth
- Lower follower count and engagement
- Potential adopter or tester

**UNCATEGORIZED**
- Only 1-2 mentions with no clear pattern
- Very low engagement on x402 content
- Insufficient data to determine category

### AI Output

For each user, the AI returns:
- **Category**: KOL, DEVELOPER, ACTIVE_USER, or UNCATEGORIZED
- **Confidence**: 0-100% confidence score
- **Reasoning**: Explanation of why this category was chosen

## Quick Start

### Prerequisites

- Node.js 20+
- Supabase account (free tier works)
- RapidAPI account with Twitter API subscription
- OpenRouter API key (free tier available)

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

### 3. Get API Keys

**RapidAPI (Twitter Data)**
1. Go to https://rapidapi.com
2. Subscribe to [Twitter API](https://rapidapi.com/omarmhaimdat/api/twitter-api45)
3. Copy your API key

**OpenRouter (AI Categorization)**
1. Go to https://openrouter.ai
2. Create an account and get your API key
3. Free tier includes access to `xiaomi/mimo-v2-flash:free` model

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

# OpenRouter AI
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=xiaomi/mimo-v2-flash:free

# Search Keywords
SEARCH_KEYWORDS_PRIMARY=x402

# CORS (for production)
ALLOWED_ORIGINS=http://localhost:5173

# Redis (optional). See "Redis and /api/search/run" below.
REDIS_URL=redis://localhost:6379
ENABLE_WORKERS=false
```

### Redis and `POST /api/search/run`

**Why Redis is used**

The app uses **BullMQ**, which needs **Redis**, to run background jobs:

1. **Search jobs** – `POST /api/search/run` adds a “discovery” job to the queue (Twitter search + save users/tweets).
2. **Analyze jobs** – After a search, uncategorized accounts are analyzed by AI; each analysis is a job in a second queue.

So **yes, `/api/search/run` uses Redis** when Redis is available: it enqueues a search job. Workers (started when `ENABLE_WORKERS=true`) then process that queue. If Redis is not running, you get `ECONNREFUSED 127.0.0.1:6379`.

**Ways to avoid the error**

**Option A – Run Redis (recommended if you use workers)**  
Then `POST /api/search/run` will enqueue jobs and workers can process them.

On macOS with Homebrew:

```bash
# Install Redis
brew install redis

# Run in foreground (for a quick test; stop with Ctrl+C)
redis-server

# Or run as a background service (stays running)
brew services start redis
```

Check that it’s up:

```bash
redis-cli ping   # should print PONG
```

Use the default URL in `.env`: `REDIS_URL=redis://localhost:6379`. No need to change it if Redis is on localhost:6379.

**Option B – No Redis (in-memory fallback)**  
If Redis is not installed or not running, the first time you call `POST /api/search/run` the app will try Redis, see the connection error, **switch to in-memory mode**, and run the search in-process. In that mode:

- Only **one** search runs at a time.
- There are no workers and no separate “analyze” jobs; only the discovery step runs.
- The handler still returns a `jobId` and you can poll `GET /api/search/status` and `GET /api/search/job/:jobId`.

So you can develop and use `/api/search/run` without Redis; for production or many concurrent jobs, running Redis is better.

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
4. Add environment variables:
   - `NODE_ENV` = `production`
   - `SUPABASE_URL` = your Supabase URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key
   - `RAPIDAPI_KEY` = your RapidAPI key
   - `RAPIDAPI_HOST` = `twitter-api45.p.rapidapi.com`
   - `OPENROUTER_API_KEY` = your OpenRouter API key
   - `OPENROUTER_MODEL` = `xiaomi/mimo-v2-flash:free`
   - `ALLOWED_ORIGINS` = `*` (update after frontend deploy)
   - `ENABLE_WORKERS` = `false`
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

After deploying frontend, update backend's `ALLOWED_ORIGINS` environment variable:
```
https://your-frontend.vercel.app
```

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
| POST | `/api/search/run` | Trigger new search & AI categorization |
| GET | `/api/search/status` | Get job queue status |
| GET | `/api/search/keywords` | Get search keywords |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/summary` | Category stats & top accounts |
| GET | `/api/analytics/confidence-distribution` | AI confidence distribution |
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

### Trigger new search (discovers users & runs AI categorization)
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
│   │   └── openRouterClient.ts # AI categorization
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

### Search Keywords

Configure in `.env`:

```env
SEARCH_KEYWORDS_PRIMARY=x402,#x402,x402 protocol
SEARCH_KEYWORDS_SECONDARY=402 payment,crypto payments API
```

### AI Model

You can change the AI model in `.env`:
```env
OPENROUTER_MODEL=xiaomi/mimo-v2-flash:free
```

Other free models available on OpenRouter:
- `mistralai/mistral-7b-instruct:free`
- `google/gemma-2-9b-it:free`

## Outputs

1. **AI-Categorized KOL list** → Promotion targets with confidence scores
2. **Qualified developer leads** → API hosting candidates
3. **Active users** → Platform onboarding
4. **CSV exports** → Outreach automation with AI reasoning

## License

MIT
