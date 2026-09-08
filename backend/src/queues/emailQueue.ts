import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { env } from '../config/env';

export const QUEUE_NAME = 'email-send';

// Shared Queue instance.
// Note: BullMQ Queue needs its own connection (not shared with the general redis client).
export const emailQueue = new Queue(QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 500 }, // Keep last 500 completed jobs for Bull Board visibility
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

emailQueue.on('error', (err) => {
  console.error('[Queue] emailQueue error:', err.message);
});

console.log(`[Queue] emailQueue initialized (minDelayMs=${env.MIN_DELAY_SECONDS * 1000}ms global floor)`);

export interface EmailJobPayload {
  emailJobId: string;
}
