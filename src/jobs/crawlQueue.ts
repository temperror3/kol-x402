import { Queue, Worker, Job, QueueOptions } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runFullDiscovery } from '../collectors/searchCollector.js';
import { searchUserTopicTweets, fetchUserTimeline } from '../collectors/rapidApiClient.js';
import {
  categorizeUserWithAI,
  categorizeUserForSecondaryCategories,
} from '../services/openRouterClient.js';
import { AccountModel } from '../db/account.model.js';
import { ConfigurationModel } from '../db/configuration.model.js';

/** Thrown when a search is triggered while one is already running (in-memory mode). */
export class SearchInProgressError extends Error {
  constructor(public readonly jobId: string) {
    super('Search already in progress');
    this.name = 'SearchInProgressError';
  }
}

// Job types
export interface SearchJobData {
  configId: string;
  keywords?: string[];
  maxPages?: number;
  searchType?: string;
}

export interface AnalyzeJobData {
  accountId: string;
  configId: string;
}

export interface SecondaryAnalyzeJobData {
  accountId: string;
  configId: string;
}

// Marker for accounts that have been through secondary categorization (DEVELOPER / ACTIVE_USER)
const SECONDARY_PASS_MARKER = '[SECONDARY_PASS]';

function addSecondaryMarker(reasoning: string): string {
  if (reasoning.includes(SECONDARY_PASS_MARKER)) return reasoning;
  return `${reasoning} ${SECONDARY_PASS_MARKER}`;
}

// Parse Redis URL for connection options
function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

// Connection options for BullMQ
const connectionOptions: QueueOptions['connection'] = {
  ...parseRedisUrl(config.redisUrl),
  maxRetriesPerRequest: null,
};

// Queue names (topic-agnostic)
const SEARCH_QUEUE = 'search';
const ANALYZE_QUEUE = 'analyze';
const SECONDARY_ANALYZE_QUEUE = 'secondary-analyze';

// Queues
let searchQueue: Queue | null = null;
let analyzeQueue: Queue | null = null;
let secondaryAnalyzeQueue: Queue | null = null;

/** When true, Redis connection failed; use in-memory one-at-a-time search. */
let redisConnectionFailed = false;

/** In-memory search state when Redis is unavailable. Only one search runs at a time. */
interface InMemorySearchState {
  jobId: string;
  result?: { tweetsFound: number; usersCreated: number; usersUpdated: number };
  error?: string;
  finishedAt?: number;
}
let inMemoryCurrentJobId: string | null = null;
let inMemoryCurrentPromise: Promise<InMemorySearchState['result']> | null = null;
let inMemoryLastResult: InMemorySearchState | null = null;

function isRedisConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; errors?: Array<{ code?: string; errno?: number }> };
  if (e?.code === 'ECONNREFUSED') return true;
  if (Array.isArray(e?.errors) && e.errors.some((x) => x?.code === 'ECONNREFUSED' || x?.errno === -61)) return true;
  if (typeof e?.message === 'string' && e.message.includes('ECONNREFUSED')) return true;
  return false;
}

/** Whether search runs in-memory (no Redis). */
export function isMemoryMode(): boolean {
  return redisConnectionFailed;
}

