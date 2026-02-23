# private_tweet Deployment Guide

This document covers the production deployment process for private_tweet, based on a single-host Docker Compose + Nginx setup.

---

## Feature Overview

| Feature | Description |
|---------|-------------|
| Invite-code registration / login | Registration requires a valid invite code; admins generate codes in the admin panel |
| Post / reply / repost | Text posts (240 chars), reply threads, reposts with optional comment |
| **Edit posts and replies** | Authors can inline-edit their content; edited posts show an *Edited* badge |
| **Delete posts and replies** | Soft delete with a confirmation modal before the action is applied |
| Likes | Real-time counter; click again to unlike |
| Follow / unfollow | Follow relationships drive the feed |
| Following timeline (Feed) | Redis Sorted Set fanout-on-write with infinite scroll |
| **Infinite scroll** | Feed and profile pages use IntersectionObserver to auto-load the next page |
| **Image uploads** | Direct upload to MinIO via presigned URL; up to 4 images displayed in a grid |
| **Direct messages (DM)** | Conversation list + real-time messaging (WebSocket) with unread badge |
| **End-to-end encryption** | Web Crypto API (RSA-OAEP + AES-256-GCM); private key stored only in localStorage |
| **Search** | Fuzzy match on post content + username / bio (ILIKE) with keyword highlighting |
| Notifications | Likes, replies, follows, and reposts all trigger in-app notifications with nav badge |
| Login wall | All pages / API endpoints require authentication; unauthenticated users redirect to `/login` |
| robots.txt + noindex | Site-wide search engine crawl prevention |
| Admin panel | User management (promote/demote), invite code management |

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Testing the Production Build Locally](#2-testing-the-production-build-locally)
3. [Deploying to DigitalOcean](#3-deploying-to-digitalocean)
4. [Environment Variables](#4-environment-variables)
5. [Day-to-Day Operations](#5-day-to-day-operations)
6. [Verifying a Successful Deployment](#6-verifying-a-successful-deployment)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Project Structure

```
private_tweet/
├── apps/
│   ├── api/            # Fastify backend (port 3001, internal only)
│   │   └── Dockerfile
│   └── web/            # Next.js frontend (port 3000, internal only)
│       └── Dockerfile
├── nginx/
│   └── nginx.conf      # Reverse proxy config (only service exposed externally, port 80)
├── docker-compose.prod.yml   # Production Compose config (6 services)
├── deploy.sh           # One-click deploy script
├── .env.production.example   # Environment variable template (copy and fill in)
└── .env.production     # Actual secrets (never commit to Git)
```

**Service startup order** (enforced by `depends_on + condition: service_healthy`):

```
postgres ─┐
redis    ─┼─→ api ─→ web ─→ nginx (external :80)
minio    ─┘
```

---

## 2. Testing the Production Build Locally

Validate that the production images work correctly on your local machine. Use the separate project name `pt_prod` to avoid conflicts with the development environment.

### Step 1: Prepare the environment variable file

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and fill in test passwords (can be simple for local testing, but must not contain `CHANGE_ME`):

```env
POSTGRES_USER=tweet
POSTGRES_PASSWORD=local_test_pw_123
POSTGRES_DB=private_tweet_prod

REDIS_PASSWORD=local_redis_pw_123

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123456

JWT_SECRET=a8f3b2c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1

JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

WEB_URL=http://localhost
```

> Use `openssl rand -hex 32` to generate a real random value for `JWT_SECRET`.

### Step 2: Build the images

The first build takes a few minutes (downloading the node:20-alpine base image, installing dependencies, compiling TypeScript):

```bash
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production build
```

### Step 3: Start all services

```bash
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production up -d
```

Wait about 30 seconds for all health checks to pass.

### Step 4: Run database migrations

**Required on first startup** to create tables. Subsequent deployments via `deploy.sh` handle this automatically:

```bash
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e DATABASE_URL="postgresql://tweet:local_test_pw_123@postgres:5432/private_tweet_prod" \
  api \
  sh -c "node /app/apps/api/node_modules/.bin/prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma"
```

### Step 5: Verify

```bash
# Check all service statuses
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production ps

# Verify the API
curl http://localhost/api/health
# Expected response: {"status":"ok"}

# Open http://localhost in a browser → should redirect to /login
```

### Clean up the local test environment

```bash
# Stop only, preserve data volumes
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production down

# Stop and delete all data (full wipe)
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production down -v
```

---

## 3. Deploying to DigitalOcean

### 3.1 Create a server (Droplet)

1. Log in to [DigitalOcean](https://cloud.digitalocean.com)
2. Create a Droplet:
   - **Image**: Ubuntu 24.04 LTS x64
   - **Plan**: Minimum Basic / 2 vCPU / 4 GB RAM (the initial Docker build needs memory; 2 GB is sufficient after that)
   - **Region**: Choose the datacenter closest to your users (Singapore or San Francisco recommended for Asian users)
   - **SSH Key**: Upload your local public key (`~/.ssh/id_rsa.pub`) to avoid password-based login
3. Note the server's **Public IP**, e.g. `143.198.x.x`

### 3.2 Connect via SSH

```bash
ssh root@143.198.x.x
```

The first connection will prompt you to confirm the fingerprint — type `yes`.

### 3.3 Install Docker

```bash
# Update package lists
apt update && apt upgrade -y

# Install Docker (official script, auto-detects Ubuntu version)
curl -fsSL https://get.docker.com | sh

# Verify installation (confirm version >= 24 and Compose is the v2 plugin)
docker version
docker compose version
```

> **Important**: Confirm the output contains `Docker Compose version v2.x.x` (not the legacy `docker-compose` v1).

### 3.4 Clone the repository

Git is usually pre-installed on Ubuntu:

```bash
git --version   # confirm it's available

# Clone your repository (replace with the actual URL)
git clone https://github.com/your-username/private_tweet.git
cd private_tweet
```

If the repository is private, configure SSH keys or a GitHub Personal Access Token first:

```bash
# Option 1: Generate a server SSH key and add it to GitHub Deploy Keys
ssh-keygen -t ed25519 -C "deploy@server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub   # Copy the output and paste it into GitHub → repo → Settings → Deploy Keys

# Option 2: Use HTTPS + Token (quick and temporary)
git clone https://your-token@github.com/your-username/private_tweet.git
```

### 3.5 Configure environment variables

Generate real secrets on the server:

```bash
cd private_tweet
cp .env.production.example .env.production

# Generate JWT_SECRET (copy the output)
openssl rand -hex 32
```

Edit the environment variable file:

```bash
nano .env.production
```

Fill in all `CHANGE_ME` placeholders (see [Section 4](#4-environment-variables) for details):

```env
POSTGRES_USER=tweet
POSTGRES_PASSWORD=<strong password, 20+ random characters recommended>
POSTGRES_DB=private_tweet

REDIS_PASSWORD=<strong password>

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<strong password>

JWT_SECRET=<output of openssl rand -hex 32>

JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

WEB_URL=http://143.198.x.x   # replace with your server IP or domain
```

Press `Ctrl+X` → `Y` → `Enter` to save.

**Verify nothing is missing**:

```bash
grep CHANGE_ME .env.production   # should return no output
```

### 3.6 Run the one-click deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

The script performs the following steps in order:
1. Checks that Docker and Compose are installed
2. Validates that `.env.production` contains no unfilled placeholders
3. Runs `git pull` to fetch the latest code
4. Runs `docker compose build` to build the api and web images (**first run takes ~5–10 minutes**)
5. Starts postgres, redis, and minio and waits for health checks to pass
6. Runs `prisma migrate deploy` inside the api container (creates tables / applies incremental migrations)
7. Starts all 6 services
8. Polls `http://localhost/api/health` until nginx is ready

When complete, the output shows:

```
✅ Deployment complete!

   Application : http://143.198.x.x
   API health  : http://143.198.x.x/api/health
```

### 3.7 Updating the code

After pushing new code, run on the server:

```bash
cd private_tweet
./deploy.sh
```

The script automatically `git pull`s, rebuilds changed images, performs a rolling restart, and leaves data volumes untouched.

---

## 4. Environment Variables

All variables are configured in `.env.production` and injected into services by `docker-compose.prod.yml` via `--env-file`.

| Variable | Example value | Description |
|----------|---------------|-------------|
| `POSTGRES_USER` | `tweet` | PostgreSQL database username; default is fine |
| `POSTGRES_PASSWORD` | *(strong password)* | PostgreSQL password — **must be changed**; 24+ random characters recommended |
| `POSTGRES_DB` | `private_tweet` | Database name; default is fine |
| `REDIS_PASSWORD` | *(strong password)* | Redis authentication password — **must be changed**; used by rate limiting and feed caching |
| `MINIO_ROOT_USER` | `minioadmin` | MinIO admin account (also used as Access Key); default is acceptable |
| `MINIO_ROOT_PASSWORD` | *(strong password)* | MinIO admin password (also used as Secret Key) — **must be changed**; minimum 8 characters |
| `MINIO_BUCKET` | `tweets` | Bucket name for image storage, default `tweets`; **the API container automatically creates the bucket and sets a public-read policy on startup if it doesn't exist** — no manual creation needed |
| `JWT_SECRET` | *(64 hex chars)* | JWT signing secret — generate with `openssl rand -hex 32`; **leaking this invalidates all login tokens** |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime; default 15 minutes — too short hurts UX, too long reduces security |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime; default 7 days — controls how long until a full re-login is required |
| `WEB_URL` | `http://1.2.3.4` | External URL of the server — **no trailing slash**; used for CORS and cookie scope. Use a domain name if available, otherwise use the IP |

**Connecting the API container to MinIO**:

The API service in `docker-compose.prod.yml` needs the following additional environment variables to connect to MinIO. Append them to the `api` service's `environment` block:

```yaml
# docker-compose.prod.yml → services.api.environment
MINIO_ENDPOINT: minio            # Docker internal service name, fixed value
MINIO_PORT: "9000"
MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
MINIO_BUCKET: ${MINIO_BUCKET:-tweets}
```

Also add to `.env.production`:

```env
MINIO_BUCKET=tweets
```

**Notes**:
- `DATABASE_URL` and `REDIS_URL` **do not** need to be set manually — `docker-compose.prod.yml` assembles them automatically from the variables above
- `.env.production` must **never be committed to Git** (already excluded in `.gitignore`)

---

## 5. Day-to-Day Operations

Run the following commands from the `private_tweet/` directory on the server.

```bash
# Short alias to avoid repeating the long command
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
```

### Check status

```bash
# View health status of all services (STATUS column should be healthy for all)
$COMPOSE ps

# Stream live logs (all services)
$COMPOSE logs -f

# View the last 100 lines of a specific service
$COMPOSE logs --tail=100 api
$COMPOSE logs --tail=100 web
$COMPOSE logs --tail=100 nginx
$COMPOSE logs --tail=100 postgres
```

### Restart services

```bash
# Restart a single service without rebuilding (useful for quick recovery)
$COMPOSE restart api
$COMPOSE restart web
$COMPOSE restart nginx

# Full rebuild and restart (after a code update)
./deploy.sh
```

### Update code

```bash
# Option 1: Run deploy.sh (recommended — auto pull + build + migrate + restart)
./deploy.sh

# Option 2: Manual steps (for debugging)
git pull --ff-only
$COMPOSE build api   # rebuild only the API image
$COMPOSE up -d api   # rolling restart of API
```

### Back up the database

```bash
# Export a full database backup (filename includes timestamp)
$COMPOSE exec postgres pg_dump \
  -U tweet \
  -d private_tweet \
  --no-password \
  -F c \
  -f /tmp/backup_$(date +%Y%m%d_%H%M%S).dump

# Copy the backup file to the host
docker cp $(docker compose -p pt_prod ps -q postgres):/tmp/backup_*.dump ./backups/

# Or use pg_dumpall for a full instance backup (includes permissions)
$COMPOSE exec postgres pg_dumpall -U tweet > backups/full_$(date +%Y%m%d).sql
```

### Restore the database

```bash
# Make sure services are stopped first (data volumes preserved)
$COMPOSE down

# Restore (overwrites existing data)
$COMPOSE up -d postgres
$COMPOSE exec -T postgres pg_restore \
  -U tweet \
  -d private_tweet \
  --clean \
  < backups/backup_20260222_120000.dump
```

### Shell access for debugging

```bash
# Open a shell in the API container
$COMPOSE exec api sh

# Run Prisma Studio inside the API container (for development debugging)
$COMPOSE exec api node /app/apps/api/node_modules/.bin/prisma studio \
  --schema /app/apps/api/prisma/schema.prisma

# Connect to PostgreSQL
$COMPOSE exec postgres psql -U tweet -d private_tweet
```

### Free up disk space

```bash
# Remove unused images (does not affect running services)
docker image prune -f

# Remove dangling build cache
docker builder prune -f

# Show total Docker disk usage
docker system df
```

---

## 6. Verifying a Successful Deployment

### Check container status

```bash
$COMPOSE ps
```

Expected output (all STATUS values should be `healthy`):

```
NAME          IMAGE              STATUS
api-1         private_tweet-api  Up 2 minutes (healthy)
web-1         private_tweet-web  Up 1 minute (healthy)
nginx-1       nginx:1.27-alpine  Up 30 seconds (healthy)
postgres-1    postgres:16-alpine Up 3 minutes (healthy)
redis-1       redis:7-alpine     Up 3 minutes (healthy)
minio-1       minio/minio:latest Up 3 minutes (healthy)
```

### Check the API

```bash
curl http://your-server-ip/api/health
# Expected: {"status":"ok"}
```

### Check the login wall

Open `http://your-server-ip` in a browser. It should automatically redirect to the `/login` page and the address bar should show:

```
http://your-server-ip/login?from=%2Ffeed
```

### Check robots.txt

```bash
curl http://your-server-ip/robots.txt
# Expected response:
# User-agent: *
# Disallow: /
```

### Check the noindex response header

```bash
curl -I http://your-server-ip/api/health | grep -i robots
# Expected: x-robots-tag: noindex, nofollow
```

### Feature verification checklist

- [ ] Visiting the home page automatically redirects to `/login`
- [ ] Log in with an admin account (first deployment requires registering first, then manually promoting the user in the database — see Troubleshooting below)
- [ ] Create a post successfully; it appears in the timeline
- [ ] Follow another user; Feed updates accordingly
- [ ] Likes work correctly
- [ ] Notifications page shows activity
- [ ] **Edit a post**: click `···` in the top-right corner of a post → Edit, modify content, click Save — the post should show the *Edited* badge
- [ ] **Delete a post**: click `···` → Delete, confirm in the modal — the post should be removed from the list
- [ ] **Image upload**: click the image button when composing a post, upload 1–4 images, publish — images should display correctly
- [ ] **Search**: type a keyword in the nav bar and press Enter — both the Posts and Users tabs should return results with keyword highlighting
- [ ] **Send a DM**: open the Messages page, start a conversation with a user, send a message — the recipient should receive it in real time
- [ ] **End-to-end encryption**: the top of a DM conversation should show "End-to-end encrypted" (requires both parties to have opened the Messages page at least once)

---

## 7. Troubleshooting

### How do I create an admin account on first deployment?

`deploy.sh` does not create any accounts automatically. The process is:

1. Visit `http://server-ip/register` and register the first account using any invite code
   - **First registration**: insert an invite code directly into the database, or temporarily bypass invite validation in the backend

   The simplest approach — insert an invite code directly:
   ```bash
   $COMPOSE exec postgres psql -U tweet -d private_tweet -c \
     "INSERT INTO invite_codes (code, created_by) VALUES ('FIRSTUSER', NULL);"
   ```

2. After registering, promote the account to admin:
   ```bash
   $COMPOSE exec postgres psql -U tweet -d private_tweet -c \
     "UPDATE users SET role = 'ADMIN' WHERE username = 'your-username';"
   ```

3. The admin can then visit `/admin` to generate invite codes and invite other users.

---

### The `api` container is stuck as `unhealthy` after startup

**Troubleshooting steps**:

```bash
# View API logs
$COMPOSE logs --tail=50 api
```

Common causes:

| Error keyword | Cause | Fix |
|---------------|-------|-----|
| `Cannot find package 'fastify'` | `apps/api/node_modules` missing in the runner stage | Confirm the Dockerfile has `COPY --from=builder /app/apps/api/node_modules` |
| `PrismaClientInitializationError` | Prisma engine cannot find OpenSSL | Confirm the runner stage has `apk add --no-cache openssl` and schema.prisma has `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` |
| `ECONNREFUSED` to postgres/redis | Database not yet healthy; API started too early | Usually recovers with a restart: `$COMPOSE restart api` |
| `P1001` / database connection timeout | `DATABASE_URL` assembled incorrectly | Check the `POSTGRES_*` variables in `.env.production` |

---

### Docker build fails

```bash
# Rebuild without cache (fixes issues caused by stale cache)
$COMPOSE build --no-cache api
$COMPOSE build --no-cache web
```

---

### `deploy.sh` reports a `CHANGE_ME` placeholder error

```
❌ JWT_SECRET in .env.production is empty or still has the placeholder value
```

Open `.env.production`, find the offending variable, and replace it with a real value. Generate `JWT_SECRET` with:

```bash
openssl rand -hex 32
```

---

### Nginx returns 502 Bad Gateway

This means nginx is reachable but the upstream service (api or web) is down:

```bash
# Check api and web status
$COMPOSE ps

# View nginx error log
$COMPOSE exec nginx cat /var/log/nginx/error.log | tail -20

# Try restarting api/web
$COMPOSE restart api web
```

---

### Disk space full (build fails or logs are too large)

```bash
# Check disk usage
df -h

# Remove old images and build cache
docker system prune -f

# Truncate logs older than 7 days
find /var/lib/docker/containers -name "*.log" -mtime +7 -exec truncate -s 0 {} \;
```

---

### Page doesn't reflect code changes after an update

In production mode, Next.js static assets are cached for 1 year (`immutable`). Force-refresh in the browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac).

If nginx is serving stale content:

```bash
$COMPOSE restart nginx
```

---

### Image upload fails / MinIO bucket not auto-created

The API creates the bucket automatically on startup (via the `storage.ts` plugin). If image uploads fail, follow these steps:

**1. Confirm the API container has the MinIO environment variables**

```bash
$COMPOSE exec api env | grep MINIO
# Should output MINIO_ENDPOINT=minio, MINIO_ACCESS_KEY=..., etc.
```

If there is no output, the `docker-compose.prod.yml` API service is missing the MinIO variables (see the configuration block in [Section 4](#4-environment-variables)). Add them, then rebuild and restart:

```bash
$COMPOSE build api
$COMPOSE up -d api
```

**2. Create the bucket manually (emergency fallback)**

If automatic creation fails, enter the MinIO container and create it manually:

```bash
# Enter the MinIO container
$COMPOSE exec minio sh

# Use the built-in mc client
mc alias set local http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc mb local/tweets
mc anonymous set public local/tweets
exit
```

**3. Confirm the MinIO container is healthy**

```bash
$COMPOSE ps minio
# STATUS should be healthy

$COMPOSE logs --tail=30 minio
```

---

### WebSocket connection fails / real-time messaging doesn't work

The messaging feature relies on a WebSocket connection to the backend API at path `/ws` (not `/api/ws`). Additional configuration is required in production.

**Symptom**: The Messages page opens but messages are not delivered in real time, or the WebSocket connection shows a `101` failure in DevTools → Network.

**Cause**: The client-side `NEXT_PUBLIC_WS_URL` is not configured and defaults to `ws://localhost:4000` (the local development address), which is invalid in production.

**Fix**:

1. Add a dedicated WebSocket proxy location for `/ws` in `nginx/nginx.conf` inside the `server` block (place it before the `/api/` location):

```nginx
# WebSocket upgrade — must come before /api/ since /api/ clears the Connection header
location /ws {
    proxy_pass         http://api:3001;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host       $host;
    proxy_read_timeout 86400s;   # long-lived connection, do not timeout
}
```

2. Pass the WS URL as a build argument and runtime variable to the `web` service in `docker-compose.prod.yml`:

```yaml
# services.web.build.args
NEXT_PUBLIC_WS_URL: ws://${WEB_URL_HOST}   # see note below

# services.web.environment
NEXT_PUBLIC_WS_URL: ws://${WEB_URL_HOST}
```

> `WEB_URL_HOST` should be only the hostname (no `http://`). If `WEB_URL=http://1.2.3.4`, use `1.2.3.4`.

3. Rebuild and redeploy:

```bash
$COMPOSE build web
$COMPOSE up -d
```

**Verify**: Open DevTools → Network → WS, refresh the Messages page — the `/ws` connection should show status `101 Switching Protocols`.

---

### DMs show "Encryption unavailable" / end-to-end encryption not working

**Symptom**: Sending a DM shows "Recipient hasn't set up E2E encryption yet", or the conversation header shows "Encryption unavailable".

**Cause**: E2E encryption uses the Web Crypto API. **Key pairs are generated in the browser and stored in localStorage**, with the public key uploaded to the server. If the recipient has never opened the Messages page, their public key has not been uploaded and encryption cannot proceed.

**Fix**:

1. Ask the **recipient** to open the Messages page (`/messages`) at least once. When the page loads, it silently generates a key pair in the background and uploads the public key — no user action is required.
2. Refresh the sender's Messages page. The conversation header should now show "End-to-end encrypted".

> **Note**: The E2E encryption private key is stored only in the user's local browser localStorage. If the user **switches devices** or **clears their browser data**, previously encrypted messages will no longer be decryptable. This is an inherent limitation of end-to-end encryption, not a bug.

---

### How to perform a complete reset (destructive — deletes all data)

```bash
# Stop all services and remove data volumes (irreversible!)
$COMPOSE down -v

# Remove built images
docker rmi $(docker images "private_tweet*" -q) 2>/dev/null || true
```
