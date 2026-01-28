import { OpenRouter } from '@openrouter/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { PromptBuilder } from '../utils/promptTemplates.js';
import type { Account, AICategoryResult, EnhancedAICategoryResult, RedFlag, SearchConfiguration } from '../types/index.js';
import type { RapidApiTweet } from '../collectors/rapidApiClient.js';

let openRouterClient: OpenRouter | null = null;

function getClient(): OpenRouter {
  if (!openRouterClient) {
    openRouterClient = new OpenRouter({
      apiKey: config.openRouter.apiKey,
    });
  }
  return openRouterClient;
}

// Hardcoded prompts removed - now using PromptBuilder for dynamic generation
// See src/utils/promptTemplates.ts

function formatTweets(tweets: RapidApiTweet[]): string {
  return tweets
    .map((tweet, index) => {
      const date = new Date(tweet.created_at).toLocaleDateString();
      const views = tweet.views ? parseInt(tweet.views, 10) : 0;
      return `---
Tweet ${index + 1} (${date}):
"${tweet.text}"
Views: ${views.toLocaleString()} | Likes: ${tweet.favorites} | Retweets: ${tweet.retweets} | Replies: ${tweet.replies} | Quotes: ${tweet.quotes} | Bookmarks: ${tweet.bookmarks}
---`;
    })
    .join('\n\n');
}

function calculateEngagementStats(tweets: RapidApiTweet[]): {
  totalViews: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  totalQuotes: number;
  totalBookmarks: number;
  avgEngagementRate: number;
} {
  let totalViews = 0;
  let totalLikes = 0;
  let totalRetweets = 0;
  let totalReplies = 0;
  let totalQuotes = 0;
  let totalBookmarks = 0;

  for (const tweet of tweets) {
    const views = tweet.views ? parseInt(tweet.views, 10) : 0;
    totalViews += views;
    totalLikes += tweet.favorites || 0;
    totalRetweets += tweet.retweets || 0;
    totalReplies += tweet.replies || 0;
    totalQuotes += tweet.quotes || 0;
    totalBookmarks += tweet.bookmarks || 0;
  }

  // Calculate average engagement rate (engagements / views * 100)
  const totalEngagements = totalLikes + totalRetweets + totalReplies + totalQuotes;
  const avgEngagementRate = totalViews > 0 ? (totalEngagements / totalViews) * 100 : 0;

  return {
    totalViews,
    totalLikes,
    totalRetweets,
    totalReplies,
    totalQuotes,
    totalBookmarks,
    avgEngagementRate,
  };
}

function buildUserPrompt(account: Account, tweets: RapidApiTweet[]): string {
  const tweetsFormatted = formatTweets(tweets);
  const stats = calculateEngagementStats(tweets);

  return `Analyze this Twitter user's x402-related activity:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}
**Followers:** ${account.followers_count.toLocaleString()}
**Following:** ${account.following_count.toLocaleString()}

**Engagement Summary for x402 tweets:**
- Total Tweets: ${tweets.length}
- Total Views: ${stats.totalViews.toLocaleString()}
- Total Likes: ${stats.totalLikes.toLocaleString()}
- Total Retweets: ${stats.totalRetweets.toLocaleString()}
- Total Replies: ${stats.totalReplies.toLocaleString()}
- Total Quotes: ${stats.totalQuotes.toLocaleString()}
- Total Bookmarks: ${stats.totalBookmarks.toLocaleString()}
- Average Engagement Rate: ${stats.avgEngagementRate.toFixed(2)}%

**Their x402-related tweets:**

${tweetsFormatted}

Based on these tweets and engagement metrics, categorize this user.`;
}

function parseAIResponse(content: string): AICategoryResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate the response
    // Note: DEVELOPER and ACTIVE_USER commented out - focusing on KOL only for now
    const validCategories = ['KOL', /* 'DEVELOPER', 'ACTIVE_USER', */ 'UNCATEGORIZED'];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = 'UNCATEGORIZED';
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5;
    }

    if (typeof parsed.reasoning !== 'string') {
      parsed.reasoning = 'No reasoning provided';
    }

    return {
      category: parsed.category,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    logger.error('Failed to parse AI response:', error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'Failed to parse AI response',
    };
  }
}