/** In-memory one-at-a-time search. Returns jobId or throws SearchInProgressError. */
async function runSearchInMemory(configId: string, maxPages?: number): Promise<string> {
  if (inMemoryCurrentPromise) {
    throw new SearchInProgressError(inMemoryCurrentJobId!);
  }
  const searchConfig = await ConfigurationModel.getById(configId);
  if (!searchConfig) {
    throw new Error(`Configuration ${configId} not found`);
  }
  const jobId = `inline-${Date.now()}`;
  inMemoryCurrentJobId = jobId;
  const pages = maxPages ?? config.search.maxPages;

  const doRun = async () => {
    const result = await runFullDiscovery(searchConfig, pages);

    // Run AI categorization inline (no Redis queues available)
    const discoveryAccountIdSet = new Set(result.accountIds || []);
    const uncategorized = await AccountModel.getUncategorizedAccounts(1000);
    const toAnalyze = uncategorized.filter((a) => a.id && discoveryAccountIdSet.has(a.id));

    if (toAnalyze.length > 0) {
      logger.info(`Running AI categorization for ${toAnalyze.length} accounts (in-memory mode)...`);
    }

    for (const account of toAnalyze) {
      try {
        // Primary categorization: KOL vs UNCATEGORIZED
        const userTweets = await searchUserTopicTweets(
          account.username,
          searchConfig,
          config.search.maxPagesPerUser
        );

        const aiResult = await categorizeUserWithAI(account, userTweets, searchConfig);

        await AccountModel.updateAICategory(account.twitter_id, {
          ai_category: aiResult.category,
          ai_reasoning: aiResult.reasoning,
          ai_confidence: aiResult.confidence,
        });

        if (account.id) {
          await ConfigurationModel.addAccountConfig(account.id, searchConfig.id, {
            relevance_score: 0,
            tweet_count_30d: userTweets.length,
            keywords_found: [],
          });
        }

        logger.info(`Categorized @${account.username} as ${aiResult.category} (confidence: ${aiResult.confidence.toFixed(2)})`);

        // Secondary categorization for UNCATEGORIZED: DEVELOPER / ACTIVE_USER
        if (aiResult.category === 'UNCATEGORIZED') {
          const generalTweets = await fetchUserTimeline(account.username, config.search.maxTimelineTweets);
          const secondaryResult = await categorizeUserForSecondaryCategories(
            account,
            userTweets,
            generalTweets,
            searchConfig
          );

          const normalizedCategory = secondaryResult.category === 'KOL' ? 'UNCATEGORIZED' : secondaryResult.category;
          const markedReasoning = `${secondaryResult.reasoning} [SECONDARY_PASS]`;

          await AccountModel.updateAICategory(account.twitter_id, {
            ai_category: normalizedCategory,
            ai_reasoning: markedReasoning,
            ai_confidence: secondaryResult.confidence,
          });

          logger.info(`Secondary categorized @${account.username} as ${normalizedCategory}`);
        }
      } catch (err) {
        logger.error(`Error categorizing @${account.username}:`, err);
      }
    }

    if (toAnalyze.length > 0) {
      logger.info(`Completed AI categorization for ${toAnalyze.length} accounts`);
    }

    return {
      tweetsFound: result.tweetsSaved,
      usersCreated: result.usersCreated,
      usersUpdated: result.usersUpdated,
    };
  };

  inMemoryCurrentPromise = doRun()
    .then((result) => {
      inMemoryLastResult = {
        jobId,
        result,
        finishedAt: Date.now(),
      };
      inMemoryCurrentPromise = null;
      inMemoryCurrentJobId = null;
      logger.info(`In-memory search ${jobId} completed: ${result.tweetsFound} tweets`);
      return result;
    })
    .catch((err) => {
      inMemoryLastResult = {
        jobId,
        error: String(err?.message ?? err),
        finishedAt: Date.now(),
      };
      inMemoryCurrentPromise = null;
      inMemoryCurrentJobId = null;
      logger.error('In-memory search failed:', err);
      throw err;
    });

  return jobId;
}

export function getInMemorySearchStatus(): {
  counts: { waiting: number; active: number; completed: number; failed: number };
  recentJobs: Array<{
    id: string;
    status: string;
    data?: { configId?: string; maxPages?: number };
    result?: unknown;
    error?: string;
    createdAt?: number;
    finishedAt?: number;
  }>;
} {
  const active = inMemoryCurrentPromise ? 1 : 0;
  const recentJobs: Array<{
    id: string;
    status: string;
    data?: { configId?: string; maxPages?: number };
    result?: unknown;
    error?: string;
    createdAt?: number;
    finishedAt?: number;
  }> = [];
  if (inMemoryCurrentJobId && inMemoryCurrentPromise) {
    recentJobs.push({
      id: inMemoryCurrentJobId,
      status: 'active',
      createdAt: parseInt(inMemoryCurrentJobId.replace('inline-', ''), 10) || undefined,
    });
  }
  if (inMemoryLastResult) {
    recentJobs.push({
      id: inMemoryLastResult.jobId,
      status: inMemoryLastResult.error ? 'failed' : 'completed',
      result: inMemoryLastResult.result,
      error: inMemoryLastResult.error,
      finishedAt: inMemoryLastResult.finishedAt,
      createdAt: parseInt(inMemoryLastResult.jobId.replace('inline-', ''), 10) || undefined,
    });
  }
  return {
    counts: {
      waiting: 0,
      active,
      completed: inMemoryLastResult && !inMemoryLastResult.error ? 1 : 0,
      failed: inMemoryLastResult?.error ? 1 : 0,
    },
    recentJobs,
  };
}

