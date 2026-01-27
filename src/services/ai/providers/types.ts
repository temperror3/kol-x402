/**
 * Common types for AI providers
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AICompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: string;
  model: string;
}

export interface RateLimitInfo {
  remainingRequests?: number;
  remainingTokensPerMinute?: number;
  resetTimeSeconds?: number;
  isLimited: boolean;
}

export type ProviderName = 'mistral' | 'cerebras' | 'openrouter';
