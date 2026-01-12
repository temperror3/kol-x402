import { Router, Request, Response } from 'express';
import { AccountModel } from '../../db/account.model.js';
import { getOutreachRecommendation } from '../../categorizer/categoryAssigner.js';
import { logger } from '../../utils/logger.js';
import type { Category } from '../../types/index.js';

const router = Router();

/**
 * GET /api/analytics/summary
 * Get overall stats and category breakdown
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const categoryStats = await AccountModel.getCategoryStats();

    const total = Object.values(categoryStats).reduce((sum, count) => sum + count, 0);

    // Get top accounts per category
    const [topKOLs, topDevs, topUsers] = await Promise.all([
      AccountModel.list({ category: 'KOL' }, 1, 5, 'confidence', 'desc'),
      AccountModel.list({ category: 'DEVELOPER' }, 1, 5, 'confidence', 'desc'),
      AccountModel.list({ category: 'ACTIVE_USER' }, 1, 5, 'confidence', 'desc'),
    ]);

    res.json({
      total,
      byCategory: categoryStats,
      percentages: {
        KOL: total > 0 ? ((categoryStats.KOL / total) * 100).toFixed(1) : '0',
        DEVELOPER: total > 0 ? ((categoryStats.DEVELOPER / total) * 100).toFixed(1) : '0',
        ACTIVE_USER: total > 0 ? ((categoryStats.ACTIVE_USER / total) * 100).toFixed(1) : '0',
        UNCATEGORIZED: total > 0 ? ((categoryStats.UNCATEGORIZED / total) * 100).toFixed(1) : '0',
      },
      topAccounts: {
        KOL: topKOLs.data.map((a) => ({
          username: a.username,
          display_name: a.display_name,
          followers: a.followers_count,
          confidence: a.confidence,
          engagement_score: a.engagement_score,
          twitter_url: `https://twitter.com/${a.username}`,
        })),
        DEVELOPER: topDevs.data.map((a) => ({
          username: a.username,
          display_name: a.display_name,
          tech_score: a.tech_score,
          confidence: a.confidence,
          has_github: a.has_github,
          twitter_url: `https://twitter.com/${a.username}`,
        })),
        ACTIVE_USER: topUsers.data.map((a) => ({
          username: a.username,
          display_name: a.display_name,
          x402_relevance: a.x402_relevance,
          confidence: a.confidence,
          twitter_url: `https://twitter.com/${a.username}`,
        })),
      },
    });
  } catch (error) {
    logger.error('Error getting analytics summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/export
 * Export accounts as CSV
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as Category | undefined;
    const minConfidence = parseFloat(req.query.minConfidence as string) || 0;

    // Get all accounts matching filters
    const result = await AccountModel.list(
      { category, minConfidence },
      1,
      10000, // Get all
      'confidence',
      'desc'
    );

    // Generate CSV
    const headers = [
      'username',
      'display_name',
      'twitter_url',
      'category',
      'confidence',
      'engagement_score',
      'tech_score',
      'x402_relevance',
      'followers_count',
      'has_github',
      'x402_tweet_count_30d',
      'bio',
    ];

    const rows = result.data.map((account) => [
      account.username,
      `"${(account.display_name || '').replace(/"/g, '""')}"`,
      `https://twitter.com/${account.username}`,
      account.category,
      account.confidence,
      account.engagement_score,
      account.tech_score,
      account.x402_relevance,
      account.followers_count,
      account.has_github,
      account.x402_tweet_count_30d,
      `"${(account.bio || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="x402-accounts-${category || 'all'}-${Date.now()}.csv"`
    );
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/outreach
 * Get outreach recommendations
 */
router.get('/outreach', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as Category | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Get accounts sorted by confidence
    const result = await AccountModel.list({ category }, 1, limit, 'confidence', 'desc');

    const recommendations = result.data.map((account) => {
      const recommendation = getOutreachRecommendation(account.category);
      return {
        account: {
          username: account.username,
          display_name: account.display_name,
          twitter_url: `https://twitter.com/${account.username}`,
          category: account.category,
          confidence: account.confidence,
          followers_count: account.followers_count,
          bio: account.bio,
        },
        recommendation,
      };
    });

    // Group by priority
    const byPriority = {
      high: recommendations.filter((r) => r.recommendation.priority === 'high'),
      medium: recommendations.filter((r) => r.recommendation.priority === 'medium'),
      low: recommendations.filter((r) => r.recommendation.priority === 'low'),
    };

    res.json({
      total: recommendations.length,
      byPriority,
      all: recommendations,
    });
  } catch (error) {
    logger.error('Error getting outreach recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/score-distribution
 * Get score distribution data for visualization
 */
router.get('/score-distribution', async (_req: Request, res: Response) => {
  try {
    // Get all accounts
    const result = await AccountModel.list({}, 1, 10000, 'confidence', 'desc');

    // Calculate distributions
    const engagementBuckets = new Array(10).fill(0);
    const techBuckets = new Array(10).fill(0);
    const x402Buckets = new Array(10).fill(0);
    const confidenceBuckets = new Array(10).fill(0);

    result.data.forEach((account) => {
      const engIdx = Math.min(Math.floor(account.engagement_score / 10), 9);
      const techIdx = Math.min(Math.floor(account.tech_score / 10), 9);
      const x402Idx = Math.min(Math.floor(account.x402_relevance / 10), 9);
      const confIdx = Math.min(Math.floor(account.confidence / 10), 9);

      engagementBuckets[engIdx]++;
      techBuckets[techIdx]++;
      x402Buckets[x402Idx]++;
      confidenceBuckets[confIdx]++;
    });

    const bucketLabels = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'];

    res.json({
      engagement: bucketLabels.map((label, i) => ({ range: label, count: engagementBuckets[i] })),
      tech: bucketLabels.map((label, i) => ({ range: label, count: techBuckets[i] })),
      x402: bucketLabels.map((label, i) => ({ range: label, count: x402Buckets[i] })),
      confidence: bucketLabels.map((label, i) => ({ range: label, count: confidenceBuckets[i] })),
    });
  } catch (error) {
    logger.error('Error getting score distribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
