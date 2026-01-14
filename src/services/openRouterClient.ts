import { OpenRouter } from '@openrouter/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Account, AICategoryResult } from '../types/index.js';
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

Analyze the user's tweets and categorize them into ONE of these categories:

1. KOL (Key Opinion Leader)
   - Has significant influence and followers
   - Creates original content about x402
   - Provides thought leadership, opinions, or analysis
   - Promotes or advocates for x402 adoption
   - High engagement on their posts

2. DEVELOPER
   - Discusses technical implementation details
   - Shares code snippets or GitHub links
   - Asks or answers technical questions
   - Mentions APIs, SDKs, protocols, or integration
   - Shows evidence of building with x402

3. ACTIVE_USER
   - Engages with x402 content (replies, retweets)
   - Asks questions about using x402
   - Shows interest but not technical depth
   - May be a potential adopter or tester

4. UNCATEGORIZED
   - Only 1-2 mentions with no clear pattern
   - Spam or irrelevant content
   - Insufficient data to determine category

Respond ONLY with valid JSON in this exact format:
{
  "category": "KOL" | "DEVELOPER" | "ACTIVE_USER" | "UNCATEGORIZED",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this category was chosen"
}`;

function formatTweets(tweets: RapidApiTweet[]): string {
  return tweets
    .map((tweet, index) => {
      const date = new Date(tweet.created_at).toLocaleDateString();
      return `---
Tweet ${index + 1} (${date}):
"${tweet.text}"
Likes: ${tweet.favorites} | Retweets: ${tweet.retweets} | Replies: ${tweet.replies}
---`;
    })
    .join('\n\n');
}

function buildUserPrompt(account: Account, tweets: RapidApiTweet[]): string {
  const tweetsFormatted = formatTweets(tweets);

  return `Analyze this Twitter user's x402-related activity:

**Username:** @${account.username}
**Display Name:** ${account.display_name}
**Bio:** ${account.bio || 'No bio'}
**Followers:** ${account.followers_count}
**Following:** ${account.following_count}

**Their x402-related tweets (${tweets.length} total):**

${tweetsFormatted}

Based on these tweets, categorize this user.`;
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
    const validCategories = ['KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED'];
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
