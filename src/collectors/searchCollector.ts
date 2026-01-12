import { TweetV2, UserV2 } from 'twitter-api-v2';
import {
  getTwitterClient,
  TWEET_FIELDS,
  USER_FIELDS,
  withRateLimit,
  transformUser,
} from './twitterClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AccountModel, SearchQueryModel } from '../db/account.model.js';

export interface SearchCollectorResult {
  tweets: TweetV2[];
  users: Map<string, UserV2>;
  totalFound: number;
}

/**
 * Search for tweets containing x402-related keywords
 * Discovers tweet authors, reply authors, retweeters, and quoted users
 */
export async function searchForX402Content(
  keywords: string[] = [...config.searchKeywords.primary, ...config.searchKeywords.secondary],
  maxResults: number = config.search.maxResultsPerSearch
): Promise<SearchCollectorResult> {
  const client = getTwitterClient();
  const allTweets: TweetV2[] = [];
  const allUsers = new Map<string, UserV2>();

  for (const keyword of keywords) {
    try {
      logger.info(`Searching for keyword: "${keyword}"`);

      const result = await withRateLimit(async () => {
        return client.v2.search(keyword, {
          max_results: Math.min(maxResults, 100), // Twitter API max is 100 per request
          'tweet.fields': TWEET_FIELDS,
          'user.fields': USER_FIELDS,
          expansions: ['author_id', 'referenced_tweets.id.author_id'],
        });
      });

      if (result.data.data) {
        allTweets.push(...result.data.data);
        logger.info(`Found ${result.data.data.length} tweets for "${keyword}"`);
      }

      // Extract users from includes
      if (result.data.includes?.users) {
        for (const user of result.data.includes.users) {
          allUsers.set(user.id, user);
        }
      }

      // Log search query
      await SearchQueryModel.log(keyword, result.data.data?.length || 0);

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      logger.error(`Error searching for "${keyword}":`, error);
    }
  }

  return {
    tweets: allTweets,
    users: allUsers,
    totalFound: allTweets.length,
  };
}

/**
 * Process discovered users and save to database
 */
export async function processDiscoveredUsers(
  users: Map<string, UserV2>
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  const accounts = Array.from(users.values()).map((user) => ({
    ...transformUser(user),
    engagement_score: 0,
    tech_score: 0,
    x402_relevance: 0,
    confidence: 0,
    category: 'UNCATEGORIZED' as const,
    x402_tweet_count_30d: 0,
    has_github: user.description?.toLowerCase().includes('github') || false,
    uses_technical_terms: false,
    posts_code_snippets: false,
    last_active_at: null,
    last_enriched_at: null,
  }));

  // Check which accounts exist
  for (const account of accounts) {
    const existing = await AccountModel.getByTwitterId(account.twitter_id);
    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  // Bulk upsert
  await AccountModel.bulkUpsert(accounts);

  logger.info(`Processed ${accounts.length} users: ${created} new, ${updated} existing`);

  return { created, updated };
}

/**
 * Get accounts of users who engaged with x402 content (retweets, replies)
 */
export async function discoverEngagedUsers(tweetIds: string[]): Promise<UserV2[]> {
  const client = getTwitterClient();
  const engagedUsers: UserV2[] = [];

  // Process in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < tweetIds.length; i += batchSize) {
    const batch = tweetIds.slice(i, i + batchSize);

    for (const tweetId of batch) {
      try {
        // Get retweeters
        const retweeters = await withRateLimit(async () => {
          return client.v2.tweetRetweetedBy(tweetId, {
            'user.fields': USER_FIELDS,
          });
        });

        if (retweeters.data) {
          engagedUsers.push(...retweeters.data);
        }

        // Small delay
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        logger.error(`Error getting retweeters for tweet ${tweetId}:`, error);
      }
    }
  }

  return engagedUsers;
}
