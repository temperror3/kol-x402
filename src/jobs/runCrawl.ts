/**
 * Manual crawl script using RapidAPI Twitter Search
 *
 * Run with: npm run crawl
 *
 * This script performs a full discovery and analysis cycle:
 * 1. Search for x402 content on Twitter via RapidAPI
 * 2. Discover and save users
 * 3. Save their tweets
 * 4. Calculate scores
 * 5. Assign categories
 */

import { config, validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runFullDiscovery } from '../collectors/searchCollector.js';
import { calculateAllScores } from '../scorers/scoreCalculator.js';
import { assignCategory } from '../categorizer/categoryAssigner.js';
import { AccountModel } from '../db/account.model.js';

async function runCrawl(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('Starting x402 KOL Discovery Crawl (RapidAPI)');
  logger.info('='.repeat(50));

  try {
    // Validate config
    validateConfig();
    logger.info('Configuration validated');
    logger.info(`Max pages per keyword: ${config.search.maxPages}`);
    logger.info(`Delay between requests: ${config.search.delayMs}ms`);

    // Step 1 & 2 & 3: Search, save users, save tweets
    logger.info('\nStep 1-3: Searching and saving data...');
    const keywords = [...config.searchKeywords.primary, ...config.searchKeywords.secondary];
    logger.info(`Keywords: ${keywords.join(', ')}`);

    const discoveryResult = await runFullDiscovery(keywords, config.search.maxPages);

    logger.info(`Discovery complete: ${discoveryResult.usersCreated} new users, ${discoveryResult.usersUpdated} updated, ${discoveryResult.tweetsSaved} tweets saved`);

    // Step 4: Calculate scores and assign categories
    logger.info('\nStep 4: Calculating scores and assigning categories...');

    // Get all accounts that need scoring
    const { data: accounts } = await AccountModel.list({}, 1, 10000, 'created_at', 'desc');

    let analyzedCount = 0;
    const categoryStats: Record<string, number> = {
      KOL: 0,
      DEVELOPER: 0,
      ACTIVE_USER: 0,
      UNCATEGORIZED: 0,
    };

    for (const account of accounts) {
      try {
        // Calculate scores
        const scores = await calculateAllScores(account);

        // Assign category
        const category = assignCategory(account, scores);
        categoryStats[category]++;

        // Update account
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

        analyzedCount++;

        // Progress logging
        if (analyzedCount % 10 === 0) {
          logger.info(`Analyzed ${analyzedCount}/${accounts.length} accounts`);
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
    logger.info(`Total accounts analyzed: ${analyzedCount}`);
    logger.info('\nCategory breakdown:');
    logger.info(`  - KOL: ${categoryStats.KOL}`);
    logger.info(`  - DEVELOPER: ${categoryStats.DEVELOPER}`);
    logger.info(`  - ACTIVE_USER: ${categoryStats.ACTIVE_USER}`);
    logger.info(`  - UNCATEGORIZED: ${categoryStats.UNCATEGORIZED}`);
    logger.info('='.repeat(50));

    // Show top accounts by category
    const topKOLs = await AccountModel.list({ category: 'KOL' }, 1, 5, 'confidence', 'desc');
    const topDevs = await AccountModel.list({ category: 'DEVELOPER' }, 1, 5, 'confidence', 'desc');
    const topUsers = await AccountModel.list({ category: 'ACTIVE_USER' }, 1, 5, 'confidence', 'desc');

    if (topKOLs.data.length > 0) {
      logger.info('\nTop KOLs:');
      topKOLs.data.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (confidence: ${acc.confidence}, followers: ${acc.followers_count})`);
      });
    }

    if (topDevs.data.length > 0) {
      logger.info('\nTop Developers:');
      topDevs.data.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (tech_score: ${acc.tech_score}, has_github: ${acc.has_github})`);
      });
    }

    if (topUsers.data.length > 0) {
      logger.info('\nTop Active Users:');
      topUsers.data.forEach((acc, i) => {
        logger.info(`  ${i + 1}. @${acc.username} (x402_relevance: ${acc.x402_relevance})`);
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
