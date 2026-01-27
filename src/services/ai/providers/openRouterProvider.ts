/**
 * OpenRouter provider implementation (fallback provider)
 */

import { OpenRouter } from '@openrouter/sdk';
import { BaseAIProvider } from './baseProvider.js';
import type { AICompletionRequest, AICompletionResponse } from './types.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

export class OpenRouterProvider extends BaseAIProvider {
  readonly name = 'openrouter';
  readonly models: string[];

  private client: OpenRouter | null = null;

  constructor() {
    super();
    this.models = [config.openRouter.model];
  }

  private getClient(): OpenRouter {
    if (!this.client) {
      this.client = new OpenRouter({
        apiKey: config.openRouter.apiKey,
      });
    }
    return this.client;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = this.getCurrentModel();
    const client = this.getClient();

    logger.debug(`OpenRouter request to ${model}`, { messageCount: request.messages.length });

    try {
      // Use streaming like the original implementation
      const stream = await client.chat.send({
        model,
        messages: request.messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        stream: true,
        streamOptions: {
          includeUsage: true,
        },
      });

      let content = '';
      // The SDK returns an async iterable when stream: true
      const asyncStream = stream as AsyncIterable<{
        choices?: Array<{ delta?: { content?: string } }>;
      }>;

      try {
        for await (const chunk of asyncStream) {
          // Safely access nested properties - some chunks may not have choices
          const chunkContent = chunk.choices?.[0]?.delta?.content;
          if (chunkContent) {
            content += chunkContent;
          }
        }
      } catch (streamError) {
        // If we got partial content before stream error, log it but continue
        if (content) {
          logger.warn('OpenRouter stream interrupted after receiving partial content', {
            contentLength: content.length,
            error: streamError
          });
        } else {
          throw streamError;
        }
      }

      if (!content) {
        logger.warn('OpenRouter returned empty content');
      }

      // Clear rate limit on success
      this.lastRateLimitInfo.isLimited = false;

      return {
        content,
        provider: this.name,
        model,
      };
    } catch (error) {
      // Check if it's a rate limit error
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
          this.lastRateLimitInfo.isLimited = true;
          logger.warn(`OpenRouter rate limit hit: ${error.message}`);
        }
      }
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!config.openRouter.apiKey && !this.lastRateLimitInfo.isLimited;
  }
}