/**
 * Categorize a user based on their topic-related tweets using AI
 */
export async function categorizeUserWithAI(
  account: Account,
  tweets: RapidApiTweet[],
  searchConfig: SearchConfiguration
): Promise<AICategoryResult> {
  const client = getClient();

  // If no tweets, return uncategorized
  if (tweets.length === 0) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `No ${searchConfig.name}-related tweets found for this user`,
    };
  }

  // Use PromptBuilder for dynamic prompts
  const systemPrompt = PromptBuilder.buildPrimarySystemPrompt(searchConfig);
  const userPrompt = PromptBuilder.buildUserPrompt(account, tweets, searchConfig);

  try {
    logger.info(`Categorizing @${account.username} for ${searchConfig.name} with AI (${tweets.length} tweets)`);

    // Use streaming to get the response
    const stream = await client.chat.send({
      model: config.openRouter.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    let response = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        response += content;
      }
    }

    const result = parseAIResponse(response);

    logger.info(
      `AI categorized @${account.username} as ${result.category} (confidence: ${result.confidence})`
    );

    return result;
  } catch (error) {
    logger.error(`Error categorizing @${account.username} with AI:`, error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Format tweets for enhanced analysis (with truncation to save tokens)
 */
function formatTweetsEnhanced(tweets: RapidApiTweet[] | null | undefined, maxCharsPerTweet: number = 200): string {
  if (!tweets || tweets.length === 0) {
    return '';
  }
  return tweets
    .map((tweet, index) => {
      const date = new Date(tweet.created_at).toLocaleDateString();
      // Truncate tweet text to save tokens
      const text = (tweet.text || '').length > maxCharsPerTweet
        ? (tweet.text || '').substring(0, maxCharsPerTweet) + '...'
        : (tweet.text || '');
      return `${index + 1}. [${date}] "${text}"`;
    })
    .join('\n');
}

/**
 * Build enhanced user prompt with both x402 and general timeline tweets
 */
function buildEnhancedUserPrompt(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): string {
  const x402Formatted = formatTweetsEnhanced(x402Tweets);
  const generalFormatted = formatTweetsEnhanced(generalTweets);

  return `Analyze this Twitter user's content quality for crypto/payments thought leadership:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}

---
**x402-RELATED TWEETS (${x402Tweets.length} tweets):**
${x402Formatted || 'No x402 tweets found'}

---
**GENERAL TIMELINE (${generalTweets.length} recent tweets):**
${generalFormatted || 'No timeline tweets available'}

---
Based on the CONTENT QUALITY (not engagement metrics), evaluate this user's quality scores and category.`;
}

/**
 * Build prompt for secondary categorization (developer vs active user)
 */
function buildSecondaryUserPrompt(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): string {
  const x402Formatted = formatTweetsEnhanced(x402Tweets);
  const generalFormatted = formatTweetsEnhanced(generalTweets);

  return `Analyze this user's activity to classify them as DEVELOPER, ACTIVE_USER, or UNCATEGORIZED:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}
**Followers:** ${account.followers_count.toLocaleString()}
**Following:** ${account.following_count.toLocaleString()}
**Has GitHub in bio:** ${account.has_github ? 'Yes' : 'No'}

---
**x402-RELATED TWEETS (${x402Tweets.length} tweets):**
${x402Formatted || 'No x402 tweets found'}

---
**GENERAL TIMELINE (${generalTweets.length} recent tweets):**
${generalFormatted || 'No timeline tweets available'}

---
Use the evidence above to choose the best category.`;
}

/**
 * Parse enhanced AI response with quality scores and red flags
 */
function parseEnhancedAIResponse(content: string): EnhancedAICategoryResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate category
    const validCategories = ['KOL', 'UNCATEGORIZED'];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = 'UNCATEGORIZED';
    }

    // Validate confidence
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5;
    }

    // Validate reasoning
    if (typeof parsed.reasoning !== 'string') {
      parsed.reasoning = 'No reasoning provided';
    }

    // Validate quality scores (default to 0 if missing/invalid)
    const validateScore = (score: unknown): number => {
      if (typeof score !== 'number' || score < 0 || score > 1) return 0;
      return score;
    };

    const topicConsistencyScore = validateScore(parsed.topicConsistencyScore);
    const contentDepthScore = validateScore(parsed.contentDepthScore);
    const topicFocusScore = validateScore(parsed.topicFocusScore);

    // Validate red flags
    const redFlags: RedFlag[] = [];
    if (Array.isArray(parsed.redFlags)) {
      for (const flag of parsed.redFlags) {
        if (
          flag &&
          typeof flag.type === 'string' &&
          typeof flag.description === 'string' &&
          ['low', 'medium', 'high'].includes(flag.severity)
        ) {
          redFlags.push({
            type: flag.type,
            description: flag.description,
            severity: flag.severity,
          });
        }
      }
    }

    // Validate primary topics
    const primaryTopics: string[] = [];
    if (Array.isArray(parsed.primaryTopics)) {
      for (const topic of parsed.primaryTopics) {
        if (typeof topic === 'string') {
          primaryTopics.push(topic);
        }
      }
    }

    return {
      category: parsed.category,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      topicConsistencyScore,
      contentDepthScore,
      topicFocusScore,
      redFlags,
      primaryTopics,
    };
  } catch (error) {
    logger.error('Failed to parse enhanced AI response:', error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'Failed to parse AI response',
      topicConsistencyScore: 0,
      contentDepthScore: 0,
      topicFocusScore: 0,
      redFlags: [],
      primaryTopics: [],
    };
  }
}

