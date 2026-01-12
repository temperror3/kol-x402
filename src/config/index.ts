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

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Twitter API
  twitter: {
    bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
  },

  // Search keywords
  searchKeywords: {
    primary: ['x402', '#x402', 'x402 protocol', 'HTTP 402'],
    secondary: ['402 payment', 'crypto payments API', 'web monetization'],
  },

  // Search settings
  search: {
    intervalHours: parseInt(process.env.SEARCH_INTERVAL_HOURS || '24', 10),
    maxResultsPerSearch: parseInt(process.env.MAX_RESULTS_PER_SEARCH || '100', 10),
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
    ['TWITTER_BEARER_TOKEN', config.twitter.bearerToken],
  ];

  const missing = required.filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
