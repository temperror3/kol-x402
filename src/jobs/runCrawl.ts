/**
 * Manual crawl script using RapidAPI Twitter Search + AI Categorization
 *
 * Run with: npm run crawl
 *
 * This script performs a full discovery and AI analysis cycle:
 * 1. Search for x402 content on Twitter via RapidAPI
 * 2. Discover and save users
 * 3. For each user, search their specific x402 tweets (in parallel batches)
 * 4. Send tweets to AI (OpenRouter) for categorization (in batches)
 * 5. Store AI category and reasoning in database (in bulk)
 *
 * Performance optimizations:
 * - Parallel data fetching with concurrency control
 * - Batch AI categorization (multiple users per AI request)
 * - Bulk database updates
 */

import { config, validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runFullDiscovery } from '../collectors/searchCollector.js';
import {
  fetchUserDataBatched,
  searchUserX402Tweets,
  fetchUserTimeline,
  delay,
  type UserTweetData,
} from '../collectors/rapidApiClient.js';
import {
  categorizeUserEnhanced,
  categorizeUsersBatch,
  type BatchCategorizationInput,
} from '../services/openRouterClient.js';
import { AccountModel } from '../db/account.model.js';
import type { Account } from '../types/index.js';

/**
 * Legacy sequential processing mode (for comparison/fallback)
 */
async function runSequentialCategorization(accounts: Account[]): Promise<{
  analyzedCount: number;
  skippedCount: number;
  categoryStats: Record<string, number>;
}> {
  let analyzedCount = 0;
  let skippedCount = 0;
  const categoryStats: Record<string, number> = {
    KOL: 0,
    UNCATEGORIZED: 0,
  };

  for (const account of accounts) {
    try {
      // Skip users that already have AI categorization (either category or timestamp set)
      if (account.ai_category || account.ai_categorized_at) {
        logger.info(`Skipping @${account.username} - already categorized as ${account.ai_category || 'pending'}`);
        skippedCount++;
        continue;
      }

      logger.info(`\nAnalyzing @${account.username}...`);

      const userX402Tweets = await searchUserX402Tweets(account.username, config.search.maxPagesPerUser);

      await delay(config.search.delayMs);
      const generalTimeline = await fetchUserTimeline(account.username, config.search.maxTimelineTweets);

      const aiResult = await categorizeUserEnhanced(account, userX402Tweets, generalTimeline);
      categoryStats[aiResult.category]++;

      await AccountModel.updateAICategoryEnhanced(account.twitter_id, {
        ai_category: aiResult.category,
        ai_reasoning: aiResult.reasoning,
        ai_confidence: aiResult.confidence,
        topic_consistency_score: aiResult.topicConsistencyScore,
        content_depth_score: aiResult.contentDepthScore,
        topic_focus_score: aiResult.topicFocusScore,
        red_flags: aiResult.redFlags,
        primary_topics: aiResult.primaryTopics,
      });

      analyzedCount++;

      logger.info(`  Category: ${aiResult.category} (confidence: ${aiResult.confidence.toFixed(2)})`);
      logger.info(`  Scores: topic=${aiResult.topicConsistencyScore.toFixed(2)}, depth=${aiResult.contentDepthScore.toFixed(2)}, focus=${aiResult.topicFocusScore.toFixed(2)}`);
      if (aiResult.redFlags.length > 0) {
        logger.info(`  Red flags: ${aiResult.redFlags.map((f) => `${f.type}(${f.severity})`).join(', ')}`);
      }
      logger.info(`  Reasoning: ${aiResult.reasoning.substring(0, 100)}...`);

      if (analyzedCount % 5 === 0) {
        logger.info(`\n[Progress] Analyzed ${analyzedCount}/${accounts.length} accounts`);
      }

      if (analyzedCount < accounts.length) {
        await delay(config.search.delayMs);
      }
    } catch (error) {
      logger.error(`Error analyzing @${account.username}:`, error);
    }
  }

  return { analyzedCount, skippedCount, categoryStats };
}

/**
 * Optimized batch processing mode
 */