/**
 * Parse AI response for secondary categorization (developer vs active user)
 */
function parseSecondaryAIResponse(content: string): AICategoryResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const validCategories = ['DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED'];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = 'UNCATEGORIZED';
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5;
    }

    if (typeof parsed.reasoning !== 'string') {
      parsed.reasoning = 'No reasoning provided';
    }

    return {
      category: parsed.category,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    logger.error('Failed to parse secondary AI response:', error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'Failed to parse AI response',
    };
  }
}

/**
 * Enhanced user categorization based on content quality
 * Uses both x402 tweets and general timeline for holistic analysis
 */
export async function categorizeUserEnhanced(
  account: Account,
  topicTweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[],
  searchConfig: SearchConfiguration
): Promise<EnhancedAICategoryResult> {
  const client = getClient();

  // If no tweets at all, return uncategorized
  if (topicTweets.length === 0 && generalTweets.length === 0) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'No tweets available for analysis',
      topicConsistencyScore: 0,
      contentDepthScore: 0,
      topicFocusScore: 0,
      redFlags: [],
      primaryTopics: [],
    };
  }

  // Use PromptBuilder to generate prompts dynamically based on configuration
  const systemPrompt = PromptBuilder.buildEnhancedSystemPrompt(searchConfig);
  const userPrompt = PromptBuilder.buildUserPrompt(
    account,
    [...topicTweets, ...generalTweets],
    searchConfig
  );

  try {
    logger.info(
      `Enhanced categorizing @${account.username} for ${searchConfig.name} (${topicTweets.length} topic tweets, ${generalTweets.length} timeline tweets)`
    );

    // Use streaming to get the response
    const stream = await client.chat.send({
      model: config.openRouter.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    let response = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        response += content;
      }
    }

    const result = parseEnhancedAIResponse(response);

    logger.info(
      `Enhanced AI categorized @${account.username} as ${result.category} ` +
      `(topic: ${result.topicConsistencyScore.toFixed(2)}, depth: ${result.contentDepthScore.toFixed(2)}, focus: ${result.topicFocusScore.toFixed(2)})`
    );

    if (result.redFlags.length > 0) {
      logger.info(`  Red flags: ${result.redFlags.map((f) => f.type).join(', ')}`);
    }

    return result;
  } catch (error) {
    logger.error(`Error enhanced categorizing @${account.username} with AI:`, error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      topicConsistencyScore: 0,
      contentDepthScore: 0,
      topicFocusScore: 0,
      redFlags: [],
      primaryTopics: [],
    };
  }
}

