/**
 * OpenRouter Client - Re-exports from unified AI service for backward compatibility
 *
 * This file maintains backward compatibility for existing imports.
 * The actual implementation now supports multiple AI providers (Mistral, Cerebras, OpenRouter)
 * with automatic failover.
 *
 * @deprecated Import directly from './ai/index.js' for new code
 */

export {
  categorizeUserWithAI,
  categorizeUserEnhanced,
  categorizeUserForSecondaryCategories,
  categorizeUsersBatch,
  categorizeUsersSecondaryBatch,
  getAIProviderStatus,
  forceAIProvider,
  type BatchCategorizationInput,
  type BatchCategorizationResult,
  type SecondaryBatchCategorizationResult,
} from './ai/index.js';
