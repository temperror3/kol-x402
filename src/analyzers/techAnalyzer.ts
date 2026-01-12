import { collectTechnicalData } from '../collectors/engagementCollector.js';
import { TweetModel } from '../db/account.model.js';
import { logger } from '../utils/logger.js';
import type { Account, Tweet } from '../types/index.js';

// Technical keywords with weights
const TECHNICAL_KEYWORDS = [
  'API',
  'SDK',
  'protocol',
  'implementation',
  'open-source',
  'infra',
  'backend',
  'frontend',
  'deploy',
  'server',
  'database',
  'lambda',
  'docker',
  'kubernetes',
  'npm',
  'git',
  'typescript',
  'javascript',
  'python',
  'rust',
  'golang',
];

/**
 * Tech Score Calculation (0-100)
 *
 * Scoring Logic:
 * +20 → GitHub link detected (in bio or tweets)
 * +10 → Each code snippet tweet (max 30 points)
 * +2  → Each technical keyword occurrence (in bio and tweets)
 *
 * Cap at 100
 */
export async function analyzeTechScore(account: Account): Promise<{
  score: number;
  hasGithub: boolean;
  usesTechnicalTerms: boolean;
  postsCodeSnippets: boolean;
}> {
  let score = 0;
  let hasGithub = account.has_github;
  let usesTechnicalTerms = false;
  let postsCodeSnippets = false;

  // Get technical data from tweets
  const techData = await collectTechnicalData(account.id!);

  // +20 for GitHub presence
  if (hasGithub || techData.tweetsWithGithub > 0) {
    score += 20;
    hasGithub = true;
    logger.debug(`@${account.username}: +20 for GitHub presence`);
  }

  // +10 per code tweet (max 30 points = 3 tweets)
  const codePoints = Math.min(30, techData.tweetsWithCode * 10);
  if (codePoints > 0) {
    score += codePoints;
    postsCodeSnippets = true;
    logger.debug(`@${account.username}: +${codePoints} for ${techData.tweetsWithCode} code tweets`);
  }

  // +2 per technical keyword found
  const keywordPoints = techData.technicalTermsFound.length * 2;
  if (keywordPoints > 0) {
    score += keywordPoints;
    usesTechnicalTerms = true;
    logger.debug(
      `@${account.username}: +${keywordPoints} for keywords: ${techData.technicalTermsFound.join(', ')}`
    );
  }

  // Also check bio for technical terms
  if (account.bio) {
    const bioLower = account.bio.toLowerCase();
    let bioKeywords = 0;

    for (const keyword of TECHNICAL_KEYWORDS) {
      if (bioLower.includes(keyword.toLowerCase())) {
        bioKeywords++;
      }
    }

    if (bioKeywords > 0) {
      const bioPoints = bioKeywords * 2;
      score += bioPoints;
      usesTechnicalTerms = true;
      logger.debug(`@${account.username}: +${bioPoints} for ${bioKeywords} keywords in bio`);
    }
  }

  // Cap at 100
  score = Math.min(100, score);

  logger.debug(`Tech score for @${account.username}: ${score}`);

  return {
    score,
    hasGithub,
    usesTechnicalTerms,
    postsCodeSnippets,
  };
}

/**
 * Quick tech analysis from tweet content
 */
export function analyzeTweetForTech(content: string): {
  hasCode: boolean;
  hasGithub: boolean;
  technicalKeywords: string[];
} {
  // Code patterns
  const codePatterns = /[{}();\[\]=>]|function\s|const\s|let\s|var\s|import\s|export\s|async\s|await\s|class\s/;
  const hasCode = codePatterns.test(content);

  // GitHub link
  const hasGithub = /github\.com/i.test(content);

  // Technical keywords
  const contentLower = content.toLowerCase();
  const technicalKeywords = TECHNICAL_KEYWORDS.filter((keyword) =>
    contentLower.includes(keyword.toLowerCase())
  );

  return {
    hasCode,
    hasGithub,
    technicalKeywords,
  };
}

/**
 * Analyze bio for technical indicators
 */
export function analyzeBioForTech(bio: string | null): {
  hasGithub: boolean;
  technicalKeywords: string[];
  isDeveloper: boolean;
} {
  if (!bio) {
    return {
      hasGithub: false,
      technicalKeywords: [],
      isDeveloper: false,
    };
  }

  const bioLower = bio.toLowerCase();

  const hasGithub = /github/i.test(bio);

  const technicalKeywords = TECHNICAL_KEYWORDS.filter((keyword) =>
    bioLower.includes(keyword.toLowerCase())
  );

  // Developer indicators in bio
  const devIndicators = [
    'developer',
    'engineer',
    'programmer',
    'coder',
    'builder',
    'dev',
    'software',
    'tech',
    'hacker',
    'architect',
  ];

  const isDeveloper = devIndicators.some((indicator) => bioLower.includes(indicator));

  return {
    hasGithub,
    technicalKeywords,
    isDeveloper,
  };
}
