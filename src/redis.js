import Redis from 'ioredis';
import { config } from './config.js';

class RedisClient {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async connect() {
    try {
      this.client = new Redis(config.redis);
      
      this.client.on('connect', () => {
        console.log('Redis connected successfully');
      });

      this.client.on('error', (err) => {
        console.error('Redis connection error:', err);
      });

      this.client.on('close', () => {
        console.log('Redis connection closed');
      });

      await this.client.ping();
      this.initialized = true;
      console.log('Redis initialized successfully');
      
      return this.client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.initialized = false;
      console.log('Redis disconnected');
    }
  }

  getClient() {
    if (!this.initialized) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  async healthCheck() {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}

export const redisClient = new RedisClient();
