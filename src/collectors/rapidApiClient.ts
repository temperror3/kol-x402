import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// RapidAPI response types based on the API response structure
export interface RapidApiUserInfo {
  screen_name: string;
  name: string;
  created_at: string;
  description: string | null;
  rest_id: string;
  followers_count: number;
  favourites_count: number;
  avatar: string | null;
  url: string | null;
  cover_image: string | null;
  verified_type: string | null;
  verified: boolean;
  friends_count: number;
  location: string;
}

export interface RapidApiTweet {
  type: string;
  tweet_id: string;
  screen_name: string;
  bookmarks: number;
  favorites: number;
  created_at: string;
  text: string;
  lang: string;
  source: string;
  quotes: number;
  replies: number;
  conversation_id: string;
  retweets: number;
  views: string;
  user_info: RapidApiUserInfo;
  entities?: {
    hashtags?: Array<{ text: string }>;
    symbols?: Array<{ text: string }>;
    user_mentions?: Array<{ screen_name: string; name: string }>;
    urls?: Array<{ expanded_url: string }>;
  };
  media?: {
    photo?: Array<{ media_url_https: string }>;
    video?: Array<{ media_url_https: string }>;
  };
}

export interface RapidApiSearchResponse {
  status: string;
  timeline: RapidApiTweet[];
  next_cursor?: string;
  prev_cursor?: string;
}

let axiosClient: AxiosInstance | null = null;

function getAxiosClient(): AxiosInstance {
  if (!axiosClient) {
    axiosClient = axios.create({
      baseURL: `https://${config.rapidApi.host}`,
      headers: {
        'x-rapidapi-key': config.rapidApi.key,
        'x-rapidapi-host': config.rapidApi.host,
      },
    });
  }
  return axiosClient;
}

/**
 * Search Twitter using RapidAPI
 */
export async function searchTwitter(
  query: string,
  searchType: string = config.search.searchType,
  cursor?: string
): Promise<RapidApiSearchResponse> {
  const client = getAxiosClient();

  try {
    const params: Record<string, string> = {
      query,
      search_type: searchType,
    };

    if (cursor) {
      params.cursor = cursor;
    }

    logger.debug(`Searching Twitter for: "${query}" (type: ${searchType})`);

    const response = await client.get<RapidApiSearchResponse>('/search.php', { params });

    if (response.data.status !== 'ok') {
      throw new Error(`API returned status: ${response.data.status}`);
    }

    logger.info(`Found ${response.data.timeline?.length || 0} tweets for "${query}"`);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`RapidAPI error: ${error.response?.status} - ${error.message}`);
      throw new Error(`Twitter search failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

/**
 * Search with pagination - fetches multiple pages
 */
export async function searchTwitterWithPagination(
  query: string,
  maxPages: number = config.search.maxPages,
  delayMs: number = config.search.delayMs
): Promise<{ tweets: RapidApiTweet[]; totalPages: number }> {
  const allTweets: RapidApiTweet[] = [];
  let cursor: string | undefined;
  let currentPage = 0;

  while (currentPage < maxPages) {
    try {
      const response = await searchTwitter(query, config.search.searchType, cursor);

      if (response.timeline && response.timeline.length > 0) {
        allTweets.push(...response.timeline);
        logger.info(`Page ${currentPage + 1}: Found ${response.timeline.length} tweets (total: ${allTweets.length})`);
      } else {
        logger.info(`Page ${currentPage + 1}: No more tweets found`);
        break;
      }

      // Check for next page
      if (response.next_cursor) {
        cursor = response.next_cursor;
        currentPage++;

        // Delay between requests
        if (currentPage < maxPages) {
          logger.debug(`Waiting ${delayMs}ms before next request...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } else {
        logger.info('No more pages available');
        break;
      }
    } catch (error) {
      logger.error(`Error fetching page ${currentPage + 1}:`, error);
      break;
    }
  }

  return {
    tweets: allTweets,
    totalPages: currentPage + 1,
  };
}

/**
 * Transform RapidAPI user to our internal format
 */
export function transformRapidApiUser(userInfo: RapidApiUserInfo): {
  twitter_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  profile_image_url: string | null;
} {
  return {
    twitter_id: userInfo.rest_id,
    username: userInfo.screen_name,
    display_name: userInfo.name,
    bio: userInfo.description || null,
    followers_count: userInfo.followers_count || 0,
    following_count: userInfo.friends_count || 0,
    tweet_count: userInfo.favourites_count || 0, // Using favourites as proxy
    profile_image_url: userInfo.avatar || null,
  };
}

