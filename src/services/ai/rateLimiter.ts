/**
 * Rate limit tracking for AI providers
 */

import { logger } from '../../utils/logger.js';

interface RateLimitState {
  provider: string;
  model?: string;
  errorCount: number;
  firstErrorTime?: number;
  lastErrorTime?: number;
  isInHighTraffic: boolean;
  remainingRequests?: number;
  remainingTokensPerMinute?: number;
}

export class RateLimitTracker {
  private states: Map<string, RateLimitState> = new Map();
  private readonly highTrafficThresholdMs: number;
  private readonly cooldownMs: number;

  constructor(highTrafficThresholdMs: number = 120000, cooldownMs: number = 300000) {
    this.highTrafficThresholdMs = highTrafficThresholdMs;
    this.cooldownMs = cooldownMs;
  }

  private getKey(provider: string, model?: string): string {
    return model ? `${provider}:${model}` : provider;
  }

  /**
   * Record an error for a provider/model
   */
  recordError(provider: string, model?: string): void {
    const key = this.getKey(provider, model);
    const now = Date.now();

    const state = this.states.get(key) || {
      provider,
      model,
      errorCount: 0,
      isInHighTraffic: false,
    };

    state.errorCount++;
    state.lastErrorTime = now;

    if (!state.firstErrorTime) {
      state.firstErrorTime = now;
    }

    // Check if in high traffic (errors for 2+ minutes)
    if (now - state.firstErrorTime >= this.highTrafficThresholdMs) {
      state.isInHighTraffic = true;
      logger.warn(`High traffic detected for ${key} - errors for ${Math.round((now - state.firstErrorTime) / 1000)}s`);
    }

    this.states.set(key, state);
  }

  /**
   * Record a successful request - clears error state
   */
  recordSuccess(provider: string, model?: string): void {
    const key = this.getKey(provider, model);
    this.states.delete(key);
  }

  /**
   * Update rate limit info from response headers (e.g., Cerebras)
   */
  updateFromHeaders(provider: string, model: string, headers: Record<string, string | null>): void {
    const key = this.getKey(provider, model);
    const state = this.states.get(key) || {
      provider,
      model,
      errorCount: 0,
      isInHighTraffic: false,
    };

    // Parse Cerebras-style headers
    const remainingRequestsDay = headers['x-ratelimit-remaining-requests-day'];
    const remainingTokensMinute = headers['x-ratelimit-remaining-tokens-minute'];

    if (remainingRequestsDay !== null && remainingRequestsDay !== undefined) {
      state.remainingRequests = parseInt(remainingRequestsDay, 10);
      if (state.remainingRequests === 0) {
        logger.warn(`Daily request limit reached for ${key}`);
      }
    }

    if (remainingTokensMinute !== null && remainingTokensMinute !== undefined) {
      state.remainingTokensPerMinute = parseInt(remainingTokensMinute, 10);
      if (state.remainingTokensPerMinute === 0) {
        logger.warn(`Per-minute token limit reached for ${key}`);
      }
    }

    this.states.set(key, state);
  }

  /**
   * Check if a provider/model is currently rate limited
   */
  isLimited(provider: string, model?: string): boolean {
    const key = this.getKey(provider, model);
    const state = this.states.get(key);

    if (!state) return false;

    // Consider limited if remaining requests is 0
    if (state.remainingRequests === 0) return true;

    // Consider limited if in high traffic mode
    if (state.isInHighTraffic) return true;

    return false;
  }

  /**
   * Check if provider is experiencing high traffic
   */
  isInHighTraffic(provider: string, model?: string): boolean {
    const key = this.getKey(provider, model);
    const state = this.states.get(key);
    return state?.isInHighTraffic || false;
  }

  /**
   * Reset state if cooldown period has passed
   */
  resetIfCooledDown(provider: string, model?: string): boolean {
    const key = this.getKey(provider, model);
    const state = this.states.get(key);

    if (state && state.lastErrorTime && Date.now() - state.lastErrorTime >= this.cooldownMs) {
      this.states.delete(key);
      logger.info(`Cooldown period passed for ${key}, resetting state`);
      return true;
    }
    return false;
  }

  /**
   * Get the current error count for a provider/model
   */
  getErrorCount(provider: string, model?: string): number {
    const key = this.getKey(provider, model);
    const state = this.states.get(key);
    return state?.errorCount || 0;
  }

  /**
   * Clear all tracking state (for testing or reset)
   */
  clearAll(): void {
    this.states.clear();
  }
}

// Singleton instance
let rateLimitTracker: RateLimitTracker | null = null;

export function getRateLimitTracker(
  highTrafficThresholdMs?: number,
  cooldownMs?: number
): RateLimitTracker {
  if (!rateLimitTracker) {
    rateLimitTracker = new RateLimitTracker(highTrafficThresholdMs, cooldownMs);
  }
  return rateLimitTracker;
}
