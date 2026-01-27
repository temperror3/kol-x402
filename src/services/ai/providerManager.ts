/**
 * Provider Manager - orchestrates multiple AI providers with automatic failover
 */

import { BaseAIProvider } from './providers/baseProvider.js';
import type { AICompletionRequest, AICompletionResponse, ProviderName } from './providers/types.js';
import { getRateLimitTracker, RateLimitTracker } from './rateLimiter.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

export class ProviderManager {
  private providers: Map<ProviderName, BaseAIProvider> = new Map();
  private rateLimitTracker: RateLimitTracker;
  private priorityOrder: ProviderName[];
  private currentProviderIndex: number = 0;

  constructor() {
    this.rateLimitTracker = getRateLimitTracker(
      config.aiProvider?.highTrafficThresholdMs,
      config.aiProvider?.cooldownMs
    );
    this.priorityOrder = (config.aiProvider?.priorityOrder as ProviderName[]) || [
      'mistral',
      'cerebras',
      'openrouter',
    ];
  }

  /**
   * Register a provider
   */
  registerProvider(name: ProviderName, provider: BaseAIProvider): void {
    this.providers.set(name, provider);
    logger.info(`Registered AI provider: ${name} (models: ${provider.models.join(', ')})`);
  }

  /**
   * Get the current provider
   */
  private getCurrentProvider(): BaseAIProvider | null {
    const name = this.priorityOrder[this.currentProviderIndex];
    return this.providers.get(name) || null;
  }

  /**
   * Get the current provider name
   */
  private getCurrentProviderName(): ProviderName {
    return this.priorityOrder[this.currentProviderIndex];
  }

  /**
   * Switch to the next provider or rotate models
   * @returns true if switch successful, false if all providers exhausted
   */
  private switchToNextProvider(): boolean {
    const currentName = this.getCurrentProviderName();
    const provider = this.providers.get(currentName);

    // For Cerebras (or any provider with multiple models), try rotating models first
    if (provider && provider.models.length > 1) {
      if (provider.rotateModel()) {
        logger.info(`Rotated ${currentName} to model: ${provider.getCurrentModel()}`);
        return true;
      }
      // Reset model rotation when moving to next provider
      provider.resetModelRotation();
    }

    // Move to next provider in priority order
    if (this.currentProviderIndex < this.priorityOrder.length - 1) {
      this.currentProviderIndex++;
      const newName = this.getCurrentProviderName();
      const newProvider = this.providers.get(newName);

      // Skip providers that don't exist or aren't available
      if (!newProvider || !newProvider.isAvailable()) {
        logger.info(`Skipping unavailable provider: ${newName}`);
        return this.switchToNextProvider();
      }

      logger.info(`Switched to provider: ${newName} (model: ${newProvider.getCurrentModel()})`);
      return true;
    }

    logger.warn('All providers exhausted');
    return false;
  }

  /**
   * Reset to the first available provider
   */
  private resetToFirstProvider(): void {
    this.currentProviderIndex = 0;

    // Reset all providers' model rotations and rate limits
    for (const provider of this.providers.values()) {
      provider.resetModelRotation();
    }

    // Find first available provider
    while (this.currentProviderIndex < this.priorityOrder.length) {
      const provider = this.getCurrentProvider();
      if (provider && provider.isAvailable()) {
        break;
      }
      this.currentProviderIndex++;
    }

    // If we went past all providers, reset to 0
    if (this.currentProviderIndex >= this.priorityOrder.length) {
      this.currentProviderIndex = 0;
    }

    const name = this.getCurrentProviderName();
    const provider = this.getCurrentProvider();
    logger.info(`Reset to provider: ${name} (model: ${provider?.getCurrentModel() || 'unknown'})`);
  }

  /**
   * Wait and reset providers after all are exhausted
   */
  private async waitAndReset(): Promise<void> {
    logger.info('All providers exhausted, waiting 60s before retry...');
    await this.delay(60000);
    this.resetToFirstProvider();
  }

