import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  triggerSearch,
  getSearchQueue,
  isMemoryMode,
  getInMemorySearchStatus,
  getInMemorySearchJob,
  SearchInProgressError,
} from '../../jobs/crawlQueue.js';
import { SearchQueryModel } from '../../db/account.model.js';
import { ConfigurationModel } from '../../db/configuration.model.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const searchRequestSchema = z.object({
  configId: z.string().uuid().optional(),
  maxPages: z.number().int().positive().max(20).optional(),
});

/**
 * POST /api/search/run
 * Trigger a new search job. Uses configId to select configuration; if omitted, uses default.
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const body = searchRequestSchema.parse(req.body);

    const searchConfig = body.configId
      ? await ConfigurationModel.getById(body.configId)
      : await ConfigurationModel.getDefault();

    if (!searchConfig) {
      res.status(400).json({
        error: body.configId
          ? 'Configuration not found'
          : 'No default configuration. Create one via POST /api/configurations or set one as default.',
      });
      return;
    }

    const maxPages = body.maxPages ?? config.search.maxPages;
    let jobId: string;
    let alreadyRunning = false;
    try {
      jobId = await triggerSearch(searchConfig.id, maxPages);
    } catch (err) {
      if (err instanceof SearchInProgressError) {
        jobId = err.jobId;
        alreadyRunning = true;
      } else {
        throw err;
      }
    }

    res.json({
      success: true,
      jobId,
      message: alreadyRunning ? 'Search already in progress' : 'Search job queued',
      configId: searchConfig.id,
      configName: searchConfig.name,
      maxPages,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request body', details: error.errors });
      return;
    }
    logger.error('Error triggering search:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/search/status
 * Get current search job status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (isMemoryMode()) {
      const status = getInMemorySearchStatus();
      return res.json(status);
    }
    const queue = getSearchQueue();

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    // Get recent jobs
    const recentJobs = await queue.getJobs(['completed', 'failed', 'active', 'waiting'], 0, 10);

    const jobs = recentJobs.map((job) => ({
      id: job.id,
      status: job.finishedOn ? 'completed' : job.failedReason ? 'failed' : 'active',
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
      createdAt: job.timestamp,
      finishedAt: job.finishedOn,
    }));

    res.json({
      counts: {
        waiting,
        active,
        completed,
        failed,
      },
      recentJobs: jobs,
    });
  } catch (error) {
    logger.error('Error getting search status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/search/job/:jobId
 * Get specific job status
 */
router.get('/job/:jobId', async (req: Request, res: Response) => {
  try {
    if (isMemoryMode()) {
      const job = getInMemorySearchJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      return res.json(job);
    }
    const queue = getSearchQueue();
    const job = await queue.getJob(req.params.jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const state = await job.getState();

    res.json({
      id: job.id,
      state,
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
      progress: job.progress,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
    });
  } catch (error) {
    logger.error('Error getting job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/search/queries
 * Get search query history
 */
router.get('/queries', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const history = await SearchQueryModel.getHistory(limit);

    res.json({
      queries: history,
      defaultKeywords: {
        primary: config.searchKeywords.primary,
        secondary: config.searchKeywords.secondary,
      },
    });
  } catch (error) {
    logger.error('Error getting search history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/search/keywords
 * Get configured search keywords (from default config if available, else env)
 */
router.get('/keywords', async (_req: Request, res: Response) => {
  try {
    const defaultConfig = await ConfigurationModel.getDefault();
    if (defaultConfig) {
      return res.json({
        primary: defaultConfig.primary_keywords,
        secondary: defaultConfig.secondary_keywords || [],
        all: [...defaultConfig.primary_keywords, ...(defaultConfig.secondary_keywords || [])],
        configId: defaultConfig.id,
        configName: defaultConfig.name,
      });
    }
  } catch (_) {
    // fallback to env
  }
  res.json({
    primary: config.searchKeywords.primary,
    secondary: config.searchKeywords.secondary,
    all: [...config.searchKeywords.primary, ...config.searchKeywords.secondary],
  });
});

export default router;
