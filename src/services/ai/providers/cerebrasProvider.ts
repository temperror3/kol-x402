/**
 * Cerebras.ai provider implementation
 */

import { BaseAIProvider } from './baseProvider.js';
import type { AICompletionRequest, AICompletionResponse } from './types.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { getRateLimitTracker } from '../rateLimiter.js';

// Cerebras API response type (OpenAI-compatible format)
interface CerebrasResponse {
  id: string;
  choices: Array<{
    finish_reason: string;
    index: number;
    message: {
      content: string;
      reasoning?: string;
      role: string;
    };
  }>;
  created: number;
  model: string;
  system_fingerprint: string;
  object: string;
  usage?: {
    total_tokens: number;
    completion_tokens: number;
    prompt_tokens: number;
  };
}

export class CerebrasProvider extends BaseAIProvider {
  readonly name = 'cerebras';
  readonly models: string[];

  private apiKey: string;
  private endpoint: string;

  constructor() {
    super();
    this.apiKey = config.cerebras?.apiKey || '';
    this.endpoint = config.cerebras?.endpoint || 'https://api.cerebras.ai/v1/chat/completions';
    this.models = config.cerebras?.models || ['gpt-oss-120b', 'llama-3.3-70b', 'qwen-3-32b', 'zai-glm-4.7'];
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = this.getCurrentModel();

    // Cerebras uses standard OpenAI-like format
    // Build request object, only include max_tokens if specified
    const cerebrasRequest: Record<string, unknown> = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? 0,
      stream: false,
      seed: 0,
      top_p: 1,
    };

    // Only include max_tokens if explicitly specified (Cerebras doesn't accept -1)
    if (request.maxTokens && request.maxTokens > 0) {
      cerebrasRequest.max_tokens = request.maxTokens;
    }

    logger.debug(`Cerebras request to ${model}`, { messageCount: request.messages.length });

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(cerebrasRequest),
    });

    // Parse rate limit headers before checking response status
    this.updateRateLimitFromHeaders(response.headers, model);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        this.lastRateLimitInfo.isLimited = true;
        logger.warn(`Cerebras rate limit hit on ${model}: ${errorText}`);
      }
      throw new Error(`Cerebras API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as CerebrasResponse;

    // Parse response - standard OpenAI format
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      logger.warn('Cerebras returned empty content', { response: data });
    }

    // Clear rate limit on success (but keep header-based limits)
    if (this.lastRateLimitInfo.remainingRequests !== 0) {
      this.lastRateLimitInfo.isLimited = false;
    }

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
      provider: this.name,
      model,
    };
  }

  private updateRateLimitFromHeaders(headers: Headers, model: string): void {
    const remainingRequestsDay = headers.get('x-ratelimit-remaining-requests-day');
    const remainingTokensMinute = headers.get('x-ratelimit-remaining-tokens-minute');
    const resetRequestsDay = headers.get('x-ratelimit-reset-requests-day');
    const resetTokensMinute = headers.get('x-ratelimit-reset-tokens-minute');

    // Update local rate limit info
    if (remainingRequestsDay !== null) {
      this.lastRateLimitInfo.remainingRequests = parseInt(remainingRequestsDay, 10);
      if (this.lastRateLimitInfo.remainingRequests === 0) {
        this.lastRateLimitInfo.isLimited = true;
        logger.warn(`Cerebras ${model}: Daily request limit exhausted`);
      }
    }

    if (remainingTokensMinute !== null) {
      this.lastRateLimitInfo.remainingTokensPerMinute = parseInt(remainingTokensMinute, 10);
      if (this.lastRateLimitInfo.remainingTokensPerMinute === 0) {
        logger.info(`Cerebras ${model}: Per-minute token limit exhausted, will reset in ${resetTokensMinute}s`);
      }
    }

    if (resetRequestsDay !== null) {
      this.lastRateLimitInfo.resetTimeSeconds = parseInt(resetRequestsDay, 10);
    }

    // Also update the global rate limit tracker
    const tracker = getRateLimitTracker();
    tracker.updateFromHeaders(this.name, model, {
      'x-ratelimit-remaining-requests-day': remainingRequestsDay,
      'x-ratelimit-remaining-tokens-minute': remainingTokensMinute,
    });
  }

  /**
   * Check if should switch to next model based on rate limits
   */
  shouldRotateModel(): boolean {
    return (
      this.lastRateLimitInfo.isLimited ||
      this.lastRateLimitInfo.remainingRequests === 0
    );
  }

  isAvailable(): boolean {
    return !!this.apiKey && !this.lastRateLimitInfo.isLimited;
  }
}
