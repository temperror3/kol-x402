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
import type { SearchConfiguration } from '../types/index.js';

export interface SearchCollectorResult {
  tweets: RapidApiTweet[];
  users: Map<string, RapidApiUserInfo>;
  totalFound: number;
}

/**
 * Search for tweets containing topic keywords using RapidAPI.
 * When searchConfig is provided, uses its keywords and logs with config_id.
 */
export async function searchForTopicContent(
  keywords: string[],
  maxPages: number = config.search.maxPages,
  searchConfig?: SearchConfiguration
): Promise<SearchCollectorResult> {
  const allTweets: RapidApiTweet[] = [];
  const allUsers = new Map<string, RapidApiUserInfo>();

  for (const keyword of keywords) {
    try {
      logger.info(`Searching for keyword: "${keyword}"`);

      const result = await searchTwitterWithPagination(keyword, maxPages, config.search.delayMs);

      if (result.tweets && result.tweets.length > 0) {
        allTweets.push(...result.tweets);

        for (const tweet of result.tweets) {
          if (tweet.user_info && tweet.user_info.rest_id) {
            allUsers.set(tweet.user_info.rest_id, tweet.user_info);
          }
        }

        logger.info(`Found ${result.tweets.length} tweets for "${keyword}" (${result.totalPages} pages)`);
      }

      await SearchQueryModel.log(keyword, result.tweets?.length || 0, searchConfig?.id);

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

/** @deprecated Use searchForTopicContent with SearchConfiguration */
export async function searchForX402Content(
  keywords: string[] = [],
  maxPages: number = config.search.maxPages
): Promise<SearchCollectorResult> {
  const kws = keywords.length ? keywords : [...config.searchKeywords.primary, ...config.searchKeywords.secondary];
  return searchForTopicContent(kws, maxPages);
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
 * Process tweets from search results and save to database.
 * searchConfig is required for topic-agnostic keyword detection (keywords_found).
 */
export async function processDiscoveredTweets(
  tweets: RapidApiTweet[],
  userAccountMap: Map<string, string>,
  searchConfig: SearchConfiguration
): Promise<number> {
  let savedCount = 0;

  for (const tweet of tweets) {
    const accountId = userAccountMap.get(tweet.user_info.rest_id);
    if (accountId) {
      const transformedTweet = transformRapidApiTweet(tweet, accountId, searchConfig);
      try {
        await TweetModel.bulkInsert([transformedTweet]);
        savedCount++;
      } catch (error) {
        logger.debug(`Could not save tweet ${tweet.tweet_id}: ${error}`);
      }
    }
  }

  logger.info(`Saved ${savedCount} tweets to database`);
  return savedCount;
}

/**
 * Full discovery pipeline: search, save users, save tweets.
 * Requires searchConfig for configuration-driven discovery.
 * Returns accountIds of accounts that were in this discovery (for linking to this config).
 */
export async function runFullDiscovery(
  searchConfig: SearchConfiguration,
  maxPages?: number
): Promise<{
  usersCreated: number;
  usersUpdated: number;
  tweetsSaved: number;
  accountIds: string[];
}> {
  const keywords = [
    ...searchConfig.primary_keywords,
    ...(searchConfig.secondary_keywords || []),
  ];
  const pages = maxPages ?? config.search.maxPages;

  const searchResult = await searchForTopicContent(keywords, pages, searchConfig);

  const { created, updated } = await processDiscoveredUsers(searchResult.users);

  const userAccountMap = new Map<string, string>();
  for (const [twitterId] of searchResult.users) {
    const account = await AccountModel.getByTwitterId(twitterId);
    if (account && account.id) {
      userAccountMap.set(twitterId, account.id);
    }
  }

  const tweetsSaved = await processDiscoveredTweets(searchResult.tweets, userAccountMap, searchConfig);

  const accountIds = Array.from(userAccountMap.values());

  return {
    usersCreated: created,
    usersUpdated: updated,
    tweetsSaved,
    accountIds,
  };
}