/**
 * Transform RapidAPI tweet to our internal format
 */
export function transformRapidApiTweet(
  tweet: RapidApiTweet,
  accountId: string
): {
  twitter_id: string;
  account_id: string;
  content: string;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  created_at: string;
  has_code: boolean;
  has_github: boolean;
  x402_keywords_found: string[];
} {
  const content = tweet.text;

  // Check for code patterns
  const codePatterns = /[{}();\[\]=>]|function\s|const\s|let\s|var\s|import\s|export\s|async\s|await\s|class\s/;
  const hasCode = codePatterns.test(content);

  // Check for GitHub links
  const hasGithub = /github\.com/i.test(content) ||
    tweet.entities?.urls?.some((url) => url.expanded_url?.includes('github.com')) ||
    false;

  // Find x402 keywords
  const x402Keywords: string[] = [];
  const primaryKeywords = ['x402', '#x402', 'x402 protocol', 'http 402'];
  const secondaryKeywords = ['402 payment', 'crypto payments api', 'web monetization'];

  const lowerContent = content.toLowerCase();
  [...primaryKeywords, ...secondaryKeywords].forEach((keyword) => {
    if (lowerContent.includes(keyword.toLowerCase())) {
      x402Keywords.push(keyword);
    }
  });

  // Parse created_at to ISO format
  let createdAt: string;
  try {
    createdAt = new Date(tweet.created_at).toISOString();
  } catch {
    createdAt = new Date().toISOString();
  }

  return {
    twitter_id: tweet.tweet_id,
    account_id: accountId,
    content,
    likes: tweet.favorites || 0,
    retweets: tweet.retweets || 0,
    replies: tweet.replies || 0,
    quotes: tweet.quotes || 0,
    created_at: createdAt,
    has_code: hasCode,
    has_github: hasGithub,
    x402_keywords_found: x402Keywords,
  };
}

/**
 * Check if user bio contains GitHub
 */
export function hasGithubInBio(userInfo: RapidApiUserInfo): boolean {
  if (!userInfo.description) return false;
  return /github/i.test(userInfo.description) || /github\.com/i.test(userInfo.url || '');
}

/**
 * Delay helper
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Search for a specific user's x402-related tweets
 * Uses query format: "from:{username} x402"
 */
export async function searchUserX402Tweets(
  username: string,
  maxPages: number = config.search.maxPages,
  delayMs: number = config.search.delayMs
): Promise<RapidApiTweet[]> {
  // Build query to get user's x402 tweets
  const query = `from:${username} x402`;

  logger.info(`Searching for x402 tweets from @${username}`);

  const result = await searchTwitterWithPagination(query, maxPages, delayMs);

  logger.info(`Found ${result.tweets.length} x402 tweets from @${username}`);

  return result.tweets;
}

// Timeline API response types
export interface RapidApiTimelineResponse {
  status: string;
  timeline: RapidApiTweet[];
  next_cursor?: string;
}

/**
 * Fetch a user's general timeline (recent tweets)
 * Uses RapidAPI timeline.php endpoint
 */
export async function fetchUserTimeline(
  username: string,
  maxTweets: number = config.search.maxTimelineTweets
): Promise<RapidApiTweet[]> {
  const client = getAxiosClient();

  try {
    logger.info(`Fetching timeline for @${username} (max: ${maxTweets} tweets)`);

    const response = await client.get<RapidApiTimelineResponse>('/timeline.php', {
      params: {
        screenname: username,
      },
    });

    if (response.data.status !== 'ok') {
      throw new Error(`API returned status: ${response.data.status}`);
    }

    const tweets = response.data.timeline || [];
    const limitedTweets = tweets.slice(0, maxTweets);

    logger.info(`Fetched ${limitedTweets.length} timeline tweets for @${username}`);

    return limitedTweets;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`RapidAPI timeline error: ${error.response?.status} - ${error.message}`);
      // Return empty array on error instead of throwing to allow crawl to continue
      return [];
    }
    throw error;
  }
}

/**
 * User data result type for batch fetching
 */
export interface UserTweetData {
  username: string;
  x402Tweets: RapidApiTweet[];
  generalTweets: RapidApiTweet[];
  error?: string;
}

/**
 * Simple concurrency limiter for parallel operations
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

/**
 * Fetch user data (x402 tweets + timeline) for a single user
 * Internal helper function
 */
