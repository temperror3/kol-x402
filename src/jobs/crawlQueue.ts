import { Queue, Worker, Job, QueueOptions } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runFullDiscovery } from '../collectors/searchCollector.js';
import { searchUserX402Tweets, searchUserTopicTweets } from '../collectors/rapidApiClient.js';
import { categorizeUserWithAI } from '../services/openRouterClient.js';
import { AccountModel } from '../db/account.model.js';
import { CampaignModel, CampaignAccountModel } from '../db/campaign.model.js';
import type { CampaignSearchJobData, CampaignAnalyzeJobData } from '../types/index.js';

// Job types
export interface SearchJobData {
  keywords?: string[];
  maxPages?: number;
  // Campaign support
  campaignId?: string;
  searchTerms?: string[];
  topicDescription?: string;
}

export interface AnalyzeJobData {
  accountId: string;
  // Campaign support
  campaignId?: string;
  searchTerms?: string[];
  topicDescription?: string;
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

      const { campaignId, searchTerms, topicDescription } = job.data;
      const keywords = searchTerms || job.data.keywords || [
        ...config.searchKeywords.primary,
        ...config.searchKeywords.secondary,
      ];
      const maxPages = job.data.maxPages || config.search.maxPages;

      // Get campaign if provided
      let campaign = undefined;
      if (campaignId) {
        campaign = await CampaignModel.getById(campaignId);
        if (!campaign) {
          logger.error(`Campaign ${campaignId} not found`);
          throw new Error(`Campaign ${campaignId} not found`);
        }
        logger.info(`Running discovery for campaign: ${campaign.name}`);
      }

      // Run full discovery pipeline (search, save users, save tweets)
      const result = await runFullDiscovery(keywords, maxPages, campaign);

      // Queue analysis jobs (for campaign: only accounts discovered in this run)
      const analyzeQ = getAnalyzeQueue();

      if (campaign) {
        // For campaign: link only discovered accounts to campaign and queue analysis for them
        const discoveredIds = result.discoveredAccountIds ?? [];
        logger.info(`Linking ${discoveredIds.length} discovered accounts to campaign and queueing analysis`);

        for (const accountId of discoveredIds) {
          await CampaignAccountModel.linkAccountToCampaign(campaign.id, accountId, []);

          await analyzeQ.add(
            'analyze',
            {
              accountId,
              campaignId: campaign.id,
              searchTerms: campaign.search_terms,
              topicDescription: campaign.topic_description,
            },
            { delay: 100 }
          );
        }
      } else {
        // Legacy behavior: queue analysis for uncategorized accounts
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
      }

      logger.info(
        `Search job ${job.id} completed: ${result.tweetsSaved} tweets, ${result.usersCreated} new users, ${result.usersUpdated} updated users` +
          (campaign ? `; ${(result.discoveredAccountIds ?? []).length} analyze jobs queued` : '')
      );

      return {
        tweetsFound: result.tweetsSaved,
        usersCreated: result.usersCreated,
        usersUpdated: result.usersUpdated,
        campaignId,
        analyzeJobsQueued: campaign ? (result.discoveredAccountIds ?? []).length : undefined,
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
      const { accountId, campaignId, searchTerms, topicDescription } = job.data;
      logger.info(`Processing analyze job for ${accountId}${campaignId ? ` (campaign: ${campaignId})` : ''}`);

      // Get account
      const account = await AccountModel.getById(accountId);
      if (!account) {
        logger.warn(`Account ${accountId} not found`);
        return { success: false, reason: 'Account not found' };
      }

      // Get campaign if provided
      let campaign = undefined;
      if (campaignId) {
        campaign = await CampaignModel.getById(campaignId);
        if (!campaign) {
          logger.warn(`Campaign ${campaignId} not found`);
          return { success: false, reason: 'Campaign not found' };
        }
      }

      // For campaign-based analysis, check campaign_accounts table
      if (campaign) {
        const campaignAccount = await CampaignAccountModel.getByCampaignAndAccount(campaign.id, accountId);
        if (campaignAccount?.ai_category && campaignAccount?.ai_categorized_at) {
          logger.info(`Skipping @${account.username} - already categorized for campaign ${campaign.name}`);
          return { success: true, skipped: true };
        }
      } else {
        // Legacy: check account's own categorization
        if (account.ai_category && account.ai_categorized_at) {
          logger.info(`Skipping @${account.username} - already categorized`);
          return { success: true, skipped: true };
        }
      }

      // Search for user's topic tweets
      const userTweets = campaign
        ? await searchUserTopicTweets(account.username, campaign.search_terms, config.search.maxPagesPerUser)
        : await searchUserX402Tweets(account.username, config.search.maxPagesPerUser);

      // Categorize with AI (with campaign context if available)
      const aiResult = await categorizeUserWithAI(account, userTweets, campaign);

      if (campaign) {
        // Update campaign_accounts table
        await CampaignAccountModel.updateAICategoryEnhanced(campaign.id, accountId, {
          ai_category: aiResult.category,
          ai_reasoning: aiResult.reasoning,
          ai_confidence: aiResult.confidence,
          topic_consistency_score: 0,
          content_depth_score: 0,
          topic_focus_score: 0,
          red_flags: [],
          primary_topics: [],
          keywords_found: [],
        });
      } else {
        // Update account with AI category (legacy)
        await AccountModel.updateAICategory(account.twitter_id, {
          ai_category: aiResult.category,
          ai_reasoning: aiResult.reasoning,
          ai_confidence: aiResult.confidence,
        });
      }

      logger.info(
        `Analyze job for @${account.username} completed: category=${aiResult.category}, confidence=${aiResult.confidence}`
      );

      return {
        success: true,
        category: aiResult.category,
        confidence: aiResult.confidence,
        campaignId,
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

// Add a campaign search job
export async function triggerCampaignSearch(
  campaignId: string,
  searchTerms: string[],
  topicDescription: string,
  maxPages?: number
): Promise<string> {
  const queue = getSearchQueue();
  const job = await queue.add('campaign-search', {
    campaignId,
    searchTerms,
    topicDescription,
    maxPages,
  });
  logger.info(`Campaign search job ${job.id} added to queue for campaign ${campaignId}`);
  return job.id!;
}

// Cleanup
export async function closeQueues(): Promise<void> {
  if (searchQueue) await searchQueue.close();
  if (analyzeQueue) await analyzeQueue.close();
}
