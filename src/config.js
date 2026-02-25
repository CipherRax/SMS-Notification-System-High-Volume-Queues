import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Africa's Talking API Configuration
  africasTalking: {
    username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
    apiKey: process.env.AFRICASTALKING_API_KEY,
    from: process.env.SMS_SENDER_NAME || 'SlausCop'
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },

  // BullMQ Configuration
  queue: {
    name: process.env.SMS_QUEUE_NAME || 'sms-queue',
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0
    }
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30, // 30 SMS per minute
    blockDurationMs: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION_MS) || 300000 // 5 minutes block
  },

  // Retry Configuration
  retry: {
    maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
    backoffType: process.env.RETRY_BACKOFF_TYPE || 'exponential',
    delay: parseInt(process.env.RETRY_DELAY_MS) || 2000
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || 'localhost'
  }
};
