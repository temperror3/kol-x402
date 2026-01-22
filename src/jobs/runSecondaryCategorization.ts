/**
 * Secondary categorization script for previously UNCATEGORIZED accounts
 *
 * Run with: npm run categorize-uncategorized
 *
 * This script:
 * 1. Loads accounts with ai_category = UNCATEGORIZED that haven't been secondary-processed yet
 * 2. Fetches x402 tweets + general timeline per account (in parallel batches)
 * 3. Assigns DEVELOPER, ACTIVE_USER, or UNCATEGORIZED via AI (in batches)
 * 4. Saves AI category and reasoning in database (in bulk)
 *
 * Performance optimizations:
 * - Parallel data fetching with concurrency control
 * - Batch AI categorization (multiple users per AI request)
 * - Bulk database updates
 * - Uses marker in ai_reasoning to track secondary-processed accounts
 */

import { config, validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  fetchUserDataBatched,
  searchUserX402Tweets,
  fetchUserTimeline,
  delay,
  type UserTweetData,
} from '../collectors/rapidApiClient.js';
import {
  categorizeUserForSecondaryCategories,
  categorizeUsersSecondaryBatch,
  type BatchCategorizationInput,
} from '../services/openRouterClient.js';
import { AccountModel } from '../db/account.model.js';
import type { Account } from '../types/index.js';

// Marker to identify accounts that have been through secondary categorization
const SECONDARY_PASS_MARKER = '[SECONDARY_PASS]';

/**
 * Check if an account has already been through secondary categorization
 */
function hasBeenSecondaryProcessed(account: Account): boolean {
  // If category is DEVELOPER or ACTIVE_USER, it came from secondary pass
  if (account.ai_category === 'DEVELOPER' || account.ai_category === 'ACTIVE_USER') {
    return true;
  }
  // If reasoning contains our marker, it's been through secondary pass
  if (account.ai_reasoning?.includes(SECONDARY_PASS_MARKER)) {
    return true;
  }
  return false;
}

/**
 * Add the secondary pass marker to the reasoning
 */
function addSecondaryMarker(reasoning: string): string {
  if (reasoning.includes(SECONDARY_PASS_MARKER)) {
    return reasoning;
  }
  return `${reasoning} ${SECONDARY_PASS_MARKER}`;
}

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
    DEVELOPER: 0,
    ACTIVE_USER: 0,
    UNCATEGORIZED: 0,
  };

  for (const account of accounts) {
    try {
      // Skip users that have already been through secondary categorization
      if (hasBeenSecondaryProcessed(account)) {
        logger.info(`Skipping @${account.username} - already secondary categorized`);
        skippedCount++;
        continue;
      }

      logger.info(`\nAnalyzing @${account.username}...`);

      const userX402Tweets = await searchUserX402Tweets(
        account.username,
        config.search.maxPagesPerUser
      );

      await delay(config.search.delayMs);
      const generalTimeline = await fetchUserTimeline(
        account.username,
        config.search.maxTimelineTweets
      );

      const aiResult = await categorizeUserForSecondaryCategories(
        account,
        userX402Tweets,
        generalTimeline
      );

      // Normalize category - don't allow KOL in secondary categorization
      const normalizedCategory = aiResult.category === 'KOL'
        ? 'UNCATEGORIZED'
        : aiResult.category;

      categoryStats[normalizedCategory]++;

      // Add marker to reasoning to track secondary pass
      const markedReasoning = addSecondaryMarker(aiResult.reasoning);

      await AccountModel.updateAICategory(account.twitter_id, {
        ai_category: normalizedCategory,
        ai_reasoning: markedReasoning,
        ai_confidence: aiResult.confidence,
      });

      analyzedCount++;

      logger.info(
        `  Category: ${normalizedCategory} (confidence: ${aiResult.confidence.toFixed(2)})`
      );
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
    DEVELOPER: 0,
    ACTIVE_USER: 0,
    UNCATEGORIZED: 0,
  };

  // Filter out already secondary-categorized accounts
  const uncategorizedAccounts = accounts.filter((account) => {
    if (hasBeenSecondaryProcessed(account)) {
      logger.info(`Skipping @${account.username} - already secondary categorized`);
      return false;
    }
    return true;
  });

  const skippedCount = accounts.length - uncategorizedAccounts.length;

  if (uncategorizedAccounts.length === 0) {
    logger.info('No accounts needing secondary categorization');
    return { analyzedCount: 0, skippedCount, categoryStats };
  }

  logger.info(`\nProcessing ${uncategorizedAccounts.length} accounts in batches...`);
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
  logger.info('\n--- Step 2: AI Secondary Categorization ---');

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
  const categorizationResults = await categorizeUsersSecondaryBatch(
    batchInputs,
    config.batch.aiCategorizationBatchSize
  );

  // Step 3: Bulk update database
  logger.info('\n--- Step 3: Saving results to database ---');

  const dbUpdates = categorizationResults.map((result) => {
    // Normalize category - don't allow KOL in secondary categorization
    const normalizedCategory = result.result.category === 'KOL'
      ? 'UNCATEGORIZED'
      : result.result.category;

    // Add marker to reasoning to track secondary pass
    const markedReasoning = addSecondaryMarker(result.result.reasoning || '');

    return {
      twitter_id: result.account.twitter_id,
      ai_category: normalizedCategory,
      ai_reasoning: markedReasoning,
      ai_confidence: result.result.confidence || 0,
    };
  });

  const { success, failed } = await AccountModel.bulkUpdateAICategorization(dbUpdates);
  logger.info(`Database updates: ${success} successful, ${failed} failed`);

  // Calculate category stats
  for (const result of categorizationResults) {
    const normalizedCategory = result.result.category === 'KOL'
      ? 'UNCATEGORIZED'
      : result.result.category;
    categoryStats[normalizedCategory]++;
  }

  // Log individual results
  for (const result of categorizationResults) {
    const { account, result: aiResult } = result;
    const normalizedCategory = aiResult.category === 'KOL'
      ? 'UNCATEGORIZED'
      : aiResult.category;
    logger.info(`@${account.username}: ${normalizedCategory} (confidence: ${aiResult.confidence.toFixed(2)})`);
  }

  return {
    analyzedCount: categorizationResults.length,
    skippedCount,
    categoryStats,
  };
}

