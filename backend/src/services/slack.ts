import axios from 'axios';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

/**
 * Returns the Redis key used to deduplicate Slack notifications per sender/hour.
 * Only the first worker to SET this key (via SETNX semantics) sends the message.
 */
function getSlackNotifiedKey(senderId: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  return `notified:${senderId}:${y}${m}${d}${h}`;
}

/**
 * Sends a Slack notification when a sender's hourly limit is hit.
 *
 * Deduplication (Correction 2):
 *   Uses SET ... NX EX 3600 — only the first worker to call this per sender/hour
 *   actually posts the webhook. All subsequent calls in the same window are no-ops.
 *
 * Graceful no-op:
 *   - If SlackIntegration doesn't exist for the user → skip silently.
 *   - If Slack webhook call fails → log, don't throw.
 *   - No in-memory caching of "has no integration" — always re-queries DB.
 */
export async function notifyRateLimit(params: {
  senderId: string;
  userId: string;
  senderEmail: string;
  rescheduledCount: number;
  nextWindowTime: Date;
}): Promise<void> {
  const { senderId, userId, senderEmail, rescheduledCount, nextWindowTime } = params;

  // Dedup: only first worker this hour sends the notification
  const dedupKey = getSlackNotifiedKey(senderId);
  const setResult = await redis.set(dedupKey, '1', 'EX', 3600, 'NX');

  if (setResult === null) {
    // Another worker already sent the notification for this sender/hour
    return;
  }

  // Re-query DB every time — no in-memory caching of missing integration
  const integration = await prisma.slackIntegration.findUnique({
    where: { userId },
  });

  if (!integration?.incomingWebhookUrl) {
    // No Slack connected for this user — silent no-op
    return;
  }

  const nextTimeStr = nextWindowTime.toUTCString();
  const message = {
    text: `⚠️ *Rate limit reached* for sender \`${senderEmail}\`\n` +
          `${rescheduledCount} email(s) rescheduled to *${nextTimeStr}*`,
  };

  try {
    await axios.post(integration.incomingWebhookUrl, message, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
    console.log(`[Slack] Notification sent for sender ${senderEmail}`);
  } catch (err: any) {
    console.error('[Slack] Failed to send notification:', err.message);
    // Do NOT re-throw — Slack failure must never crash the email worker
  }
}