async function runBatchCategorization(accounts: Account[]): Promise<{
  analyzedCount: number;
  skippedCount: number;
  categoryStats: Record<string, number>;
}> {
  const categoryStats: Record<string, number> = {
    KOL: 0,
    UNCATEGORIZED: 0,
  };

  // Filter out already categorized accounts (skip if EITHER category OR timestamp is set)
  const uncategorizedAccounts = accounts.filter((account) => {
    if (account.ai_category || account.ai_categorized_at) {
      logger.info(`Skipping @${account.username} - already categorized as ${account.ai_category || 'pending'}`);
      return false;
    }
    return true;
  });

  const skippedCount = accounts.length - uncategorizedAccounts.length;

  if (uncategorizedAccounts.length === 0) {
    logger.info('No uncategorized accounts to process');
    return { analyzedCount: 0, skippedCount, categoryStats };
  }

  logger.info(`\nProcessing ${uncategorizedAccounts.length} uncategorized accounts in batches...`);
  logger.info(`Batch settings:`);
  logger.info(`  - Data fetch concurrency: ${config.batch.dataFetchConcurrency}`);
  logger.info(`  - Data fetch batch size: ${config.batch.dataFetchBatchSize}`);
  logger.info(`  - AI categorization batch size: ${config.batch.aiCategorizationBatchSize}`);

  // Step 1: Fetch tweet data for all accounts in parallel batches
  logger.info('\n--- Step 1: Fetching tweet data ---');
  const usernames = uncategorizedAccounts.map((a) => a.username);

  const userDataResults = await fetchUserDataBatched(usernames, {
    batchSize: config.batch.dataFetchBatchSize,
    maxConcurrentPerBatch: config.batch.dataFetchConcurrency,
    delayBetweenBatches: config.batch.dataFetchBatchDelay,
    onBatchComplete: (batchNum, totalBatches, results) => {
      const successCount = results.filter((r) => !r.error).length;
      logger.info(`Batch ${batchNum}/${totalBatches} complete: ${successCount}/${results.length} successful`);
    },
  });

  // Create a map of username -> user data for easy lookup
  const userDataMap = new Map<string, UserTweetData>();
  for (const userData of userDataResults) {
    userDataMap.set(userData.username.toLowerCase(), userData);
  }

  // Step 2: AI categorization in batches
  logger.info('\n--- Step 2: AI Categorization ---');

  // Prepare batch inputs
  const batchInputs: BatchCategorizationInput[] = uncategorizedAccounts.map((account) => {
    const userData = userDataMap.get(account.username.toLowerCase());
    return {
      account,
      x402Tweets: userData?.x402Tweets || [],
      generalTweets: userData?.generalTweets || [],
    };
  });

  // Process in AI batches
  const categorizationResults = await categorizeUsersBatch(
    batchInputs,
    config.batch.aiCategorizationBatchSize
  );

  // Step 3: Bulk update database
  logger.info('\n--- Step 3: Saving results to database ---');

  const dbUpdates = categorizationResults.map((result) => ({
    twitter_id: result.account.twitter_id,
    ai_category: result.result.category,
    ai_reasoning: result.result.reasoning || '',
    ai_confidence: result.result.confidence || 0,
    topic_consistency_score: result.result.topicConsistencyScore || 0,
    content_depth_score: result.result.contentDepthScore || 0,
    topic_focus_score: result.result.topicFocusScore || 0,
    red_flags: result.result.redFlags || [],
    primary_topics: result.result.primaryTopics || [],
  }));

  const { success, failed } = await AccountModel.bulkUpdateAICategoryEnhanced(dbUpdates);
  logger.info(`Database updates: ${success} successful, ${failed} failed`);

  // Calculate category stats
  for (const result of categorizationResults) {
    categoryStats[result.result.category]++;
  }

  // Log individual results
  for (const result of categorizationResults) {
    const { account, result: aiResult } = result;
    logger.info(`@${account.username}: ${aiResult.category} (confidence: ${aiResult.confidence.toFixed(2)})`);
    const redFlags = aiResult.redFlags || [];
    if (redFlags.length > 0) {
      logger.info(`  Red flags: ${redFlags.map((f) => f.type).join(', ')}`);
    }
  }

  return {
    analyzedCount: categorizationResults.length,
    skippedCount,
    categoryStats,
  };
}

