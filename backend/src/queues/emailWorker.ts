import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { env } from '../config/env';
import { QUEUE_NAME, EmailJobPayload } from './emailQueue';
import { emailProcessor } from '../jobs/emailProcessor';

let _worker: Worker | null = null;

export function startEmailWorker(): Worker {
  if (_worker) return _worker;

  _worker = new Worker<EmailJobPayload>(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      console.log(`[Worker] Processing job ${job.id} → emailJobId=${job.data.emailJobId}`);
      await emailProcessor(job);
    },
    {
      connection: createRedisConnection(),
      concurrency: env.WORKER_CONCURRENCY,
      // Global minimum delay floor between any two job completions.
      // Per-sender delay is baked into scheduledFor at enqueue time.
      limiter: {
        max: env.WORKER_CONCURRENCY,
        duration: env.MIN_DELAY_SECONDS * 1000,
      },
    },
  );

  _worker.on('completed', (job: Job<EmailJobPayload>) => {
    console.log(`[Worker] Job completed: ${job.id}`);
  });

  _worker.on('failed', (job: Job<EmailJobPayload> | undefined, err: Error) => {
    console.error(`[Worker] Job failed: ${job?.id} — ${err.message}`);
  });

  _worker.on('error', (err: Error) => {
    console.error('[Worker] Worker error:', err.message);
  });

  console.log(
    `[Worker] Started with concurrency=${env.WORKER_CONCURRENCY}, ` +
    `limiter.duration=${env.MIN_DELAY_SECONDS * 1000}ms`,
  );

  return _worker;
}
