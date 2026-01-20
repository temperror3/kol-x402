import { OpenRouter } from '@openrouter/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Account, AICategoryResult, EnhancedAICategoryResult, RedFlag } from '../types/index.js';
import type { RapidApiTweet } from '../collectors/rapidApiClient.js';

let openRouterClient: OpenRouter | null = null;

function getClient(): OpenRouter {
  if (!openRouterClient) {
    openRouterClient = new OpenRouter({
      apiKey: config.openRouter.apiKey,
    });
  }
  return openRouterClient;
}

const SYSTEM_PROMPT = `You are an expert analyst categorizing Twitter/X users based on their x402-related activity.

x402 is a crypto payment protocol that enables HTTP 402 Payment Required responses for API monetization.

Goal: identify GOOD KOLs (Key Opinion Leaders) who are independent analysts, NOT product promoters.

Hard exclusions (always UNCATEGORIZED):
- Founder/CEO/co-founder/employee in bio, or official project/company account
- Primarily promotes their own product, project, token, or company

Signals of a GOOD KOL:
- Original analysis, critiques, or frameworks about crypto markets, infra, or payments
- Explains why something matters, highlights tradeoffs, uses data or concrete examples
- Consistent, thoughtful commentary beyond price-only hype
- Strong opinions are OK if backed by reasoning

Weak/low-quality signals:
- Pure hype, memes only, or short price calls with no reasoning
- Engagement farming (like/RT/follow to win), shilling, or templated posts
- Mostly retweets or announcements
- Heavy referral/affiliate/giveaway content or token-gated club promos

When in doubt, choose UNCATEGORIZED.

Consider engagement metrics as secondary support only.
If there is too little signal (e.g., 1-2 shallow tweets), choose UNCATEGORIZED.

Respond ONLY with valid JSON in this exact format:
{
  "category": "KOL" | "UNCATEGORIZED",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this category was chosen, mentioning key engagement metrics if relevant"
}`;
// Note: DEVELOPER and ACTIVE_USER categories commented out - focusing on KOL only for now

const ENHANCED_SYSTEM_PROMPT = `You are an expert analyst finding genuine crypto/web3 KEY OPINION LEADERS (KOLs) - independent voices who provide valuable insights, NOT company promoters.

x402 is a crypto payment protocol that enables HTTP 402 Payment Required responses for API monetization.

PRIMARY RULE: A KOL must be independent. If the bio says Founder/CEO/Co-founder, "building X", "core team", or shows they work at a project, they are NOT a KOL.
KOLs can be broader crypto/web3 analysts; x402 mentions are helpful but NOT required if their broader content is high-signal.

## Hard Exclusions (always UNCATEGORIZED)
- Founder/CEO/co-founder/employee in bio or clearly tied to a project
- Official project/company accounts
- Mostly promotional content, product launch updates, "we just shipped"
- Paid shilling or constant token pumping

## What GOOD KOL content looks like
- Opinionated analysis and critiques of market behavior or narratives
- Explains mechanisms or tradeoffs (e.g., liquidity gaps vs normal volatility)
- Uses concrete data (market cap, holders, revenue, adoption metrics)
- Shares playbooks or frameworks WITHOUT selling a product
- Can be blunt or strongly worded, but still analytical

## What is NOT a KOL
- Price-only hype, "moon" talk, or meme-only accounts
- News aggregators who repost without analysis
- Engagement farming ("like/RT/follow to win", giveaways)
- Accounts dominated by shilling a single project

## Scoring Criteria (0.0 - 1.0 each)

### topicConsistencyScore
Does the user regularly discuss crypto payments/web3 monetization with substance?
- 0.75+: Consistent, high-signal analysis or education
- 0.55-0.74: Regular relevant content mixed with other topics
- <0.55: Rare or shallow mentions, mostly promotional

### contentDepthScore
Does the content show REAL KNOWLEDGE and provide VALUE?
- 0.75+: Original analysis, technical explanations, market structure, clear reasoning
- 0.6-0.74: Useful perspectives, some original insight
- <0.6: Surface-level takes, hype, promotional language, no insight

### topicFocusScore
Is this person a focused EXPERT voice, not a generalist or promoter?
- 0.7+: Focused independent analyst on crypto payments/monetization
- 0.6-0.69: Broader crypto/fintech focus with genuine expertise
- <0.6: Too scattered or primarily self-promotional

## Red Flags (auto-disqualify if high severity)
- company_founder: Bio includes founder/CEO/co-founder
- company_employee: Bio says team/core/employee/BD/marketing at a project
- corporate_account: Official project/company account or announcements
- referral_affiliate: Referral codes, affiliate links, token-gated club (high severity if dominant/pinned)
- engagement_farming: Giveaways, "like/RT/follow to win" (high severity if dominant/pinned)
- shill_behavior: Paid promos, constant token pumping
- only_retweets: No original content
- low_quality_content: Emojis only, memes only, no reasoning

## KOL Decision (STRICT, but allow true analysts)
Classify as KOL if ALL are true:
- Independent (no founder/CEO/employee ties)
- No high-severity red flags
- contentDepthScore >= 0.7
- topicFocusScore >= 0.6
- AND one of:
  - topicConsistencyScore >= 0.6, OR
  - contentDepthScore >= 0.7 with at least 3 substantive tweets

When in doubt, classify as UNCATEGORIZED. We want QUALITY over quantity.

Respond ONLY with valid JSON:
{
  "category": "KOL" | "UNCATEGORIZED",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentences explaining decision. If excluded, explain why (founder, promotional, etc.)",
  "topicConsistencyScore": 0.0-1.0,
  "contentDepthScore": 0.0-1.0,
  "topicFocusScore": 0.0-1.0,
  "redFlags": [{ "type": "...", "description": "...", "severity": "low|medium|high" }],
  "primaryTopics": ["topic1", "topic2"]
}`;

