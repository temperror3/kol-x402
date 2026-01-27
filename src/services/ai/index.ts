/**
 * Unified AI Service - provides backward-compatible exports with multi-provider support
 */

import { getProviderManager, ProviderManager } from './providerManager.js';
import { MistralProvider } from './providers/mistralProvider.js';
import { CerebrasProvider } from './providers/cerebrasProvider.js';
import { OpenRouterProvider } from './providers/openRouterProvider.js';
import type { AIMessage } from './providers/types.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { Account, AICategoryResult, EnhancedAICategoryResult } from '../../types/index.js';
import type { RapidApiTweet } from '../../collectors/rapidApiClient.js';

import {
  SYSTEM_PROMPT,
  ENHANCED_SYSTEM_PROMPT,
  SECONDARY_SYSTEM_PROMPT,
  BATCH_SYSTEM_PROMPT,
  BATCH_SECONDARY_SYSTEM_PROMPT,
  buildUserPrompt,
  buildEnhancedUserPrompt,
  buildSecondaryUserPrompt,
  buildBatchUserPrompt,
  buildBatchSecondaryUserPrompt,
  parseAIResponse,
  parseEnhancedAIResponse,
  parseSecondaryAIResponse,
  parseBatchAIResponse,
  parseBatchSecondaryAIResponse,
  type BatchCategorizationInput,
  type BatchCategorizationResult,
  type SecondaryBatchCategorizationResult,
} from './prompts.js';

// Re-export types
export type { BatchCategorizationInput, BatchCategorizationResult, SecondaryBatchCategorizationResult };

// Track if providers have been initialized
let providersInitialized = false;

/**
 * Initialize providers based on available API keys
 */
function initializeProviders(): ProviderManager {
  const manager = getProviderManager();

  if (providersInitialized) {
    return manager;
  }

  // Register providers based on available API keys
  // Order matters - first registered providers are tried first within their priority
  if (config.mistral?.apiKey) {
    manager.registerProvider('mistral', new MistralProvider());
  }

  if (config.cerebras?.apiKey) {
    manager.registerProvider('cerebras', new CerebrasProvider());
  }

  if (config.openRouter?.apiKey) {
    manager.registerProvider('openrouter', new OpenRouterProvider());
  }

  providersInitialized = true;
  logger.info('AI providers initialized', { status: manager.getStatus() });

  return manager;
}

/**
 * Helper to make AI completion request
 */
async function makeAIRequest(systemPrompt: string, userPrompt: string): Promise<string> {
  const manager = initializeProviders();

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await manager.complete({ messages });
  return response.content;
}

// ============================================================================
// BACKWARD-COMPATIBLE EXPORTS
// ============================================================================

/**
 * Categorize a user based on their x402 tweets using AI
 */