async function runSecondaryCategorization(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('Starting secondary categorization for UNCATEGORIZED accounts');
  logger.info('='.repeat(50));

  try {
    validateConfig();
    logger.info('Configuration validated');
    logger.info(`Max pages per user: ${config.search.maxPagesPerUser}`);
    logger.info(`Max timeline tweets: ${config.search.maxTimelineTweets}`);
    logger.info(`Delay between requests: ${config.search.delayMs}ms`);
    logger.info(`AI Model: ${config.openRouter.model}`);
    logger.info(`Parallel processing: ${config.batch.enableParallelProcessing ? 'ENABLED' : 'DISABLED'}`);

    logger.info('\n' + '-'.repeat(50));
    logger.info('Step 1: Load UNCATEGORIZED accounts...');
    logger.info('-'.repeat(50));

    // Get all UNCATEGORIZED accounts
    const { data: accounts } = await AccountModel.list(
      { aiCategory: 'UNCATEGORIZED' },
      1,
      10000,
      'created_at',
      'desc'
    );

    if (!accounts || accounts.length === 0) {
      logger.info('No UNCATEGORIZED accounts found. Nothing to do.');
      process.exit(0);
    }

    // Filter to only accounts that haven't been through secondary pass
    const needsProcessing = accounts.filter(a => !hasBeenSecondaryProcessed(a));
    const alreadyProcessed = accounts.length - needsProcessing.length;

    logger.info(`Found ${accounts.length} UNCATEGORIZED accounts`);
    logger.info(`  - ${alreadyProcessed} already secondary-processed (will be skipped)`);
    logger.info(`  - ${needsProcessing.length} need secondary categorization`);

    if (needsProcessing.length === 0) {
      logger.info('All UNCATEGORIZED accounts have been secondary-categorized. Nothing to do.');
      process.exit(0);
    }

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

    logger.info('\n' + '='.repeat(50));
    logger.info('SECONDARY CATEGORIZATION COMPLETED!');
    logger.info('='.repeat(50));
    logger.info(`Total accounts analyzed: ${result.analyzedCount}`);
    logger.info(`Total accounts skipped (already processed): ${result.skippedCount}`);
    logger.info(`Processing time: ${elapsedMinutes} minutes`);
    if (result.analyzedCount > 0) {
      logger.info(`Processing rate: ${(result.analyzedCount / (elapsedTime / 60000)).toFixed(2)} accounts/minute`);
    }
    logger.info('\nCategory breakdown:');
    logger.info(`  - DEVELOPER: ${result.categoryStats.DEVELOPER}`);
    logger.info(`  - ACTIVE_USER: ${result.categoryStats.ACTIVE_USER}`);
    logger.info(`  - UNCATEGORIZED: ${result.categoryStats.UNCATEGORIZED}`);
    logger.info('='.repeat(50));

    // Show top accounts by category
    logger.info('\n' + '-'.repeat(50));
    logger.info('Top Accounts by Category');
    logger.info('-'.repeat(50));

    // Query accounts sorted by AI confidence
    const { data: allAccounts } = await AccountModel.list({}, 1, 10000, 'ai_confidence', 'desc');

    const developerAccounts = allAccounts
      .filter((a) => a.ai_category === 'DEVELOPER')
      .sort((a, b) => (b.ai_confidence || 0) - (a.ai_confidence || 0))
      .slice(0, 5);

    const activeUserAccounts = allAccounts
      .filter((a) => a.ai_category === 'ACTIVE_USER')
      .sort((a, b) => (b.ai_confidence || 0) - (a.ai_confidence || 0))
      .slice(0, 5);

    if (developerAccounts.length > 0) {
      logger.info('\nTop Developers:');
      developerAccounts.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (confidence: ${acc.ai_confidence?.toFixed(2)}, followers: ${acc.followers_count})`);
        logger.info(`     Reason: ${acc.ai_reasoning?.replace(SECONDARY_PASS_MARKER, '').trim().substring(0, 80)}...`);
      });
    }

    if (activeUserAccounts.length > 0) {
      logger.info('\nTop Active Users:');
      activeUserAccounts.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (confidence: ${acc.ai_confidence?.toFixed(2)}, followers: ${acc.followers_count})`);
        logger.info(`     Reason: ${acc.ai_reasoning?.replace(SECONDARY_PASS_MARKER, '').trim().substring(0, 80)}...`);
      });
    }

  } catch (error) {
    logger.error('Secondary categorization failed:', error);
    process.exit(1);
  }

  logger.info('\nSecondary categorization script finished.');
  process.exit(0);
}

runSecondaryCategorization();
