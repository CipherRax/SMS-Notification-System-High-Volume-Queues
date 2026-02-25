import africastalking from 'africastalking';
import { config } from './config.js';
import { redisClient } from './redis.js';
import { rateLimiter } from './rateLimiter.js';

class SMSService {
  constructor() {
    this.client = africastalking({
      username: config.africasTalking.username,
      apiKey: config.africasTalking.apiKey
    });
    this.from = config.africasTalking.from;
  }

  async sendSMS({ to, message, identifier = 'default' }) {
    try {
      // Check rate limits
      const rateLimitResult = await rateLimiter.isAllowed(identifier);
      
      if (!rateLimitResult.allowed) {
        throw new Error(`Rate limit exceeded. Blocked for ${Math.ceil(rateLimitResult.blockDuration / 1000)} seconds`);
      }

      // Validate phone number
      if (!this.isValidPhoneNumber(to)) {
        throw new Error('Invalid phone number format');
      }

      // Validate message
      if (!message || message.trim().length === 0) {
        throw new Error('Message cannot be empty');
      }

      if (message.length > 160) {
        console.warn(`Message length (${message.length}) exceeds standard SMS limit (160 chars)`);
      }

      // Send SMS via Africa's Talking API
      const smsData = {
        to: [to],
        message: message.trim(),
        from: this.from
      };

      const result = await this.client.SMS.send(smsData);
      
      // Log successful delivery
      await this.logSMSDelivery(to, message, 'success', result);
      
      return {
        success: true,
        messageId: result.SMSMessageData.Recipients[0].messageId,
        status: result.SMSMessageData.Recipients[0].status,
        cost: result.SMSMessageData.Recipients[0].cost,
        rateLimit: {
          allowed: true,
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime
        }
      };

    } catch (error) {
      // Log failed delivery attempt
      await this.logSMSDelivery(to, message, 'failed', null, error.message);
      
      throw error;
    }
  }

  async sendBulkSMS(messages, identifier = 'bulk') {
    const results = [];
    
    for (const smsData of messages) {
      try {
        const result = await this.sendSMS({ ...smsData, identifier });
        results.push({ ...smsData, ...result, success: true });
      } catch (error) {
        results.push({ ...smsData, success: false, error: error.message });
      }
    }
    
    return results;
  }

  isValidPhoneNumber(phoneNumber) {
    // Basic validation for international phone numbers
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  async logSMSDelivery(to, message, status, apiResponse = null, error = null) {
    const redis = redisClient.getClient();
    
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        to,
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        status,
        apiResponse,
        error
      };

      // Store in Redis list (keep last 1000 entries)
      await redis.lpush('sms_delivery_logs', JSON.stringify(logEntry));
      await redis.ltrim('sms_delivery_logs', 0, 999);

      // Also store in a daily log for analytics
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `sms_logs:${today}`;
      await redis.lpush(dailyKey, JSON.stringify(logEntry));
      await redis.expire(dailyKey, 86400 * 7); // Keep for 7 days

    } catch (logError) {
      console.error('Failed to log SMS delivery:', logError);
    }
  }

  async getDeliveryLogs(limit = 50, offset = 0) {
    const redis = redisClient.getClient();
    
    try {
      const logs = await redis.lrange('sms_delivery_logs', offset, offset + limit - 1);
      return logs.map(log => JSON.parse(log));
    } catch (error) {
      console.error('Failed to retrieve delivery logs:', error);
      return [];
    }
  }

  async getDailyStats(date = new Date().toISOString().split('T')[0]) {
    const redis = redisClient.getClient();
    
    try {
      const dailyKey = `sms_logs:${date}`;
      const logs = await redis.lrange(dailyKey, 0, -1);
      
      const stats = {
        total: logs.length,
        successful: 0,
        failed: 0,
        date
      };

      logs.forEach(log => {
        const parsed = JSON.parse(log);
        if (parsed.status === 'success') {
          stats.successful++;
        } else {
          stats.failed++;
        }
      });

      return stats;
    } catch (error) {
      console.error('Failed to get daily stats:', error);
      return { total: 0, successful: 0, failed: 0, date };
    }
  }

  async getRateLimitStatus(identifier) {
    return await rateLimiter.getStatus(identifier);
  }

  async resetRateLimit(identifier) {
    return await rateLimiter.reset(identifier);
  }
}

export const smsService = new SMSService();
