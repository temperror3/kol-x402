import { TweetV2 } from 'twitter-api-v2';
import {
  getTwitterClient,
  TWEET_FIELDS,
  USER_FIELDS,
  withRateLimit,
  transformUser,
  transformTweet,
} from './twitterClient.js';
import { logger } from '../utils/logger.js';
import { AccountModel, TweetModel } from '../db/account.model.js';
import type { Account } from '../types/index.js';

/**
 * Fetch detailed user information by Twitter ID
 */
export async function fetchUserDetails(twitterId: string): Promise<Account | null> {
  const client = getTwitterClient();

  try {
    const result = await withRateLimit(async () => {
      return client.v2.user(twitterId, {
        'user.fields': USER_FIELDS,
      });
    });

    if (!result.data) {
      return null;
    }

    const userData = transformUser(result.data);

    // Check for GitHub in bio
    const hasGithub =
      result.data.description?.toLowerCase().includes('github') ||
      result.data.entities?.url?.urls?.some((url) => url.expanded_url?.includes('github.com')) ||
      result.data.entities?.description?.urls?.some((url) =>
        url.expanded_url?.includes('github.com')
      ) ||
      false;

    const account = await AccountModel.upsert({
      ...userData,
      engagement_score: 0,
      tech_score: 0,
      x402_relevance: 0,
      confidence: 0,
      category: 'UNCATEGORIZED',
      x402_tweet_count_30d: 0,
      has_github: hasGithub,
      uses_technical_terms: false,
      posts_code_snippets: false,
      last_active_at: null,
      last_enriched_at: new Date().toISOString(),
    });

    return account;
  } catch (error) {
    logger.error(`Error fetching user details for ${twitterId}:`, error);
    return null;
  }
}

/**
 * Fetch multiple users by IDs (batch)
 */
export async function fetchUsersBatch(twitterIds: string[]): Promise<Account[]> {
  const client = getTwitterClient();
  const accounts: Account[] = [];

  // Process in batches of 100 (Twitter API limit)
  const batchSize = 100;
  for (let i = 0; i < twitterIds.length; i += batchSize) {
    const batch = twitterIds.slice(i, i + batchSize);

    try {
      const result = await withRateLimit(async () => {
        return client.v2.users(batch, {
          'user.fields': USER_FIELDS,
        });
      });

      if (result.data) {
        for (const user of result.data) {
          const userData = transformUser(user);
          const hasGithub = user.description?.toLowerCase().includes('github') || false;

          const account = await AccountModel.upsert({
            ...userData,
            engagement_score: 0,
            tech_score: 0,
            x402_relevance: 0,
            confidence: 0,
            category: 'UNCATEGORIZED',
            x402_tweet_count_30d: 0,
            has_github: hasGithub,
            uses_technical_terms: false,
            posts_code_snippets: false,
            last_active_at: null,
            last_enriched_at: new Date().toISOString(),
          });

          if (account) {
            accounts.push(account);
          }
        }
      }

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      logger.error(`Error fetching users batch:`, error);
    }
  }

  return accounts;
}

/**
 * Fetch recent tweets for a user (for analysis)
 */
export async function fetchUserTweets(
  twitterId: string,
  accountId: string,
  maxResults = 100
): Promise<TweetV2[]> {
  const client = getTwitterClient();
  const tweets: TweetV2[] = [];

  try {
    const result = await withRateLimit(async () => {
      return client.v2.userTimeline(twitterId, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': TWEET_FIELDS,
        exclude: ['retweets'], // Get original tweets only for better analysis
      });
    });

    if (result.data.data) {
      tweets.push(...result.data.data);

      // Transform and save tweets
      const transformedTweets = tweets.map((tweet) => transformTweet(tweet, accountId));
      await TweetModel.bulkInsert(transformedTweets);

      logger.debug(`Fetched ${tweets.length} tweets for user ${twitterId}`);
    }
  } catch (error) {
    logger.error(`Error fetching tweets for ${twitterId}:`, error);
  }

  return tweets;
}

/**
 * Lookup user by username
 */
export async function fetchUserByUsername(username: string): Promise<Account | null> {
  const client = getTwitterClient();

  try {
    const result = await withRateLimit(async () => {
      return client.v2.userByUsername(username, {
        'user.fields': USER_FIELDS,
      });
    });

    if (!result.data) {
      return null;
    }

    return fetchUserDetails(result.data.id);
  } catch (error) {
    logger.error(`Error fetching user by username ${username}:`, error);
    return null;
  }
}
