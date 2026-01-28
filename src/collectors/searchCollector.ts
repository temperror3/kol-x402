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
import { CampaignSearchQueryModel } from '../db/campaign.model.js';
import type { Campaign } from '../types/index.js';

export interface SearchCollectorResult {
  tweets: RapidApiTweet[];
  users: Map<string, RapidApiUserInfo>;
  totalFound: number;
}

/**
 * Search for tweets containing x402-related keywords using RapidAPI (backward compatible)
 * Discovers tweet authors from search results
 */
export async function searchForX402Content(
  keywords: string[] = [...config.searchKeywords.primary, ...config.searchKeywords.secondary],
  maxPages: number = config.search.maxPages
): Promise<SearchCollectorResult> {
  return searchForTopicContent(undefined, keywords, maxPages);
}

/**
 * Search for tweets containing topic-related keywords using RapidAPI
 * Discovers tweet authors from search results
 * @param campaign - Optional campaign for logging (if not provided, uses default query logging)
 * @param keywords - Search terms to use
 * @param maxPages - Maximum pages per keyword
 */
export async function searchForTopicContent(
  campaign: Campaign | undefined,
  keywords: string[] = [...config.searchKeywords.primary, ...config.searchKeywords.secondary],
  maxPages: number = config.search.maxPages
): Promise<SearchCollectorResult> {
  const allTweets: RapidApiTweet[] = [];
  const allUsers = new Map<string, RapidApiUserInfo>();

  for (const keyword of keywords) {
    try {
      logger.info(`Searching for keyword: "${keyword}"${campaign ? ` (campaign: ${campaign.name})` : ''}`);

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

      // Log search query (to campaign-specific table if campaign provided)
      if (campaign) {
        await CampaignSearchQueryModel.log(campaign.id, keyword, result.tweets?.length || 0);
      } else {
        await SearchQueryModel.log(keyword, result.tweets?.length || 0);
      }

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
 * @param tweets - Raw tweets from RapidAPI
 * @param userAccountMap - Map of twitter_id -> account_id
 * @param searchTerms - Optional custom search terms for keyword detection
 */
export async function processDiscoveredTweets(
  tweets: RapidApiTweet[],
  userAccountMap: Map<string, string>, // twitter_id -> account_id
  searchTerms?: string[]
): Promise<number> {
  let savedCount = 0;

  for (const tweet of tweets) {
    const accountId = userAccountMap.get(tweet.user_info.rest_id);
    if (accountId) {
      const transformedTweet = transformRapidApiTweet(tweet, accountId, searchTerms);
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
 * @param keywords - Search terms to use
 * @param maxPages - Maximum pages per keyword
 * @param campaign - Optional campaign for logging
 */
export async function runFullDiscovery(
  keywords?: string[],
  maxPages?: number,
  campaign?: Campaign
): Promise<{
  usersCreated: number;
  usersUpdated: number;
  tweetsSaved: number;
  discoveredAccountIds: string[];
}> {
  // Step 1: Search for topic content
  const searchResult = await searchForTopicContent(campaign, keywords, maxPages);

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

  // Step 4: Save tweets (pass search terms for keyword detection)
  const tweetsSaved = await processDiscoveredTweets(searchResult.tweets, userAccountMap, keywords);

  const discoveredAccountIds = Array.from(userAccountMap.values());

  return {
    usersCreated: created,
    usersUpdated: updated,
    tweetsSaved,
    discoveredAccountIds,
  };
}
