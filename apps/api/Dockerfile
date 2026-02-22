# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# openssl is needed for Prisma to detect the correct binary target (linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl

RUN npm install -g pnpm@9

WORKDIR /app

# 1. Copy manifests only — cache this layer when source changes but lockfile doesn't
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json         ./apps/api/

# 2. Install all dependencies (dev + prod — prisma CLI is a devDep)
RUN pnpm install --frozen-lockfile

# 3. Copy source
COPY packages/types ./packages/types
COPY apps/api       ./apps/api

# 4. Build shared types (use hoisted tsc — pnpm symlinks it to workspace root)
RUN cd packages/types && /app/node_modules/.bin/tsc

# 5. Generate Prisma client for the current platform (linux/musl for Alpine)
RUN /app/apps/api/node_modules/.bin/prisma generate --schema /app/apps/api/prisma/schema.prisma

# 6. Compile TypeScript → dist/
RUN cd apps/api && /app/node_modules/.bin/tsc

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# curl for healthcheck; openssl for Prisma query engine (linux-musl-openssl-3.0.x)
RUN apk add --no-cache curl openssl

WORKDIR /app

# Copy the pnpm node_modules (symlinks + .pnpm store) from builder.
# Both stages use the same Alpine/Node version so native binaries are compatible.
COPY --from=builder /app/node_modules          ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

# Copy workspace manifests (needed for module resolution at runtime)
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json       ./apps/api/

# Copy compiled output and Prisma schema
COPY --from=builder /app/packages/types/dist  ./packages/types/dist
COPY --from=builder /app/apps/api/dist        ./apps/api/dist
COPY --from=builder /app/apps/api/prisma      ./apps/api/prisma

WORKDIR /app/apps/api

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/index.js"]
