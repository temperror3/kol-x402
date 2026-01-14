import { Queue, Worker, Job, QueueOptions } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runFullDiscovery } from '../collectors/searchCollector.js';
import { searchUserX402Tweets } from '../collectors/rapidApiClient.js';
import { categorizeUserWithAI } from '../services/openRouterClient.js';
import { AccountModel } from '../db/account.model.js';

// Job types
export interface SearchJobData {
  keywords?: string[];
  maxPages?: number;
}

export interface AnalyzeJobData {
  accountId: string;
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

// Queue names
const SEARCH_QUEUE = 'x402-search';
const ANALYZE_QUEUE = 'x402-analyze';

// Queues
let searchQueue: Queue | null = null;
let analyzeQueue: Queue | null = null;

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

// Workers
export function startSearchWorker(): Worker {
  const worker = new Worker(
    SEARCH_QUEUE,
    async (job: Job<SearchJobData>) => {
      logger.info(`Processing search job ${job.id}`);

      const keywords = job.data.keywords || [
        ...config.searchKeywords.primary,
        ...config.searchKeywords.secondary,
      ];
      const maxPages = job.data.maxPages || config.search.maxPages;

      // Run full discovery pipeline (search, save users, save tweets)
      const result = await runFullDiscovery(keywords, maxPages);

      // Queue analysis jobs for uncategorized accounts only
      const analyzeQ = getAnalyzeQueue();
      const uncategorized = await AccountModel.getUncategorizedAccounts(1000);

      for (const account of uncategorized) {
        if (account.id) {
          await analyzeQ.add(
            'analyze',
            { accountId: account.id },
            { delay: 100 }
          );
        }
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
    { connection: connectionOptions }
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

      // Get account
      const account = await AccountModel.getById(job.data.accountId);
      if (!account) {
        logger.warn(`Account ${job.data.accountId} not found`);
        return { success: false, reason: 'Account not found' };
      }

      // Skip if already categorized
      if (account.ai_category && account.ai_categorized_at) {
        logger.info(`Skipping @${account.username} - already categorized`);
        return { success: true, skipped: true };
      }

      // Search for user's x402 tweets
      const userTweets = await searchUserX402Tweets(account.username, config.search.maxPagesPerUser);

      // Categorize with AI
      const aiResult = await categorizeUserWithAI(account, userTweets);

      // Update account with AI category
      await AccountModel.updateAICategory(account.twitter_id, {
        ai_category: aiResult.category,
        ai_reasoning: aiResult.reasoning,
        ai_confidence: aiResult.confidence,
      });

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

// Start all workers
export function startAllWorkers(): {
  searchWorker: Worker;
  analyzeWorker: Worker;
} {
  return {
    searchWorker: startSearchWorker(),
    analyzeWorker: startAnalyzeWorker(),
  };
}

// Add a search job
export async function triggerSearch(keywords?: string[], maxPages?: number): Promise<string> {
  const queue = getSearchQueue();
  const job = await queue.add('search', { keywords, maxPages });
  logger.info(`Search job ${job.id} added to queue`);
  return job.id!;
}

// Cleanup
export async function closeQueues(): Promise<void> {
  if (searchQueue) await searchQueue.close();
  if (analyzeQueue) await analyzeQueue.close();
}
