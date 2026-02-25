import { Worker, Queue } from 'bullmq';
import { config } from './config.js';
import { redisClient } from './redis.js';
import { smsService } from './smsService.js';

class QueueProcessor {
  constructor() {
    this.queue = null;
    this.worker = null;
    this.processing = false;
  }

  async initialize() {
    try {
      // Create queue
      this.queue = new Queue(config.queue.name, {
        connection: config.queue.connection
      });

      // Create worker with retry configuration
      this.worker = new Worker(
        config.queue.name,
        this.processSMSJob.bind(this),
        {
          connection: config.queue.connection,
          concurrency: 5, // Process 5 jobs concurrently
          settings: {
            stalledInterval: 30 * 1000, // 30 seconds
            maxStalledCount: 1, // Allow 1 stall before moving to next attempt
          }
        }
      );

      // Set up event listeners
      this.setupEventListeners();

      console.log('Queue processor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize queue processor:', error);
      throw error;
    }
  }

  setupEventListeners() {
    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
      this.updateJobMetrics(job, 'completed');
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err.message);
      this.updateJobMetrics(job, 'failed', err);
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    this.worker.on('stalled', (job) => {
      console.warn(`Job ${job.id} stalled`);
    });

    this.queue.on('waiting', (job) => {
      console.log(`Job ${job.id} is waiting`);
    });

    this.queue.on('active', (job) => {
      console.log(`Job ${job.id} is now active`);
    });
  }

  async processSMSJob(job) {
    const { to, message, identifier, priority, metadata } = job.data;
    
    try {
      console.log(`Processing SMS job ${job.id} to ${to}`);
      
      // Add processing metadata
      const processingStart = Date.now();
      
      // Send SMS
      const result = await smsService.sendSMS({ to, message, identifier });
      
      const processingTime = Date.now() - processingStart;
      
      // Update job with success data
      await job.updateProgress(100);
      await job.addResult({
        ...result,
        processingTime,
        processedAt: new Date().toISOString(),
        metadata
      });

      return result;

    } catch (error) {
      // Update job with error data
      await job.updateProgress(0);
      await job.addResult({
        error: error.message,
        processedAt: new Date().toISOString(),
        metadata
      });

      // Determine if we should retry based on error type
      if (this.shouldRetry(error)) {
        throw error; // Re-throw to trigger BullMQ retry mechanism
      } else {
        // Don't retry for certain errors (invalid numbers, etc.)
        throw new Error(`Non-retryable error: ${error.message}`);
      }
    }
  }

  shouldRetry(error) {
    const nonRetryableErrors = [
      'Rate limit exceeded',
      'Invalid phone number format',
      'Message cannot be empty',
      'Non-retryable error'
    ];

    return !nonRetryableErrors.some(nonRetryableError => 
      error.message.includes(nonRetryableError)
    );
  }

  async addSMSJob(smsData, options = {}) {
    const jobOptions = {
      attempts: config.retry.maxAttempts,
      backoff: {
        type: config.retry.backoffType,
        delay: config.retry.delay
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 50, // Keep last 50 failed jobs
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...options
    };

    try {
      const job = await this.queue.add('send-sms', smsData, jobOptions);
      console.log(`SMS job added to queue: ${job.id}`);
      return job;
    } catch (error) {
      console.error('Failed to add SMS job to queue:', error);
      throw error;
    }
  }

  async addBulkSMSJobs(messages, options = {}) {
    const jobs = [];
    
    for (const smsData of messages) {
      try {
        const job = await this.addSMSJob(smsData, options);
        jobs.push({ smsData, jobId: job.id, success: true });
      } catch (error) {
        jobs.push({ smsData, error: error.message, success: false });
      }
    }
    
    return jobs;
  }

  async getJobStatus(jobId) {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress;
      const result = job.returnvalue;
      const failedReason = job.failedReason;
      const processedOn = job.processedOn;
      const finishedOn = job.finishedOn;

      return {
        id: job.id,
        data: job.data,
        state,
        progress,
        result,
        failedReason,
        processedOn,
        finishedOn,
        createdAt: job.timestamp,
        attemptsMade: job.attemptsMade,
        opts: job.opts
      };
    } catch (error) {
      console.error('Failed to get job status:', error);
      return null;
    }
  }

  async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed()
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return null;
    }
  }

  async updateJobMetrics(job, status, error = null) {
    const redis = redisClient.getClient();
    
    try {
      const metrics = {
        jobId: job.id,
        status,
        timestamp: new Date().toISOString(),
        processingTime: job.finishedOn ? job.finishedOn - job.processedOn : null,
        attempts: job.attemptsMade,
        error: error ? error.message : null
      };

      // Store metrics
      await redis.lpush('job_metrics', JSON.stringify(metrics));
      await redis.ltrim('job_metrics', 0, 999); // Keep last 1000 entries

      // Update daily counters
      const today = new Date().toISOString().split('T')[0];
      const counterKey = `job_metrics:${today}:${status}`;
      await redis.incr(counterKey);
      await redis.expire(counterKey, 86400 * 7); // Keep for 7 days

    } catch (metricsError) {
      console.error('Failed to update job metrics:', metricsError);
    }
  }

  async getJobMetrics(limit = 50, offset = 0) {
    const redis = redisClient.getClient();
    
    try {
      const metrics = await redis.lrange('job_metrics', offset, offset + limit - 1);
      return metrics.map(metric => JSON.parse(metric));
    } catch (error) {
      console.error('Failed to get job metrics:', error);
      return [];
    }
  }

  async pause() {
    try {
      await this.worker.pause();
      this.processing = false;
      console.log('Queue processor paused');
    } catch (error) {
      console.error('Failed to pause queue processor:', error);
      throw error;
    }
  }

  async resume() {
    try {
      await this.worker.resume();
      this.processing = true;
      console.log('Queue processor resumed');
    } catch (error) {
      console.error('Failed to resume queue processor:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.worker) {
        await this.worker.close();
      }
      if (this.queue) {
        await this.queue.close();
      }
      console.log('Queue processor closed');
    } catch (error) {
      console.error('Failed to close queue processor:', error);
      throw error;
    }
  }
}

export const queueProcessor = new QueueProcessor();
