import fp from "fastify-plugin";
import { Redis } from "ioredis";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

  await redis.connect();

  app.decorate("redis", redis);

  app.addHook("onClose", async () => {
    await redis.quit();
  });
};

export const redisPlugin = fp(plugin, { name: "redis" });
