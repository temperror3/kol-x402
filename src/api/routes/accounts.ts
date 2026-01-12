import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AccountModel, TweetModel } from '../../db/account.model.js';
import { logger } from '../../utils/logger.js';
import type { Category, AccountFilters } from '../../types/index.js';

const router = Router();

// Query params schema
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  category: z.enum(['KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED']).optional(),
  minEngagementScore: z.coerce.number().min(0).max(100).optional(),
  minTechScore: z.coerce.number().min(0).max(100).optional(),
  minX402Relevance: z.coerce.number().min(0).max(100).optional(),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  hasGithub: z.coerce.boolean().optional(),
  orderBy: z.enum(['confidence', 'engagement_score', 'tech_score', 'x402_relevance', 'followers_count', 'created_at']).default('confidence'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /api/accounts
 * List accounts with filtering and pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.parse(req.query);

    const filters: AccountFilters = {
      category: query.category as Category | undefined,
      minEngagementScore: query.minEngagementScore,
      minTechScore: query.minTechScore,
      minX402Relevance: query.minX402Relevance,
      minConfidence: query.minConfidence,
      hasGithub: query.hasGithub,
    };

    const result = await AccountModel.list(
      filters,
      query.page,
      query.limit,
      query.orderBy,
      query.orderDir
    );

    res.json(result);
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

    res.json({
      ...account,
      recent_tweets: tweets,
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

    res.json(account);
  } catch (error) {
    logger.error('Error getting account by Twitter ID:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update schema
const updateSchema = z.object({
  category: z.enum(['KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED']).optional(),
  notes: z.string().optional(),
});

/**
 * PATCH /api/accounts/:id
 * Update account (manual category override, notes)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updates = updateSchema.parse(req.body);

    const account = await AccountModel.getById(req.params.id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (updates.category) updateData.category = updates.category;
    // Notes would need to be added to schema if needed

    // For now, we can update category through updateScores
    if (updates.category) {
      await AccountModel.updateScores(account.twitter_id, {
        engagement_score: account.engagement_score,
        tech_score: account.tech_score,
        x402_relevance: account.x402_relevance,
        confidence: account.confidence,
        category: updates.category,
        x402_tweet_count_30d: account.x402_tweet_count_30d,
        has_github: account.has_github,
        uses_technical_terms: account.uses_technical_terms,
        posts_code_snippets: account.posts_code_snippets,
      });
    }

    // Fetch updated account
    const updatedAccount = await AccountModel.getById(req.params.id);
    res.json(updatedAccount);
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
