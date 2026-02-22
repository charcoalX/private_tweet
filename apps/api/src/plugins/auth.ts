import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";

export interface JwtPayload {
  sub: string; // user id
  username: string;
  role: string;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
    sign: { expiresIn: process.env.JWT_ACCESS_EXPIRY ?? "15m" },
    cookie: {
      cookieName: "access_token",
      signed: false,
    },
  });

  app.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired token", statusCode: 401 });
      }
    }
  );
};

export const authPlugin = fp(plugin, { name: "auth", dependencies: ["redis"] });