/**
 * Secondary categorization for previously-uncategorized accounts
 * Determines DEVELOPER vs ACTIVE_USER vs UNCATEGORIZED
 */
export async function categorizeUserForSecondaryCategories(
  account: Account,
  topicTweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[],
  searchConfig: SearchConfiguration
): Promise<AICategoryResult> {
  const client = getClient();

  if (topicTweets.length === 0 && generalTweets.length === 0) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'No tweets available for analysis',
    };
  }

  // Use PromptBuilder for dynamic secondary categorization prompts
  const systemPrompt = PromptBuilder.buildSecondarySystemPrompt(searchConfig);
  const userPrompt = PromptBuilder.buildUserPrompt(
    account,
    [...topicTweets, ...generalTweets],
    searchConfig
  );

  try {
    logger.info(
      `Secondary categorizing @${account.username} for ${searchConfig.name} (${topicTweets.length} topic tweets, ${generalTweets.length} timeline tweets)`
    );

    const stream = await client.chat.send({
      model: config.openRouter.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    let response = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        response += content;
      }
    }

    const result = parseSecondaryAIResponse(response);

    logger.info(
      `Secondary AI categorized @${account.username} as ${result.category} (confidence: ${result.confidence})`
    );

    return result;
  } catch (error) {
    logger.error(`Error secondary categorizing @${account.username} with AI:`, error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Batch categorization input type
 */
export interface BatchCategorizationInput {
  account: Account;
  x402Tweets: RapidApiTweet[];
  generalTweets: RapidApiTweet[];
}

/**
 * Batch categorization result type
 */
export interface BatchCategorizationResult {
  account: Account;
  result: EnhancedAICategoryResult;
  error?: string;
}

/**
 * Secondary batch categorization result type
 */
export interface SecondaryBatchCategorizationResult {
  account: Account;
  result: AICategoryResult;
  error?: string;
}

// TODO: Update batch functions to use PromptBuilder.buildBatchSecondarySystemPrompt(searchConfig)
// For now, keeping legacy batch categorization - needs refactoring to accept SearchConfiguration

/**
 * Build batch user prompt for secondary categorization
 */
function buildBatchSecondaryUserPrompt(inputs: BatchCategorizationInput[]): string {
  const usersData = inputs.map((input, index) => {
    const { account, x402Tweets, generalTweets } = input;
    const x402Formatted = formatTweetsEnhanced(x402Tweets);
    const generalFormatted = formatTweetsEnhanced(generalTweets);

    return `
=== USER ${index + 1}: @${account.username} ===
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}
**Followers:** ${account.followers_count?.toLocaleString() || 0}
**Has GitHub in bio:** ${account.has_github ? 'Yes' : 'No'}

**x402-RELATED TWEETS (${x402Tweets?.length || 0} tweets):**
${x402Formatted || 'No x402 tweets found'}

**GENERAL TIMELINE (${generalTweets?.length || 0} recent tweets):**
${generalFormatted || 'No timeline tweets available'}
`;
  });

  return `Analyze the following ${inputs.length} Twitter users to classify them as DEVELOPER, ACTIVE_USER, or UNCATEGORIZED. Return a JSON array with analysis for each user.

${usersData.join('\n---\n')}

Use the evidence above to choose the best category for each user. Return exactly ${inputs.length} results in the same order.`;
}

/**
 * Parse batch secondary AI response
 */
function parseBatchSecondaryAIResponse(content: string): Map<string, AICategoryResult> {
  const results = new Map<string, AICategoryResult>();

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    for (const item of parsed) {
      const username = (item.username || '').replace('@', '').toLowerCase();

      const validCategories = ['DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED'];
      let category = validCategories.includes(item.category) ? item.category : 'UNCATEGORIZED';

      let confidence = 0.5;
      if (typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1) {
        confidence = item.confidence;
      }

      const reasoning = typeof item.reasoning === 'string' ? item.reasoning : 'No reasoning provided';

      results.set(username, {
        category,
        confidence,
        reasoning,
      });
    }
  } catch (error) {
    logger.error('Failed to parse batch secondary AI response:', error);
  }

  return results;
}

/**
 * Process a single secondary batch with retry logic
 */
async function processSecondaryBatchWithRetry(
  client: OpenRouter,
  usersWithTweets: BatchCategorizationInput[],
  searchConfig: SearchConfiguration,
  batchNumber: number,
  maxRetries: number = 5,
  retryDelay: number = 2000
): Promise<SecondaryBatchCategorizationResult[]> {
  const results: SecondaryBatchCategorizationResult[] = [];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Secondary batch categorizing ${usersWithTweets.length} users for ${searchConfig.name} (batch ${batchNumber})${attempt > 1 ? ` - Retry ${attempt}/${maxRetries}` : ''}`);

      const userPrompt = buildBatchSecondaryUserPrompt(usersWithTweets);

      // Use PromptBuilder for dynamic batch prompts
      const systemPrompt = PromptBuilder.buildBatchSecondarySystemPrompt(searchConfig);

      const stream = await client.chat.send({
        model: config.openRouter.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        streamOptions: {
          includeUsage: true,
        },
      });

      let response = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          response += content;
        }
      }

      const parsedResults = parseBatchSecondaryAIResponse(response);

      let allParsedSuccessfully = true;
      const batchResults: SecondaryBatchCategorizationResult[] = [];

      for (const input of usersWithTweets) {
        const username = input.account.username.toLowerCase();
        const result = parsedResults.get(username);

        if (result) {
          batchResults.push({
            account: input.account,
            result,
          });
          logger.info(
            `Secondary batch AI categorized @${input.account.username} as ${result.category} (confidence: ${result.confidence.toFixed(2)})`
          );
        } else {
          allParsedSuccessfully = false;
          logger.warn(`No result found for @${input.account.username} in secondary batch response`);
        }
      }

      if (allParsedSuccessfully) {
        return batchResults;
      }

      if (attempt === maxRetries) {
        logger.warn(`Some users missing from secondary AI response after ${maxRetries} attempts, using fallbacks`);
        for (const input of usersWithTweets) {
          const username = input.account.username.toLowerCase();
          const result = parsedResults.get(username);

          if (result) {
            results.push({
              account: input.account,
              result,
            });
          } else {
            results.push({
              account: input.account,
              result: {
                category: 'UNCATEGORIZED',
                confidence: 0,
                reasoning: 'Failed to parse batch AI response for this user after retries',
              },
              error: 'Result not found in batch response after retries',
            });
          }
        }
        return results;
      }

      logger.info(`Retrying secondary batch ${batchNumber} due to incomplete results...`);
      await delay(retryDelay * attempt);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error in secondary batch ${batchNumber} (attempt ${attempt}/${maxRetries}):`, lastError.message);

      if (attempt < maxRetries) {
        logger.info(`Retrying secondary batch ${batchNumber} in ${retryDelay * attempt}ms...`);
        await delay(retryDelay * attempt);
      }
    }
  }

  logger.error(`Secondary batch ${batchNumber} failed after ${maxRetries} attempts`);
  for (const input of usersWithTweets) {
    results.push({
      account: input.account,
      result: {
        category: 'UNCATEGORIZED',
        confidence: 0,
        reasoning: `AI categorization failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`,
      },
      error: lastError?.message || 'Unknown error',
    });
  }

  return results;
}

