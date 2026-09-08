# ReachInbox Email Scheduler — Requirements Doc + Antigravity Build Prompt

## 0. How to use this file
Section A is the requirements breakdown I extracted from the assignment (so you can sanity-check I didn't miss anything before you commit to it). Section B is a single, self-contained prompt you can paste into Antigravity as-is — it restates the full spec with concrete architectural decisions baked in, so the agent isn't left guessing on ambiguous points.

I made a few implementation decisions where the assignment leaves it open (ORM choice, monorepo layout, exact rate-limit algorithm). They're called out below — flag any you want changed before you run this.

---

## A. Requirements Breakdown (traceability checklist)

### A.1 Backend — Core Scheduler
- [ ] REST API to accept email scheduling requests
- [ ] Store requests in Postgres/MySQL (relational)
- [ ] Schedule via BullMQ delayed jobs — **no cron**, no node-cron/agenda
- [ ] Send via Ethereal Email SMTP, multiple senders
- [ ] Sent/scheduled emails indexed in Elasticsearch and searchable
- [ ] Live BullMQ dashboard (Bull Board or similar) for queue visibility
- [ ] Survive restart: future jobs still fire on time, nothing re-sent, nothing lost
- [ ] Idempotency: a given email job can never be sent twice

### A.2 Throughput / Concurrency / Rate Limiting
- [ ] Configurable BullMQ worker concurrency, safe under parallel execution
- [ ] Minimum delay between individual sends (documented, e.g. "min 2s between sends") — via BullMQ limiter or worker-side delay
- [ ] Emails-per-hour cap, configurable via env, global or per-sender
- [ ] Rate-limit counters backed by Redis (or DB) — never purely in-memory — safe across multiple worker instances
- [ ] On hitting the hourly cap: **delay/reschedule into next window**, never drop/fail the job; preserve ordering as much as possible
- [ ] README must explain the rate-limiting mechanism and trade-offs

### A.3 Slack Notification on Rate-Limit Hit
- [ ] "Connect Slack" button in dashboard → real OAuth authorize flow (not a webhook pasted in manually)
- [ ] Token/webhook stored per user/tenant
- [ ] Live Slack message fired the moment an hourly limit is hit — must be demoable, not just a log line
- [ ] Graceful no-op if Slack isn't connected (no crash)
- [ ] Connecting later starts notifications working without a redeploy

### A.4 Load Behavior
- [ ] Defined behavior for 1000+ emails scheduled at ~the same time
- [ ] Defined behavior for what happens once the rate limit would be exceeded
- [ ] Doesn't need to actually send thousands via Ethereal, but logic must handle the volume (queueing, backpressure, DB writes)

### A.5 Hard Constraints
- [ ] No OS cron, no cron libraries, anywhere
- [ ] Scheduling only via BullMQ delayed jobs or a Redis/DB-tracked custom scheduler
- [ ] Persistent across restarts, no restart-from-zero, no duplicate sends
- [ ] Idempotent job execution

### A.6 Frontend
- [ ] Real Google OAuth login (no mock) → redirect to dashboard
- [ ] Header: user name, email, avatar, logout
- [ ] Dashboard tabs: Scheduled Emails / Sent Emails, "Compose New Email" primary action
- [ ] Match provided Figma as closely as possible
- [ ] Compose flow: subject, body, CSV/text upload of leads with parsed count shown, start time, delay-between-emails, hourly limit, submit to schedule API
- [ ] Scheduled Emails table: email, subject, scheduled time, status; loading + empty states
- [ ] Sent Emails table: email, subject, sent time, status (sent/failed); loading + empty states
- [ ] Clean structure, reusable components, DRY, typed API/props, basic error handling/toasts

### A.7 Submission Packaging
- [ ] Private GitHub repo (monorepo ok), access granted to specified collaborators
- [ ] README: run instructions (backend, Redis, DB, worker), frontend run instructions, Ethereal + env setup, architecture overview (scheduling, persistence, rate limiting/concurrency), feature-to-requirement mapping
- [ ] Demo video ≤5 min: scheduling emails, dashboard views, restart-survival demo, (bonus) rate-limit/delay behavior under load
- [ ] Documented assumptions/shortcuts/trade-offs

---

## Decisions I made where the spec is open (flag if you want these changed)

| Open point | Decision | Why |
|---|---|---|
| DB | PostgreSQL | Better JSON/indexing support for job metadata than MySQL, and Prisma support is first-class |
| ORM | Prisma | Fast to scaffold, typed client fits the "strong TypeScript" requirement |
| Repo layout | Monorepo: `/backend`, `/frontend`, `/infra` (docker-compose) | Simplest for one agent + one reviewer to navigate |
| Rate-limit algorithm | Fixed hourly window, Redis key `ratelimit:{senderId}:{yyyyMMddHH}`, atomic `INCR` + `EXPIRE`, checked before a job is allowed to send | Simple, correct under concurrency, easy to explain in README |
| Rescheduling on limit hit | Worker re-enqueues the job as a new BullMQ delayed job targeting the start of the next hour window (+ small jitter), original DB row updated, not duplicated | Satisfies "preserve order, never drop" without a second queue system |
| Queue Dashboard | `@bull-board/express` mounted at `/admin/queues` | Standard, minimal-effort live dashboard |
| Elasticsearch | Single `emails` index, upserted on status transitions (scheduled → sent/failed) | Keeps ES and Postgres in sync without a separate sync job |
| Slack OAuth | Slack "Add to Slack" OAuth v2 flow, storing `access_token` + `incoming_webhook.url` per user in DB | Matches "real OAuth" requirement without hardcoding a webhook |
| CSV parsing | `papaparse` on frontend for immediate count feedback, backend re-validates on submit | Avoids trusting client-side parse alone |

---

## B. Build Prompt for Antigravity

Copy everything in the fenced block below into Antigravity as the task/build prompt.

```
You are building a production-grade full-stack "Email Job Scheduler" for a hiring assignment from ReachInbox. Follow every constraint below exactly — several are hard requirements, not suggestions. Build this as a monorepo with /backend, /frontend, and /infra.

=== GOAL ===
A system that accepts email-send requests via API, schedules them for a specific future time using BullMQ delayed jobs backed by Redis (NEVER cron, NEVER node-cron/agenda), sends them via Ethereal Email SMTP, survives server restarts without losing or duplicating jobs, and exposes a React/Next.js dashboard to compose, view, and track scheduled/sent emails.

=== TECH STACK (fixed) ===
Backend: TypeScript, Express.js, BullMQ + Redis, PostgreSQL via Prisma, Ethereal Email (nodemailer SMTP transport), Elasticsearch for search indexing, @bull-board/express for a live queue dashboard.
Frontend: Next.js + TypeScript, Tailwind CSS, papaparse for CSV parsing.
Infra: docker-compose for Redis, Postgres, and Elasticsearch.
Auth: Real Google OAuth 2.0 for user login. Real Slack OAuth v2 ("Add to Slack" flow) for notifications, storing the token/webhook per user — not a pasted-in webhook URL.

=== DATA MODEL (Prisma) ===
- User: id, googleId, email, name, avatarUrl, createdAt
- SlackIntegration: id, userId (FK, unique), accessToken, incomingWebhookUrl, teamName, connectedAt
- Sender: id, userId (FK), emailAddress, displayName, etherealUser, etherealPass (or shared Ethereal creds — your call, document it)
- EmailJob: id, userId (FK), senderId (FK), bullJobId (unique, for idempotency lookups), recipientEmail, subject, body, scheduledFor (timestamp), status (enum: SCHEDULED, SENDING, SENT, FAILED, RESCHEDULED), attempts, lastError, sentAt, createdAt, updatedAt
- RateLimitConfig: id, userId (FK) or senderId (FK), maxEmailsPerHour, minDelaySeconds — configurable per tenant, with env-level defaults (MAX_EMAILS_PER_HOUR, MIN_DELAY_SECONDS) as fallback

=== SCHEDULING & PERSISTENCE ===
1. On a schedule request, write an EmailJob row to Postgres with status=SCHEDULED FIRST, then enqueue a BullMQ delayed job with `delay = scheduledFor - now` and a jobId derived deterministically from the EmailJob's primary key (e.g. `email-job:{id}`) so re-enqueuing the same row is a no-op, not a duplicate.
2. On server/worker boot, reconcile: query all EmailJob rows with status=SCHEDULED whose corresponding BullMQ job is missing (e.g. after a Redis flush or a gap), and re-enqueue them with the correct remaining delay. Do NOT re-enqueue jobs already present in the queue (checked via jobId).
3. The worker must only transition SCHEDULED -> SENT after Ethereal confirms delivery, and must use a DB transaction / idempotency check (status must still be SCHEDULED/RESCHEDULED, not already SENT) before sending, to prevent double-sends if a job is processed twice.

=== CONCURRENCY, DELAY, RATE LIMITING (all env-configurable) ===
- BullMQ Worker `concurrency` option, read from `WORKER_CONCURRENCY` env var.
- Minimum delay between sends: implement via BullMQ's rate limiter (`limiter: { max: 1, duration: MIN_DELAY_SECONDS * 1000 }` scoped appropriately, or per-sender queues) — document the chosen value in the README, default 2 seconds.
- Hourly cap: before sending, atomically increment a Redis counter keyed `ratelimit:{senderId}:{yyyyMMddHH}` with `INCR` + `EXPIRE 3600` (use a Lua script or `MULTI` to keep it atomic across worker instances). If incrementing would exceed `MAX_EMAILS_PER_HOUR` (or the per-sender override), do NOT send:
  - Update the EmailJob status to RESCHEDULED.
  - Re-enqueue a new delayed BullMQ job targeting the start of the next hour window (plus a few seconds of jitter to avoid a thundering herd), preserving the original relative order among rescheduled jobs (use scheduledFor ascending as the tiebreaker).
  - Fire the Slack notification (see below) exactly once per limit-hit event, not once per queued job.
- All of this must be correct if you horizontally scale the worker process — no in-memory counters anywhere in the rate-limiting path.

=== SLACK NOTIFICATIONS ===
- Implement a real "Connect Slack" OAuth v2 flow: authorize URL -> callback route -> exchange code for token -> store `access_token` and `incoming_webhook.url` on SlackIntegration for that user.
- The moment a sender's hourly limit is hit, POST a message to `incoming_webhook.url` (e.g. "Rate limit reached for sender X — Y emails rescheduled to Z"). This must be a live call during your demo, not just a console.log.
- If SlackIntegration doesn't exist for the user, skip notification silently (no throw, no crash).
- If the user connects Slack later, notifications should start firing without restarting the server (no caching of "has no integration" in memory beyond a short TTL, or just re-query on each hit).

=== ELASTICSEARCH ===
- Single `emails` index. On every EmailJob status transition (create, SENT, FAILED, RESCHEDULED), upsert the document (id = EmailJob id) with searchable fields: recipientEmail, subject, body, status, scheduledFor, sentAt, senderId, userId.
- Expose a `GET /api/emails/search?q=...&status=...` endpoint backed by an ES query (match on subject/body/recipientEmail, filter by status), used by the frontend tables' search/filter UI.

=== BULLMQ DASHBOARD ===
- Mount `@bull-board/express` at `/admin/queues`, wired to the actual email-send queue, so job states are visible live during the demo.

=== API SURFACE (Express) ===
- `POST /api/auth/google` (or NextAuth-style callback) — Google OAuth login, issues a session (JWT or cookie session, your call — document it).
- `GET /api/auth/me` — current user.
- `POST /api/auth/logout`.
- `GET /api/slack/connect` — redirect to Slack OAuth authorize URL.
- `GET /api/slack/callback` — exchange code, store integration.
- `POST /api/emails/schedule` — body: subject, body, recipients[] (or CSV parsed leads), senderId, startTime, delaySeconds override, hourlyLimit override. Creates N EmailJob rows (one per recipient) with staggered scheduledFor times respecting delaySeconds, and enqueues BullMQ jobs for each.
- `GET /api/emails/scheduled` — paginated list, status=SCHEDULED/RESCHEDULED.
- `GET /api/emails/sent` — paginated list, status=SENT/FAILED.
- `GET /api/emails/search` — as above.

=== FRONTEND (Next.js + TS + Tailwind) ===
- Follow the Figma referenced in the assignment as closely as possible for layout/spacing/colors; if the Figma isn't accessible to you, use a clean, modern SaaS-dashboard aesthetic (sidebar or top nav + content area) and note that as an assumption in the README.
- `/login` — "Sign in with Google" button, real OAuth redirect.
- `/dashboard` — header with avatar/name/email + logout; tabs "Scheduled Emails" / "Sent Emails"; primary "Compose New Email" button; a "Connect Slack" control (shows connected/disconnected state).
- Compose modal/page: subject input, rich-ish body textarea, CSV/text upload (parse client-side with papaparse, show "N email addresses detected", validate format), start time picker, delay-between-emails input, hourly-limit input, Schedule button -> POST to backend.
- Scheduled table: email, subject, scheduled time, status chip; loading skeleton; empty state illustration/message.
- Sent table: email, subject, sent time, status chip (sent=green, failed=red); loading skeleton; empty state.
- Reusable components: Button, Input, Table, Modal, Toast/ErrorBanner, StatusChip. All props/API responses typed.

=== HARD CONSTRAINTS (do not violate) ===
- No cron, anywhere, in any form.
- Every schedule must survive a server restart and must not duplicate or restart from scratch — implement and manually test the restart scenario (stop the process, start it again, confirm queued jobs still fire at the right time and nothing re-sends).
- Idempotency must be provable: the same EmailJob can never be sent twice even if enqueued twice.

=== DELIVERABLES ===
1. Working backend (Express + BullMQ worker + Postgres via Prisma + Redis + Elasticsearch + Slack OAuth + Google OAuth).
2. Working frontend (Next.js dashboard matching the flows above).
3. docker-compose.yml for Redis, Postgres, Elasticsearch.
4. README.md covering: setup steps for backend/frontend/Redis/DB/Ethereal/env vars; architecture overview of scheduling, persistence-on-restart, and rate-limiting/concurrency (with the exact delay value and rate-limit mechanism stated); a feature-to-requirement mapping table; and a list of assumptions/shortcuts/trade-offs taken.
5. .env.example files for backend and frontend listing every required variable (GOOGLE_CLIENT_ID/SECRET, SLACK_CLIENT_ID/SECRET, DATABASE_URL, REDIS_URL, ELASTICSEARCH_URL, ETHEREAL_* creds or auto-generation logic, MAX_EMAILS_PER_HOUR, MIN_DELAY_SECONDS, WORKER_CONCURRENCY, SESSION_SECRET).

Build this incrementally: (1) Prisma schema + docker-compose + migrations, (2) BullMQ queue/worker skeleton with a dummy job to prove delayed-job + restart-survival works, (3) Ethereal sending + idempotency, (4) rate limiting + rescheduling logic, (5) Slack OAuth + notification, (6) Elasticsearch indexing + search endpoint, (7) Bull Board dashboard, (8) Google OAuth + session, (9) frontend pages wired to the real API, (10) README + .env.example + final restart/load test pass.
```

---

Let me know if you want me to adjust any of the "decisions I made" (e.g. swap Postgres→MySQL, or NextAuth instead of a custom Google OAuth flow) before you hand this to Antigravity — those are the parts most likely to need to match a house convention you already use.
