/**
 * Mistral.ai provider implementation
 * Uses standard OpenAI-compatible /v1/chat/completions endpoint
 */

import { BaseAIProvider } from './baseProvider.js';
import type { AICompletionRequest, AICompletionResponse } from './types.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

// Mistral API response type (OpenAI-compatible format)
interface MistralResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class MistralProvider extends BaseAIProvider {
  readonly name = 'mistral';
  readonly models: string[];

  private apiKey: string;
  private endpoint: string;

  constructor() {
    super();
    this.apiKey = config.mistral?.apiKey || '';
    this.endpoint = config.mistral?.endpoint || 'https://api.mistral.ai/v1/chat/completions';
    this.models = [config.mistral?.model || 'mistral-small-latest'];
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = this.getCurrentModel();

    // Mistral uses standard OpenAI-compatible format
    const mistralRequest = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };

    logger.debug(`Mistral request to ${model}`, { messageCount: request.messages.length });

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(mistralRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        this.lastRateLimitInfo.isLimited = true;
        logger.warn(`Mistral rate limit hit: ${errorText}`);
      }
      throw new Error(`Mistral API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as MistralResponse;

    // Parse response - standard OpenAI format
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      logger.warn('Mistral returned empty content', { response: data });
    }

    // Clear rate limit on success
    this.lastRateLimitInfo.isLimited = false;

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

  isAvailable(): boolean {
    return !!this.apiKey && !this.lastRateLimitInfo.isLimited;
  }
}
