/**
 * Abstract base class for AI providers
 */

import type { AICompletionRequest, AICompletionResponse, RateLimitInfo } from './types.js';

export abstract class BaseAIProvider {
  abstract readonly name: string;
  abstract readonly models: string[];

  protected currentModelIndex: number = 0;
  protected lastRateLimitInfo: RateLimitInfo = { isLimited: false };

  /**
   * Send a completion request to the AI provider
   */
  abstract complete(request: AICompletionRequest): Promise<AICompletionResponse>;

  /**
   * Get the current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    return this.lastRateLimitInfo;
  }

  /**
   * Check if the provider is available (has API key and not rate limited)
   */
  abstract isAvailable(): boolean;

  /**
   * Rotate to the next model (for providers with multiple models)
   * @returns true if rotation successful, false if no more models
   */
  rotateModel(): boolean {
    if (this.currentModelIndex < this.models.length - 1) {
      this.currentModelIndex++;
      return true;
    }
    return false;
  }

  /**
   * Reset model rotation to the first model
   */
  resetModelRotation(): void {
    this.currentModelIndex = 0;
    this.lastRateLimitInfo = { isLimited: false };
  }

  /**
   * Get the current active model
   */
  getCurrentModel(): string {
    return this.models[this.currentModelIndex];
  }

  /**
   * Mark the current model as rate limited
   */
  markAsLimited(): void {
    this.lastRateLimitInfo.isLimited = true;
  }

  /**
   * Clear the rate limit flag
   */
  clearRateLimit(): void {
    this.lastRateLimitInfo.isLimited = false;
  }
}
