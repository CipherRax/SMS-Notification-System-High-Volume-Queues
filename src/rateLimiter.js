import { redisClient } from './redis.js';
import { config } from './config.js';

class RateLimiter {
  constructor() {
    this.windowMs = config.rateLimit.windowMs;
    this.maxRequests = config.rateLimit.maxRequests;
    this.blockDurationMs = config.rateLimit.blockDurationMs;
  }

  async isAllowed(identifier) {
    const redis = redisClient.getClient();
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const key = `rate_limit:sms:${identifier}`;
    const blockKey = `rate_limit:block:${identifier}`;
    
    try {
      // Check if identifier is currently blocked
      const blockExpiry = await redis.ttl(blockKey);
      if (blockExpiry > 0) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + (blockExpiry * 1000),
          blocked: true,
          blockDuration: blockExpiry * 1000
        };
      }

      // Remove expired entries
      await redis.zremrangebyscore(key, 0, windowStart);

      // Count current requests in window
      const currentRequests = await redis.zcard(key);

      if (currentRequests >= this.maxRequests) {
        // Block the identifier for the specified duration
        await redis.setex(blockKey, Math.ceil(this.blockDurationMs / 1000), '1');
        
        // Get the oldest request to determine reset time
        const oldestRequest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetTime = oldestRequest.length > 0 ? parseInt(oldestRequest[1]) + this.windowMs : now + this.windowMs;

        return {
          allowed: false,
          remaining: 0,
          resetTime,
          blocked: true,
          blockDuration: this.blockDurationMs
        };
      }

      // Add current request
      await redis.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiry for the key
      await redis.expire(key, Math.ceil(this.windowMs / 1000));

      const remaining = this.maxRequests - (currentRequests + 1);
      
      return {
        allowed: true,
        remaining,
        resetTime: now + this.windowMs,
        blocked: false
      };

    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow the request if rate limiting fails
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs,
        blocked: false
      };
    }
  }

  async reset(identifier) {
    const redis = redisClient.getClient();
    const key = `rate_limit:sms:${identifier}`;
    const blockKey = `rate_limit:block:${identifier}`;
    
    try {
      await redis.del(key, blockKey);
      return true;
    } catch (error) {
      console.error('Error resetting rate limit:', error);
      return false;
    }
  }

  async getStatus(identifier) {
    const redis = redisClient.getClient();
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const key = `rate_limit:sms:${identifier}`;
    const blockKey = `rate_limit:block:${identifier}`;
    
    try {
      // Check if blocked
      const blockExpiry = await redis.ttl(blockKey);
      if (blockExpiry > 0) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + (blockExpiry * 1000),
          blocked: true,
          blockDuration: blockExpiry * 1000
        };
      }

      // Count current requests
      await redis.zremrangebyscore(key, 0, windowStart);
      const currentRequests = await redis.zcard(key);
      const remaining = Math.max(0, this.maxRequests - currentRequests);

      return {
        allowed: remaining > 0,
        remaining,
        resetTime: now + this.windowMs,
        blocked: false
      };

    } catch (error) {
      console.error('Error getting rate limit status:', error);
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetTime: now + this.windowMs,
        blocked: false
      };
    }
  }
}

export const rateLimiter = new RateLimiter();
