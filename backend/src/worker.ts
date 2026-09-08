import 'dotenv/config';
import { prisma } from './config/prisma';
import { emailQueue } from './queues/emailQueue';
import { startEmailWorker } from './queues/emailWorker';
import { reconcilePendingJobs } from './services/reconciler';
import { Worker } from 'bullmq';

let emailWorker: Worker | null = null;

async function bootstrapWorker(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('[Worker Service] PostgreSQL connected');

    // Run startup reconciler
    await reconcilePendingJobs();

    // Start BullMQ email worker
    emailWorker = startEmailWorker();
    console.log('[Worker Service] Email worker started and listening for jobs.');
  } catch (err: any) {
    console.error('[Worker Service] Fatal bootstrap error:', err.message);
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  console.log('[Worker Service] Shutting down gracefully...');

  if (emailWorker) {
    console.log('[Worker Service] Draining in-flight jobs and closing worker...');
    await emailWorker.close();
  }

  await emailQueue.close();
  await prisma.$disconnect();

  console.log('[Worker Service] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrapWorker();