async function runCrawl(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('Starting x402 KOL Discovery Crawl with AI Categorization');
  logger.info('='.repeat(50));

  try {
    // Validate config
    validateConfig();
    logger.info('Configuration validated');
    logger.info(`Max pages per keyword: ${config.search.maxPages}`);
    logger.info(`Max pages per user: ${config.search.maxPagesPerUser}`);
    logger.info(`Delay between requests: ${config.search.delayMs}ms`);
    logger.info(`AI Model: ${config.openRouter.model}`);
    logger.info(`Parallel processing: ${config.batch.enableParallelProcessing ? 'ENABLED' : 'DISABLED'}`);

    // Step 1: Initial discovery - search for x402 keywords to find users
    logger.info('\n' + '-'.repeat(50));
    logger.info('Step 1: Initial Discovery - Searching for x402 content...');
    logger.info('-'.repeat(50));
    const keywords = [...config.searchKeywords.primary, ...config.searchKeywords.secondary];
    logger.info(`Keywords: ${keywords.join(', ')}`);

    const discoveryResult = await runFullDiscovery(keywords, config.search.maxPages);

    logger.info(`Discovery complete: ${discoveryResult.usersCreated} new users, ${discoveryResult.usersUpdated} updated, ${discoveryResult.tweetsSaved} tweets saved`);

    // Step 2: Get all discovered accounts for AI analysis
    logger.info('\n' + '-'.repeat(50));
    logger.info('Step 2: AI Categorization - Analyzing each user...');
    logger.info('-'.repeat(50));

    const { data: accounts } = await AccountModel.list({}, 1, 10000, 'created_at', 'desc');

    // Choose processing mode based on config
    let result: {
      analyzedCount: number;
      skippedCount: number;
      categoryStats: Record<string, number>;
    };

    const startTime = Date.now();

    if (config.batch.enableParallelProcessing) {
      logger.info('Using OPTIMIZED batch processing mode');
      result = await runBatchCategorization(accounts);
    } else {
      logger.info('Using LEGACY sequential processing mode');
      result = await runSequentialCategorization(accounts);
    }

    const elapsedTime = Date.now() - startTime;
    const elapsedMinutes = (elapsedTime / 60000).toFixed(2);

    // Summary
    logger.info('\n' + '='.repeat(50));
    logger.info('CRAWL COMPLETED!');
    logger.info('='.repeat(50));
    logger.info(`Total accounts discovered: ${discoveryResult.usersCreated + discoveryResult.usersUpdated}`);
    logger.info(`Total tweets saved: ${discoveryResult.tweetsSaved}`);
    logger.info(`Total accounts analyzed with AI: ${result.analyzedCount}`);
    logger.info(`Total accounts skipped (already categorized): ${result.skippedCount}`);
    logger.info(`Processing time: ${elapsedMinutes} minutes`);
    logger.info(`Processing rate: ${(result.analyzedCount / (elapsedTime / 60000)).toFixed(2)} accounts/minute`);
    logger.info('\nAI Category breakdown:');
    logger.info(`  - KOL: ${result.categoryStats.KOL}`);
    logger.info(`  - UNCATEGORIZED: ${result.categoryStats.UNCATEGORIZED}`);
    logger.info('='.repeat(50));

    // Show top accounts by AI category
    logger.info('\n' + '-'.repeat(50));
    logger.info('Top Accounts by AI Category');
    logger.info('-'.repeat(50));

    // Query accounts sorted by AI confidence
    const { data: allAccounts } = await AccountModel.list({}, 1, 10000, 'created_at', 'desc');

    const kolAccounts = allAccounts
      .filter((a) => a.ai_category === 'KOL')
      .sort((a, b) => (b.ai_confidence || 0) - (a.ai_confidence || 0))
      .slice(0, 5);

    if (kolAccounts.length > 0) {
      logger.info('\nTop KOLs:');
      kolAccounts.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (confidence: ${acc.ai_confidence?.toFixed(2)}, followers: ${acc.followers_count})`);
        logger.info(`     Reason: ${acc.ai_reasoning?.substring(0, 80)}...`);
      });
    }

  } catch (error) {
    logger.error('Crawl failed:', error);
    process.exit(1);
  }

  logger.info('\nCrawl script finished.');
  process.exit(0);
}

// Run the crawl
runCrawl();