export function getInMemorySearchJob(jobId: string): {
  id: string;
  state: string;
  data?: { configId?: string; maxPages?: number };
  result?: unknown;
  error?: string;
  progress?: number;
  createdAt?: number;
  processedAt?: number;
  finishedAt?: number;
} | null {
  if (inMemoryCurrentJobId === jobId && inMemoryCurrentPromise) {
    return {
      id: jobId,
      state: 'active',
      createdAt: parseInt(jobId.replace('inline-', ''), 10) || undefined,
    };
  }
  if (inMemoryLastResult?.jobId === jobId) {
    return {
      id: jobId,
      state: inMemoryLastResult.error ? 'failed' : 'completed',
      result: inMemoryLastResult.result,
      error: inMemoryLastResult.error,
      finishedAt: inMemoryLastResult.finishedAt,
      createdAt: parseInt(jobId.replace('inline-', ''), 10) || undefined,
    };
  }
  return null;
}

export function getSearchQueue(): Queue {
  if (!searchQueue) {
    searchQueue = new Queue(SEARCH_QUEUE, { connection: connectionOptions });
  }
  return searchQueue;
}

export function getAnalyzeQueue(): Queue {
  if (!analyzeQueue) {
    analyzeQueue = new Queue(ANALYZE_QUEUE, { connection: connectionOptions });
  }
  return analyzeQueue;
}

export function getSecondaryAnalyzeQueue(): Queue {
  if (!secondaryAnalyzeQueue) {
    secondaryAnalyzeQueue = new Queue(SECONDARY_ANALYZE_QUEUE, { connection: connectionOptions });
  }
  return secondaryAnalyzeQueue;
}

// Workers
export function startSearchWorker(): Worker {
  const worker = new Worker(
    SEARCH_QUEUE,
    async (job: Job<SearchJobData>) => {
      logger.info(`Processing search job ${job.id}`);

      const searchConfig = await ConfigurationModel.getById(job.data.configId);
      if (!searchConfig) {
        throw new Error(`Configuration ${job.data.configId} not found`);
      }

      const maxPages = job.data.maxPages ?? config.search.maxPages;

      const result = await runFullDiscovery(searchConfig, maxPages);

      const discoveryAccountIdSet = new Set(result.accountIds || []);

      const analyzeQ = getAnalyzeQueue();
      const uncategorized = await AccountModel.getUncategorizedAccounts(1000);
      let queued = 0;
      for (const account of uncategorized) {
        if (account.id && discoveryAccountIdSet.has(account.id)) {
          await analyzeQ.add('analyze', { accountId: account.id, configId: searchConfig.id }, { delay: 100 });
          queued++;
        }
      }
      if (queued > 0) {
        logger.info(`Queued ${queued} accounts for AI categorization (config: ${searchConfig.name})`);
      }

      logger.info(
        `Search job ${job.id} completed: ${result.tweetsSaved} tweets, ${result.usersCreated} new users, ${result.usersUpdated} updated users`
      );

      return {
        tweetsFound: result.tweetsSaved,
        usersCreated: result.usersCreated,
        usersUpdated: result.usersUpdated,
      };
    },
    { connection: connectionOptions, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    logger.info(`Search job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Search job ${job?.id} failed:`, err);
  });

  return worker;
}

export function startAnalyzeWorker(): Worker {
  const worker = new Worker(
    ANALYZE_QUEUE,
    async (job: Job<AnalyzeJobData>) => {
      logger.info(`Processing analyze job for ${job.data.accountId}`);

      const searchConfig = await ConfigurationModel.getById(job.data.configId);
      if (!searchConfig) {
        throw new Error(`Configuration ${job.data.configId} not found`);
      }

      const account = await AccountModel.getById(job.data.accountId);
      if (!account) {
        logger.warn(`Account ${job.data.accountId} not found`);
        return { success: false, reason: 'Account not found' };
      }

      if (account.ai_categorized_at) {
        logger.info(`Skipping @${account.username} - already categorized (${account.ai_category || 'unknown'})`);
        return { success: true, skipped: true };
      }

      const userTweets = await searchUserTopicTweets(
        account.username,
        searchConfig,
        config.search.maxPagesPerUser
      );

      const aiResult = await categorizeUserWithAI(account, userTweets, searchConfig);

      await AccountModel.updateAICategory(account.twitter_id, {
        ai_category: aiResult.category,
        ai_reasoning: aiResult.reasoning,
        ai_confidence: aiResult.confidence,
      });

      if (account.id) {
        await ConfigurationModel.addAccountConfig(account.id, searchConfig.id, {
          relevance_score: 0,
          tweet_count_30d: userTweets.length,
          keywords_found: [],
        });
      }

      // Queue secondary categorization (DEVELOPER / ACTIVE_USER) when result is UNCATEGORIZED
      if (aiResult.category === 'UNCATEGORIZED' && account.id) {
        const secondaryQ = getSecondaryAnalyzeQueue();
        await secondaryQ.add('secondary-analyze', {
          accountId: account.id,
          configId: searchConfig.id,
        });
        logger.info(`Queued @${account.username} for secondary categorization`);
      }

      logger.info(
        `Analyze job for @${account.username} completed: category=${aiResult.category}, confidence=${aiResult.confidence}`
      );

      return {
        success: true,
        category: aiResult.category,
        confidence: aiResult.confidence,
      };
    },
    { connection: connectionOptions, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logger.debug(`Analyze job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Analyze job ${job?.id} failed:`, err);
  });

  return worker;
}

