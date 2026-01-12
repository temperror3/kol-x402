import { TweetModel } from '../db/account.model.js';
import { logger } from '../utils/logger.js';
import type { Tweet } from '../types/index.js';

export interface EngagementData {
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  totalQuotes: number;
  totalTweets: number;
  avgEngagementPerTweet: number;
}

/**
 * Collect engagement data from stored tweets for an account
 */
export async function collectEngagementData(accountId: string): Promise<EngagementData> {
  const tweets = await TweetModel.getRecentByAccountId(accountId);

  if (tweets.length === 0) {
    return {
      totalLikes: 0,
      totalRetweets: 0,
      totalReplies: 0,
      totalQuotes: 0,
      totalTweets: 0,
      avgEngagementPerTweet: 0,
    };
  }

  const totalLikes = tweets.reduce((sum, t) => sum + t.likes, 0);
  const totalRetweets = tweets.reduce((sum, t) => sum + t.retweets, 0);
  const totalReplies = tweets.reduce((sum, t) => sum + t.replies, 0);
  const totalQuotes = tweets.reduce((sum, t) => sum + t.quotes, 0);
  const totalTweets = tweets.length;

  const totalEngagement = totalLikes + totalRetweets + totalReplies + totalQuotes;
  const avgEngagementPerTweet = totalTweets > 0 ? totalEngagement / totalTweets : 0;

  logger.debug(
    `Engagement data for ${accountId}: ${totalTweets} tweets, avg engagement: ${avgEngagementPerTweet.toFixed(2)}`
  );

  return {
    totalLikes,
    totalRetweets,
    totalReplies,
    totalQuotes,
    totalTweets,
    avgEngagementPerTweet,
  };
}

/**
 * Collect x402-related engagement data
 */
export async function collectX402EngagementData(accountId: string): Promise<{
  x402Tweets: Tweet[];
  x402TweetCount: number;
  x402Engagement: number;
}> {
  const tweets = await TweetModel.getRecentByAccountId(accountId);

  // Filter tweets with x402 keywords
  const x402Tweets = tweets.filter((t) => t.x402_keywords_found && t.x402_keywords_found.length > 0);

  const x402TweetCount = x402Tweets.length;
  const x402Engagement = x402Tweets.reduce(
    (sum, t) => sum + t.likes + t.retweets + t.replies + t.quotes,
    0
  );

  logger.debug(
    `x402 engagement for ${accountId}: ${x402TweetCount} tweets, ${x402Engagement} total engagement`
  );

  return {
    x402Tweets,
    x402TweetCount,
    x402Engagement,
  };
}

/**
 * Collect code/technical content data
 */
export async function collectTechnicalData(accountId: string): Promise<{
  tweetsWithCode: number;
  tweetsWithGithub: number;
  technicalTermsFound: string[];
}> {
  const tweets = await TweetModel.getRecentByAccountId(accountId);

  const tweetsWithCode = tweets.filter((t) => t.has_code).length;
  const tweetsWithGithub = tweets.filter((t) => t.has_github).length;

  // Find technical terms in tweets
  const technicalTerms = ['API', 'SDK', 'protocol', 'implementation', 'open-source', 'infra'];
  const foundTerms = new Set<string>();

  for (const tweet of tweets) {
    const content = tweet.content.toLowerCase();
    for (const term of technicalTerms) {
      if (content.includes(term.toLowerCase())) {
        foundTerms.add(term);
      }
    }
  }

  logger.debug(
    `Technical data for ${accountId}: ${tweetsWithCode} code tweets, ${tweetsWithGithub} github tweets`
  );

  return {
    tweetsWithCode,
    tweetsWithGithub,
    technicalTermsFound: Array.from(foundTerms),
  };
}
