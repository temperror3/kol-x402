import { TwitterApi, TwitterApiReadOnly, TweetV2, UserV2, TTweetv2TweetField, TTweetv2UserField } from 'twitter-api-v2';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let client: TwitterApi | null = null;

export function getTwitterClient(): TwitterApiReadOnly {
  if (!client) {
    client = new TwitterApi(config.twitter.bearerToken);
  }
  return client.readOnly;
}

// Tweet fields to request
export const TWEET_FIELDS: TTweetv2TweetField[] = [
  'id',
  'text',
  'author_id',
  'created_at',
  'public_metrics',
  'entities',
];

// User fields to request
export const USER_FIELDS: TTweetv2UserField[] = [
  'id',
  'username',
  'name',
  'description',
  'profile_image_url',
  'public_metrics',
  'created_at',
  'url',
  'entities',
];

// Rate limit handling with exponential backoff
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes('429') || error.message.includes('Rate limit'));

      if (isRateLimit && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

// Transform Twitter API user to our format
export function transformUser(user: UserV2): {
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
    twitter_id: user.id,
    username: user.username,
    display_name: user.name,
    bio: user.description || null,
    followers_count: user.public_metrics?.followers_count || 0,
    following_count: user.public_metrics?.following_count || 0,
    tweet_count: user.public_metrics?.tweet_count || 0,
    profile_image_url: user.profile_image_url || null,
  };
}

// Transform Twitter API tweet to our format
export function transformTweet(
  tweet: TweetV2,
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
  const codePatterns = /[{}();\[\]=>]|function\s|const\s|let\s|var\s|import\s|export\s|async\s|await\s/;
  const hasCode = codePatterns.test(content);

  // Check for GitHub links
  const hasGithub = /github\.com/i.test(content);

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

  return {
    twitter_id: tweet.id,
    account_id: accountId,
    content,
    likes: tweet.public_metrics?.like_count || 0,
    retweets: tweet.public_metrics?.retweet_count || 0,
    replies: tweet.public_metrics?.reply_count || 0,
    quotes: tweet.public_metrics?.quote_count || 0,
    created_at: tweet.created_at || new Date().toISOString(),
    has_code: hasCode,
    has_github: hasGithub,
    x402_keywords_found: x402Keywords,
  };
}
