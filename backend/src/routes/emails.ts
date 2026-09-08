import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authGuard } from '../middleware/authGuard';
import { emailQueue } from '../queues/emailQueue';
import { upsertEmailJob } from '../services/elasticsearch';
import { searchEmails } from '../services/elasticsearch';
import { env } from '../config/env';

const router = Router();

router.use(authGuard);

// ─── Email format validation (server-side, Correction 5) ─────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

// ─── POST /api/emails/schedule ────────────────────────────────────────────────

router.post('/schedule', async (req: Request, res: Response) => {
  const {
    subject,
    body,
    recipients,
    senderId,
    startTime,
    delaySeconds: delaySecondsRaw,
    hourlyLimit: hourlyLimitRaw,
  } = req.body as {
    subject?: string;
    body?: string;
    recipients?: string[];
    senderId?: string;
    startTime?: string | number;
    delaySeconds?: number | string;
    hourlyLimit?: number | string;
  };

  // ─── Input validation ──────────────────────────────────────────────────────
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    res.status(400).json({ error: 'subject is required' });
    return;
  }
  if (!body || typeof body !== 'string' || !body.trim()) {
    res.status(400).json({ error: 'body is required' });
    return;
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    res.status(400).json({ error: 'recipients must be a non-empty array' });
    return;
  }
  if (!senderId) {
    res.status(400).json({ error: 'senderId is required' });
    return;
  }
  if (!startTime) {
    res.status(400).json({ error: 'startTime is required' });
    return;
  }

  // ─── Validate sender ownership ─────────────────────────────────────────────
  const sender = await prisma.sender.findFirst({
    where: { id: senderId, userId: req.user!.userId },
  });
  if (!sender) {
    res.status(404).json({ error: 'Sender not found or not owned by you' });
    return;
  }

  // ─── Server-side email validation (Correction 5) ──────────────────────────
  const invalid: string[] = [];
  const valid: string[] = [];

  for (const email of recipients) {
    if (typeof email === 'string' && validateEmail(email)) {
      valid.push(email.trim().toLowerCase());
    } else {
      invalid.push(String(email));
    }
  }

  if (valid.length === 0) {
    res.status(400).json({
      error: 'No valid email addresses provided',
      invalid,
    });
    return;
  }

  // ─── Determine effective delay (Correction 1) ─────────────────────────────
  const delaySecondsOverride = delaySecondsRaw !== undefined ? Number(delaySecondsRaw) : undefined;
  const hourlyLimitOverride = hourlyLimitRaw !== undefined ? Number(hourlyLimitRaw) : undefined;

  // If overrides provided, upsert RateLimitConfig for this sender
  if (delaySecondsOverride !== undefined || hourlyLimitOverride !== undefined) {
    const existingConfig = await prisma.rateLimitConfig.findFirst({
      where: { senderId },
    });

    await prisma.rateLimitConfig.upsert({
      where: existingConfig ? { id: existingConfig.id } : { senderId },
      update: {
        ...(delaySecondsOverride !== undefined && { minDelaySeconds: delaySecondsOverride }),
        ...(hourlyLimitOverride !== undefined && { maxEmailsPerHour: hourlyLimitOverride }),
      },
      create: {
        senderId,
        userId: req.user!.userId,
        minDelaySeconds: delaySecondsOverride ?? env.MIN_DELAY_SECONDS,
        maxEmailsPerHour: hourlyLimitOverride ?? env.MAX_EMAILS_PER_HOUR,
      },
    });
  }

  // Read effective delay (may have just been upserted above)
  const senderConfig = await prisma.rateLimitConfig.findFirst({ where: { senderId } });
  const effectiveDelaySec = senderConfig?.minDelaySeconds ?? env.MIN_DELAY_SECONDS;

  // ─── Create EmailJob rows + enqueue BullMQ delayed jobs ───────────────────
  const startMs = Number(new Date(startTime));
  if (isNaN(startMs)) {
    res.status(400).json({ error: 'startTime is not a valid date' });
    return;
  }

  const createdJobs: Array<{ id: string; recipientEmail: string }> = [];

  for (let i = 0; i < valid.length; i++) {
    const scheduledFor = new Date(startMs + i * effectiveDelaySec * 1000);

    const emailJob = await prisma.emailJob.create({
      data: {
        userId: req.user!.userId,
        senderId,
        bullJobId: 'pending', // Placeholder — updated after we get the cuid
        recipientEmail: valid[i],
        subject,
        body,
        scheduledFor,
        status: 'SCHEDULED',
      },
    });

    // Deterministic jobId derived from DB primary key
    const bullJobId = `email-job:${emailJob.id}`;

    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { bullJobId },
    });

    // Enqueue delayed BullMQ job
    const delay = Math.max(0, scheduledFor.getTime() - Date.now());
    await emailQueue.add(
      'send-email',
      { emailJobId: emailJob.id },
      { jobId: bullJobId, delay },
    );

    // Upsert to ES
    await upsertEmailJob({
      id: emailJob.id,
      recipientEmail: valid[i],
      subject,
      body,
      status: 'SCHEDULED',
      scheduledFor,
      sentAt: null,
      senderId,
      userId: req.user!.userId,
    });

    createdJobs.push({ id: emailJob.id, recipientEmail: valid[i] });
  }

  res.status(201).json({
    scheduled: createdJobs.length,
    invalid,
    jobs: createdJobs,
  });
});

// ─── GET /api/emails/scheduled ────────────────────────────────────────────────
// Returns paginated list with total count (Correction 6)

router.get('/scheduled', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

  const scheduledStatuses = ['SCHEDULED', 'RESCHEDULED'] as const;
  const where = {
    userId: req.user!.userId,
    status: { in: [...scheduledStatuses] },
  };

  const [jobs, total] = await prisma.$transaction([
    prisma.emailJob.findMany({
      where,
      orderBy: { scheduledFor: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        recipientEmail: true,
        subject: true,
        scheduledFor: true,
        status: true,
        attempts: true,
        createdAt: true,
        sender: { select: { emailAddress: true, displayName: true } },
      },
    }),
    prisma.emailJob.count({ where }),
  ]);

  res.json({ jobs, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── GET /api/emails/sent ─────────────────────────────────────────────────────

router.get('/sent', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

  const sentStatuses = ['SENT', 'FAILED'] as const;
  const where = {
    userId: req.user!.userId,
    status: { in: [...sentStatuses] },
  };

  const [jobs, total] = await prisma.$transaction([
    prisma.emailJob.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        recipientEmail: true,
        subject: true,
        sentAt: true,
        status: true,
        lastError: true,
        attempts: true,
        updatedAt: true,
        sender: { select: { emailAddress: true, displayName: true } },
      },
    }),
    prisma.emailJob.count({ where }),
  ]);

  res.json({ jobs, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── GET /api/emails/search ──────────────────────────────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

  const result = await searchEmails({
    q: q.trim() || undefined,
    status: status?.trim() || undefined,
    userId: req.user!.userId,
    page,
    limit,
  });

  res.json({ ...result, page, limit });
});

export default router;
