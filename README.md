# ReachInbox — Email Job Scheduler

A production-grade full-stack email scheduling system built for the ReachInbox hiring assignment. Schedules emails via **BullMQ delayed jobs** (Redis-backed), sends via **Ethereal Email SMTP**, indexes in **Elasticsearch**, and exposes a **Next.js dashboard** with Google OAuth + Slack OAuth.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser  →  Next.js (port 3000)                        │
│                 ↕ Next.js rewrites proxy                │
│  Express API (port 4000)                                │
│     ├── Google OAuth 2.0  (state CSRF-protected)        │
│     ├── Slack OAuth v2    (state CSRF-protected)        │
│     ├── Email Routes      (schedule / list / search)    │
│     ├── Bull Board        /admin/queues                 │
│     └── BullMQ Worker                                   │
│           ↓                                             │
│    Redis (BullMQ delayed jobs)                          │
│    PostgreSQL (Prisma ORM — source of truth)            │
│    Elasticsearch (search index, mirrored on transitions)│
└─────────────────────────────────────────────────────────┘
```

### Scheduling & Persistence (restart-survival)

1. On `POST /api/emails/schedule`, **write EmailJob rows to Postgres first** (status=SCHEDULED), then enqueue BullMQ delayed jobs with `jobId = email-job:{id}` (deterministic → re-enqueuing is a no-op).
2. **On every boot**, `reconciler.ts` queries all SCHEDULED/RESCHEDULED rows, checks each `bullJobId` via `Queue.getJob()`, and re-enqueues any missing ones with the correct remaining delay.
3. Restarting the server never loses a job or duplicates a send.

### Idempotency

The worker uses a **conditional UPDATE** (not a lock):
```sql
UPDATE "EmailJob"
SET status = 'SENDING'
WHERE id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED')
RETURNING *
```
If `RETURNING *` comes back empty, another worker already claimed the job — return immediately. This is safe under any level of horizontal worker scaling.

### Rate Limiting

- **Minimum delay between sends**: `MIN_DELAY_SECONDS` (default: **2 seconds**). Per-sender override baked into staggered `scheduledFor` timestamps at enqueue time. The BullMQ worker limiter (`{ max: WORKER_CONCURRENCY, duration: MIN_DELAY_SECONDS * 1000 }`) enforces a global floor.
- **Hourly cap**: Atomic Lua script on Redis key `ratelimit:{senderId}:{yyyyMMddHH}`. The script INCRs, sets EXPIRE 3600 on first call, and DECRs + returns 0 if over limit. **Zero in-memory counters** — correct under horizontal scaling.
- On limit hit: job is rescheduled to `start-of-next-UTC-hour + random(0–30s) jitter`, DB row updated to RESCHEDULED, new BullMQ delayed job enqueued.

### Slack Notification Deduplication

`notifyRateLimit()` uses `SET notified:{senderId}:{HH} 1 EX 3600 NX` before firing the webhook. Only the first worker to successfully SET the key sends the message; all others skip silently. This prevents N webhook calls when N concurrent workers all hit the cap in the same second.

---

## Quick Start

### 1. Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A Google Cloud Console project with OAuth 2.0 credentials
- A Slack App with `incoming-webhook` scope

### 2. Start Infrastructure

```bash
cd infra
docker-compose up -d
```

Verify all 3 services are healthy:
```bash
docker-compose ps
```

### 3. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env — fill in GOOGLE_CLIENT_ID/SECRET, SLACK_CLIENT_ID/SECRET, SESSION_SECRET
# Leave ETHEREAL_USER/PASS blank to auto-generate

npm install
npx prisma migrate dev --name init
npm run dev
```

The server starts on **http://localhost:4000**

- API: `http://localhost:4000/api/...`
- Bull Board: `http://localhost:4000/admin/queues`

### 4. Frontend Setup

```bash
cd frontend
cp .env.example .env
# Edit .env — set BACKEND_URL=http://localhost:4000

npm install
npm run dev
```