async function fetchUserData(
  username: string,
  maxPagesPerUser: number,
  maxTimelineTweets: number,
  delayMs: number
): Promise<UserTweetData> {
  try {
    // Fetch x402 tweets
    const x402Tweets = await searchUserX402Tweets(username, maxPagesPerUser, delayMs);

    // Add delay between API calls to avoid rate limits
    await delay(delayMs);

    // Fetch general timeline
    const generalTweets = await fetchUserTimeline(username, maxTimelineTweets);

    return {
      username,
      x402Tweets,
      generalTweets,
    };
  } catch (error) {
    logger.error(`Error fetching data for @${username}:`, error);
    return {
      username,
      x402Tweets: [],
      generalTweets: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch user data for multiple users in parallel with concurrency control
 * This is much faster than sequential fetching while respecting rate limits
 *
 * @param usernames Array of usernames to fetch data for
 * @param options Configuration options
 * @returns Array of user tweet data
 */
export async function fetchUserDataBatch(
  usernames: string[],
  options: {
    maxConcurrent?: number;
    maxPagesPerUser?: number;
    maxTimelineTweets?: number;
    delayMs?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<UserTweetData[]> {
  const {
    maxConcurrent = 3,
    maxPagesPerUser = config.search.maxPagesPerUser,
    maxTimelineTweets = config.search.maxTimelineTweets,
    delayMs = config.search.delayMs,
    onProgress,
  } = options;

  const limiter = new ConcurrencyLimiter(maxConcurrent);
  const results: UserTweetData[] = [];
  let completed = 0;

  logger.info(`Fetching data for ${usernames.length} users (concurrency: ${maxConcurrent})`);

  const fetchPromises = usernames.map(async (username) => {
    await limiter.acquire();
    try {
      const result = await fetchUserData(username, maxPagesPerUser, maxTimelineTweets, delayMs);
      completed++;
      if (onProgress) {
        onProgress(completed, usernames.length);
      }
      return result;
    } finally {
      limiter.release();
    }
  });

  const allResults = await Promise.all(fetchPromises);

  logger.info(`Completed fetching data for ${usernames.length} users`);

  return allResults;
}

/**
 * Fetch user data for multiple users with rate limiting and batching
 * Processes users in configurable batch sizes with delays between batches
 *
 * @param usernames Array of usernames to fetch data for
 * @param options Configuration options
 * @returns Array of user tweet data
 */
export async function fetchUserDataBatched(
  usernames: string[],
  options: {
    batchSize?: number;
    maxConcurrentPerBatch?: number;
    maxPagesPerUser?: number;
    maxTimelineTweets?: number;
    delayMs?: number;
    delayBetweenBatches?: number;
    onBatchComplete?: (batchNum: number, totalBatches: number, results: UserTweetData[]) => void;
  } = {}
): Promise<UserTweetData[]> {
  const {
    batchSize = 10,
    maxConcurrentPerBatch = 3,
    maxPagesPerUser = config.search.maxPagesPerUser,
    maxTimelineTweets = config.search.maxTimelineTweets,
    delayMs = config.search.delayMs,
    delayBetweenBatches = 5000,
    onBatchComplete,
  } = options;

  const allResults: UserTweetData[] = [];
  const totalBatches = Math.ceil(usernames.length / batchSize);

  logger.info(
    `Processing ${usernames.length} users in ${totalBatches} batches ` +
    `(batch size: ${batchSize}, concurrency: ${maxConcurrentPerBatch})`
  );

  for (let i = 0; i < usernames.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batchUsernames = usernames.slice(i, i + batchSize);

    logger.info(`Processing batch ${batchNum}/${totalBatches} (${batchUsernames.length} users)`);

    const batchResults = await fetchUserDataBatch(batchUsernames, {
      maxConcurrent: maxConcurrentPerBatch,
      maxPagesPerUser,
      maxTimelineTweets,
      delayMs,
    });

    allResults.push(...batchResults);

    if (onBatchComplete) {
      onBatchComplete(batchNum, totalBatches, batchResults);
    }

    // Add delay between batches to avoid overwhelming the API
    if (i + batchSize < usernames.length) {
      logger.info(`Waiting ${delayBetweenBatches}ms before next batch...`);
      await delay(delayBetweenBatches);
    }
  }

  logger.info(`Completed processing all ${usernames.length} users`);

  return allResults;
}
