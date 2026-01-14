import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { createApp } from './api/index.js';
import { startAllWorkers, closeQueues } from './jobs/crawlQueue.js';

async function main(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated');

    // Create Express app
    const app = createApp();

    // Start job workers only if enabled (requires Redis)
    let workers: ReturnType<typeof startAllWorkers> | null = null;
    if (config.enableWorkers) {
      logger.info('Starting job workers...');
      workers = startAllWorkers();
      logger.info('Job workers started');
    } else {
      logger.info('Job workers disabled (set ENABLE_WORKERS=true to enable)');
    }

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API docs: http://localhost:${config.port}/api`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      // Close server
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close workers if they were started
      if (workers) {
        await workers.searchWorker.close();
        await workers.analyzeWorker.close();
        logger.info('Workers closed');

        // Close queues
        await closeQueues();
        logger.info('Queues closed');
      }

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
