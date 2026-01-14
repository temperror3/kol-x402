import {
  searchTwitterWithPagination,
  transformRapidApiUser,
  transformRapidApiTweet,
  hasGithubInBio,
  delay,
  RapidApiTweet,
  RapidApiUserInfo,
} from './rapidApiClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AccountModel, TweetModel, SearchQueryModel } from '../db/account.model.js';

export interface SearchCollectorResult {
  tweets: RapidApiTweet[];
  users: Map<string, RapidApiUserInfo>;
  totalFound: number;
}

/**
 * Search for tweets containing x402-related keywords using RapidAPI
 * Discovers tweet authors from search results
 */
export async function searchForX402Content(
  keywords: string[] = [...config.searchKeywords.primary, ...config.searchKeywords.secondary],
  maxPages: number = config.search.maxPages
): Promise<SearchCollectorResult> {
  const allTweets: RapidApiTweet[] = [];
  const allUsers = new Map<string, RapidApiUserInfo>();

  for (const keyword of keywords) {
    try {
      logger.info(`Searching for keyword: "${keyword}"`);

      const result = await searchTwitterWithPagination(keyword, maxPages, config.search.delayMs);

      if (result.tweets && result.tweets.length > 0) {
        allTweets.push(...result.tweets);

        // Extract unique users from tweets
        for (const tweet of result.tweets) {
          if (tweet.user_info && tweet.user_info.rest_id) {
            allUsers.set(tweet.user_info.rest_id, tweet.user_info);
          }
        }

        logger.info(`Found ${result.tweets.length} tweets for "${keyword}" (${result.totalPages} pages)`);
      }

      // Log search query
      await SearchQueryModel.log(keyword, result.tweets?.length || 0);

      // Delay between different keyword searches
      if (keywords.indexOf(keyword) < keywords.length - 1) {
        logger.debug(`Waiting ${config.search.delayMs}ms before next keyword search...`);
        await delay(config.search.delayMs);
      }
    } catch (error) {
      logger.error(`Error searching for "${keyword}":`, error);
    }
  }

  logger.info(`Total: ${allTweets.length} tweets from ${allUsers.size} unique users`);

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
  users: Map<string, RapidApiUserInfo>
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  const accounts = Array.from(users.values()).map((userInfo) => ({
    ...transformRapidApiUser(userInfo),
    has_github: hasGithubInBio(userInfo),
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
 * Process tweets from search results and save to database
 */
export async function processDiscoveredTweets(
  tweets: RapidApiTweet[],
  userAccountMap: Map<string, string> // twitter_id -> account_id
): Promise<number> {
  let savedCount = 0;

  for (const tweet of tweets) {
    const accountId = userAccountMap.get(tweet.user_info.rest_id);
    if (accountId) {
      const transformedTweet = transformRapidApiTweet(tweet, accountId);
      try {
        await TweetModel.bulkInsert([transformedTweet]);
        savedCount++;
      } catch (error) {
        // Ignore duplicate tweet errors
        logger.debug(`Could not save tweet ${tweet.tweet_id}: ${error}`);
      }
    }
  }

  logger.info(`Saved ${savedCount} tweets to database`);
  return savedCount;
}

/**
 * Full discovery pipeline: search, save users, save tweets
 */
export async function runFullDiscovery(
  keywords?: string[],
  maxPages?: number
): Promise<{
  usersCreated: number;
  usersUpdated: number;
  tweetsSaved: number;
}> {
  // Step 1: Search for x402 content
  const searchResult = await searchForX402Content(keywords, maxPages);

  // Step 2: Save users
  const { created, updated } = await processDiscoveredUsers(searchResult.users);

  // Step 3: Build user -> account ID map
  const userAccountMap = new Map<string, string>();
  for (const [twitterId] of searchResult.users) {
    const account = await AccountModel.getByTwitterId(twitterId);
    if (account && account.id) {
      userAccountMap.set(twitterId, account.id);
    }
  }

  // Step 4: Save tweets
  const tweetsSaved = await processDiscoveredTweets(searchResult.tweets, userAccountMap);

  return {
    usersCreated: created,
    usersUpdated: updated,
    tweetsSaved,
  };
}