/**
 * Batch categorize multiple users for secondary categories (DEVELOPER, ACTIVE_USER, UNCATEGORIZED)
 * Includes retry logic for failed batches
 *
 * @param inputs Array of accounts with their tweets
 * @param searchConfig Search configuration for dynamic prompts
 * @param maxBatchSize Maximum number of users to process in a single AI request (default: 5)
 * @param maxRetries Maximum number of retries for failed batches (default: 3)
 * @param retryDelay Base delay between retries in ms (default: 2000)
 * @returns Array of categorization results
 */
export async function categorizeUsersSecondaryBatch(
  inputs: BatchCategorizationInput[],
  searchConfig: SearchConfiguration,
  maxBatchSize: number = 5,
  maxRetries: number = config.batch.aiRetryCount,
  retryDelay: number = config.batch.aiRetryDelay
): Promise<SecondaryBatchCategorizationResult[]> {
  const client = getClient();
  const allResults: SecondaryBatchCategorizationResult[] = [];

  for (let i = 0; i < inputs.length; i += maxBatchSize) {
    const batch = inputs.slice(i, i + maxBatchSize);
    const batchNumber = Math.floor(i / maxBatchSize) + 1;

    const usersWithTweets: BatchCategorizationInput[] = [];
    const usersWithoutTweets: BatchCategorizationInput[] = [];

    for (const input of batch) {
      const x402Tweets = input.x402Tweets || [];
      const generalTweets = input.generalTweets || [];
      if (x402Tweets.length === 0 && generalTweets.length === 0) {
        usersWithoutTweets.push(input);
      } else {
        usersWithTweets.push(input);
      }
    }

    for (const input of usersWithoutTweets) {
      allResults.push({
        account: input.account,
        result: {
          category: 'UNCATEGORIZED',
          confidence: 0,
          reasoning: 'No tweets available for analysis',
        },
      });
    }

    if (usersWithTweets.length === 0) {
      continue;
    }

    const batchResults = await processSecondaryBatchWithRetry(
      client,
      usersWithTweets,
      searchConfig,
      batchNumber,
      maxRetries,
      retryDelay
    );

    allResults.push(...batchResults);
  }

  return allResults;
}

