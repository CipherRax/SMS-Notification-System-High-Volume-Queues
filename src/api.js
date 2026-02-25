import express from 'express';
import { queueProcessor } from './queueProcessor.js';
import { smsService } from './smsService.js';
import { redisClient } from './redis.js';

class APIRouter {
  constructor() {
    this.router = express.Router();
    this.setupRoutes();
  }

  setupRoutes() {
    // Send single SMS
    this.router.post('/sms/send', this.sendSMS.bind(this));
    
    // Send bulk SMS
    this.router.post('/sms/bulk', this.sendBulkSMS.bind(this));
    
    // Get SMS status
    this.router.get('/sms/status/:jobId', this.getSMSStatus.bind(this));
    
    // Get queue stats
    this.router.get('/queue/stats', this.getQueueStats.bind(this));
    
    // Get delivery logs
    this.router.get('/sms/logs', this.getDeliveryLogs.bind(this));
    
    // Get daily stats
    this.router.get('/sms/stats/daily', this.getDailyStats.bind(this));
    
    // Get rate limit status
    this.router.get('/rate-limit/:identifier', this.getRateLimitStatus.bind(this));
    
    // Reset rate limit
    this.router.post('/rate-limit/:identifier/reset', this.resetRateLimit.bind(this));
    
    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  async sendSMS(req, res) {
    try {
      const { to, message, identifier, priority, metadata } = req.body;

      // Validate required fields
      if (!to || !message) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: to, message'
        });
      }

      // Add to queue
      const job = await queueProcessor.addSMSJob({
        to,
        message,
        identifier: identifier || 'api',
        priority: priority || 0,
        metadata: metadata || {}
      });

      res.status(202).json({
        success: true,
        jobId: job.id,
        message: 'SMS queued for delivery',
        queuePosition: await job.getQueuePosition()
      });

    } catch (error) {
      console.error('Error queuing SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to queue SMS',
        details: error.message
      });
    }
  }

  async sendBulkSMS(req, res) {
    try {
      const { messages, identifier, priority } = req.body;

      // Validate required fields
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid messages array'
        });
      }

      // Validate each message
      for (const msg of messages) {
        if (!msg.to || !msg.message) {
          return res.status(400).json({
            success: false,
            error: 'Each message must contain to and message fields'
          });
        }
      }

      // Add to queue
      const results = await queueProcessor.addBulkSMSJobs(messages, {
        identifier: identifier || 'bulk-api',
        priority: priority || 0
      });

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      res.status(202).json({
        success: true,
        message: `Bulk SMS processing started`,
        total: messages.length,
        successful: successful.length,
        failed: failed.length,
        results: results
      });

    } catch (error) {
      console.error('Error queuing bulk SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to queue bulk SMS',
        details: error.message
      });
    }
  }

  async getSMSStatus(req, res) {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: 'Job ID is required'
        });
      }

      const jobStatus = await queueProcessor.getJobStatus(jobId);

      if (!jobStatus) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }

      res.json({
        success: true,
        job: jobStatus
      });

    } catch (error) {
      console.error('Error getting SMS status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get SMS status',
        details: error.message
      });
    }
  }

  async getQueueStats(req, res) {
    try {
      const stats = await queueProcessor.getQueueStats();
      const metrics = await queueProcessor.getJobMetrics(10);

      res.json({
        success: true,
        stats,
        recentMetrics: metrics
      });

    } catch (error) {
      console.error('Error getting queue stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue stats',
        details: error.message
      });
    }
  }

  async getDeliveryLogs(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const logs = await smsService.getDeliveryLogs(limit, offset);

      res.json({
        success: true,
        logs,
        pagination: {
          limit,
          offset,
          total: logs.length
        }
      });

    } catch (error) {
      console.error('Error getting delivery logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get delivery logs',
        details: error.message
      });
    }
  }

  async getDailyStats(req, res) {
    try {
      const date = req.query.date || new Date().toISOString().split('T')[0];
      const stats = await smsService.getDailyStats(date);

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error('Error getting daily stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get daily stats',
        details: error.message
      });
    }
  }

  async getRateLimitStatus(req, res) {
    try {
      const { identifier } = req.params;

      if (!identifier) {
        return res.status(400).json({
          success: false,
          error: 'Identifier is required'
        });
      }

      const status = await smsService.getRateLimitStatus(identifier);

      res.json({
        success: true,
        identifier,
        rateLimit: status
      });

    } catch (error) {
      console.error('Error getting rate limit status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get rate limit status',
        details: error.message
      });
    }
  }

  async resetRateLimit(req, res) {
    try {
      const { identifier } = req.params;

      if (!identifier) {
        return res.status(400).json({
          success: false,
          error: 'Identifier is required'
        });
      }

      const success = await smsService.resetRateLimit(identifier);

      if (success) {
        res.json({
          success: true,
          message: `Rate limit reset for identifier: ${identifier}`
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to reset rate limit'
        });
      }

    } catch (error) {
      console.error('Error resetting rate limit:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset rate limit',
        details: error.message
      });
    }
  }

  async healthCheck(req, res) {
    try {
      const redis = redisClient.getClient();
      const redisHealth = await redisClient.healthCheck();
      const queueStats = await queueProcessor.getQueueStats();

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          redis: redisHealth ? 'healthy' : 'unhealthy',
          queue: queueStats ? 'healthy' : 'unhealthy'
        },
        queue: queueStats
      };

      if (!redisHealth || !queueStats) {
        health.status = 'degraded';
        res.status(503);
      }

      res.json(health);

    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
}

export const apiRouter = new APIRouter();