const SECONDARY_SYSTEM_PROMPT = `You are an expert analyst classifying previously-uncategorized Twitter/X accounts for the x402 ecosystem.

x402 is a crypto payment protocol that enables HTTP 402 Payment Required responses for API monetization.

IMPORTANT: These accounts were already reviewed for KOL quality and were NOT KOLs.
Do NOT return KOL. Only choose from: DEVELOPER, ACTIVE_USER, UNCATEGORIZED.

## Category Definitions

### DEVELOPER
Personal account showing clear evidence of building or contributing to software.
Strong signals include:
- Code snippets, technical threads, build logs, or architecture discussions
- GitHub links, repos, PRs, SDKs, APIs, open-source contributions
- Role signals like "engineer", "developer", "builder", "infra", "backend"

### ACTIVE_USER
Non-developer who actively uses or experiments with x402/crypto payment APIs.
Signals include:
- Describing real usage, integrations, demos, or feedback
- Asking/answering practical questions about using the protocol
- Sharing results, learnings, or issues from using x402/related APIs
- Active users is not a company founder or the CEO

### UNCATEGORIZED
Use when there is insufficient evidence, or the account is:
- A company/brand/official account
- Purely promotional, marketing, or hype-driven
- Mostly memes/retweets/engagement farming
- Not clearly related to x402 or crypto payments usage/building

Decision rules:
- Prefer DEVELOPER over ACTIVE_USER if strong dev evidence exists.
- Require at least 2 concrete signals; otherwise choose UNCATEGORIZED.
- When in doubt, choose UNCATEGORIZED.

Respond ONLY with valid JSON:
{
  "category": "DEVELOPER" | "ACTIVE_USER" | "UNCATEGORIZED",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentences citing the strongest evidence from the bio or tweets"
}`;

