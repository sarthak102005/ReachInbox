import { Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { emailQueue, EmailJobPayload } from '../queues/emailQueue';
import { checkAndIncrementRateLimit, getRateLimitKey } from './rateLimitLua';
import { sendEmailViaEthereal } from '../services/ethereal';
import { upsertEmailJob } from '../services/elasticsearch';
import { notifyRateLimit } from '../services/slack';

// Raw DB row shape returned by prisma.$queryRaw on the EmailJob table
interface EmailJobRow {
  id: string;
  userId: string;
  senderId: string;
  bullJobId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledFor: Date;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Main BullMQ job processor.
 *
 * Key properties guaranteed:
 * 1. IDEMPOTENCY (Correction 3): Uses a conditional UPDATE that only claims
 *    the job if status is still SCHEDULED/RESCHEDULED. If 0 rows returned,
 *    another worker already processed it — return immediately.
 *
 * 2. RATE LIMITING: Lua-script atomic INCR on ratelimit:{senderId}:{HH} key.
 *    On hit: reschedule to next-hour-window + jitter, update DB, re-enqueue BullMQ job.
 *
 * 3. SLACK DEDUP (Correction 2): SETNX on notified:{senderId}:{HH} ensures only
 *    one Slack notification per sender per hour regardless of worker concurrency.
 *
 * 4. PER-SENDER CONFIG (Correction 1): Rate-limit max is read from RateLimitConfig
 *    for the senderId first, falling back to env.MAX_EMAILS_PER_HOUR.
 */
export async function emailProcessor(job: Job<EmailJobPayload>): Promise<void> {
  const { emailJobId } = job.data;

  // ─── Step 1: Atomic idempotency claim ─────────────────────────────────────
  // Single conditional UPDATE — if another worker already claimed this job,
  // zero rows come back and we return without doing anything.
  const rows = await prisma.$queryRaw<EmailJobRow[]>`
    UPDATE "EmailJob"
    SET status = 'SENDING', "updatedAt" = NOW()
    WHERE id = ${emailJobId}
      AND status IN ('SCHEDULED', 'RESCHEDULED')
    RETURNING *
  `;

  if (rows.length === 0) {
    console.log(`[Processor] Job ${emailJobId} already claimed or not found — skipping.`);
    return;
  }

  const emailJob = rows[0];

  // ─── Step 2: Look up effective rate-limit config (Correction 1) ───────────
  const rateLimitConfig = await prisma.rateLimitConfig.findFirst({
    where: { senderId: emailJob.senderId },
  });
  const maxEmailsPerHour = rateLimitConfig?.maxEmailsPerHour ?? env.MAX_EMAILS_PER_HOUR;

  // ─── Step 3: Atomic rate-limit check via Lua script ───────────────────────
  const rateLimitKey = getRateLimitKey(emailJob.senderId);
  const rateLimitResult = await checkAndIncrementRateLimit(rateLimitKey, maxEmailsPerHour);

  if (rateLimitResult === 0) {
    // Over hourly limit — reschedule to next window
    await handleRateLimitExceeded(emailJob, rateLimitConfig?.minDelaySeconds);
    return;
  }

  // ─── Step 4: Send the email ────────────────────────────────────────────────
  const sender = await prisma.sender.findUnique({ where: { id: emailJob.senderId } });
  if (!sender) {
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'FAILED', lastError: 'Sender not found', updatedAt: new Date() },
    });
    return;
  }

  try {
    const result = await sendEmailViaEthereal(sender, emailJob);

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        attempts: emailJob.attempts + 1,
        lastError: null,
        updatedAt: new Date(),
      },
    });

    await upsertEmailJob({
      id: emailJob.id,
      recipientEmail: emailJob.recipientEmail,
      subject: emailJob.subject,
      body: emailJob.body,
      status: 'SENT',
      scheduledFor: emailJob.scheduledFor,
      sentAt: new Date(),
      senderId: emailJob.senderId,
      userId: emailJob.userId,
    });

    console.log(`[Processor] SENT ${emailJobId} → ${emailJob.recipientEmail} (${result.messageId})`);
  } catch (err: any) {
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'FAILED',
        lastError: err.message,
        attempts: emailJob.attempts + 1,
        updatedAt: new Date(),
      },
    });

    await upsertEmailJob({
      id: emailJob.id,
      recipientEmail: emailJob.recipientEmail,
      subject: emailJob.subject,
      body: emailJob.body,
      status: 'FAILED',
      scheduledFor: emailJob.scheduledFor,
      sentAt: null,
      senderId: emailJob.senderId,
      userId: emailJob.userId,
    });

    console.error(`[Processor] FAILED ${emailJobId}:`, err.message);
    throw err; // Let BullMQ handle retries per defaultJobOptions
  }
}

/**
 * Called when the rate limit is exceeded.
 * Re-schedules the job to the next hour window with jitter and updates the DB.
 */
async function handleRateLimitExceeded(
  emailJob: EmailJobRow,
  _minDelaySeconds?: number,
): Promise<void> {
  const newAttempts = emailJob.attempts + 1;

  // Compute next-hour-start (UTC) + random jitter (0–30 s) to avoid thundering herd
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
  const jitter = Math.floor(Math.random() * 30_000); // 0–30 s
  const nextWindowMs = nextHour.getTime() + jitter;
  const nextWindowDate = new Date(nextWindowMs);

  const newBullJobId = `email-job-${emailJob.id}-r${newAttempts}`;
  const delay = Math.max(0, nextWindowMs - Date.now());

  // Update DB row
  await prisma.emailJob.update({
    where: { id: emailJob.id },
    data: {
      status: 'RESCHEDULED',
      bullJobId: newBullJobId,
      scheduledFor: nextWindowDate,
      attempts: newAttempts,
      updatedAt: new Date(),
    },
  });

  // Re-enqueue in BullMQ with the new jobId
  await emailQueue.add(
    'send-email',
    { emailJobId: emailJob.id },
    { jobId: newBullJobId, delay },
  );

  // ES sync
  await upsertEmailJob({
    id: emailJob.id,
    recipientEmail: emailJob.recipientEmail,
    subject: emailJob.subject,
    body: emailJob.body,
    status: 'RESCHEDULED',
    scheduledFor: nextWindowDate,
    sentAt: null,
    senderId: emailJob.senderId,
    userId: emailJob.userId,
  });

  console.log(
    `[Processor] RESCHEDULED ${emailJob.id} → next window ${nextWindowDate.toISOString()} ` +
    `(delay=${delay}ms, bullJobId=${newBullJobId})`,
  );

  // Slack notification — SETNX dedup inside notifyRateLimit (Correction 2)
  const sender = await prisma.sender.findUnique({ where: { id: emailJob.senderId } });
  await notifyRateLimit({
    senderId: emailJob.senderId,
    userId: emailJob.userId,
    senderEmail: sender?.emailAddress ?? emailJob.senderId,
    rescheduledCount: 1,
    nextWindowTime: nextWindowDate,
  });
}
