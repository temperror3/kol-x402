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

  // Fallback keywords when no search_configurations exist (e.g. legacy env)
  // Prefer creating configurations via API/dashboard for topic-driven discovery.
  defaultConfigId: process.env.DEFAULT_CONFIG_ID || null,
  searchKeywords: {
    primary: (process.env.SEARCH_KEYWORDS_PRIMARY || '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0),
    secondary: (process.env.SEARCH_KEYWORDS_SECONDARY || '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0),
  },

  // Search settings
  search: {
    maxPages: parseInt(process.env.SEARCH_MAX_PAGES || '1', 10),
    maxPagesPerUser: parseInt(process.env.SEARCH_MAX_PAGES_PER_USER || '2', 10),
    delayMs: parseInt(process.env.SEARCH_DELAY_MS || '2000', 10),
    searchType: process.env.SEARCH_TYPE || 'Top',
    maxTimelineTweets: parseInt(process.env.MAX_TIMELINE_TWEETS || '50', 10),
  },

  // Batch processing settings for improved performance
  batch: {
    // Number of users to fetch data for in parallel
    dataFetchConcurrency: parseInt(process.env.BATCH_DATA_FETCH_CONCURRENCY || '3', 10),
    // Number of users to process in a single data fetch batch
    dataFetchBatchSize: parseInt(process.env.BATCH_DATA_FETCH_SIZE || '10', 10),
    // Delay between data fetch batches (ms)
    dataFetchBatchDelay: parseInt(process.env.BATCH_DATA_FETCH_DELAY || '5000', 10),
    // Number of users to categorize in a single AI request
    aiCategorizationBatchSize: parseInt(process.env.BATCH_AI_CATEGORIZATION_SIZE || '5', 10),
    // Number of categorization results to save in a single database batch
    dbUpdateBatchSize: parseInt(process.env.BATCH_DB_UPDATE_SIZE || '50', 10),
    // Enable parallel processing (set to false to use legacy sequential mode)
    enableParallelProcessing: process.env.BATCH_ENABLE_PARALLEL !== 'false',
    // Number of retries for failed AI batches
    aiRetryCount: parseInt(process.env.BATCH_AI_RETRY_COUNT || '5', 10),
    // Delay between retries (ms)
    aiRetryDelay: parseInt(process.env.BATCH_AI_RETRY_DELAY || '2000', 10),
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
    // Commented out - focusing on KOL only for now. May be required in future.
    // developer: {
    //   minTechScore: parseInt(process.env.DEV_MIN_TECH_SCORE || '50', 10),
    // },
    // activeUser: {
    //   minX402Relevance: parseInt(process.env.USER_MIN_X402_RELEVANCE || '20', 10),
    // },
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