function formatTweets(tweets: RapidApiTweet[]): string {
  return tweets
    .map((tweet, index) => {
      const date = new Date(tweet.created_at).toLocaleDateString();
      const views = tweet.views ? parseInt(tweet.views, 10) : 0;
      return `---
Tweet ${index + 1} (${date}):
"${tweet.text}"
Views: ${views.toLocaleString()} | Likes: ${tweet.favorites} | Retweets: ${tweet.retweets} | Replies: ${tweet.replies} | Quotes: ${tweet.quotes} | Bookmarks: ${tweet.bookmarks}
---`;
    })
    .join('\n\n');
}

function calculateEngagementStats(tweets: RapidApiTweet[]): {
  totalViews: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  totalQuotes: number;
  totalBookmarks: number;
  avgEngagementRate: number;
} {
  let totalViews = 0;
  let totalLikes = 0;
  let totalRetweets = 0;
  let totalReplies = 0;
  let totalQuotes = 0;
  let totalBookmarks = 0;

  for (const tweet of tweets) {
    const views = tweet.views ? parseInt(tweet.views, 10) : 0;
    totalViews += views;
    totalLikes += tweet.favorites || 0;
    totalRetweets += tweet.retweets || 0;
    totalReplies += tweet.replies || 0;
    totalQuotes += tweet.quotes || 0;
    totalBookmarks += tweet.bookmarks || 0;
  }

  // Calculate average engagement rate (engagements / views * 100)
  const totalEngagements = totalLikes + totalRetweets + totalReplies + totalQuotes;
  const avgEngagementRate = totalViews > 0 ? (totalEngagements / totalViews) * 100 : 0;

  return {
    totalViews,
    totalLikes,
    totalRetweets,
    totalReplies,
    totalQuotes,
    totalBookmarks,
    avgEngagementRate,
  };
}

function buildUserPrompt(account: Account, tweets: RapidApiTweet[]): string {
  const tweetsFormatted = formatTweets(tweets);
  const stats = calculateEngagementStats(tweets);

  return `Analyze this Twitter user's x402-related activity:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}
**Followers:** ${account.followers_count.toLocaleString()}
**Following:** ${account.following_count.toLocaleString()}

**Engagement Summary for x402 tweets:**
- Total Tweets: ${tweets.length}
- Total Views: ${stats.totalViews.toLocaleString()}
- Total Likes: ${stats.totalLikes.toLocaleString()}
- Total Retweets: ${stats.totalRetweets.toLocaleString()}
- Total Replies: ${stats.totalReplies.toLocaleString()}
- Total Quotes: ${stats.totalQuotes.toLocaleString()}
- Total Bookmarks: ${stats.totalBookmarks.toLocaleString()}
- Average Engagement Rate: ${stats.avgEngagementRate.toFixed(2)}%

**Their x402-related tweets:**

${tweetsFormatted}

Based on these tweets and engagement metrics, categorize this user.`;
}

function parseAIResponse(content: string): AICategoryResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate the response
    // Note: DEVELOPER and ACTIVE_USER commented out - focusing on KOL only for now
    const validCategories = ['KOL', /* 'DEVELOPER', 'ACTIVE_USER', */ 'UNCATEGORIZED'];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = 'UNCATEGORIZED';
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5;
    }

    if (typeof parsed.reasoning !== 'string') {
      parsed.reasoning = 'No reasoning provided';
    }

    return {
      category: parsed.category,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    logger.error('Failed to parse AI response:', error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'Failed to parse AI response',
    };
  }
}

/**
 * Categorize a user based on their x402 tweets using AI
 */
