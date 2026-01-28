import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CampaignModel, CampaignAccountModel } from '../../db/campaign.model.js';
import { AccountModel } from '../../db/account.model.js';
import { logger } from '../../utils/logger.js';
import { triggerCampaignSearch } from '../../jobs/crawlQueue.js';
import type { Category, AccountFilters } from '../../types/index.js';

const router = Router();

// Campaign create/update schema
const campaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  search_terms: z.array(z.string().min(1)).min(1),
  topic_description: z.string().min(10),
  is_active: z.boolean().optional(),
});

// List query schema
const listQuerySchema = z.object({
  activeOnly: z.coerce.boolean().default(true),
});

// Campaign accounts query schema
const accountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  category: z.enum(['KOL', 'DEVELOPER', 'ACTIVE_USER', 'UNCATEGORIZED']).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  orderBy: z.enum(['ai_confidence', 'created_at', 'ai_categorized_at']).default('ai_confidence'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

// Run discovery schema
const runDiscoverySchema = z.object({
  maxPages: z.number().int().positive().max(20).optional(),
});

/**
 * POST /api/campaigns
 * Create a new campaign
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = campaignSchema.parse(req.body);

    const campaign = await CampaignModel.create({
      name: data.name,
      description: data.description || null,
      search_terms: data.search_terms,
      topic_description: data.topic_description,
      is_default: false,
      is_active: data.is_active ?? true,
    });

    if (!campaign) {
      res.status(500).json({ error: 'Failed to create campaign' });
      return;
    }

    res.status(201).json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }
    logger.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/campaigns
 * List all campaigns
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const campaigns = await CampaignModel.list(query.activeOnly);

    // Get stats for each campaign
    const campaignsWithStats = await Promise.all(
      campaigns.map(async (campaign) => {
        const stats = await CampaignAccountModel.getCategoryStats(campaign.id);
        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        return {
          ...campaign,
          stats: {
            total,
            ...stats,
          },
        };
      })
    );

    res.json(campaignsWithStats);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    logger.error('Error listing campaigns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/campaigns/:id
 * Get campaign by ID with stats
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await CampaignModel.getById(req.params.id);

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Get stats
    const stats = await CampaignAccountModel.getCategoryStats(campaign.id);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    res.json({
      ...campaign,
      stats: {
        total,
        ...stats,
      },
    });
  } catch (error) {
    logger.error('Error getting campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/campaigns/:id
 * Update a campaign
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = campaignSchema.partial().parse(req.body);

    const existing = await CampaignModel.getById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Don't allow changing is_default
    const updates: Record<string, unknown> = { ...data };
    delete (updates as { is_default?: boolean }).is_default;

    const campaign = await CampaignModel.update(req.params.id, updates);

    if (!campaign) {
      res.status(500).json({ error: 'Failed to update campaign' });
      return;
    }

    res.json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }
    logger.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/campaigns/:id
 * Delete a campaign (not allowed for default)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await CampaignModel.getById(req.params.id);

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    if (campaign.is_default) {
      res.status(400).json({ error: 'Cannot delete the default campaign' });
      return;
    }

    const success = await CampaignModel.delete(req.params.id);

    if (!success) {
      res.status(500).json({ error: 'Failed to delete campaign' });
      return;
    }

    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    logger.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/campaigns/:id/run
 * Trigger discovery for a campaign
 */
router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const body = runDiscoverySchema.parse(req.body);

    const campaign = await CampaignModel.getById(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const jobId = await triggerCampaignSearch(
      campaign.id,
      campaign.search_terms,
      campaign.topic_description,
      body.maxPages
    );

    res.json({
      success: true,
      jobId,
      message: 'Campaign discovery job queued',
      campaign: {
        id: campaign.id,
        name: campaign.name,
      },
      searchTerms: campaign.search_terms,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }
    logger.error('Error triggering campaign discovery:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/campaigns/:id/accounts
 * List accounts for a campaign
 */
router.get('/:id/accounts', async (req: Request, res: Response) => {
  try {
    const query = accountsQuerySchema.parse(req.query);

    const campaign = await CampaignModel.getById(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const filters: AccountFilters = {
      aiCategory: query.category as Category | undefined,
      minAiConfidence: query.minConfidence,
    };

    const result = await CampaignAccountModel.listByCampaign(
      campaign.id,
      filters,
      query.page,
      query.limit,
      query.orderBy,
      query.orderDir
    );

    // Transform data for frontend
    const transformedData = result.data.map((item) => ({
      id: item.id,
      campaign_id: item.campaign_id,
      account_id: item.account_id,
      // Account info
      twitter_id: item.account?.twitter_id,
      username: item.account?.username,
      display_name: item.account?.display_name,
      bio: item.account?.bio,
      followers_count: item.account?.followers_count,
      following_count: item.account?.following_count,
      profile_image_url: item.account?.profile_image_url,
      has_github: item.account?.has_github,
      twitter_url: item.account?.username ? `https://twitter.com/${item.account.username}` : null,
      // AI categorization for this campaign
      ai_category: item.ai_category || 'UNCATEGORIZED',
      ai_confidence: item.ai_confidence || 0,
      ai_reasoning: item.ai_reasoning,
      ai_categorized_at: item.ai_categorized_at,
      // Quality scores
      topic_consistency_score: item.topic_consistency_score,
      content_depth_score: item.content_depth_score,
      topic_focus_score: item.topic_focus_score,
      red_flags: item.red_flags,
      primary_topics: item.primary_topics,
      keywords_found: item.keywords_found,
      // Timestamps
      created_at: item.created_at,
      updated_at: item.updated_at,
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
    logger.error('Error listing campaign accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/campaigns/:id/analytics
 * Get analytics for a campaign
 */
router.get('/:id/analytics', async (req: Request, res: Response) => {
  try {
    const campaign = await CampaignModel.getById(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Get category stats
    const byCategory = await CampaignAccountModel.getCategoryStats(campaign.id);
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);

    // Calculate percentages
    const percentages: Record<string, string> = {};
    for (const [key, value] of Object.entries(byCategory)) {
      percentages[key] = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
    }

    // Get top accounts by category
    const topAccounts: Record<string, unknown[]> = {
      KOL: [],
      DEVELOPER: [],
      ACTIVE_USER: [],
    };

    for (const category of ['KOL', 'DEVELOPER', 'ACTIVE_USER'] as const) {
      const result = await CampaignAccountModel.listByCampaign(
        campaign.id,
        { aiCategory: category },
        1,
        5,
        'ai_confidence',
        'desc'
      );

      topAccounts[category] = result.data.map((item) => ({
        username: item.account?.username,
        display_name: item.account?.display_name,
        followers: item.account?.followers_count,
        confidence: item.ai_confidence || 0,
        reasoning: item.ai_reasoning,
        has_github: item.account?.has_github,
        twitter_url: item.account?.username ? `https://twitter.com/${item.account.username}` : null,
      }));
    }

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
      },
      total,
      byCategory,
      percentages,
      topAccounts,
    });
  } catch (error) {
    logger.error('Error getting campaign analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/campaigns/default
 * Get the default campaign
 */
router.get('/default/info', async (_req: Request, res: Response) => {
  try {
    const campaign = await CampaignModel.getDefault();

    if (!campaign) {
      res.status(404).json({ error: 'Default campaign not found' });
      return;
    }

    // Get stats
    const stats = await CampaignAccountModel.getCategoryStats(campaign.id);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    res.json({
      ...campaign,
      stats: {
        total,
        ...stats,
      },
    });
  } catch (error) {
    logger.error('Error getting default campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
