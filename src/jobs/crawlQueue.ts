import { Queue, Worker, Job, QueueOptions } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { searchForX402Content, processDiscoveredUsers } from '../collectors/searchCollector.js';
import { fetchUserTweets } from '../collectors/userCollector.js';
import { calculateAllScores } from '../scorers/scoreCalculator.js';
import { assignCategory } from '../categorizer/categoryAssigner.js';
import { AccountModel } from '../db/account.model.js';

// Job types
export interface SearchJobData {
  keywords?: string[];
  maxResults?: number;
}

export interface EnrichJobData {
  twitterId: string;
  accountId: string;
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
const ENRICH_QUEUE = 'x402-enrich';
const ANALYZE_QUEUE = 'x402-analyze';

// Queues
let searchQueue: Queue | null = null;
let enrichQueue: Queue | null = null;
let analyzeQueue: Queue | null = null;

export function getSearchQueue(): Queue {
  if (!searchQueue) {
    searchQueue = new Queue(SEARCH_QUEUE, { connection: connectionOptions });
  }
  return searchQueue;
}

export function getEnrichQueue(): Queue {
  if (!enrichQueue) {
    enrichQueue = new Queue(ENRICH_QUEUE, { connection: connectionOptions });
  }
  return enrichQueue;
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
      const maxResults = job.data.maxResults || config.search.maxResultsPerSearch;

      // Search for x402 content
      const searchResult = await searchForX402Content(keywords, maxResults);

      // Process discovered users
      const { created, updated } = await processDiscoveredUsers(searchResult.users);

      // Queue enrichment jobs for new accounts
      const enrichQ = getEnrichQueue();
      for (const user of searchResult.users.values()) {
        const account = await AccountModel.getByTwitterId(user.id);
        if (account && account.id) {
          await enrichQ.add(
            'enrich',
            { twitterId: user.id, accountId: account.id },
            { delay: 1000 } // Small delay to avoid rate limits
          );
        }
      }

      logger.info(
        `Search job ${job.id} completed: ${searchResult.totalFound} tweets, ${created} new users, ${updated} updated users`
      );

      return {
        tweetsFound: searchResult.totalFound,
        usersCreated: created,
        usersUpdated: updated,
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

export function startEnrichWorker(): Worker {
  const worker = new Worker(
    ENRICH_QUEUE,
    async (job: Job<EnrichJobData>) => {
      logger.info(`Processing enrich job for ${job.data.twitterId}`);

      // Fetch recent tweets for analysis
      await fetchUserTweets(job.data.twitterId, job.data.accountId, 100);

      // Queue analysis job
      const analyzeQ = getAnalyzeQueue();
      await analyzeQ.add('analyze', { accountId: job.data.accountId });

      logger.info(`Enrich job for ${job.data.twitterId} completed`);

      return { success: true };
    },
    { connection: connectionOptions, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logger.debug(`Enrich job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Enrich job ${job?.id} failed:`, err);
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

      // Calculate scores
      const scores = await calculateAllScores(account);

      // Assign category
      const category = assignCategory(account, scores);

      // Update account with scores and category
      await AccountModel.updateScores(account.twitter_id, {
        engagement_score: scores.engagementScore,
        tech_score: scores.techScore,
        x402_relevance: scores.x402Relevance,
        confidence: scores.confidence,
        category,
        x402_tweet_count_30d: scores.x402TweetCount30d,
        has_github: scores.hasGithub,
        uses_technical_terms: scores.usesTechnicalTerms,
        posts_code_snippets: scores.postsCodeSnippets,
      });

      logger.info(
        `Analyze job for @${account.username} completed: category=${category}, confidence=${scores.confidence}`
      );

      return {
        success: true,
        category,
        scores,
      };
    },
    { connection: connectionOptions, concurrency: 10 }
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
  enrichWorker: Worker;
  analyzeWorker: Worker;
} {
  return {
    searchWorker: startSearchWorker(),
    enrichWorker: startEnrichWorker(),
    analyzeWorker: startAnalyzeWorker(),
  };
}

// Add a search job
export async function triggerSearch(keywords?: string[], maxResults?: number): Promise<string> {
  const queue = getSearchQueue();
  const job = await queue.add('search', { keywords, maxResults });
  logger.info(`Search job ${job.id} added to queue`);
  return job.id!;
}

// Cleanup
export async function closeQueues(): Promise<void> {
  if (searchQueue) await searchQueue.close();
  if (enrichQueue) await enrichQueue.close();
  if (analyzeQueue) await analyzeQueue.close();
}
