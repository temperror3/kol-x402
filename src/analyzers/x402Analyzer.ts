import { collectX402EngagementData } from '../collectors/engagementCollector.js';
import { TweetModel } from '../db/account.model.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Account, Tweet } from '../types/index.js';

// Primary keywords (high weight: +15 per tweet)
const PRIMARY_KEYWORDS = ['x402', '#x402', 'x402 protocol', 'http 402'];

// Secondary keywords (medium weight: +8 per tweet)
const SECONDARY_KEYWORDS = ['402 payment', 'crypto payments api', 'web monetization'];

/**
 * x402 Relevance Score Calculation (0-100)
 *
 * Scoring Logic:
 * +15 → Primary keyword per tweet
 * +8  → Secondary keyword per tweet
 * +5  → Reply/RT to x402 content
 *
 * Decay factor for tweets older than 30 days (handled by only using recent tweets)
 */
export async function analyzeX402Relevance(account: Account): Promise<{
  score: number;
  x402TweetCount30d: number;
}> {
  let score = 0;

  // Get x402-related data
  const x402Data = await collectX402EngagementData(account.id!);

  // Also get all recent tweets to check for x402 content
  const recentTweets = await TweetModel.getRecentByAccountId(account.id!);

  let primaryKeywordTweets = 0;
  let secondaryKeywordTweets = 0;

  for (const tweet of recentTweets) {
    const contentLower = tweet.content.toLowerCase();

    // Check primary keywords
    const hasPrimary = PRIMARY_KEYWORDS.some((keyword) =>
      contentLower.includes(keyword.toLowerCase())
    );
    if (hasPrimary) {
      primaryKeywordTweets++;
      score += 15;
      logger.debug(`@${account.username}: +15 for primary x402 keyword in tweet`);
    }

    // Check secondary keywords
    const hasSecondary = SECONDARY_KEYWORDS.some((keyword) =>
      contentLower.includes(keyword.toLowerCase())
    );
    if (hasSecondary && !hasPrimary) {
      // Don't double count if already counted as primary
      secondaryKeywordTweets++;
      score += 8;
      logger.debug(`@${account.username}: +8 for secondary x402 keyword in tweet`);
    }
  }

  // +5 for engaging with x402 content (based on x402_keywords_found in tweets)
  const engagedTweets = recentTweets.filter(
    (t) =>
      t.x402_keywords_found &&
      t.x402_keywords_found.length > 0 &&
      (t.retweets > 0 || t.replies > 0)
  );
  const engagementBonus = Math.min(20, engagedTweets.length * 5);
  score += engagementBonus;

  if (engagementBonus > 0) {
    logger.debug(`@${account.username}: +${engagementBonus} for x402 engagement`);
  }

  // Cap at 100
  score = Math.min(100, score);

  // Count x402 tweets in last 30 days
  const x402TweetCount30d = primaryKeywordTweets + secondaryKeywordTweets;

  logger.debug(
    `x402 relevance for @${account.username}: ${score} ` +
      `(${primaryKeywordTweets} primary, ${secondaryKeywordTweets} secondary tweets)`
  );

  return {
    score,
    x402TweetCount30d,
  };
}

/**
 * Quick x402 relevance check for a single tweet
 */
export function analyzeTweetForX402(content: string): {
  isPrimary: boolean;
  isSecondary: boolean;
  keywordsFound: string[];
} {
  const contentLower = content.toLowerCase();
  const keywordsFound: string[] = [];

  let isPrimary = false;
  let isSecondary = false;

  for (const keyword of PRIMARY_KEYWORDS) {
    if (contentLower.includes(keyword.toLowerCase())) {
      isPrimary = true;
      keywordsFound.push(keyword);
    }
  }

  for (const keyword of SECONDARY_KEYWORDS) {
    if (contentLower.includes(keyword.toLowerCase())) {
      isSecondary = true;
      keywordsFound.push(keyword);
    }
  }

  return {
    isPrimary,
    isSecondary,
    keywordsFound,
  };
}

/**
 * Check if account meets x402 relevance threshold for categorization
 */
export function meetsX402Threshold(score: number, category: 'KOL' | 'DEVELOPER' | 'ACTIVE_USER'): boolean {
  const thresholds = {
    KOL: config.thresholds.kol.minX402Relevance,
    DEVELOPER: 0, // Developers don't require x402 relevance
    ACTIVE_USER: config.thresholds.activeUser.minX402Relevance,
  };

  return score >= thresholds[category];
}
