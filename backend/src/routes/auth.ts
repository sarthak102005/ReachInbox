import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { authGuard } from '../middleware/authGuard';
import { provisionEtherealAccount } from '../services/ethereal';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStateKey(state: string): string {
  return `oauth:state:${state}`;
}

/** Signs a JWT and sets it as an HttpOnly cookie. */
function setSessionCookie(res: Response, payload: object): void {
  const token = jwt.sign(payload, env.SESSION_SECRET, { expiresIn: '7d' });
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// ─── GET /api/auth/google — Initiate Google OAuth (Correction 4: state param) ─

router.get('/google', async (req: Request, res: Response) => {
  // Generate CSRF-proof state token
  const state = crypto.randomBytes(16).toString('hex');

  // Store in Redis with 5-minute TTL
  await redis.set(getStateKey(state), 'google', 'EX', 300);

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ─── GET /api/auth/google/callback ────────────────────────────────────────────

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, '');

  if (error) {
    console.error('[Auth] Google OAuth error:', error);
    return res.redirect(`${frontendUrl}/login?error=oauth_denied`);
  }

  // Verify state (Correction 4)
  if (!state) {
    return res.redirect(`${frontendUrl}/login?error=missing_state`);
  }

  const stateKey = getStateKey(state);
  const storedValue = await redis.get(stateKey);

  if (!storedValue) {
    return res.redirect(`${frontendUrl}/login?error=invalid_state`);
  }

  await redis.del(stateKey); // One-time use

  if (!code) {
    return res.redirect(`${frontendUrl}/login?error=missing_code`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post<{
      access_token: string;
      id_token: string;
    }>(
      'https://oauth2.googleapis.com/token',
      {
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const { access_token } = tokenRes.data;

    // Fetch user profile
    const profileRes = await axios.get<{
      id: string;
      email: string;
      name: string;
      picture: string;
    }>('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id: googleId, email, name, picture: avatarUrl } = profileRes.data;

    // Upsert user in DB
    const user = await prisma.user.upsert({
      where: { googleId },
      update: { email, name, avatarUrl },
      create: { googleId, email, name, avatarUrl },
    });

    // Auto-provision a default Ethereal sender if none exists
    const existingSender = await prisma.sender.findFirst({ where: { userId: user.id } });
    if (!existingSender) {
      const { user: etUser, pass: etPass } = await provisionEtherealAccount();
      await prisma.sender.create({
        data: {
          userId: user.id,
          emailAddress: etUser,
          displayName: name,
          etherealUser: etUser,
          etherealPass: etPass,
        },
      });
      console.log(`[Auth] Auto-provisioned Ethereal sender for ${email}: ${etUser}`);
    }

    const sessionPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };

    // Issue JWT cookie (for same-domain / proxy setups)
    setSessionCookie(res, sessionPayload);

    // Also pass token in URL for cross-domain (Vercel <-> Render) authentication
    const token = jwt.sign(sessionPayload, env.SESSION_SECRET, { expiresIn: '7d' });

    res.redirect(`${frontendUrl}/dashboard?token=${encodeURIComponent(token)}`);
  } catch (err: any) {
    console.error('[Auth] Google callback error:', err.response?.data ?? err.message);
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', authGuard, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('session', {
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: env.NODE_ENV === 'production',
  });
  res.json({ success: true });
});

export default router;
