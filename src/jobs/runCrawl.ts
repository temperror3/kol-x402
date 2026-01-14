/**
 * Manual crawl script using RapidAPI Twitter Search + AI Categorization
 *
 * Run with: npm run crawl
 *
 * This script performs a full discovery and AI analysis cycle:
 * 1. Search for x402 content on Twitter via RapidAPI
 * 2. Discover and save users
 * 3. For each user, search their specific x402 tweets
 * 4. Send tweets to AI (OpenRouter) for categorization
 * 5. Store AI category and reasoning in database
 */

import { config, validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runFullDiscovery } from '../collectors/searchCollector.js';
import { searchUserX402Tweets, delay } from '../collectors/rapidApiClient.js';
import { categorizeUserWithAI } from '../services/openRouterClient.js';
import { AccountModel } from '../db/account.model.js';

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

    let analyzedCount = 0;
    let skippedCount = 0;
    const categoryStats: Record<string, number> = {
      KOL: 0,
      DEVELOPER: 0,
      ACTIVE_USER: 0,
      UNCATEGORIZED: 0,
    };

    for (const account of accounts) {
      try {
        // Skip users that already have AI categorization
        if (account.ai_category && account.ai_categorized_at) {
          logger.info(`Skipping @${account.username} - already categorized as ${account.ai_category}`);
          skippedCount++;
          continue;
        }

        // Step 2a: Search for this user's x402 tweets specifically
        logger.info(`\nAnalyzing @${account.username}...`);

        const userTweets = await searchUserX402Tweets(account.username, config.search.maxPagesPerUser);

        // Step 2b: Send to AI for categorization
        const aiResult = await categorizeUserWithAI(account, userTweets);
        categoryStats[aiResult.category]++;

        // Step 2c: Save AI categorization to database
        await AccountModel.updateAICategory(account.twitter_id, {
          ai_category: aiResult.category,
          ai_reasoning: aiResult.reasoning,
          ai_confidence: aiResult.confidence,
        });

        analyzedCount++;

        logger.info(`  Category: ${aiResult.category} (confidence: ${aiResult.confidence.toFixed(2)})`);
        logger.info(`  Reasoning: ${aiResult.reasoning.substring(0, 100)}...`);

        // Progress logging
        if (analyzedCount % 5 === 0) {
          logger.info(`\n[Progress] Analyzed ${analyzedCount}/${accounts.length} accounts`);
        }

        // Delay between users to avoid rate limits
        if (analyzedCount < accounts.length) {
          await delay(config.search.delayMs);
        }
      } catch (error) {
        logger.error(`Error analyzing @${account.username}:`, error);
      }
    }

    // Summary
    logger.info('\n' + '='.repeat(50));
    logger.info('CRAWL COMPLETED!');
    logger.info('='.repeat(50));
    logger.info(`Total accounts discovered: ${discoveryResult.usersCreated + discoveryResult.usersUpdated}`);
    logger.info(`Total tweets saved: ${discoveryResult.tweetsSaved}`);
    logger.info(`Total accounts analyzed with AI: ${analyzedCount}`);
    logger.info(`Total accounts skipped (already categorized): ${skippedCount}`);
    logger.info('\nAI Category breakdown:');
    logger.info(`  - KOL: ${categoryStats.KOL}`);
    logger.info(`  - DEVELOPER: ${categoryStats.DEVELOPER}`);
    logger.info(`  - ACTIVE_USER: ${categoryStats.ACTIVE_USER}`);
    logger.info(`  - UNCATEGORIZED: ${categoryStats.UNCATEGORIZED}`);
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

    const devAccounts = allAccounts
      .filter((a) => a.ai_category === 'DEVELOPER')
      .sort((a, b) => (b.ai_confidence || 0) - (a.ai_confidence || 0))
      .slice(0, 5);

    const userAccounts = allAccounts
      .filter((a) => a.ai_category === 'ACTIVE_USER')
      .sort((a, b) => (b.ai_confidence || 0) - (a.ai_confidence || 0))
      .slice(0, 5);

    if (kolAccounts.length > 0) {
      logger.info('\nTop KOLs:');
      kolAccounts.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (confidence: ${acc.ai_confidence?.toFixed(2)}, followers: ${acc.followers_count})`);
        logger.info(`     Reason: ${acc.ai_reasoning?.substring(0, 80)}...`);
      });
    }

    if (devAccounts.length > 0) {
      logger.info('\nTop Developers:');
      devAccounts.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (confidence: ${acc.ai_confidence?.toFixed(2)})`);
        logger.info(`     Reason: ${acc.ai_reasoning?.substring(0, 80)}...`);
      });
    }

    if (userAccounts.length > 0) {
      logger.info('\nTop Active Users:');
      userAccounts.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (confidence: ${acc.ai_confidence?.toFixed(2)})`);
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
