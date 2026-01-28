import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AccountModel, TweetModel } from '../../db/account.model.js';
import { logger } from '../../utils/logger.js';
import type { Category, AccountFilters } from '../../types/index.js';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  category: z.enum(['KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED']).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  hasGithub: z.coerce.boolean().optional(),
  configId: z.string().uuid().optional(),
  orderBy: z.enum(['ai_confidence', 'followers_count', 'created_at', 'ai_categorized_at']).default('ai_confidence'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /api/accounts
 * List accounts with filtering and pagination (uses AI categories)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.parse(req.query);

    const filters: AccountFilters = {
      aiCategory: query.category as Category | undefined,
      minAiConfidence: query.minConfidence,
      hasGithub: query.hasGithub,
      configId: query.configId,
    };

    const result = await AccountModel.list(
      filters,
      query.page,
      query.limit,
      query.orderBy,
      query.orderDir
    );

    // Transform response to use AI fields (matching frontend types)
    const transformedData = result.data.map((account) => ({
      id: account.id,
      twitter_id: account.twitter_id,
      username: account.username,
      display_name: account.display_name,
      bio: account.bio,
      followers_count: account.followers_count,
      following_count: account.following_count,
      tweet_count: account.tweet_count || 0,
      profile_image_url: account.profile_image_url,
      twitter_url: `https://twitter.com/${account.username}`,
      // AI categorization (using ai_ prefix to match frontend)
      ai_category: account.ai_category || 'UNCATEGORIZED',
      ai_confidence: account.ai_confidence || 0,
      ai_reasoning: account.ai_reasoning || null,
      ai_categorized_at: account.ai_categorized_at || null,
      // Metadata
      has_github: account.has_github,
      created_at: account.created_at,
      updated_at: account.updated_at,
    }));

    res.json({
      data: transformedData,
      pagination: result.pagination,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    logger.error('Error listing accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/accounts/:id
 * Get account details with tweets
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const account = await AccountModel.getById(req.params.id);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Get recent tweets
    const tweets = await TweetModel.getByAccountId(account.id!, 50);

    // Return { account, tweets } structure to match frontend expectations
    res.json({
      account: {
        id: account.id,
        twitter_id: account.twitter_id,
        username: account.username,
        display_name: account.display_name,
        bio: account.bio,
        followers_count: account.followers_count,
        following_count: account.following_count,
        tweet_count: account.tweet_count || 0,
        profile_image_url: account.profile_image_url,
        twitter_url: `https://twitter.com/${account.username}`,
        // AI categorization (using ai_ prefix to match frontend)
        ai_category: account.ai_category || 'UNCATEGORIZED',
        ai_confidence: account.ai_confidence || 0,
        ai_reasoning: account.ai_reasoning || null,
        ai_categorized_at: account.ai_categorized_at || null,
        // Metadata
        has_github: account.has_github,
        created_at: account.created_at,
        updated_at: account.updated_at,
      },
      tweets: tweets,
    });
  } catch (error) {
    logger.error('Error getting account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/accounts/twitter/:twitterId
 * Get account by Twitter ID
 */
router.get('/twitter/:twitterId', async (req: Request, res: Response) => {
  try {
    const account = await AccountModel.getByTwitterId(req.params.twitterId);

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({
      id: account.id,
      twitter_id: account.twitter_id,
      username: account.username,
      display_name: account.display_name,
      bio: account.bio,
      followers_count: account.followers_count,
      following_count: account.following_count,
      profile_image_url: account.profile_image_url,
      twitter_url: `https://twitter.com/${account.username}`,
      // AI categorization
      category: account.ai_category || 'UNCATEGORIZED',
      confidence: account.ai_confidence || 0,
      reasoning: account.ai_reasoning || null,
      categorized_at: account.ai_categorized_at || null,
      // Metadata
      has_github: account.has_github,
      created_at: account.created_at,
    });
  } catch (error) {
    logger.error('Error getting account by Twitter ID:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update schema
const updateSchema = z.object({
  category: z.enum(['KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED']).optional(),
  reasoning: z.string().optional(),
});

/**
 * PATCH /api/accounts/:id
 * Update account (manual AI category override)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updates = updateSchema.parse(req.body);

    const account = await AccountModel.getById(req.params.id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Update AI category manually
    if (updates.category) {
      await AccountModel.updateAICategory(account.twitter_id, {
        ai_category: updates.category,
        ai_reasoning: updates.reasoning || `Manually set to ${updates.category}`,
        ai_confidence: 1.0, // Manual override = 100% confidence
      });
    }

    // Fetch updated account
    const updatedAccount = await AccountModel.getById(req.params.id);
    res.json({
      id: updatedAccount?.id,
      username: updatedAccount?.username,
      category: updatedAccount?.ai_category,
      confidence: updatedAccount?.ai_confidence,
      reasoning: updatedAccount?.ai_reasoning,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }
    logger.error('Error updating account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/accounts/:id
 * Delete account
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const success = await AccountModel.delete(req.params.id);

    if (!success) {
      res.status(404).json({ error: 'Account not found or delete failed' });
      return;
    }

    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    logger.error('Error deleting account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
