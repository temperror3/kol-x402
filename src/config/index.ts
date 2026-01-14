import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // Redis (only needed if workers are enabled)
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  enableWorkers: process.env.ENABLE_WORKERS === 'true',

  // RapidAPI for Twitter Search
  rapidApi: {
    key: process.env.RAPIDAPI_KEY || '',
    host: process.env.RAPIDAPI_HOST || 'twitter-api45.p.rapidapi.com',
  },

  // Search keywords (comma-separated in env)
  searchKeywords: {
    primary: (process.env.SEARCH_KEYWORDS_PRIMARY || 'x402,#x402,x402 protocol,HTTP 402')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0),
    // secondary: (process.env.SEARCH_KEYWORDS_SECONDARY || '402 payment,crypto payments API,web monetization')
    //   .split(',')
    //   .map((k) => k.trim())
    //   .filter((k) => k.length > 0),
    secondary: [],
  },

  // Search settings
  search: {
    maxPages: parseInt(process.env.SEARCH_MAX_PAGES || '5', 10),
    maxPagesPerUser: parseInt(process.env.SEARCH_MAX_PAGES_PER_USER || '3', 10),
    delayMs: parseInt(process.env.SEARCH_DELAY_MS || '2000', 10),
    searchType: process.env.SEARCH_TYPE || 'Top',
  },

  // OpenRouter AI
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free',
  },

  // Categorization thresholds
  thresholds: {
    kol: {
      minFollowers: parseInt(process.env.KOL_MIN_FOLLOWERS || '1000', 10),
      minEngagementScore: parseInt(process.env.KOL_MIN_ENGAGEMENT_SCORE || '50', 10),
      minX402Relevance: parseInt(process.env.KOL_MIN_X402_RELEVANCE || '30', 10),
      minX402Tweets30d: parseInt(process.env.KOL_MIN_X402_TWEETS_30D || '3', 10),
    },
    developer: {
      minTechScore: parseInt(process.env.DEV_MIN_TECH_SCORE || '50', 10),
    },
    activeUser: {
      minX402Relevance: parseInt(process.env.USER_MIN_X402_RELEVANCE || '20', 10),
    },
  },
};

// Validate required config
export function validateConfig(): void {
  const required = [
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabase.serviceRoleKey],
    ['RAPIDAPI_KEY', config.rapidApi.key],
    ['OPENROUTER_API_KEY', config.openRouter.apiKey],
  ];

  const missing = required.filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
