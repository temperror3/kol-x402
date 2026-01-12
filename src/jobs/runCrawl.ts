/**
 * Manual crawl script
 *
 * Run with: npm run crawl
 *
 * This script performs a full discovery and analysis cycle:
 * 1. Search for x402 content on Twitter
 * 2. Discover and save users
 * 3. Fetch their recent tweets
 * 4. Calculate scores
 * 5. Assign categories
 */

import { config, validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { searchForX402Content, processDiscoveredUsers } from '../collectors/searchCollector.js';
import { fetchUserTweets } from '../collectors/userCollector.js';
import { calculateAllScores } from '../scorers/scoreCalculator.js';
import { assignCategory } from '../categorizer/categoryAssigner.js';
import { AccountModel } from '../db/account.model.js';

async function runCrawl(): Promise<void> {
  logger.info('Starting x402 KOL discovery crawl...');

  try {
    // Validate config
    validateConfig();
    logger.info('Configuration validated');

    // Step 1: Search for x402 content
    logger.info('Step 1: Searching for x402 content...');
    const keywords = [...config.searchKeywords.primary, ...config.searchKeywords.secondary];
    const searchResult = await searchForX402Content(keywords, config.search.maxResultsPerSearch);
    logger.info(`Found ${searchResult.totalFound} tweets from ${searchResult.users.size} unique users`);

    // Step 2: Process and save discovered users
    logger.info('Step 2: Processing discovered users...');
    const { created, updated } = await processDiscoveredUsers(searchResult.users);
    logger.info(`Saved users: ${created} new, ${updated} existing`);

    // Step 3: Enrich accounts with tweet data
    logger.info('Step 3: Fetching tweet data for analysis...');
    let enrichedCount = 0;
    for (const user of searchResult.users.values()) {
      const account = await AccountModel.getByTwitterId(user.id);
      if (account && account.id) {
        await fetchUserTweets(user.id, account.id, 100);
        enrichedCount++;

        // Progress logging
        if (enrichedCount % 10 === 0) {
          logger.info(`Enriched ${enrichedCount}/${searchResult.users.size} accounts`);
        }

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    logger.info(`Enriched ${enrichedCount} accounts with tweet data`);

    // Step 4: Calculate scores and assign categories
    logger.info('Step 4: Calculating scores and assigning categories...');
    let analyzedCount = 0;
    const categoryStats: Record<string, number> = {
      KOL: 0,
      DEVELOPER: 0,
      ACTIVE_USER: 0,
      UNCATEGORIZED: 0,
    };

    for (const user of searchResult.users.values()) {
      const account = await AccountModel.getByTwitterId(user.id);
      if (account && account.id) {
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
          logger.info(`Analyzed ${analyzedCount}/${searchResult.users.size} accounts`);
        }
      }
    }

    // Summary
    logger.info('='.repeat(50));
    logger.info('Crawl completed!');
    logger.info('='.repeat(50));
    logger.info(`Total accounts processed: ${analyzedCount}`);
    logger.info('Category breakdown:');
    logger.info(`  - KOL: ${categoryStats.KOL}`);
    logger.info(`  - DEVELOPER: ${categoryStats.DEVELOPER}`);
    logger.info(`  - ACTIVE_USER: ${categoryStats.ACTIVE_USER}`);
    logger.info(`  - UNCATEGORIZED: ${categoryStats.UNCATEGORIZED}`);
    logger.info('='.repeat(50));

    // Show top accounts
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
