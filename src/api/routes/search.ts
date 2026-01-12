import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { triggerSearch, getSearchQueue } from '../../jobs/crawlQueue.js';
import { SearchQueryModel } from '../../db/account.model.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const router = Router();

// Search request schema
const searchRequestSchema = z.object({
  keywords: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().max(500).optional(),
});

/**
 * POST /api/search/run
 * Trigger a new search job
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const body = searchRequestSchema.parse(req.body);

    const keywords = body.keywords || [
      ...config.searchKeywords.primary,
      ...config.searchKeywords.secondary,
    ];
    const maxResults = body.maxResults || config.search.maxResultsPerSearch;

    const jobId = await triggerSearch(keywords, maxResults);

    res.json({
      success: true,
      jobId,
      message: 'Search job queued',
      keywords,
      maxResults,
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
 * Get configured search keywords
 */
router.get('/keywords', async (_req: Request, res: Response) => {
  res.json({
    primary: config.searchKeywords.primary,
    secondary: config.searchKeywords.secondary,
    all: [...config.searchKeywords.primary, ...config.searchKeywords.secondary],
  });
});

export default router;