export async function categorizeUserWithAI(
  account: Account,
  tweets: RapidApiTweet[]
): Promise<AICategoryResult> {
  const client = getClient();

  // If no tweets, return uncategorized
  if (tweets.length === 0) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'No x402-related tweets found for this user',
    };
  }

  const userPrompt = buildUserPrompt(account, tweets);

  try {
    logger.info(`Categorizing @${account.username} with AI (${tweets.length} tweets)`);

    // Use streaming to get the response
    const stream = await client.chat.send({
      model: config.openRouter.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    let response = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        response += content;
      }
    }

    const result = parseAIResponse(response);

    logger.info(
      `AI categorized @${account.username} as ${result.category} (confidence: ${result.confidence})`
    );

    return result;
  } catch (error) {
    logger.error(`Error categorizing @${account.username} with AI:`, error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Format tweets for enhanced analysis (with truncation to save tokens)
 */
function formatTweetsEnhanced(tweets: RapidApiTweet[], maxCharsPerTweet: number = 200): string {
  return tweets
    .map((tweet, index) => {
      const date = new Date(tweet.created_at).toLocaleDateString();
      // Truncate tweet text to save tokens
      const text = tweet.text.length > maxCharsPerTweet
        ? tweet.text.substring(0, maxCharsPerTweet) + '...'
        : tweet.text;
      return `${index + 1}. [${date}] "${text}"`;
    })
    .join('\n');
}

/**
 * Build enhanced user prompt with both x402 and general timeline tweets
 */
function buildEnhancedUserPrompt(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): string {
  const x402Formatted = formatTweetsEnhanced(x402Tweets);
  const generalFormatted = formatTweetsEnhanced(generalTweets);

  return `Analyze this Twitter user's content quality for crypto/payments thought leadership:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}

---
**x402-RELATED TWEETS (${x402Tweets.length} tweets):**
${x402Formatted || 'No x402 tweets found'}

---
**GENERAL TIMELINE (${generalTweets.length} recent tweets):**
${generalFormatted || 'No timeline tweets available'}

---
Based on the CONTENT QUALITY (not engagement metrics), evaluate this user's quality scores and category.`;
}

/**
 * Build prompt for secondary categorization (developer vs active user)
 */
function buildSecondaryUserPrompt(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): string {
  const x402Formatted = formatTweetsEnhanced(x402Tweets);
  const generalFormatted = formatTweetsEnhanced(generalTweets);

  return `Analyze this user's activity to classify them as DEVELOPER, ACTIVE_USER, or UNCATEGORIZED:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}
**Followers:** ${account.followers_count.toLocaleString()}
**Following:** ${account.following_count.toLocaleString()}
**Has GitHub in bio:** ${account.has_github ? 'Yes' : 'No'}

---
**x402-RELATED TWEETS (${x402Tweets.length} tweets):**
${x402Formatted || 'No x402 tweets found'}

---
**GENERAL TIMELINE (${generalTweets.length} recent tweets):**
${generalFormatted || 'No timeline tweets available'}

---
Use the evidence above to choose the best category.`;
}

/**
 * Parse enhanced AI response with quality scores and red flags
 */
function parseEnhancedAIResponse(content: string): EnhancedAICategoryResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate category
    const validCategories = ['KOL', 'UNCATEGORIZED'];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = 'UNCATEGORIZED';
    }

    // Validate confidence
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5;
    }

    // Validate reasoning
    if (typeof parsed.reasoning !== 'string') {
      parsed.reasoning = 'No reasoning provided';
    }

    // Validate quality scores (default to 0 if missing/invalid)
    const validateScore = (score: unknown): number => {
      if (typeof score !== 'number' || score < 0 || score > 1) return 0;
      return score;
    };

    const topicConsistencyScore = validateScore(parsed.topicConsistencyScore);
    const contentDepthScore = validateScore(parsed.contentDepthScore);
    const topicFocusScore = validateScore(parsed.topicFocusScore);

    // Validate red flags
    const redFlags: RedFlag[] = [];
    if (Array.isArray(parsed.redFlags)) {
      for (const flag of parsed.redFlags) {
        if (
          flag &&
          typeof flag.type === 'string' &&
          typeof flag.description === 'string' &&
          ['low', 'medium', 'high'].includes(flag.severity)
        ) {
          redFlags.push({
            type: flag.type,
            description: flag.description,
            severity: flag.severity,
          });
        }
      }
    }

    // Validate primary topics
    const primaryTopics: string[] = [];
    if (Array.isArray(parsed.primaryTopics)) {
      for (const topic of parsed.primaryTopics) {
        if (typeof topic === 'string') {
          primaryTopics.push(topic);
        }
      }
    }

    return {
      category: parsed.category,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      topicConsistencyScore,
      contentDepthScore,
      topicFocusScore,
      redFlags,
      primaryTopics,
    };
  } catch (error) {
    logger.error('Failed to parse enhanced AI response:', error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'Failed to parse AI response',
      topicConsistencyScore: 0,
      contentDepthScore: 0,
      topicFocusScore: 0,
      redFlags: [],
      primaryTopics: [],
    };
  }
}

