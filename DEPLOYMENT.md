# Production Deployment Guide: Single VPS with Docker & Caddy

This guide describes how to deploy the ReachInbox Email Job Scheduler on a single Linux Virtual Private Server (VPS) behind Caddy with automatic HTTPS, separate API and queue worker containers, PostgreSQL, Redis, and zero-maintenance PostgreSQL search fallback (no Elasticsearch container required).

---

## 1. Prerequisites & VPS Sizing

- **Recommended OS**: Ubuntu 22.04 or 24.04 LTS (x86_64)
- **Minimum Specs**: 1 vCPU, 2 GB RAM, 20 GB SSD
- **Network Ports**:
  - `80/tcp` (HTTP — used by Caddy for ACME HTTP-01 challenge)
  - `443/tcp` (HTTPS — Caddy TLS termination)
  - `22/tcp` (SSH access)

---

## 2. Install Docker & Docker Compose

Connect to your VPS via SSH and install Docker:

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install prerequisites
sudo apt-get install -y ca-certificates curl gnupg lsb-release git

# Add Docker GPG key & repository
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Docker Compose Plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable and start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Allow non-root user to run docker (optional)
sudo usermod -aG docker $USER
```

---

## 3. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/your-username/reachinbox.git
sudo chown -R $USER:$USER /opt/reachinbox
cd /opt/reachinbox
```

---

## 4. Configure DNS

Go to your DNS registrar (Cloudflare, Namecheap, Route53, etc.) and create DNS `A` records:
- `yourdomain.com` → `YOUR_VPS_PUBLIC_IP`
- `www.yourdomain.com` (optional) → `YOUR_VPS_PUBLIC_IP`

> **Note**: If using Cloudflare, set proxy status to **DNS only (Grey cloud)** during initial certificate generation, or ensure SSL is set to **Full (Strict)**.

---

## 5. Configure Production Environment Variables

### A. Root `.env` (for Caddy and Docker Compose)
Create a `.env` file in the project root:

```bash
cat << 'EOF' > .env
DOMAIN=yourdomain.com
ACME_EMAIL=admin@yourdomain.com
POSTGRES_USER=reachinbox
POSTGRES_PASSWORD=generate_a_strong_password_here
POSTGRES_DB=reachinbox_prod
EOF
```

### B. Backend `.env.production`
Copy and edit the backend production env:

```bash
cp backend/.env.production.example backend/.env.production
nano backend/.env.production
```

Ensure the following variables are configured:
- `DATABASE_URL`: `postgresql://reachinbox:<STRONG_PASSWORD>@postgres:5432/reachinbox_prod?schema=public`
- `REDIS_URL`: `redis://redis:6379`
- `ELASTICSEARCH_URL`: `disabled` *(Elasticsearch is omitted in production; search queries automatically use the built-in PostgreSQL `contains()` fallback)*
- `FRONTEND_URL`: `https://yourdomain.com`
- `SESSION_SECRET`: generate with `openssl rand -hex 32`
- `GOOGLE_CALLBACK_URL`: `https://yourdomain.com/api/auth/google/callback`
- `SLACK_CALLBACK_URL`: `https://yourdomain.com/api/slack/callback`

### C. Frontend `.env.production`
Copy and edit the frontend production env:

```bash
cp frontend/.env.production.example frontend/.env.production
nano frontend/.env.production
```

Ensure the following variables are configured:
- `BACKEND_URL`: `http://backend:4000`
- `NEXT_PUBLIC_APP_URL`: `https://yourdomain.com`

---

## 6. Update OAuth Callback URIs

Before launching, register your production domain with Google and Slack.

### Google Cloud Console
1. Navigate to **APIs & Services > Credentials > OAuth 2.0 Client IDs**.
2. Under **Authorized JavaScript origins**, add:
   - `https://yourdomain.com`
3. Under **Authorized redirect URIs**, add:
   - `https://yourdomain.com/api/auth/google/callback`

### Slack App Settings
1. Navigate to **api.slack.com/apps > Your App > OAuth & Permissions**.
2. Under **Redirect URLs**, add:
   - `https://yourdomain.com/api/slack/callback`

---

## 7. Build and Launch Containers

Start the production stack using `docker-compose.prod.yml`:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This launches 5 coordinated containers:
1. `reachinbox_prod_postgres`: PostgreSQL database (persisted to `postgres_data` volume)
2. `reachinbox_prod_redis`: Redis with AOF persistence (persisted to `redis_data` volume)
3. `reachinbox_prod_backend`: Express API HTTP server (`START_WORKER=false`)
4. `reachinbox_prod_worker`: Dedicated BullMQ queue worker and restart reconciler (`START_WORKER=true`)
5. `reachinbox_prod_frontend`: Production Next.js server on port 3000
6. `reachinbox_prod_caddy`: Reverse proxy with automatic Let's Encrypt TLS certificates

---

## 8. Run Database Migrations

Apply the Prisma schema to the production PostgreSQL database:

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma db push
```

*(Alternatively, if using Prisma migrations: `docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy`)*

---

## 9. Verification & Health Check

### Check Container Status
```bash
docker compose -f docker-compose.prod.yml ps
```
All containers should be in `Up` (healthy) status.

### Inspect Caddy SSL Certificates
```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i "certificate"
```
Caddy will automatically obtain a certificate from Let's Encrypt for `yourdomain.com`.

### Check Backend & Worker Logs
```bash
# View backend HTTP server logs
docker compose -f docker-compose.prod.yml logs -f backend

# View queue worker logs
docker compose -f docker-compose.prod.yml logs -f worker
```

### Access Points
- **Web Application**: `https://yourdomain.com`
- **API Health Check**: `https://yourdomain.com/api/health`
- **Bull Board Queue Dashboard**: `https://yourdomain.com/admin/queues`

---

## 10. Operational Commands

### Scale Queue Workers
To increase worker processing throughput independently of the HTTP server:
```bash
docker compose -f docker-compose.prod.yml up -d --scale worker=2
```

### Restart Services Gracefully
```bash
# Graceful worker restart (drains in-flight emails before stopping)
docker compose -f docker-compose.prod.yml restart worker

# Full stack restart
docker compose -f docker-compose.prod.yml restart
```

### Data Backups
```bash
# Backup PostgreSQL database
docker compose -f docker-compose.prod.yml exec -t postgres pg_dump -U reachinbox reachinbox_prod > backup_$(date +%F).sql

# Backup Redis dump
docker compose -f docker-compose.prod.yml exec redis redis-cli bgsave
```