The dashboard starts on **http://localhost:3000**

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | `redis://localhost:6379` | Redis connection string |
| `ELASTICSEARCH_URL` | — | `http://localhost:9200` | Elasticsearch node URL |
| `GOOGLE_CLIENT_ID` | ✅ | — | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | — | Google OAuth 2.0 client secret |
| `GOOGLE_CALLBACK_URL` | — | `http://localhost:4000/api/auth/google/callback` | Must match Google Console |
| `SLACK_CLIENT_ID` | ✅ | — | Slack App client ID |
| `SLACK_CLIENT_SECRET` | ✅ | — | Slack App client secret |
| `SLACK_CALLBACK_URL` | — | `http://localhost:4000/api/slack/callback` | Must match Slack App config |
| `SESSION_SECRET` | ✅ | — | JWT signing secret (≥32 chars) |
| `ETHEREAL_USER` | — | _(auto-generated)_ | Ethereal SMTP username |
| `ETHEREAL_PASS` | — | _(auto-generated)_ | Ethereal SMTP password |
| `MAX_EMAILS_PER_HOUR` | — | `10` | Global hourly cap (per sender) |
| `MIN_DELAY_SECONDS` | — | `2` | Min delay between sends (global floor) |
| `WORKER_CONCURRENCY` | — | `5` | BullMQ worker concurrency |
| `PORT` | — | `4000` | HTTP server port |
| `FRONTEND_URL` | — | `http://localhost:3000` | CORS origin |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `BACKEND_URL` | — | `http://localhost:4000` | Backend URL for Next.js rewrites (server-side) |

---

## Feature-to-Requirement Mapping

