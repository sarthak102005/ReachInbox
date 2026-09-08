import Redis from 'ioredis';
import { env } from './env';

// Singleton IORedis client shared across the app.
// BullMQ requires separate connection instances per Queue/Worker/QueueEvents,
// so we export a factory function for those as well.
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    });

    _redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    _redis.on('connect', () => {
      console.log('[Redis] Connected to', env.REDIS_URL);
    });
  }
  return _redis;
}

// Factory: creates a fresh Redis connection suitable for BullMQ
// (BullMQ requires dedicated connections that are not shared)
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export const redis = getRedis();
