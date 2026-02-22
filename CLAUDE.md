# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This project is currently in the **planning phase**. The only file is `skills.md`, a Chinese-language architectural specification for a private, invite-only Twitter-like platform. No implementation code exists yet.

## Project Goal

A self-hosted, privacy-first microblogging platform for small groups of invited friends. Key constraints:
- All content hidden behind a login wall (no public access)
- Blocked from search engine indexing (`robots.txt` + `X-Robots-Tag: noindex, nofollow`)
- Registration by invite code or admin approval only
- Self-hosted on a private VPS (not a public SaaS)

## Planned Tech Stack

```
Frontend:  Next.js (React) + Tailwind CSS
Backend:   Node.js (Fastify/Express) or Python (FastAPI)
Database:  PostgreSQL + Redis
Storage:   MinIO (self-hosted) or S3
Queue:     BullMQ (Redis-backed)
Proxy:     Nginx/Caddy (auto HTTPS)
Deploy:    Docker Compose → Kubernetes (as scale demands)
```

## Architecture Decisions (from skills.md)

### Authentication
- JWT with access + refresh tokens
- Passwords hashed with bcrypt or argon2
- RBAC: regular users and admins

### Feed System
Hybrid fanout strategy:
- **Push (Fanout on Write)**: posts pushed to follower Redis Sorted Sets at write time — used when follower count < ~1,000
- **Pull (Fanout on Read)**: feed aggregated at read time — used for high-follower accounts
- Always use **cursor-based pagination** (not offset) to avoid deep-page performance issues

### Database Schema (core tables)
```sql
users         (id, username, email, password_hash, bio, avatar_url, created_at)
posts         (id, user_id, content, media_urls, reply_to_id, repost_of_id, created_at, deleted_at)
follows       (follower_id, followee_id, created_at)
likes         (user_id, post_id, created_at)
notifications (id, user_id, type, actor_id, post_id, read, created_at)
invite_codes  (code, created_by, used_by, used_at, expires_at)
```

Key indices: `posts(user_id, created_at DESC)`, `follows(follower_id)`, `follows(followee_id)`, `notifications(user_id, read, created_at DESC)`

### Redis Caching
| Data | Structure | TTL |
|------|-----------|-----|
| User session | String | 7 days (sliding) |
| Feed list | Sorted Set (score=timestamp) | 3 days |
| Follow/follower counts | Hash | Permanent (updated on write) |
| Hot post content | String | 1 hour |

### Media Uploads
Client → backend presigned URL → direct upload to S3/MinIO → Sharp/ImageMagick for compression and thumbnails.

### Scalability Path
- **Stage 1** (<1,000 users): Single Docker Compose
- **Stage 2** (<50,000 users): PostgreSQL read replicas + Redis Cluster + PgBouncer
- **Stage 3** (<500,000 users): DB sharding by `user_id` + CDN + Kubernetes

## MVP Checklist (from skills.md)

- Invite code registration + login
- Post creation (text, 240-char limit)
- Follow/unfollow
- Following feed (timeline)
- User profiles
- Likes
- Full-site login wall
- `robots.txt` + noindex headers
- Basic admin panel (user management, invite code generation)

## Security Requirements

Every page/API endpoint must enforce authentication server-side. Required headers on all responses:
- `X-Robots-Tag: noindex, nofollow`
- HSTS, CSP, SameSite cookie flags

Rate limiting via Redis Token Bucket per user ID.
