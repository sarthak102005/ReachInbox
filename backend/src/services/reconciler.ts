import { prisma } from '../config/prisma';
import { emailQueue } from '../queues/emailQueue';

/**
 * Boot-time reconciler.
 *
 * Problem: If the server/Redis is restarted, BullMQ delayed jobs are lost but
 * the EmailJob rows in Postgres still have status=SCHEDULED.
 *
 * Solution: On every boot, query all SCHEDULED/RESCHEDULED EmailJob rows and
 * check whether their corresponding BullMQ job still exists in Redis.
 * If it doesn't, re-enqueue it with the correct remaining delay.
 *
 * This is idempotent: if the BullMQ job IS present (Redis survived), we skip it.
 */
export async function reconcilePendingJobs(): Promise<void> {
  console.log('[Reconciler] Starting reconciliation of pending email jobs...');

  const pendingJobs = await prisma.emailJob.findMany({
    where: {
      status: { in: ['SCHEDULED', 'RESCHEDULED', 'SENDING'] },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  if (pendingJobs.length === 0) {
    console.log('[Reconciler] No pending jobs to reconcile.');
    return;
  }

  console.log(`[Reconciler] Found ${pendingJobs.length} pending job(s) in DB.`);

  let requeued = 0;
  let alreadyQueued = 0;
  let stale = 0;

  for (const job of pendingJobs) {
    try {
      // BullMQ forbids colons (:) in custom job IDs. Normalize any existing IDs in DB:
      const cleanJobId = job.bullJobId.replace(/:/g, '-');
      if (cleanJobId !== job.bullJobId) {
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { bullJobId: cleanJobId },
        });
      }

      // Check if the BullMQ job already exists in Redis
      const existingBullJob = await emailQueue.getJob(cleanJobId);

      if (existingBullJob) {
        alreadyQueued++;
        continue; // Already in Redis — no action needed
      }

      const now = Date.now();
      const scheduledAt = job.scheduledFor.getTime();

      if (scheduledAt <= now - 60_000) {
        // Job is more than 1 minute overdue — enqueue immediately (delay=0)
        stale++;
      }

      const delay = Math.max(0, scheduledAt - now);

      if (job.status === 'SENDING') {
        const stuckForMs = now - job.updatedAt.getTime();
        const GRACE_PERIOD_MS = 30_000;
        if (stuckForMs > GRACE_PERIOD_MS) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'RESCHEDULED', updatedAt: new Date() },
          });
        } else {
          // Within grace period — assume still in-flight or finalizing; skip re-enqueue to prevent duplicate send
          console.log(`[Reconciler] Job ${job.id} is SENDING within 30s grace period (${stuckForMs}ms) — skipping.`);
          continue;
        }
      }

      await emailQueue.add(
        'send-email',
        { emailJobId: job.id },
        {
          jobId: cleanJobId,
          delay,
        },
      );

      requeued++;
      console.log(
        `[Reconciler] Re-enqueued job ${cleanJobId} (delay=${delay}ms, recipient=${job.recipientEmail})`,
      );
    } catch (err: any) {
      // If jobId already exists in Redis but we couldn't fetch it, BullMQ will throw
      // "Job already exists" on add — that's fine, means it's already there.
      if (err.message?.includes('already exists')) {
        alreadyQueued++;
      } else {
        console.error(`[Reconciler] Error re-enqueuing job ${job.bullJobId}:`, err.message);
      }
    }
  }

  console.log(
    `[Reconciler] Done — re-enqueued=${requeued}, already-in-queue=${alreadyQueued}, stale-and-immediate=${stale}`,
  );
}
