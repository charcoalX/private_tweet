#!/usr/bin/env bash
# deploy.sh — One-command production deployment for private_tweet
#
# Usage:
#   ./deploy.sh           # pull latest code, build, migrate, start
#   ./deploy.sh --no-pull # skip git pull (useful when testing local changes)
#
# Prerequisites: Docker with Compose plugin (docker compose v2)

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo ""; echo "▶  $*"; }
ok()   { echo "✅ $*"; }
fail() { echo ""; echo "❌ $*" >&2; exit 1; }

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1        || fail "docker not found — install Docker first"
docker compose version >/dev/null 2>&1   || fail "docker compose plugin not found — upgrade Docker"

# ── .env.production setup ─────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  if [ -f ".env.production.example" ]; then
    cp .env.production.example "$ENV_FILE"
    fail "Created $ENV_FILE from the example file.
       Open it, fill in all CHANGE_ME values, then re-run: ./deploy.sh"
  else
    fail "$ENV_FILE not found. Create it from .env.production.example."
  fi
fi

# Load env vars so the script can reference them (e.g. POSTGRES_USER)
# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

# Fail fast if any critical secret is still the placeholder
for var in POSTGRES_PASSWORD REDIS_PASSWORD JWT_SECRET WEB_URL; do
  val="${!var:-}"
  if [ -z "$val" ] || [[ "$val" == CHANGE_ME* ]]; then
    fail "$var in $ENV_FILE is empty or still has the placeholder value"
  fi
done

# ── Pull latest code ──────────────────────────────────────────────────────────
if [[ "${1:-}" != "--no-pull" ]] && git rev-parse --git-dir >/dev/null 2>&1; then
  log "Pulling latest code..."
  git pull --ff-only
fi

# ── Build images ──────────────────────────────────────────────────────────────
log "Building Docker images (first run takes a few minutes)..."
$COMPOSE build --pull

# ── Start infrastructure ──────────────────────────────────────────────────────
log "Starting infrastructure (postgres, redis, minio)..."
$COMPOSE up -d postgres redis minio

# Wait for PostgreSQL
log "Waiting for PostgreSQL to be ready..."
RETRIES=30
until $COMPOSE exec -T postgres \
    pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  [ "$RETRIES" -le 0 ] && fail "PostgreSQL did not become healthy in time"
  sleep 2
done
ok "PostgreSQL is ready"

# ── Database migrations ───────────────────────────────────────────────────────
log "Running database migrations..."
$COMPOSE run --rm \
  -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  api \
  sh -c "node /app/node_modules/.bin/prisma migrate deploy \
         --schema /app/apps/api/prisma/schema.prisma"
ok "Migrations complete"

# ── Start all services ────────────────────────────────────────────────────────
log "Starting all services..."
$COMPOSE up -d

# ── Wait for the full stack to pass health checks ────────────────────────────
log "Waiting for the stack to become healthy..."
RETRIES=40
until curl -sf http://localhost/api/health >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo ""
    echo "⚠️  Health check timed out. Inspect logs:"
    echo "   $COMPOSE logs --tail=50"
    exit 1
  fi
  sleep 3
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
ok "Deployment complete!"
echo ""
echo "   Application : $WEB_URL"
echo "   API health  : $WEB_URL/api/health"
echo ""
echo "Service status:"
$COMPOSE ps
echo ""
echo "Useful commands:"
echo "   Logs          : $COMPOSE logs -f"
echo "   Stop          : $COMPOSE down"
echo "   Stop + wipe   : $COMPOSE down -v   ⚠️  deletes all data"
echo "   Redeploy      : ./deploy.sh"