// TODO: Update primary batch functions to use PromptBuilder.buildBatchSystemPrompt(searchConfig)
// For now keeping legacy - needs refactoring to accept SearchConfiguration

/**
 * Build batch user prompt for multiple users
 */
function buildBatchUserPrompt(inputs: BatchCategorizationInput[]): string {
  const usersData = inputs.map((input, index) => {
    const { account, x402Tweets, generalTweets } = input;
    const x402Formatted = formatTweetsEnhanced(x402Tweets);
    const generalFormatted = formatTweetsEnhanced(generalTweets);

    return `
=== USER ${index + 1}: @${account.username} ===
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}

**x402-RELATED TWEETS (${x402Tweets.length} tweets):**
${x402Formatted || 'No x402 tweets found'}

**GENERAL TIMELINE (${generalTweets.length} recent tweets):**
${generalFormatted || 'No timeline tweets available'}
`;
  });

  return `Analyze the following ${inputs.length} Twitter users for crypto/payments thought leadership. Return a JSON array with analysis for each user.

${usersData.join('\n---\n')}

Based on the CONTENT QUALITY (not engagement metrics), evaluate each user's quality scores and category. Return exactly ${inputs.length} results in the same order.`;
}

/**
 * Parse batch AI response
 */
function parseBatchAIResponse(content: string, inputs: BatchCategorizationInput[]): Map<string, EnhancedAICategoryResult> {
  const results = new Map<string, EnhancedAICategoryResult>();

  try {
    // Try to extract JSON array from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    for (const item of parsed) {
      // Extract username (remove @ if present)
      const username = (item.username || '').replace('@', '').toLowerCase();

      // Validate category
      const validCategories = ['KOL', 'UNCATEGORIZED'];
      let category = validCategories.includes(item.category) ? item.category : 'UNCATEGORIZED';

      // Validate confidence
      let confidence = 0.5;
      if (typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1) {
        confidence = item.confidence;
      }

      // Validate reasoning
      const reasoning = typeof item.reasoning === 'string' ? item.reasoning : 'No reasoning provided';

      // Validate quality scores
      const validateScore = (score: unknown): number => {
        if (typeof score !== 'number' || score < 0 || score > 1) return 0;
        return score;
      };

      const topicConsistencyScore = validateScore(item.topicConsistencyScore);
      const contentDepthScore = validateScore(item.contentDepthScore);
      const topicFocusScore = validateScore(item.topicFocusScore);

      // Validate red flags
      const redFlags: RedFlag[] = [];
      if (Array.isArray(item.redFlags)) {
        for (const flag of item.redFlags) {
          if (
            flag &&
            typeof flag.type === 'string' &&
            typeof flag.description === 'string' &&
            ['low', 'medium', 'high'].includes(flag.severity)
          ) {
            redFlags.push({
              type: flag.type,
              description: flag.description,
              severity: flag.severity,
            });
          }
        }
      }

      // Validate primary topics
      const primaryTopics: string[] = [];
      if (Array.isArray(item.primaryTopics)) {
        for (const topic of item.primaryTopics) {
          if (typeof topic === 'string') {
            primaryTopics.push(topic);
          }
        }
      }

      results.set(username, {
        category,
        confidence,
        reasoning,
        topicConsistencyScore,
        contentDepthScore,
        topicFocusScore,
        redFlags,
        primaryTopics,
      });
    }
  } catch (error) {
    logger.error('Failed to parse batch AI response:', error);
  }

  return results;
}

