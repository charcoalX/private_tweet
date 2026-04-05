# Private Tweet

A self-hosted, privacy-first microblogging platform for small groups of invited friends. All content sits behind a login wall, search engines are blocked from indexing, and registration requires an invite code or admin approval.

## Features

- **Invite-only registration** — new accounts require a valid invite code
- **Posts** — 240-character limit, with reply and repost support; posts are editable and soft-deletable
- **Timeline feed** — follows-based feed with Redis-backed fanout (push for < 1 k followers, DB fallback otherwise); infinite scroll with cursor pagination
- **User profiles** — bio, avatar, follower/following counts, post history
- **Likes & notifications** — like posts; get notified on likes, follows, replies, reposts, and mentions
- **Direct messages** — end-to-end encrypted (RSA-OAEP 2048 + AES-256-GCM hybrid); real-time delivery over WebSocket
- **Unified search** — full-text search across posts and users with keyword highlighting
- **Media uploads** — client → presigned URL → MinIO (S3-compatible)
- **Admin panel** — manage users (promote/demote), generate invite codes
- **Full login wall** — every page and API endpoint requires authentication
- **SEO blocking** — `robots.txt` (`Disallow: /`) + `X-Robots-Tag: noindex, nofollow` on all responses

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 · React 19 · Tailwind CSS 3 |
| Backend | Fastify 4 · Node.js 20 · TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 (ioredis) |
| Object Storage | MinIO (S3-compatible) |
| Auth | JWT (access 15 m + refresh 7 d) via `@fastify/jwt` · argon2 password hashing |
| Monorepo | pnpm workspaces |
| Container | Docker Compose (dev) · multi-stage Dockerfile (prod) |

## Project Structure

```
private_tweet/
├── apps/
│   ├── api/                  # Fastify backend
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       ├── plugins/      # db, redis, auth, storage, websocket
│   │       └── routes/       # auth, users, posts, admin, notifications,
│   │                         # uploads, messages, search
│   └── web/                  # Next.js frontend
│       └── src/
│           ├── app/          # App Router pages
│           ├── components/   # UI components
│           └── lib/          # api client, e2e crypto, utilities
├── packages/
│   └── types/                # Shared TypeScript types (@private-tweet/types)
└── docker-compose.yml        # PostgreSQL + Redis + MinIO
```

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm 9+](https://pnpm.io/) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Development Setup

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd private_tweet
pnpm install
pnpm approve-builds   # allow native module builds (argon2, prisma, etc.)
```

**2. Start backing services (PostgreSQL, Redis, MinIO)**

```bash
docker compose up -d
```

**3. Configure environment variables**

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Key variables in `apps/api/.env`:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://tweet:tweet_dev_password@localhost:5432/private_tweet` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | — | **Required** — a long random string |
| `MINIO_ENDPOINT` | `localhost` | MinIO host |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |

**4. Run database migrations**

```bash
cd apps/api
pnpm prisma migrate dev
```

**5. Start the development servers**

```bash
# From the repo root — starts both api (port 3001) and web (port 3000)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

> The first user to register is automatically promoted to ADMIN. Create an invite code from the admin panel to invite others.

## API Overview

All routes are prefixed with `/api`. Authentication uses `httpOnly` cookies set automatically on login.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Register with invite code |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout (revokes refresh token) |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/api/users/:username` | Get user profile |
| `PATCH` | `/api/users/me` | Update profile |
| `GET` | `/api/users/:username/posts` | User's posts (paginated) |
| `POST` | `/api/users/:username/follow` | Follow a user |
| `DELETE` | `/api/users/:username/follow` | Unfollow a user |
| `GET` | `/api/posts/feed` | Timeline feed (cursor-paginated) |
| `POST` | `/api/posts` | Create a post |
| `PATCH` | `/api/posts/:id` | Edit a post |
| `DELETE` | `/api/posts/:id` | Soft-delete a post |
| `POST` | `/api/posts/:id/like` | Like a post |
| `DELETE` | `/api/posts/:id/like` | Unlike a post |
| `GET` | `/api/notifications` | List notifications |
| `POST` | `/api/notifications/read-all` | Mark all as read |
| `GET` | `/api/messages` | List conversations |
| `GET` | `/api/messages/:userId` | Get messages with a user |
| `POST` | `/api/messages/:userId` | Send a message |
| `GET` | `/api/search` | Search posts and users |
| `POST` | `/api/uploads/presign` | Get a presigned upload URL |
| `GET` | `/api/admin/users` | List all users (admin only) |
| `PATCH` | `/api/admin/users/:id/role` | Promote / demote user (admin only) |
| `GET` | `/api/admin/invites` | List invite codes (admin only) |
| `POST` | `/api/admin/invites` | Generate invite code (admin only) |

## End-to-End Encryption (Direct Messages)

Messages use a hybrid RSA-OAEP + AES-256-GCM scheme implemented entirely in the browser via the Web Crypto API:

1. On first login each user generates an RSA-2048 key pair in the browser; the public key is uploaded to the server.
2. When sending a message, a fresh AES-256-GCM key is generated, the plaintext is encrypted with it, and the AES key is encrypted twice — once with the sender's public key and once with the recipient's public key.
3. The private key never leaves the browser (stored in `localStorage`).

> **Note:** Clearing browser storage or switching devices permanently loses the ability to decrypt past messages.

## Production Deployment

Each app has a multi-stage Dockerfile. Build and run with a production `docker-compose.yml` that includes the `api` and `web` services alongside PostgreSQL, Redis, and MinIO.

```bash
# Build images
docker build -t private-tweet-api ./apps/api
docker build -t private-tweet-web ./apps/web

# Or use your production docker-compose file
docker compose -f docker-compose.prod.yml up -d
```

Before the first run, apply migrations inside the container:

```bash
docker exec <api-container> npx prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma
```

Recommended: place Nginx or Caddy in front for TLS termination, and set `HSTS`, `CSP`, and `SameSite` headers.

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Accounts, roles, public keys for E2E |
| `posts` | Posts with reply/repost chains, soft delete |
| `follows` | Follower graph |
| `likes` | Post likes |
| `notifications` | Activity feed |
| `conversations` | DM conversation pairs |
| `messages` | Encrypted message content |
| `invite_codes` | One-time registration tokens |

## Security Notes

- All API endpoints require authentication (verified server-side via JWT cookie).
- Passwords are hashed with argon2.
- Rate limiting via Redis token bucket (100 req/min per user).
- `X-Robots-Tag: noindex, nofollow` on every response.
- `robots.txt` disallows all crawlers.
