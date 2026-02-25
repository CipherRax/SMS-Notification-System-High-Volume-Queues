import express from 'express';
import { redisClient } from './redis.js';
import { queueProcessor } from './queueProcessor.js';
import { apiRouter } from './api.js';
import { config } from './config.js';

class NotificationSystem {
  constructor() {
    this.app = express();
    this.server = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Setup middleware
      this.setupMiddleware();

      // Connect to Redis
      await redisClient.connect();

      // Initialize queue processor
      await queueProcessor.initialize();

      // Setup routes
      this.setupRoutes();

      // Graceful shutdown handlers
      this.setupGracefulShutdown();

      this.initialized = true;
      console.log('Notification system initialized successfully');

    } catch (error) {
      console.error('Failed to initialize notification system:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      });
      
      next();
    });

    // Error handling middleware
    this.app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/v1', apiRouter.router);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'SMS Notification System',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/api/v1/health',
          sendSMS: '/api/v1/sms/send',
          sendBulkSMS: '/api/v1/sms/bulk',
          getSMSStatus: '/api/v1/sms/status/:jobId',
          queueStats: '/api/v1/queue/stats',
          deliveryLogs: '/api/v1/sms/logs',
          dailyStats: '/api/v1/sms/stats/daily',
          rateLimitStatus: '/api/v1/rate-limit/:identifier',
          resetRateLimit: '/api/v1/rate-limit/:identifier/reset'
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
      
      try {
        // Stop accepting new connections
        if (this.server) {
          this.server.close();
        }

        // Close queue processor
        await queueProcessor.close();

        // Disconnect from Redis
        await redisClient.disconnect();

        console.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }

  async start() {
    if (!this.initialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(config.server.port, config.server.host, (err) => {
        if (err) {
          console.error('Failed to start server:', err);
          reject(err);
        } else {
          console.log(`SMS Notification System running on http://${config.server.host}:${config.server.port}`);
          console.log(`API documentation available at http://${config.server.host}:${config.server.port}/`);
          console.log(`Health check available at http://${config.server.host}:${config.server.port}/api/v1/health`);
          resolve();
        }
      });
    });
  }

  async stop() {
    console.log('Stopping notification system...');
    
    if (this.server) {
      this.server.close();
    }
    
    await queueProcessor.close();
    await redisClient.disconnect();
    
    console.log('Notification system stopped');
  }
}

// Start the application
const notificationSystem = new NotificationSystem();

notificationSystem.start().catch(error => {
  console.error('Failed to start notification system:', error);
  process.exit(1);
});

export default notificationSystem;