import { collectEngagementData } from '../collectors/engagementCollector.js';
import { logger } from '../utils/logger.js';
import type { Account } from '../types/index.js';

/**
 * Engagement Score Calculation (0-100)
 *
 * Formula: engagementRate = (likes + retweets + replies) / followers
 * Normalization: engagementScore = Math.min(100, engagementRate * 1000)
 *
 * A 5% engagement rate ≈ score of 50
 */
export async function analyzeEngagement(account: Account): Promise<number> {
  const engagementData = await collectEngagementData(account.id!);

  if (account.followers_count === 0 || engagementData.totalTweets === 0) {
    logger.debug(`Engagement score for @${account.username}: 0 (no followers or tweets)`);
    return 0;
  }

  // Calculate average engagement per tweet
  const totalEngagement =
    engagementData.totalLikes + engagementData.totalRetweets + engagementData.totalReplies;
  const avgEngagementPerTweet = totalEngagement / engagementData.totalTweets;

  // Calculate engagement rate relative to followers
  const engagementRate = avgEngagementPerTweet / account.followers_count;

  // Normalize to 0-100 scale (multiply by 1000, cap at 100)
  // This means 5% engagement = 50, 10% = 100
  const engagementScore = Math.min(100, Math.round(engagementRate * 1000));

  logger.debug(
    `Engagement score for @${account.username}: ${engagementScore} ` +
      `(rate: ${(engagementRate * 100).toFixed(2)}%, ` +
      `${engagementData.totalTweets} tweets, ${account.followers_count} followers)`
  );

  return engagementScore;
}

/**
 * Quick engagement analysis from tweet data without database lookup
 */
export function calculateEngagementScoreFromData(
  totalLikes: number,
  totalRetweets: number,
  totalReplies: number,
  tweetCount: number,
  followerCount: number
): number {
  if (followerCount === 0 || tweetCount === 0) {
    return 0;
  }

  const totalEngagement = totalLikes + totalRetweets + totalReplies;
  const avgEngagementPerTweet = totalEngagement / tweetCount;
  const engagementRate = avgEngagementPerTweet / followerCount;

  return Math.min(100, Math.round(engagementRate * 1000));
}
