import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Import routes
import accountsRouter from './routes/accounts.js';
import searchRouter from './routes/search.js';
import analyticsRouter from './routes/analytics.js';
import campaignsRouter from './routes/campaigns.js';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' },
  });
  app.use(limiter);

  // Body parsing
  app.use(express.json());

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API info
  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      name: 'KOL Finder API',
      version: '2.0.0',
      endpoints: {
        campaigns: {
          'POST /api/campaigns': 'Create campaign',
          'GET /api/campaigns': 'List campaigns',
          'GET /api/campaigns/:id': 'Get campaign with stats',
          'PUT /api/campaigns/:id': 'Update campaign',
          'DELETE /api/campaigns/:id': 'Delete campaign (not default)',
          'POST /api/campaigns/:id/run': 'Trigger discovery',
          'GET /api/campaigns/:id/accounts': 'List campaign accounts',
          'GET /api/campaigns/:id/analytics': 'Campaign analytics',
          'GET /api/campaigns/default/info': 'Get default campaign',
        },
        accounts: {
          'GET /api/accounts': 'List accounts with filtering',
          'GET /api/accounts/:id': 'Get account details',
          'GET /api/accounts/twitter/:twitterId': 'Get account by Twitter ID',
          'PATCH /api/accounts/:id': 'Update account',
          'DELETE /api/accounts/:id': 'Delete account',
        },
        search: {
          'POST /api/search/run': 'Trigger search job',
          'GET /api/search/status': 'Get search status',
          'GET /api/search/job/:jobId': 'Get job status',
          'GET /api/search/queries': 'Get search history',
          'GET /api/search/keywords': 'Get configured keywords',
        },
        analytics: {
          'GET /api/analytics/summary': 'Get stats summary',
          'GET /api/analytics/export': 'Export as CSV',
          'GET /api/analytics/outreach': 'Get outreach recommendations',
          'GET /api/analytics/score-distribution': 'Get score distributions',
        },
      },
    });
  });

  // Mount routes
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/accounts', accountsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/analytics', analyticsRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
