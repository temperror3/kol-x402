import type { SearchConfiguration, Account } from '../types/index.js';
import type { RapidApiTweet } from '../collectors/rapidApiClient.js';

/**
 * PromptBuilder generates AI prompts dynamically based on search configuration
 * Replaces hardcoded x402-specific prompts with template-based approach
 */
export class PromptBuilder {
  /**
   * Build primary KOL categorization system prompt
   * Used for initial categorization: KOL or UNCATEGORIZED
   */
  static buildPrimarySystemPrompt(config: SearchConfiguration): string {
    return `You are an expert analyst categorizing Twitter/X users based on their ${config.name}-related activity.

${config.topic_context}

Goal: identify GOOD KOLs (Key Opinion Leaders) who are independent analysts, NOT product promoters.

Hard exclusions (always UNCATEGORIZED):
- Founder/CEO/co-founder/employee in bio, or official project/company account
- Primarily promotes their own product, project, token, or company

Signals of a GOOD KOL:
- Original analysis, critiques, or frameworks about ${config.name.toLowerCase()} or related topics
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
  }

  /**
   * Build enhanced KOL categorization system prompt with quality scores
   * Used for more sophisticated analysis with topic consistency, content depth, and focus scores
   */
  static buildEnhancedSystemPrompt(config: SearchConfiguration): string {
    return `You are an expert analyst finding genuine ${config.name} KEY OPINION LEADERS (KOLs) - independent voices who provide valuable insights, NOT company promoters.

${config.topic_context}

PRIMARY RULE: A KOL must be independent. If the bio says Founder/CEO/Co-founder, "building X", "core team", or shows they work at a project, they are NOT a KOL.
KOLs can be broader topic analysts; ${config.name} mentions are helpful but NOT required if their broader content is high-signal.

## Hard Exclusions (always UNCATEGORIZED)
- Founder/CEO/co-founder/employee in bio or clearly tied to a project
- Official project/company accounts
- Mostly promotional content, product launch updates, "we just shipped"
- Paid shilling or constant token pumping

## What GOOD KOL content looks like
- Opinionated analysis and critiques related to ${config.name.toLowerCase()} or the broader ecosystem
- Explains mechanisms or tradeoffs with technical depth
- Uses concrete data (metrics, adoption stats, technical benchmarks)
- Shares playbooks or frameworks WITHOUT selling a product
- Can be blunt or strongly worded, but still analytical

## What is NOT a KOL
- Price-only hype, "moon" talk, or meme-only accounts
- News aggregators who repost without analysis
- Engagement farming ("like/RT/follow to win", giveaways)
- Accounts dominated by shilling a single project

## Scoring Criteria (0.0 - 1.0 each)

### topicConsistencyScore
Does the user regularly discuss ${config.name.toLowerCase()} or related topics with substance?
- 0.75+: Consistent, high-signal analysis or education
- 0.55-0.74: Regular relevant content mixed with other topics
- <0.55: Rare or shallow mentions, mostly promotional

### contentDepthScore
Does the content show REAL KNOWLEDGE and provide VALUE about ${config.name.toLowerCase()}?
- 0.75+: Original analysis, technical explanations, market structure, clear reasoning
- 0.6-0.74: Useful perspectives, some original insight
- <0.6: Surface-level takes, hype, promotional language, no insight

### topicFocusScore
Is this person a focused EXPERT voice on ${config.name.toLowerCase()}, not a generalist or promoter?
- 0.7+: Focused independent analyst
- 0.6-0.69: Broader topic focus with genuine expertise
- <0.6: Too scattered or primarily self-promotional

## Red Flags (auto-disqualify if high severity)
- company_founder: Bio includes founder/CEO/co-founder
- corporate_account: Official project/company account or announcements
- self_promotion: Primarily promotes own product/token/project
- engagement_farming: Giveaways, "like/RT/follow to win"
- shill_behavior: Paid promos, constant token pumping
- only_retweets: No original content
- low_quality_content: Emojis only, memes only, no reasoning
- bot_like_behavior: Automated, repetitive, spam-like posts

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
  }