| Requirement | Implementation |
|---|---|
| Schedule emails via BullMQ delayed jobs | `POST /api/emails/schedule` → Prisma create → `emailQueue.add(..., { delay })` |
| No cron anywhere | ✅ Confirmed — only BullMQ delayed jobs used |
| Survive server restart | `reconciler.ts` re-enqueues SCHEDULED jobs missing from Redis on every boot |
| Idempotency — no double sends | Conditional `UPDATE ... WHERE status IN ('SCHEDULED','RESCHEDULED') RETURNING *` via `prisma.$queryRaw` |
| Hourly rate limit (Redis-atomic) | Lua script INCR + EXPIRE 3600 on `ratelimit:{senderId}:{HH}` |
| Per-sender rate-limit override | `POST /api/emails/schedule` body `hourlyLimit`/`delaySeconds` → upserts `RateLimitConfig` for `senderId` |
| Min delay between sends | BullMQ worker `limiter` + delay baked into staggered `scheduledFor` at enqueue |
| Reschedule on limit hit | `handleRateLimitExceeded()` → status=RESCHEDULED → new delayed BullMQ job → next-hour-start + jitter |
| Preserve order among rescheduled jobs | Staggered by `scheduledFor` ascending at enqueue |
| Slack notification (real OAuth v2) | `/api/slack/connect` → Slack authorize URL → `/api/slack/callback` → stores `incomingWebhookUrl` |
| Slack notification deduplication | `SET notified:{senderId}:{HH} 1 EX 3600 NX` — only first worker to set key sends the webhook |
| Slack graceful no-op | `notifyRateLimit()` returns silently if `SlackIntegration` not found |
| Elasticsearch indexing | `upsertEmailJob()` called on every status transition |
| ES full-text search | `GET /api/emails/search?q=&status=` → `multi_match` + filter bool query |
| Bull Board dashboard | `@bull-board/express` mounted at `/admin/queues` |
| Google OAuth 2.0 | `/api/auth/google` → Google authorize URL → `/api/auth/google/callback` → JWT cookie |
| CSRF protection (state param) | Both OAuth flows generate `state`, store in Redis EX 300, verify + DEL in callback |
| JWT cookie session | `jsonwebtoken` signed with `SESSION_SECRET`, `HttpOnly; SameSite=Lax` cookie |
| Server-side email validation | Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` applied before any DB writes |
| Paginated responses with total | `prisma.$transaction([findMany, count])` → `{ jobs, total, page, totalPages }` |
| CSV parsing (frontend) | `papaparse` client-side → count shown before submit |
| Next.js dashboard | `/login`, `/dashboard` with tabs, compose modal, Slack badge, search |

---

## Assumptions & Trade-offs

| Item | Decision | Rationale |
|---|---|---|
| Figma access | Implemented dark SaaS aesthetic (navy/indigo) | Figma link not publicly accessible |
| JWT vs sessions | JWT in HttpOnly cookie | No session store needed; survives restarts without Redis round-trips |
| Per-sender min-delay | Baked into `scheduledFor` stagger at enqueue | BullMQ's `limiter` is worker-global; per-sender delay can't be set per-job |
| Ethereal auto-provision | `nodemailer.createTestAccount()` on first boot | Zero manual SMTP setup for demo |
| Slack notification count | Always reports `1` per rate-limit event | Each job independently triggers; SETNX ensures only first fires |
| ES failure isolation | Non-fatal — logs and continues | Email delivery must not fail due to ES outage |
| DB → ES sync | On-demand in worker, not event-sourced | Sufficient for assignment; production would use CDC or Debezium |
| Sender provisioning | Default Ethereal sender auto-created on first Google login | Reduces friction for the first compose |
| In-flight jobs & restarts | Graceful shutdown (`worker.close()`) + 30s reconciler grace period | A graceful shutdown (SIGTERM) drains in-flight sends before exit; only a hard crash (SIGKILL/OOM) between the SMTP call and the SENT write can leave a job in SENDING, which the reconciler now only reclaims after a 30s grace period to avoid double-sending. The reconciler runs once at boot; a job caught inside the 30s SENDING grace period at that exact moment will only be re-evaluated on a subsequent restart. A production system would run this on a recurring schedule (or a BullMQ repeatable job) rather than boot-only. |
| Automatic Job Retries | Claim guard accepts `FAILED` jobs when `attempts < 3` | Built-in BullMQ exponential backoff handles transient SMTP timeouts up to 3 attempts, after which the job remains permanently `FAILED` with `lastError` logged. |

---

## Cloud Hosting & Outbound SMTP Policies

### The Cloud Free-Tier SMTP Limitation
Most modern cloud hosting providers (including **Render**, **Railway**, **AWS EC2**, and **GCP**) enforce strict network-level firewall policies that block outbound TCP traffic on standard SMTP ports (**25, 465, 587**) and alternate submission ports (**2525**) on free/entry-level tiers to prevent spam abuse:

- **Hosted Environments (e.g. Render Free Tier)**: Outbound socket connections to raw SMTP servers (including `smtp.ethereal.email`) time out (`ETIMEDOUT`) due to this hosting firewall restriction. For hosted production deployments, cloud providers recommend using HTTP/REST API-based email services (such as **Resend**, **SendGrid API**, or **Mailgun**) over HTTPS (port 443), which are never subject to SMTP port blocking.
- **Local Development / Evaluation**: Running locally connects directly to Ethereal SMTP over port **587 with STARTTLS** (`requireTLS: true`) with 100% fidelity. Sent emails generate real preview URLs on `ethereal.email` and are logged to `stdout`.

---

## Production Deployment (Vercel + Render)

### Backend (Render Web Service)
1. **Build Command**: `npm install && npm run build && npx prisma generate`
2. **Start Command**: `npm run start`
3. **Environment Variables**:
   - `DATABASE_URL`: Cloud PostgreSQL (e.g. Render Postgres, Neon, or Supabase)
   - `REDIS_URL`: Cloud Redis (e.g. Upstash, Aiven, or Redis Cloud)
   - `ELASTICSEARCH_URL`: Elasticsearch node URL
   - `SESSION_SECRET`: Random 32+ character string
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: From Google Cloud Console
   - `GOOGLE_CALLBACK_URL`: `https://<your-backend>.onrender.com/api/auth/google/callback`
   - `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`: From Slack API Apps
   - `SLACK_CALLBACK_URL`: `https://<your-backend>.onrender.com/api/slack/callback`
   - `FRONTEND_URL`: `https://<your-app>.vercel.app`
   - `NODE_ENV`: `production`

### Frontend (Vercel)
1. **Framework Preset**: Next.js
2. **Environment Variables**:
   - `BACKEND_URL`: `https://<your-backend>.onrender.com`
   - `NEXT_PUBLIC_API_URL`: `https://<your-backend>.onrender.com`

---

## Demo Scenarios

### Restart Survival Demo
```bash
# Schedule some emails
# Kill the backend (Ctrl+C)
# Restart: npm run dev
# Observe reconciler output:
# [Reconciler] Re-enqueued job email-job:xxx (delay=45000ms, ...)
# Jobs still fire at the correct time, nothing re-sent
```

### Rate Limit + Slack Demo
```bash
# Set MAX_EMAILS_PER_HOUR=3
# Schedule 5+ emails
# Watch logs: [Processor] RESCHEDULED email-job:xxx → next window ...
# Check Slack: "⚠️ Rate limit reached for sender@example.com — 1 email(s) rescheduled to ..."
```

### Idempotency Proof
```bash
# The conditional UPDATE ensures status must be SCHEDULED/RESCHEDULED (or FAILED for retry)
# A second worker claiming the same job sees 0 rows returned → returns immediately
# Check DB: sentAt populated exactly once
```