/**
 * Parse AI response for secondary categorization (developer vs active user)
 */
function parseSecondaryAIResponse(content: string): AICategoryResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const validCategories = ['DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED'];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = 'UNCATEGORIZED';
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5;
    }

    if (typeof parsed.reasoning !== 'string') {
      parsed.reasoning = 'No reasoning provided';
    }

    return {
      category: parsed.category,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    logger.error('Failed to parse secondary AI response:', error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'Failed to parse AI response',
    };
  }
}

/**
 * Enhanced user categorization based on content quality
 * Uses both x402 tweets and general timeline for holistic analysis
 */
export async function categorizeUserEnhanced(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): Promise<EnhancedAICategoryResult> {
  const client = getClient();

  // If no tweets at all, return uncategorized
  if (x402Tweets.length === 0 && generalTweets.length === 0) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'No tweets available for analysis',
      topicConsistencyScore: 0,
      contentDepthScore: 0,
      topicFocusScore: 0,
      redFlags: [],
      primaryTopics: [],
    };
  }

  const userPrompt = buildEnhancedUserPrompt(account, x402Tweets, generalTweets);

  try {
    logger.info(
      `Enhanced categorizing @${account.username} (${x402Tweets.length} x402 tweets, ${generalTweets.length} timeline tweets)`
    );

    // Use streaming to get the response
    const stream = await client.chat.send({
      model: config.openRouter.model,
      messages: [
        { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    let response = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        response += content;
      }
    }

    const result = parseEnhancedAIResponse(response);

    logger.info(
      `Enhanced AI categorized @${account.username} as ${result.category} ` +
      `(topic: ${result.topicConsistencyScore.toFixed(2)}, depth: ${result.contentDepthScore.toFixed(2)}, focus: ${result.topicFocusScore.toFixed(2)})`
    );

    if (result.redFlags.length > 0) {
      logger.info(`  Red flags: ${result.redFlags.map((f) => f.type).join(', ')}`);
    }

    return result;
  } catch (error) {
    logger.error(`Error enhanced categorizing @${account.username} with AI:`, error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      topicConsistencyScore: 0,
      contentDepthScore: 0,
      topicFocusScore: 0,
      redFlags: [],
      primaryTopics: [],
    };
  }
}

/**
 * Secondary categorization for previously-uncategorized accounts
 * Determines DEVELOPER vs ACTIVE_USER vs UNCATEGORIZED
 */
export async function categorizeUserForSecondaryCategories(
  account: Account,
  x402Tweets: RapidApiTweet[],
  generalTweets: RapidApiTweet[]
): Promise<AICategoryResult> {
  const client = getClient();

  if (x402Tweets.length === 0 && generalTweets.length === 0) {
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: 'No tweets available for analysis',
    };
  }

  const userPrompt = buildSecondaryUserPrompt(account, x402Tweets, generalTweets);

  try {
    logger.info(
      `Secondary categorizing @${account.username} (${x402Tweets.length} x402 tweets, ${generalTweets.length} timeline tweets)`
    );

    const stream = await client.chat.send({
      model: config.openRouter.model,
      messages: [
        { role: 'system', content: SECONDARY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    let response = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        response += content;
      }
    }

    const result = parseSecondaryAIResponse(response);

    logger.info(
      `Secondary AI categorized @${account.username} as ${result.category} (confidence: ${result.confidence})`
    );

    return result;
  } catch (error) {
    logger.error(`Error secondary categorizing @${account.username} with AI:`, error);
    return {
      category: 'UNCATEGORIZED',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
