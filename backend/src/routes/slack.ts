import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { authGuard } from '../middleware/authGuard';

const router = Router();

function getSlackStateKey(state: string): string {
  return `oauth:state:${state}`;
}

function getEffectiveCallbackUrl(req: Request): string {
  if (env.SLACK_CALLBACK_URL && !env.SLACK_CALLBACK_URL.includes('localhost')) {
    return env.SLACK_CALLBACK_URL;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host && !String(host).includes('localhost')) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${host}/api/slack/callback`;
  }
  return env.SLACK_CALLBACK_URL;
}

// ─── GET /api/slack/connect — Initiate Slack OAuth (Correction 4: state param) ─

router.get('/connect', authGuard, async (req: Request, res: Response) => {
  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, '');
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    return res.redirect(`${frontendUrl}/dashboard?slack=not_configured`);
  }

  // Generate CSRF-proof state token embedding userId
  const state = crypto.randomBytes(16).toString('hex');
  const userId = req.user!.userId;
  const callbackUrl = getEffectiveCallbackUrl(req);

  // Store userId and callbackUrl in Redis with 5-minute TTL
  await redis.set(getSlackStateKey(state), JSON.stringify({ userId, callbackUrl }), 'EX', 300);

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    redirect_uri: callbackUrl,
    scope: 'incoming-webhook',
    state,
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

// ─── GET /api/slack/callback ──────────────────────────────────────────────────

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, '');

  if (error === 'access_denied') {
    return res.redirect(`${frontendUrl}/dashboard?slack=denied`);
  }

  // Verify state (Correction 4)
  if (!state) {
    return res.redirect(`${frontendUrl}/dashboard?slack=invalid_state`);
  }

  const stateKey = getSlackStateKey(state);
  const rawState = await redis.get(stateKey);

  if (!rawState) {
    return res.redirect(`${frontendUrl}/dashboard?slack=invalid_state`);
  }

  let userId: string;
  let redirectUri = getEffectiveCallbackUrl(req);

  try {
    const parsed = JSON.parse(rawState);
    userId = parsed.userId;
    if (parsed.callbackUrl) redirectUri = parsed.callbackUrl;
  } catch {
    userId = rawState;
  }

  await redis.del(stateKey); // One-time use

  if (!code) {
    return res.redirect(`${frontendUrl}/dashboard?slack=missing_code`);
  }

  try {
    // Exchange code for Slack token
    const params = new URLSearchParams({
      code,
      redirect_uri: redirectUri,
    });

    const response = await axios.post<{
      ok: boolean;
      error?: string;
      access_token: string;
      team: { name: string };
      incoming_webhook: { url: string; channel: string };
    }>(
      'https://slack.com/api/oauth.v2.access',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${env.SLACK_CLIENT_ID}:${env.SLACK_CLIENT_SECRET}`).toString('base64')}`,
        },
      },
    );

    const data = response.data;

    if (!data.ok) {
      console.error('[Slack] OAuth error:', data.error);
      return res.redirect(`${frontendUrl}/dashboard?slack=error&msg=${encodeURIComponent(data.error ?? 'unknown')}`);
    }

    if (!data.incoming_webhook?.url) {
      return res.redirect(`${frontendUrl}/dashboard?slack=no_webhook`);
    }

    // Upsert SlackIntegration
    await prisma.slackIntegration.upsert({
      where: { userId },
      update: {
        accessToken: data.access_token,
        incomingWebhookUrl: data.incoming_webhook.url,
        teamName: data.team.name,
        connectedAt: new Date(),
      },
      create: {
        userId,
        accessToken: data.access_token,
        incomingWebhookUrl: data.incoming_webhook.url,
        teamName: data.team.name,
      },
    });

    console.log(`[Slack] Integration stored for user ${userId} (team: ${data.team.name})`);
    res.redirect(`${frontendUrl}/dashboard?slack=connected`);
  } catch (err: any) {
    console.error('[Slack] Callback error:', err.message);
    res.redirect(`${frontendUrl}/dashboard?slack=error`);
  }
});

// ─── GET /api/slack/status — Check connection status ─────────────────────────

router.get('/status', authGuard, async (req: Request, res: Response) => {
  const integration = await prisma.slackIntegration.findUnique({
    where: { userId: req.user!.userId },
    select: { teamName: true, connectedAt: true },
  });

  res.json({ connected: !!integration, teamName: integration?.teamName ?? null });
});

// ─── DELETE /api/slack/disconnect ─────────────────────────────────────────────

router.delete('/disconnect', authGuard, async (req: Request, res: Response) => {
  await prisma.slackIntegration.deleteMany({
    where: { userId: req.user!.userId },
  });
  res.json({ success: true });
});

export default router;