  /**
   * Send a completion request with automatic provider failover
   */
  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    let attempts = 0;
    // Account for all providers and their model rotations
    const maxAttempts = this.priorityOrder.length * 5;

    while (attempts < maxAttempts) {
      const provider = this.getCurrentProvider();
      const providerName = this.getCurrentProviderName();

      if (!provider) {
        // Try to find an available provider
        if (!this.switchToNextProvider()) {
          await this.waitAndReset();
        }
        attempts++;
        continue;
      }

      const modelName = provider.getCurrentModel();

      // Check if cooldown has passed for this provider/model
      this.rateLimitTracker.resetIfCooledDown(providerName, modelName);

      // Check if this provider/model is rate limited
      if (this.rateLimitTracker.isLimited(providerName, modelName) || !provider.isAvailable()) {
        logger.info(`Provider ${providerName}/${modelName} is rate limited or unavailable, switching...`);
        if (!this.switchToNextProvider()) {
          await this.waitAndReset();
        }
        attempts++;
        continue;
      }

      try {
        logger.debug(`Attempting request with ${providerName}/${modelName}`);
        const response = await provider.complete(request);

        // Success! Record it and return
        this.rateLimitTracker.recordSuccess(providerName, modelName);
        return response;
      } catch (error) {
        this.rateLimitTracker.recordError(providerName, modelName);

        const isRateLimitError = this.isRateLimitError(error);

        if (isRateLimitError) {
          logger.warn(`Rate limit hit on ${providerName}/${modelName}`);
          provider.markAsLimited();
        } else {
          logger.error(`Error from ${providerName}/${modelName}:`, error);
        }

        // Check if we should switch providers
        if (
          isRateLimitError ||
          this.rateLimitTracker.isInHighTraffic(providerName, modelName) ||
          this.rateLimitTracker.getErrorCount(providerName, modelName) >= 3
        ) {
          if (!this.switchToNextProvider()) {
            await this.waitAndReset();
          }
        } else {
          // Single non-rate-limit error, retry same provider after delay
          await this.delay(2000);
        }

        attempts++;
      }
    }

    throw new Error(`Failed to complete request after ${maxAttempts} attempts across all providers`);
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('too many requests') ||
        message.includes('quota exceeded')
      );
    }
    return false;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current provider status for monitoring
   */
  getStatus(): {
    currentProvider: ProviderName;
    currentModel: string;
    availableProviders: ProviderName[];
    allProviders: Array<{
      name: ProviderName;
      model: string;
      available: boolean;
    }>;
  } {
    const provider = this.getCurrentProvider();
    const availableProviders = this.priorityOrder.filter((name, idx) => {
      if (idx < this.currentProviderIndex) return false;
      const p = this.providers.get(name);
      return p && p.isAvailable();
    });

    const allProviders = this.priorityOrder.map((name) => {
      const p = this.providers.get(name);
      return {
        name,
        model: p?.getCurrentModel() || 'not registered',
        available: p?.isAvailable() || false,
      };
    });

    return {
      currentProvider: this.getCurrentProviderName(),
      currentModel: provider?.getCurrentModel() || 'unknown',
      availableProviders,
      allProviders,
    };
  }

  /**
   * Force switch to a specific provider (for testing/manual override)
   */
  forceProvider(name: ProviderName): boolean {
    const index = this.priorityOrder.indexOf(name);
    if (index === -1) {
      logger.warn(`Provider ${name} not in priority order`);
      return false;
    }

    const provider = this.providers.get(name);
    if (!provider) {
      logger.warn(`Provider ${name} not registered`);
      return false;
    }

    this.currentProviderIndex = index;
    provider.resetModelRotation();
    logger.info(`Forced switch to provider: ${name}`);
    return true;
  }
}

// Singleton instance
let providerManager: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!providerManager) {
    providerManager = new ProviderManager();
  }
  return providerManager;
}

/**
 * Reset the provider manager (for testing)
 */
export function resetProviderManager(): void {
  providerManager = null;
}
