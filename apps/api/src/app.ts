import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";

import { dbPlugin } from "./plugins/db.js";
import { redisPlugin } from "./plugins/redis.js";
import { authPlugin } from "./plugins/auth.js";
import { storagePlugin } from "./plugins/storage.js";
import { wsPlugin } from "./plugins/ws.js";

import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { postRoutes } from "./routes/posts.js";
import { adminRoutes } from "./routes/admin.js";
import { notificationRoutes } from "./routes/notifications.js";
import { uploadRoutes } from "./routes/uploads.js";
import { messageRoutes } from "./routes/messages.js";
import { searchRoutes } from "./routes/search.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "warn" : "info",
    },
  });

  // ── Security headers ────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // configured per-route if needed
  });

  // ── CORS ────────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  });

  // ── Cookies ─────────────────────────────────────────────────────────────────
  await app.register(cookie);

  // ── Rate limiting ────────────────────────────────────────────────────────────
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (req) =>
      (req.user as { id?: string } | undefined)?.id ?? req.ip,
  });

  // ── noindex header on all responses ─────────────────────────────────────────
  app.addHook("onSend", (_req, reply, _payload, done) => {
    reply.header("X-Robots-Tag", "noindex, nofollow");
    done();
  });

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(storagePlugin);
  await app.register(wsPlugin);

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get("/api/health", async () => ({ status: "ok" }));

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(postRoutes, { prefix: "/api/posts" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(notificationRoutes, { prefix: "/api/notifications" });
  await app.register(uploadRoutes, { prefix: "/api/uploads" });
  await app.register(messageRoutes, { prefix: "/api/messages" });
  await app.register(searchRoutes, { prefix: "/api/search" });

  return app;
}
