import { analyzeEngagement } from '../analyzers/engagementAnalyzer.js';
import { analyzeTechScore } from '../analyzers/techAnalyzer.js';
import { analyzeX402Relevance } from '../analyzers/x402Analyzer.js';
import { logger } from '../utils/logger.js';
import type { Account, AccountScores } from '../types/index.js';

export interface FullScores extends AccountScores {
  confidence: number;
  x402TweetCount30d: number;
  hasGithub: boolean;
  usesTechnicalTerms: boolean;
  postsCodeSnippets: boolean;
}

/**
 * Calculate all scores for an account
 */
export async function calculateAllScores(account: Account): Promise<FullScores> {
  logger.info(`Calculating scores for @${account.username}`);

  // Run all analyzers
  const [engagementScore, techResult, x402Result] = await Promise.all([
    analyzeEngagement(account),
    analyzeTechScore(account),
    analyzeX402Relevance(account),
  ]);

  // Calculate confidence score
  // confidence = (engagementScore * 0.3) + (techScore * 0.3) + (x402Relevance * 0.4)
  const confidence =
    engagementScore * 0.3 + techResult.score * 0.3 + x402Result.score * 0.4;

  const scores: FullScores = {
    engagementScore,
    techScore: techResult.score,
    x402Relevance: x402Result.score,
    confidence: Math.round(confidence * 100) / 100,
    x402TweetCount30d: x402Result.x402TweetCount30d,
    hasGithub: techResult.hasGithub,
    usesTechnicalTerms: techResult.usesTechnicalTerms,
    postsCodeSnippets: techResult.postsCodeSnippets,
  };

  logger.info(
    `Scores for @${account.username}: ` +
      `engagement=${scores.engagementScore}, ` +
      `tech=${scores.techScore}, ` +
      `x402=${scores.x402Relevance}, ` +
      `confidence=${scores.confidence}`
  );

  return scores;
}

/**
 * Calculate confidence score from individual scores
 *
 * confidence = (engagementScore * 0.3) + (techScore * 0.3) + (x402Relevance * 0.4)
 */
export function calculateConfidence(
  engagementScore: number,
  techScore: number,
  x402Relevance: number
): number {
  return Math.round((engagementScore * 0.3 + techScore * 0.3 + x402Relevance * 0.4) * 100) / 100;
}

/**
 * Normalize a raw value to 0-100 scale
 */
export function normalizeScore(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const normalized = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}
