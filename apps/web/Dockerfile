# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# 1. Copy manifests only — maximise layer cache
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json       ./apps/web/

# 2. Install all dependencies
RUN pnpm install --frozen-lockfile

# 3. Copy source
COPY packages/types ./packages/types
COPY apps/web       ./apps/web

# 4. Build shared types (use hoisted tsc — pnpm symlinks it to workspace root)
RUN cd packages/types && /app/node_modules/.bin/tsc

# 5. Build Next.js
#    API_URL_BUILD is used by next.config.ts rewrites — baked in at build time.
#    At runtime the web container's API_URL env var is used by server components.
ARG API_URL_BUILD=http://api:3001
ENV API_URL=${API_URL_BUILD}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN cd apps/web && /app/apps/web/node_modules/.bin/next build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

# Copy pnpm node_modules (symlinks + .pnpm store) from builder
COPY --from=builder /app/node_modules          ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json       ./apps/web/

# Copy compiled types (imported at runtime by server components)
COPY --from=builder /app/packages/types/dist ./packages/types/dist

# Copy Next.js build output and static assets
COPY --from=builder /app/apps/web/.next  ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy Next.js config (read at server startup)
COPY apps/web/next.config.ts      ./apps/web/
COPY apps/web/postcss.config.mjs  ./apps/web/

WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

EXPOSE 3000

CMD ["/app/apps/web/node_modules/.bin/next", "start"]
