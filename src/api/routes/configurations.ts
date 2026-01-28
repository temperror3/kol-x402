import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ConfigurationModel } from '../../db/configuration.model.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const createConfigSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  primary_keywords: z.array(z.string()).min(1),
  secondary_keywords: z.array(z.string()).default([]),
  topic_context: z.string().min(1),
  min_followers: z.number().int().min(0).default(1000),
  min_relevance_score: z.number().min(0).max(100).default(30),
  min_tweet_count_30d: z.number().int().min(0).default(3),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

const updateConfigSchema = createConfigSchema.partial();

/**
 * POST /api/configurations
 * Create a new search configuration
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = createConfigSchema.parse(req.body);

    const existing = await ConfigurationModel.getByName(body.name);
    if (existing) {
      res.status(409).json({ error: 'A configuration with this name already exists' });
      return;
    }

    const config = await ConfigurationModel.create({
      name: body.name,
      description: body.description,
      primary_keywords: body.primary_keywords,
      secondary_keywords: body.secondary_keywords,
      topic_context: body.topic_context,
      min_followers: body.min_followers,
      min_relevance_score: body.min_relevance_score,
      min_tweet_count_30d: body.min_tweet_count_30d,
      is_active: body.is_active,
      is_default: body.is_default,
    });

    if (!config) {
      res.status(500).json({ error: 'Failed to create configuration' });
      return;
    }

    if (body.is_default) {
      await ConfigurationModel.setDefault(config.id);
    }

    res.status(201).json(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }
    logger.error('Error creating configuration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/configurations
 * List all configurations
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const configs = await ConfigurationModel.list();

    const withStats = await Promise.all(
      configs.map(async (c) => {
        const stats = await ConfigurationModel.getConfigStats(c.id);
        return {
          ...c,
          account_count: stats.accountCount,
          kol_count: stats.kolCount,
          developer_count: stats.developerCount,
          active_user_count: stats.activeUserCount,
        };
      })
    );

    res.json({ data: withStats });
  } catch (error) {
    logger.error('Error listing configurations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/configurations/default
 * Get the default configuration (must be before :id to avoid "default" as id)
 */
router.get('/default', async (_req: Request, res: Response) => {
  try {
    const config = await ConfigurationModel.getDefault();
    if (!config) {
      res.status(404).json({ error: 'No default configuration found' });
      return;
    }
    res.json(config);
  } catch (error) {
    logger.error('Error getting default configuration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/configurations/:id
 * Get a single configuration with stats
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const config = await ConfigurationModel.getById(req.params.id);
    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }
    const stats = await ConfigurationModel.getConfigStats(config.id);
    res.json({ ...config, ...stats });
  } catch (error) {
    logger.error('Error getting configuration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/configurations/:id
 * Update a configuration
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const body = updateConfigSchema.parse(req.body);

    const existing = await ConfigurationModel.getById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    if (body.name !== undefined && body.name !== existing.name) {
      const byName = await ConfigurationModel.getByName(body.name);
      if (byName) {
        res.status(409).json({ error: 'A configuration with this name already exists' });
        return;
      }
    }

    const config = await ConfigurationModel.update(req.params.id, body);
    if (!config) {
      res.status(500).json({ error: 'Failed to update configuration' });
      return;
    }

    if (body.is_default === true) {
      await ConfigurationModel.setDefault(config.id);
    }

    res.json(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }
    logger.error('Error updating configuration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/configurations/:id
 * Delete a configuration (cannot delete default)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await ConfigurationModel.getById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }
    if (existing.is_default) {
      res.status(400).json({ error: 'Cannot delete the default configuration. Set another as default first.' });
      return;
    }

    const ok = await ConfigurationModel.delete(req.params.id);
    if (!ok) {
      res.status(500).json({ error: 'Failed to delete configuration' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting configuration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/configurations/:id/set-default
 * Set this configuration as the default
 */
router.post('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const existing = await ConfigurationModel.getById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    const ok = await ConfigurationModel.setDefault(req.params.id);
    if (!ok) {
      res.status(500).json({ error: 'Failed to set default configuration' });
      return;
    }
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    logger.error('Error setting default configuration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