export function startSecondaryAnalyzeWorker(): Worker {
  const worker = new Worker(
    SECONDARY_ANALYZE_QUEUE,
    async (job: Job<SecondaryAnalyzeJobData>) => {
      logger.info(`Processing secondary-analyze job for ${job.data.accountId}`);

      const searchConfig = await ConfigurationModel.getById(job.data.configId);
      if (!searchConfig) {
        throw new Error(`Configuration ${job.data.configId} not found`);
      }

      const account = await AccountModel.getById(job.data.accountId);
      if (!account) {
        logger.warn(`Account ${job.data.accountId} not found`);
        return { success: false, reason: 'Account not found' };
      }

      // Skip if already secondary-processed (DEVELOPER / ACTIVE_USER or marker in reasoning)
      if (account.ai_category === 'DEVELOPER' || account.ai_category === 'ACTIVE_USER') {
        logger.info(`Skipping @${account.username} - already secondary categorized as ${account.ai_category}`);
        return { success: true, skipped: true };
      }
      if (account.ai_reasoning?.includes(SECONDARY_PASS_MARKER)) {
        logger.info(`Skipping @${account.username} - already secondary pass`);
        return { success: true, skipped: true };
      }

      const topicTweets = await searchUserTopicTweets(
        account.username,
        searchConfig,
        config.search.maxPagesPerUser
      );
      const generalTweets = await fetchUserTimeline(
        account.username,
        config.search.maxTimelineTweets
      );

      const aiResult = await categorizeUserForSecondaryCategories(
        account,
        topicTweets,
        generalTweets,
        searchConfig
      );

      const normalizedCategory = aiResult.category === 'KOL' ? 'UNCATEGORIZED' : aiResult.category;
      const markedReasoning = addSecondaryMarker(aiResult.reasoning);

      await AccountModel.updateAICategory(account.twitter_id, {
        ai_category: normalizedCategory,
        ai_reasoning: markedReasoning,
        ai_confidence: aiResult.confidence,
      });

      logger.info(
        `Secondary-analyze for @${account.username} completed: category=${normalizedCategory}, confidence=${aiResult.confidence}`
      );

      return {
        success: true,
        category: normalizedCategory,
        confidence: aiResult.confidence,
      };
    },
    { connection: connectionOptions, concurrency: 3 }
  );

  worker.on('completed', (job) => {
    logger.debug(`Secondary-analyze job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Secondary-analyze job ${job?.id} failed:`, err);
  });

  return worker;
}

// Start all workers
export function startAllWorkers(): {
  searchWorker: Worker;
  analyzeWorker: Worker;
  secondaryAnalyzeWorker: Worker;
} {
  return {
    searchWorker: startSearchWorker(),
    analyzeWorker: startAnalyzeWorker(),
    secondaryAnalyzeWorker: startSecondaryAnalyzeWorker(),
  };
}

// Add a search job (configId required for configuration-driven discovery).
// If Redis is unavailable, runs one search at a time in-memory. Throws SearchInProgressError when already running in memory.
export async function triggerSearch(configId: string, maxPages?: number): Promise<string> {
  if (redisConnectionFailed) {
    return runSearchInMemory(configId, maxPages);
  }
  try {
    const queue = getSearchQueue();
    const job = await queue.add('search', { configId, maxPages });
    logger.info(`Search job ${job.id} added to queue (config: ${configId})`);
    return job.id!;
  } catch (err) {
    if (isRedisConnectionError(err)) {
      redisConnectionFailed = true;
      logger.warn('Redis unavailable, falling back to in-memory search (one at a time)');
      return runSearchInMemory(configId, maxPages);
    }
    throw err;
  }
}

// Cleanup
export async function closeQueues(): Promise<void> {
  if (searchQueue) await searchQueue.close();
  if (analyzeQueue) await analyzeQueue.close();
  if (secondaryAnalyzeQueue) await secondaryAnalyzeQueue.close();
}
