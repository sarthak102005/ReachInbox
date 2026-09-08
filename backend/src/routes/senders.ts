import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authGuard } from '../middleware/authGuard';
import { provisionEtherealAccount } from '../services/ethereal';

const router = Router();

// All sender routes require authentication
router.use(authGuard);

// ─── GET /api/senders ─────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const senders = await prisma.sender.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      emailAddress: true,
      displayName: true,
      createdAt: true,
    },
  });

  res.json({ senders });
});

// ─── POST /api/senders ────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { displayName, emailAddress } = req.body as {
    displayName?: string;
    emailAddress?: string;
  };

  if (!displayName || typeof displayName !== 'string') {
    res.status(400).json({ error: 'displayName is required' });
    return;
  }

  // Auto-provision a fresh Ethereal test account for this sender
  const { user: etUser, pass: etPass } = await provisionEtherealAccount();

  const sender = await prisma.sender.create({
    data: {
      userId: req.user!.userId,
      emailAddress: emailAddress ?? etUser,
      displayName,
      etherealUser: etUser,
      etherealPass: etPass,
    },
    select: {
      id: true,
      emailAddress: true,
      displayName: true,
      createdAt: true,
    },
  });

  res.status(201).json({ sender });
});

// ─── DELETE /api/senders/:id ──────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const sender = await prisma.sender.findFirst({
    where: { id, userId: req.user!.userId },
  });

  if (!sender) {
    res.status(404).json({ error: 'Sender not found' });
    return;
  }

  await prisma.sender.delete({ where: { id } });
  res.json({ success: true });
});

export default router;