export async function categorizeUserWithAI(
  account: Account,
  tweets: RapidApiTweet[]
): Promise<AICategoryResult> {
  // If no tweets, return uncategorized
  if (tweets.length === 0) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'No x402-related tweets found for this user',
    };
  }

  const userPrompt = buildUserPrompt(account, tweets);

  try {
    logger.info(`Categorizing @${account.username} with AI (${tweets.length} tweets)`);

    const response = await makeAIRequest(SYSTEM_PROMPT, userPrompt);
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
 * Enhanced user categorization based on content quality
 * Uses both x402 tweets and general timeline for holistic analysis
 */
export async function categorizeUserEnhanced(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): Promise<EnhancedAICategoryResult> {
  // If no tweets at all, return uncategorized
  if (x402Tweets.length === 0 && generalTweets.length === 0) {
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

  const userPrompt = buildEnhancedUserPrompt(account, x402Tweets, generalTweets);

  try {
    logger.info(
      `Enhanced categorizing @${account.username} (${x402Tweets.length} x402 tweets, ${generalTweets.length} timeline tweets)`
    );

    const response = await makeAIRequest(ENHANCED_SYSTEM_PROMPT, userPrompt);
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
    logger.error(`Error in enhanced categorization for @${account.username}:`, error);
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
 * Secondary categorization for non-KOL accounts
 * Classifies as DEVELOPER, ACTIVE_USER, or UNCATEGORIZED
 */
export async function categorizeUserForSecondaryCategories(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): Promise<AICategoryResult> {
  // If no tweets at all, return uncategorized
  if ((!x402Tweets || x402Tweets.length === 0) && (!generalTweets || generalTweets.length === 0)) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'No tweets available for secondary analysis',
    };
  }

  const userPrompt = buildSecondaryUserPrompt(account, x402Tweets, generalTweets);

  try {
    logger.info(
      `Secondary categorizing @${account.username} (${x402Tweets?.length || 0} x402 tweets, ${generalTweets?.length || 0} timeline tweets)`
    );

    const response = await makeAIRequest(SECONDARY_SYSTEM_PROMPT, userPrompt);
    const result = parseSecondaryAIResponse(response);

    logger.info(
      `Secondary AI categorized @${account.username} as ${result.category} (confidence: ${result.confidence.toFixed(2)})`
    );

    return result;
  } catch (error) {
    logger.error(`Error in secondary categorization for @${account.username}:`, error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Batch categorization for multiple users
 */
export async function categorizeUsersBatch(
  inputs: BatchCategorizationInput[],
  maxBatchSize: number = config.batch.aiCategorizationBatchSize,
  maxRetries: number = config.batch.aiRetryCount,
  retryDelay: number = config.batch.aiRetryDelay
): Promise<BatchCategorizationResult[]> {
  const allResults: BatchCategorizationResult[] = [];

  // Filter out users with no tweets
  const usersWithTweets = inputs.filter(
    (input) => input.x402Tweets.length > 0 || input.generalTweets.length > 0
  );

  // Add results for users with no tweets
  for (const input of inputs) {
    if (input.x402Tweets.length === 0 && input.generalTweets.length === 0) {
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
  }

  // Process in batches
  for (let i = 0; i < usersWithTweets.length; i += maxBatchSize) {
    const batch = usersWithTweets.slice(i, i + maxBatchSize);
    const batchNumber = Math.floor(i / maxBatchSize) + 1;

    const batchResults = await processBatchWithRetry(batch, batchNumber, maxRetries, retryDelay);
    allResults.push(...batchResults);
  }

  return allResults;
}

/**
 * Process a single batch with retry logic
 */
async function processBatchWithRetry(
  usersWithTweets: BatchCategorizationInput[],
  batchNumber: number,
  maxRetries: number,
  retryDelay: number
): Promise<BatchCategorizationResult[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `Batch categorizing ${usersWithTweets.length} users (batch ${batchNumber})${attempt > 1 ? ` - Retry ${attempt}/${maxRetries}` : ''}`
      );

      const userPrompt = buildBatchUserPrompt(usersWithTweets);
      const response = await makeAIRequest(BATCH_SYSTEM_PROMPT, userPrompt);
      const parsedResults = parseBatchAIResponse(response);

      const batchResults: BatchCategorizationResult[] = [];
      let allParsedSuccessfully = true;

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
              `(topic: ${result.topicConsistencyScore.toFixed(2)}, depth: ${result.contentDepthScore.toFixed(2)})`
          );
        } else {
          allParsedSuccessfully = false;
          logger.warn(`No result found for @${input.account.username} in batch response`);
        }
      }

      if (allParsedSuccessfully) {
        return batchResults;
      }

      // On final attempt, return partial results with fallbacks
      if (attempt === maxRetries) {
        logger.warn(`Some users missing from AI response after ${maxRetries} attempts, using fallbacks`);
        for (const input of usersWithTweets) {
          const username = input.account.username.toLowerCase();
          if (!parsedResults.has(username)) {
            batchResults.push({
              account: input.account,
              result: {
                category: 'UNCATEGORIZED',
                confidence: 0,
                reasoning: 'Failed to get AI categorization result',
                topicConsistencyScore: 0,
                contentDepthScore: 0,
                topicFocusScore: 0,
                redFlags: [],
                primaryTopics: [],
              },
              error: 'Missing from batch response',
            });
          }
        }
        return batchResults;
      }

      // Wait before retry
      await delay(retryDelay * attempt);
    } catch (error) {
      logger.error(`Error in batch ${batchNumber} (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt === maxRetries) {
        // Return fallback results for all users
        return usersWithTweets.map((input) => ({
          account: input.account,
          result: {
            category: 'UNCATEGORIZED' as const,
            confidence: 0,
            reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            topicConsistencyScore: 0,
            contentDepthScore: 0,
            topicFocusScore: 0,
            redFlags: [],
            primaryTopics: [],
          },
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }

      await delay(retryDelay * attempt);
    }
  }

  // Should not reach here, but TypeScript needs a return
  return [];
}

/**
 * Batch secondary categorization for multiple users
 */
export async function categorizeUsersSecondaryBatch(
  inputs: BatchCategorizationInput[],
  maxBatchSize: number = config.batch.aiCategorizationBatchSize,
  maxRetries: number = config.batch.aiRetryCount,
  retryDelay: number = config.batch.aiRetryDelay
): Promise<SecondaryBatchCategorizationResult[]> {
  const allResults: SecondaryBatchCategorizationResult[] = [];

  // Filter out users with no tweets
  const usersWithTweets = inputs.filter(
    (input) => (input.x402Tweets?.length || 0) > 0 || (input.generalTweets?.length || 0) > 0
  );

  // Add results for users with no tweets
  for (const input of inputs) {
    if ((!input.x402Tweets || input.x402Tweets.length === 0) && (!input.generalTweets || input.generalTweets.length === 0)) {
      allResults.push({
        account: input.account,
        result: {
          category: 'UNCATEGORIZED',
          confidence: 0,
          reasoning: 'No tweets available for analysis',
        },
      });
    }
  }

  // Process in batches
  for (let i = 0; i < usersWithTweets.length; i += maxBatchSize) {
    const batch = usersWithTweets.slice(i, i + maxBatchSize);
    const batchNumber = Math.floor(i / maxBatchSize) + 1;

    const batchResults = await processSecondaryBatchWithRetry(batch, batchNumber, maxRetries, retryDelay);
    allResults.push(...batchResults);
  }

  return allResults;
}

/**
 * Process a single secondary batch with retry logic
 */
async function processSecondaryBatchWithRetry(
  usersWithTweets: BatchCategorizationInput[],
  batchNumber: number,
  maxRetries: number,
  retryDelay: number
): Promise<SecondaryBatchCategorizationResult[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `Secondary batch categorizing ${usersWithTweets.length} users (batch ${batchNumber})${attempt > 1 ? ` - Retry ${attempt}/${maxRetries}` : ''}`
      );

      const userPrompt = buildBatchSecondaryUserPrompt(usersWithTweets);
      const response = await makeAIRequest(BATCH_SECONDARY_SYSTEM_PROMPT, userPrompt);
      const parsedResults = parseBatchSecondaryAIResponse(response);

      const batchResults: SecondaryBatchCategorizationResult[] = [];
      let allParsedSuccessfully = true;

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

      // On final attempt, return partial results with fallbacks
      if (attempt === maxRetries) {
        logger.warn(`Some users missing from secondary AI response after ${maxRetries} attempts, using fallbacks`);
        for (const input of usersWithTweets) {
          const username = input.account.username.toLowerCase();
          if (!parsedResults.has(username)) {
            batchResults.push({
              account: input.account,
              result: {
                category: 'UNCATEGORIZED',
                confidence: 0,
                reasoning: 'Failed to get AI categorization result',
              },
              error: 'Missing from batch response',
            });
          }
        }
        return batchResults;
      }

      // Wait before retry
      await delay(retryDelay * attempt);
    } catch (error) {
      logger.error(`Error in secondary batch ${batchNumber} (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt === maxRetries) {
        // Return fallback results for all users
        return usersWithTweets.map((input) => ({
          account: input.account,
          result: {
            category: 'UNCATEGORIZED' as const,
            confidence: 0,
            reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }

      await delay(retryDelay * attempt);
    }
  }

  // Should not reach here, but TypeScript needs a return
  return [];
}

/**
 * Helper delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// NEW EXPORTS FOR MONITORING
// ============================================================================

/**
 * Get current AI provider status
 */
export function getAIProviderStatus() {
  const manager = initializeProviders();
  return manager.getStatus();
}

/**
 * Force switch to a specific provider (for testing/manual override)
 */
export function forceAIProvider(providerName: 'mistral' | 'cerebras' | 'openrouter'): boolean {
  const manager = initializeProviders();
  return manager.forceProvider(providerName);
}