  /**
   * Build secondary categorization system prompt for DEVELOPER vs ACTIVE_USER
   * Used for accounts that were marked UNCATEGORIZED in primary categorization
   */
  static buildSecondarySystemPrompt(config: SearchConfiguration): string {
    return `You are an expert analyst classifying previously-uncategorized Twitter/X accounts for the ${config.name} ecosystem.

${config.topic_context}

IMPORTANT: These accounts were already reviewed for KOL quality and were NOT KOLs.
Do NOT return KOL. Only choose from: DEVELOPER, ACTIVE_USER, UNCATEGORIZED.

## Category Definitions

### DEVELOPER
Personal account showing clear evidence of building or contributing to software related to ${config.name}.
Strong signals include:
- Code snippets, technical threads, build logs, or architecture discussions
- GitHub links, repos, PRs, SDKs, APIs, open-source contributions
- Role signals like "engineer", "developer", "builder", "infra", "backend"
- Technical problem-solving or debugging related to ${config.name.toLowerCase()}

### ACTIVE_USER
Non-developer who actively uses or experiments with ${config.name} or related technologies.
Signals include:
- Describing real usage, integrations, demos, or feedback
- Asking/answering practical questions about using ${config.name.toLowerCase()}
- Sharing results, learnings, or issues from active usage
- NOT a company founder or CEO (those are excluded)

### UNCATEGORIZED
Use when there is insufficient evidence, or the account is:
- A company/brand/official account
- Purely promotional, marketing, or hype-driven
- Mostly memes/retweets/engagement farming
- Not clearly related to ${config.name.toLowerCase()} usage or building

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
  }

  /**
   * Build user data prompt with account info and tweets
   * Used as the user message in the AI conversation
   */
  static buildUserPrompt(
    account: Account,
    tweets: RapidApiTweet[],
    config: SearchConfiguration
  ): string {
    const tweetsFormatted = tweets
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

    return `Analyze this Twitter user's ${config.name}-related activity:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}
**Followers:** ${account.followers_count.toLocaleString()}

**Their ${config.name}-related tweets:**

${tweetsFormatted}

Based on these tweets, categorize this user according to the criteria.`;
  }

  /**
   * Build batch processing system prompt for multiple users at once
   * More token-efficient for analyzing multiple accounts in one AI call
   */
  static buildBatchSystemPrompt(config: SearchConfiguration): string {
    // Similar to enhanced, but optimized for batch processing
    return `You are an expert analyst categorizing MULTIPLE Twitter/X users at once based on their ${config.name}-related activity.

${config.topic_context}

You will receive multiple user profiles with their tweets. Analyze each independently and return a JSON array.

PRIMARY RULE: A KOL must be independent. If the bio says Founder/CEO/Co-founder, they are NOT a KOL.

## Scoring Criteria (0.0 - 1.0 each)

topicConsistencyScore: Does user regularly discuss ${config.name.toLowerCase()} with substance?
contentDepthScore: Does content show REAL KNOWLEDGE about ${config.name.toLowerCase()}?
topicFocusScore: Is this a focused EXPERT voice on ${config.name.toLowerCase()}?

## KOL Decision
Classify as KOL if ALL are true:
- Independent (no founder/CEO ties)
- No high-severity red flags
- contentDepthScore >= 0.7
- topicFocusScore >= 0.6
- topicConsistencyScore >= 0.6 OR contentDepthScore >= 0.7 with 3+ substantive tweets

Respond with a JSON array (one object per user):
[
  {
    "username": "@user1",
    "category": "KOL" | "UNCATEGORIZED",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation",
    "topicConsistencyScore": 0.0-1.0,
    "contentDepthScore": 0.0-1.0,
    "topicFocusScore": 0.0-1.0,
    "redFlags": [],
    "primaryTopics": []
  }
]`;
  }

  /**
   * Build batch secondary categorization prompt
   */
  static buildBatchSecondarySystemPrompt(config: SearchConfiguration): string {
    return `You are an expert analyst classifying MULTIPLE previously-uncategorized Twitter/X accounts for ${config.name}.

${config.topic_context}

These accounts were NOT KOLs. Only choose: DEVELOPER, ACTIVE_USER, UNCATEGORIZED.

DEVELOPER: Building software related to ${config.name.toLowerCase()}.
ACTIVE_USER: Using/experimenting with ${config.name.toLowerCase()}.
UNCATEGORIZED: Insufficient evidence.

Respond with a JSON array:
[
  {
    "username": "@user1",
    "category": "DEVELOPER" | "ACTIVE_USER" | "UNCATEGORIZED",
    "confidence": 0.0-1.0,
    "reasoning": "Brief evidence"
  }
]`;
  }

  /**
   * Format tweets for display in prompts
   */
  static formatTweets(tweets: RapidApiTweet[]): string {
    return tweets
      .map((tweet, index) => {
        const date = new Date(tweet.created_at).toLocaleDateString();
        const views = tweet.views ? parseInt(tweet.views, 10) : 0;
        return `---
Tweet ${index + 1} (${date}):
"${tweet.text}"
Views: ${views.toLocaleString()} | Likes: ${tweet.favorites} | Retweets: ${tweet.retweets}
---`;
      })
      .join('\n\n');
  }
}
