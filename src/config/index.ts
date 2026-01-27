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
    aiRetryCount: parseInt(process.env.BATCH_AI_RETRY_COUNT || '3', 10),
    // Delay between retries (ms)
    aiRetryDelay: parseInt(process.env.BATCH_AI_RETRY_DELAY || '2000', 10),
  },

  // OpenRouter AI
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free',
  },

  // Mistral AI (uses standard OpenAI-compatible chat completions)
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY || '',
    model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
    endpoint: process.env.MISTRAL_ENDPOINT || 'https://api.mistral.ai/v1/chat/completions',
  },

  // Cerebras AI (uses standard OpenAI-compatible format)
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY || '',
    models: (process.env.CEREBRAS_MODELS || 'llama-3.3-70b,llama3.1-70b,llama3.1-8b')
      .split(',')
      .map((m) => m.trim()),
    endpoint: process.env.CEREBRAS_ENDPOINT || 'https://api.cerebras.ai/v1/chat/completions',
  },

  // AI Provider settings (multi-provider support)
  aiProvider: {
    // Priority order for AI providers (comma-separated)
    priorityOrder: (process.env.AI_PROVIDER_PRIORITY || 'mistral,cerebras,openrouter')
      .split(',')
      .map((p) => p.trim()),
    // High traffic threshold in ms (switch provider after errors for this duration)
    highTrafficThresholdMs: parseInt(process.env.AI_HIGH_TRAFFIC_THRESHOLD_MS || '120000', 10),
    // Cooldown period before retrying a rate-limited provider (ms)
    cooldownMs: parseInt(process.env.AI_COOLDOWN_MS || '300000', 10),
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
  ];

  const missing = required.filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // At least one AI provider must be configured
  const hasOpenRouter = !!config.openRouter.apiKey;
  const hasMistral = !!config.mistral.apiKey;
  const hasCerebras = !!config.cerebras.apiKey;

  if (!hasOpenRouter && !hasMistral && !hasCerebras) {
    throw new Error(
      'At least one AI provider API key must be configured: OPENROUTER_API_KEY, MISTRAL_API_KEY, or CEREBRAS_API_KEY'
    );
  }
}