/**
 * Helper function to delay execution
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process a single batch of users with retry logic
 */
async function processBatchWithRetry(
  client: OpenRouter,
  usersWithTweets: BatchCategorizationInput[],
  searchConfig: SearchConfiguration,
  batchNumber: number,
  maxRetries: number = 5,
  retryDelay: number = 2000
): Promise<BatchCategorizationResult[]> {
  const results: BatchCategorizationResult[] = [];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Batch categorizing ${usersWithTweets.length} users for ${searchConfig.name} (batch ${batchNumber})${attempt > 1 ? ` - Retry ${attempt}/${maxRetries}` : ''}`);

      const userPrompt = buildBatchUserPrompt(usersWithTweets);

      // Use PromptBuilder for dynamic batch prompts
      const systemPrompt = PromptBuilder.buildBatchSystemPrompt(searchConfig);

      const stream = await client.chat.send({
        model: config.openRouter.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        streamOptions: {
          includeUsage: true,
        },
      });

      let response = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          response += content;
        }
      }

      const parsedResults = parseBatchAIResponse(response, usersWithTweets);

      // Check if we got valid results for all users
      let allParsedSuccessfully = true;
      const batchResults: BatchCategorizationResult[] = [];

      for (const input of usersWithTweets) {
        const username = input.account.username.toLowerCase();
        const result = parsedResults.get(username);

        if (result) {
          batchResults.push({
            account: input.account,
            result,
          });
          logger.info(
            `Batch AI categorized @${input.account.username} as ${result.category} ` +
            `(topic: ${result.topicConsistencyScore.toFixed(2)}, depth: ${result.contentDepthScore.toFixed(2)}, focus: ${result.topicFocusScore.toFixed(2)})`
          );
        } else {
          // Result not found for this user - might need retry
          allParsedSuccessfully = false;
          logger.warn(`No result found for @${input.account.username} in batch response`);
        }
      }

      // If all users were parsed successfully, return results
      if (allParsedSuccessfully) {
        return batchResults;
      }

      // If some users were missing but we have partial results, and this is the last attempt
      // return what we have with fallbacks for missing ones
      if (attempt === maxRetries) {
        logger.warn(`Some users missing from AI response after ${maxRetries} attempts, using fallbacks`);
        for (const input of usersWithTweets) {
          const username = input.account.username.toLowerCase();
          const result = parsedResults.get(username);

          if (result) {
            results.push({
              account: input.account,
              result,
            });
          } else {
            results.push({
              account: input.account,
              result: {
                category: 'UNCATEGORIZED',
                confidence: 0,
                reasoning: 'Failed to parse batch AI response for this user after retries',
                topicConsistencyScore: 0,
                contentDepthScore: 0,
                topicFocusScore: 0,
                redFlags: [],
                primaryTopics: [],
              },
              error: 'Result not found in batch response after retries',
            });
          }
        }
        return results;
      }

      // Otherwise, retry with delay
      logger.info(`Retrying batch ${batchNumber} due to incomplete results...`);
      await delay(retryDelay * attempt); // Exponential backoff

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error in batch ${batchNumber} (attempt ${attempt}/${maxRetries}):`, lastError.message);

      if (attempt < maxRetries) {
        logger.info(`Retrying batch ${batchNumber} in ${retryDelay * attempt}ms...`);
        await delay(retryDelay * attempt); // Exponential backoff
      }
    }
  }

  // All retries failed - return error results
  logger.error(`Batch ${batchNumber} failed after ${maxRetries} attempts`);
  for (const input of usersWithTweets) {
    results.push({
      account: input.account,
      result: {
        category: 'UNCATEGORIZED',
        confidence: 0,
        reasoning: `AI categorization failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`,
        topicConsistencyScore: 0,
        contentDepthScore: 0,
        topicFocusScore: 0,
        redFlags: [],
        primaryTopics: [],
      },
      error: lastError?.message || 'Unknown error',
    });
  }

  return results;
}

