import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Category, Account } from '../types/index.js';
import type { FullScores } from '../scorers/scoreCalculator.js';

/**
 * Category Assignment Rules (Priority Order)
 *
 * 1. KOL (Key Opinion Leader):
 *    - engagementScore >= 50 (≈ 5% engagement rate)
 *    - followers >= 1000
 *    - x402Relevance >= 30
 *    - x402TweetCount30d >= 3
 *
 * 2. DEVELOPER:
 *    - techScore >= 50
 *    - hasGithub = true
 *    - usesTechnicalTerms = true
 *    - postsCodeSnippets = true
 *
 * 3. ACTIVE_USER:
 *    - x402Relevance >= 20
 *    - Does not meet KOL or Developer thresholds
 *
 * 4. UNCATEGORIZED:
 *    - Does not meet any of the above criteria
 */
export function assignCategory(account: Account, scores: FullScores): Category {
  const { kol, developer, activeUser } = config.thresholds;

  // Log inputs for debugging
  logger.debug(
    `Assigning category for @${account.username}: ` +
      `engagement=${scores.engagementScore}, ` +
      `tech=${scores.techScore}, ` +
      `x402=${scores.x402Relevance}, ` +
      `followers=${account.followers_count}, ` +
      `x402Tweets30d=${scores.x402TweetCount30d}, ` +
      `hasGithub=${scores.hasGithub}`
  );

  // Check KOL criteria first (highest priority)
  if (
    scores.engagementScore >= kol.minEngagementScore &&
    account.followers_count >= kol.minFollowers &&
    scores.x402Relevance >= kol.minX402Relevance &&
    scores.x402TweetCount30d >= kol.minX402Tweets30d
  ) {
    logger.info(`@${account.username} categorized as KOL`);
    return 'KOL';
  }

  // Check Developer criteria
  if (
    scores.techScore >= developer.minTechScore &&
    scores.hasGithub &&
    scores.usesTechnicalTerms &&
    scores.postsCodeSnippets
  ) {
    logger.info(`@${account.username} categorized as DEVELOPER`);
    return 'DEVELOPER';
  }

  // Check Active User criteria
  if (scores.x402Relevance >= activeUser.minX402Relevance) {
    logger.info(`@${account.username} categorized as ACTIVE_USER`);
    return 'ACTIVE_USER';
  }

  // Default to uncategorized
  logger.debug(`@${account.username} categorized as UNCATEGORIZED`);
  return 'UNCATEGORIZED';
}

/**
 * Explain why an account was assigned a specific category
 */
export function explainCategorization(
  account: Account,
  scores: FullScores,
  category: Category
): string {
  const { kol, developer, activeUser } = config.thresholds;
  const reasons: string[] = [];

  switch (category) {
    case 'KOL':
      reasons.push(`High engagement rate: ${scores.engagementScore}% (threshold: ${kol.minEngagementScore}%)`);
      reasons.push(`Large following: ${account.followers_count} (threshold: ${kol.minFollowers})`);
      reasons.push(`x402 relevance: ${scores.x402Relevance} (threshold: ${kol.minX402Relevance})`);
      reasons.push(`x402 tweets in 30d: ${scores.x402TweetCount30d} (threshold: ${kol.minX402Tweets30d})`);
      break;

    case 'DEVELOPER':
      reasons.push(`High tech score: ${scores.techScore} (threshold: ${developer.minTechScore})`);
      reasons.push(`Has GitHub: ${scores.hasGithub}`);
      reasons.push(`Uses technical terms: ${scores.usesTechnicalTerms}`);
      reasons.push(`Posts code snippets: ${scores.postsCodeSnippets}`);
      break;

    case 'ACTIVE_USER':
      reasons.push(`x402 relevance: ${scores.x402Relevance} (threshold: ${activeUser.minX402Relevance})`);
      reasons.push('Does not meet KOL or Developer thresholds');
      break;

    case 'UNCATEGORIZED':
      reasons.push('Does not meet criteria for KOL, Developer, or Active User');
      if (scores.engagementScore < kol.minEngagementScore) {
        reasons.push(`Low engagement: ${scores.engagementScore} (need: ${kol.minEngagementScore})`);
      }
      if (scores.techScore < developer.minTechScore) {
        reasons.push(`Low tech score: ${scores.techScore} (need: ${developer.minTechScore})`);
      }
      if (scores.x402Relevance < activeUser.minX402Relevance) {
        reasons.push(`Low x402 relevance: ${scores.x402Relevance} (need: ${activeUser.minX402Relevance})`);
      }
      break;
  }

  return reasons.join('\n');
}

/**
 * Get category-specific recommendations for outreach
 */
export function getOutreachRecommendation(category: Category): {
  priority: 'high' | 'medium' | 'low';
  action: string;
  message: string;
} {
  switch (category) {
    case 'KOL':
      return {
        priority: 'high',
        action: 'Partnership outreach',
        message: 'Reach out for promotional partnership. Offer exclusive access or collaboration.',
      };

    case 'DEVELOPER':
      return {
        priority: 'high',
        action: 'API hosting invitation',
        message: 'Invite to host their API on platform. Highlight developer benefits and x402 integration.',
      };

    case 'ACTIVE_USER':
      return {
        priority: 'medium',
        action: 'Platform invitation',
        message: 'Invite to try the platform. Offer early access or beta testing opportunity.',
      };

    case 'UNCATEGORIZED':
      return {
        priority: 'low',
        action: 'Monitor',
        message: 'Continue monitoring for increased x402 engagement.',
      };
  }
}
