/**
 * Secondary categorization script for previously UNCATEGORIZED accounts
 *
 * Run with: npm run categorize-uncategorized
 *
 * This script:
 * 1. Loads accounts with ai_category = UNCATEGORIZED
 * 2. Fetches x402 tweets + general timeline per account
 * 3. Assigns DEVELOPER, ACTIVE_USER, or UNCATEGORIZED via AI
 * 4. Saves AI category and reasoning in database
 */

import { config, validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { searchUserX402Tweets, fetchUserTimeline, delay } from '../collectors/rapidApiClient.js';
import { categorizeUserForSecondaryCategories } from '../services/openRouterClient.js';
import { AccountModel } from '../db/account.model.js';

async function runSecondaryCategorization(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('Starting secondary categorization for uncategorized accounts');
  logger.info('='.repeat(50));

  try {
    validateConfig();
    logger.info('Configuration validated');
    logger.info(`Max pages per user: ${config.search.maxPagesPerUser}`);
    logger.info(`Max timeline tweets: ${config.search.maxTimelineTweets}`);
    logger.info(`Delay between requests: ${config.search.delayMs}ms`);
    logger.info(`AI Model: ${config.openRouter.model}`);

    logger.info('\n' + '-'.repeat(50));
    logger.info('Step 1: Load uncategorized accounts...');
    logger.info('-'.repeat(50));

    const { data: accounts } = await AccountModel.list(
      { aiCategory: 'UNCATEGORIZED' },
      1,
      10000,
      'created_at',
      'desc'
    );

    if (!accounts || accounts.length === 0) {
      logger.info('No uncategorized accounts found. Nothing to do.');
      process.exit(0);
    }

    let analyzedCount = 0;
    const categoryStats: Record<'DEVELOPER' | 'ACTIVE_USER' | 'UNCATEGORIZED', number> = {
      DEVELOPER: 0,
      ACTIVE_USER: 0,
      UNCATEGORIZED: 0,
    };

    for (const account of accounts) {
      try {
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

        const normalizedCategory = aiResult.category === 'KOL'
          ? 'UNCATEGORIZED'
          : aiResult.category;

        categoryStats[normalizedCategory]++;

        await AccountModel.updateAICategory(account.twitter_id, {
          ai_category: normalizedCategory,
          ai_reasoning: aiResult.reasoning,
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

    logger.info('\n' + '='.repeat(50));
    logger.info('SECONDARY CATEGORIZATION COMPLETED!');
    logger.info('='.repeat(50));
    logger.info(`Total accounts analyzed: ${analyzedCount}`);
    logger.info('\nCategory breakdown:');
    logger.info(`  - DEVELOPER: ${categoryStats.DEVELOPER}`);
    logger.info(`  - ACTIVE_USER: ${categoryStats.ACTIVE_USER}`);
    logger.info(`  - UNCATEGORIZED: ${categoryStats.UNCATEGORIZED}`);
    logger.info('='.repeat(50));

  } catch (error) {
    logger.error('Secondary categorization failed:', error);
    process.exit(1);
  }

  logger.info('\nSecondary categorization script finished.');
  process.exit(0);
}

runSecondaryCategorization();