/**
 * Batch categorize multiple users in a single AI request
 * This is more efficient than calling categorizeUserEnhanced for each user
 * Includes retry logic for failed batches
 *
 * @param inputs Array of accounts with their tweets
 * @param maxBatchSize Maximum number of users to process in a single AI request (default: 5)
 * @param maxRetries Maximum number of retries for failed batches (default: 3)
 * @param retryDelay Base delay between retries in ms (default: 2000)
 * @returns Array of categorization results
 */
export async function categorizeUsersBatch(
  inputs: BatchCategorizationInput[],
  searchConfig: SearchConfiguration,
  maxBatchSize: number = 5,
  maxRetries: number = config.batch.aiRetryCount,
  retryDelay: number = config.batch.aiRetryDelay
): Promise<BatchCategorizationResult[]> {
  const client = getClient();
  const allResults: BatchCategorizationResult[] = [];

  // Process in batches
  for (let i = 0; i < inputs.length; i += maxBatchSize) {
    const batch = inputs.slice(i, i + maxBatchSize);
    const batchNumber = Math.floor(i / maxBatchSize) + 1;

    // Filter out users with no tweets - they get auto-uncategorized
    const usersWithTweets: BatchCategorizationInput[] = [];
    const usersWithoutTweets: BatchCategorizationInput[] = [];

    for (const input of batch) {
      const x402Tweets = input.x402Tweets || [];
      const generalTweets = input.generalTweets || [];
      if (x402Tweets.length === 0 && generalTweets.length === 0) {
        usersWithoutTweets.push(input);
      } else {
        usersWithTweets.push(input);
      }
    }

    // Add uncategorized results for users without tweets
    for (const input of usersWithoutTweets) {
      allResults.push({
        account: input.account,
        result: {
          category: 'UNCATEGORIZED',
          confidence: 0,
          reasoning: 'No tweets available for analysis',
          topicConsistencyScore: 0,
          contentDepthScore: 0,
          topicFocusScore: 0,
          redFlags: [],
          primaryTopics: [],
        },
      });
    }

    // Skip AI call if no users have tweets
    if (usersWithTweets.length === 0) {
      continue;
    }

    // Process batch with retry logic
    const batchResults = await processBatchWithRetry(
      client,
      usersWithTweets,
      searchConfig,
      batchNumber,
      maxRetries,
      retryDelay
    );

    allResults.push(...batchResults);
  }

  return allResults;
}
