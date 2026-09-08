import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// BullMQ Dashboard
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { env } from './config/env';
import { prisma } from './config/prisma';
import { ensureEmailIndex } from './config/elasticsearch';
import { emailQueue } from './queues/emailQueue';
import { Worker } from 'bullmq';
import { startEmailWorker } from './queues/emailWorker';
import { reconcilePendingJobs } from './services/reconciler';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth';
import slackRoutes from './routes/slack';
import emailRoutes from './routes/emails';
import senderRoutes from './routes/senders';

const app = express();

// Trust reverse proxy (Caddy / Cloudflare / Nginx) for HTTPS headers
app.set('trust proxy', 1);

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Bull Board Dashboard (Phase 7) ──────────────────────────────────────────

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  // @ts-expect-error — known type incompatibility between bullmq@5 and @bull-board/api@5
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/senders', senderRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

let emailWorker: Worker | null = null;
let server: any = null;

async function bootstrap(): Promise<void> {
  try {
    // Verify DB connection
    await prisma.$connect();
    console.log('[DB] PostgreSQL connected');

    // Ensure Elasticsearch index exists
    await ensureEmailIndex();

    // Start BullMQ worker & reconciler only if not run in dedicated worker container
    const shouldStartWorker = process.env.START_WORKER !== 'false';
    if (shouldStartWorker) {
      emailWorker = startEmailWorker();
      await reconcilePendingJobs();
    } else {
      console.log('[Server] START_WORKER=false: running as dedicated HTTP API server.');
    }

    // Start HTTP server
    server = app.listen(env.PORT, () => {
      console.log(`[Server] Listening on http://localhost:${env.PORT}`);
      console.log(`[Server] Bull Board at http://localhost:${env.PORT}/admin/queues`);
    });
  } catch (err: any) {
    console.error('[Bootstrap] Fatal error:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('[Server] Shutting down gracefully...');

  // 1. Stop accepting new HTTP requests
  if (server) {
    server.close();
  }

  // 2. Wait for in-flight worker jobs to complete before resolving
  if (emailWorker) {
    console.log('[Server] Draining and closing email worker...');
    await emailWorker.close();
  }

  // 3. Close queue & DB connections
  await emailQueue.close();
  await prisma.$disconnect();

  console.log('[Server] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap();
