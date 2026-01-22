import { Router, Request, Response } from 'express';
import { AccountModel } from '../../db/account.model.js';
import { logger } from '../../utils/logger.js';
import type { Category } from '../../types/index.js';

const router = Router();

/**
 * GET /api/analytics/summary
 * Get overall stats and category breakdown (uses AI categories)
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const categoryStats = await AccountModel.getAICategoryStats();

    const total = Object.values(categoryStats).reduce((sum, count) => sum + count, 0);

    // Get top accounts per AI category
    const [topKOLs, topDevs, topUsers] = await Promise.all([
      AccountModel.list({ aiCategory: 'KOL' }, 1, 5, 'ai_confidence', 'desc'),
      AccountModel.list({ aiCategory: 'DEVELOPER' }, 1, 5, 'ai_confidence', 'desc'),
      AccountModel.list({ aiCategory: 'ACTIVE_USER' }, 1, 5, 'ai_confidence', 'desc'),
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
          confidence: a.ai_confidence,
          reasoning: a.ai_reasoning,
          twitter_url: `https://twitter.com/${a.username}`,
        })),
        DEVELOPER: topDevs.data.map((a) => ({
          username: a.username,
          display_name: a.display_name,
          confidence: a.ai_confidence,
          reasoning: a.ai_reasoning,
          has_github: a.has_github,
          twitter_url: `https://twitter.com/${a.username}`,
        })),
        ACTIVE_USER: topUsers.data.map((a) => ({
          username: a.username,
          display_name: a.display_name,
          confidence: a.ai_confidence,
          reasoning: a.ai_reasoning,
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
 * Export accounts as CSV (uses AI categories)
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as Category | undefined;
    const minConfidence = parseFloat(req.query.minConfidence as string) || 0;

    // Generate CSV with AI fields
    const headers = [
      'username',
      'display_name',
      'twitter_url',
      'category',
      'confidence',
      'reasoning',
      'followers_count',
      'has_github',
      'categorized_at',
      'bio',
    ];

    const allRows: string[][] = [];

    // Paginate through all accounts to avoid Supabase's default row limit
    const pageSize = 1000;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await AccountModel.list(
        { aiCategory: category, minAiConfidence: minConfidence },
        page,
        pageSize,
        'ai_confidence',
        'desc'
      );

      const rows = result.data.map((account) => [
        account.username,
        `"${(account.display_name || '').replace(/"/g, '""')}"`,
        `https://twitter.com/${account.username}`,
        account.ai_category || 'UNCATEGORIZED',
        String(account.ai_confidence || 0),
        `"${(account.ai_reasoning || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        String(account.followers_count),
        String(account.has_github),
        account.ai_categorized_at || '',
        `"${(account.bio || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      ]);

      allRows.push(...rows);
      hasMore = page < result.pagination.totalPages;
      page++;
    }

    const csv = [headers.join(','), ...allRows.map((row) => row.join(','))].join('\n');

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
 * Get outreach recommendations based on AI categories
 */
router.get('/outreach', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as Category | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Get accounts sorted by AI confidence
    const result = await AccountModel.list({ aiCategory: category }, 1, limit, 'ai_confidence', 'desc');

    const recommendations = result.data.map((account) => {
      // Generate outreach recommendation based on AI category
      const recommendation = getAIOutreachRecommendation(
        account.ai_category || 'UNCATEGORIZED',
        account.ai_reasoning || ''
      );
      return {
        account: {
          username: account.username,
          display_name: account.display_name,
          twitter_url: `https://twitter.com/${account.username}`,
          category: account.ai_category || 'UNCATEGORIZED',
          confidence: account.ai_confidence || 0,
          reasoning: account.ai_reasoning,
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
 * GET /api/analytics/confidence-distribution
 * Get AI confidence distribution data for visualization
 */
router.get('/confidence-distribution', async (_req: Request, res: Response) => {
  try {
    // Calculate confidence distribution
    const confidenceBuckets = new Array(10).fill(0);
    const byCategory: Record<string, number[]> = {
      KOL: new Array(10).fill(0),
      DEVELOPER: new Array(10).fill(0),
      ACTIVE_USER: new Array(10).fill(0),
      UNCATEGORIZED: new Array(10).fill(0),
    };

    // Paginate through all accounts to avoid Supabase's default row limit
    const pageSize = 1000;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await AccountModel.list({}, page, pageSize, 'ai_confidence', 'desc');

      result.data.forEach((account) => {
        const confidence = account.ai_confidence || 0;
        const confIdx = Math.min(Math.floor(confidence * 10), 9);
        confidenceBuckets[confIdx]++;

        const category = account.ai_category || 'UNCATEGORIZED';
        if (category in byCategory) {
          byCategory[category][confIdx]++;
        }
      });

      hasMore = page < result.pagination.totalPages;
      page++;
    }

    const bucketLabels = ['0-0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '0.4-0.5', '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'];

    res.json({
      overall: bucketLabels.map((label, i) => ({ range: label, count: confidenceBuckets[i] })),
      byCategory: {
        KOL: bucketLabels.map((label, i) => ({ range: label, count: byCategory.KOL[i] })),
        DEVELOPER: bucketLabels.map((label, i) => ({ range: label, count: byCategory.DEVELOPER[i] })),
        ACTIVE_USER: bucketLabels.map((label, i) => ({ range: label, count: byCategory.ACTIVE_USER[i] })),
        UNCATEGORIZED: bucketLabels.map((label, i) => ({ range: label, count: byCategory.UNCATEGORIZED[i] })),
      },
    });
  } catch (error) {
    logger.error('Error getting confidence distribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for AI-based outreach recommendations
function getAIOutreachRecommendation(
  category: string,
  reasoning: string
): { priority: 'high' | 'medium' | 'low'; action: string; template: string } {
  switch (category) {
    case 'KOL':
      return {
        priority: 'high',
        action: 'Partner for promotion and awareness campaigns',
        template: `Hi! We noticed your influential content about x402. Would you be interested in a partnership to help spread awareness about HTTP 402 payment protocol?`,
      };
    case 'DEVELOPER':
      return {
        priority: 'high',
        action: 'Invite to build and host APIs on the platform',
        template: `Hi! We saw your technical work with x402. We'd love to invite you to our developer program - you could host your APIs and monetize them using the x402 protocol.`,
      };
    case 'ACTIVE_USER':
      return {
        priority: 'medium',
        action: 'Invite to try the platform and provide feedback',
        template: `Hi! We noticed your interest in x402. Would you like early access to try our platform? We'd love your feedback!`,
      };
    default:
      return {
        priority: 'low',
        action: 'Monitor for future engagement',
        template: `Thanks for your interest in x402! Follow us for updates.`,
      };
  }
}

export default router;
