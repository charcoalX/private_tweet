import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import type { RegisterRequest, LoginRequest } from "@private-tweet/types";

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  inviteCode: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/auth/register
  app.post<{ Body: RegisterRequest }>("/register", async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "ValidationError",
        message: body.error.issues[0]?.message ?? "Invalid input",
        statusCode: 400,
      });
    }
    const { username, email, password, inviteCode } = body.data;

    // Validate invite code
    const invite = await app.prisma.inviteCode.findUnique({
      where: { code: inviteCode },
    });
    if (!invite || invite.usedBy || (invite.expiresAt && invite.expiresAt < new Date())) {
      return reply.code(400).send({
        error: "InvalidInviteCode",
        message: "Invite code is invalid or already used",
        statusCode: 400,
      });
    }

    // Check uniqueness
    const existing = await app.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return reply.code(409).send({
        error: "Conflict",
        message: "Username or email already taken",
        statusCode: 409,
      });
    }

    const passwordHash = await argon2.hash(password);

    const user = await app.prisma.$transaction(async (tx) => {
      // First user on the platform automatically becomes ADMIN
      const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
      const newUser = await tx.user.create({
        data: { username, email, passwordHash, role: adminCount === 0 ? "ADMIN" : "USER" },
      });
      await tx.inviteCode.update({
        where: { code: inviteCode },
        data: { usedBy: newUser.id, usedAt: new Date() },
      });
      return newUser;
    });

    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = app.jwt.sign(payload);
    const refreshToken = app.jwt.sign(payload, { expiresIn: "7d" });

    await app.redis.setex(
      `refresh:${user.id}`,
      REFRESH_TTL_SECONDS,
      refreshToken
    );

    reply
      .setCookie("access_token", accessToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      })
      .setCookie("refresh_token", refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/api/auth/refresh",
        maxAge: REFRESH_TTL_SECONDS,
      });

    return reply.code(201).send({
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
      },
      message: "Account created",
    });
  });

  // POST /api/auth/login
  app.post<{ Body: LoginRequest }>("/login", async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "ValidationError",
        message: body.error.issues[0]?.message ?? "Invalid input",
        statusCode: 400,
      });
    }
    const { email, password } = body.data;

    const user = await app.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid credentials",
        statusCode: 401,
      });
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid credentials",
        statusCode: 401,
      });
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = app.jwt.sign(payload);
    const refreshToken = app.jwt.sign(payload, { expiresIn: "7d" });

    await app.redis.setex(
      `refresh:${user.id}`,
      REFRESH_TTL_SECONDS,
      refreshToken
    );

    reply
      .setCookie("access_token", accessToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      })
      .setCookie("refresh_token", refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/api/auth/refresh",
        maxAge: REFRESH_TTL_SECONDS,
      });

    return reply.send({
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  // POST /api/auth/refresh
  app.post("/refresh", async (req, reply) => {
    const refreshToken = req.cookies["refresh_token"];
    if (!refreshToken) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "No refresh token",
        statusCode: 401,
      });
    }

    let payload: { sub: string; username: string; role: string };
    try {
      payload = app.jwt.verify<{ sub: string; username: string; role: string }>(
        refreshToken
      );
    } catch {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid refresh token",
        statusCode: 401,
      });
    }

    const stored = await app.redis.get(`refresh:${payload.sub}`);
    if (stored !== refreshToken) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Refresh token revoked",
        statusCode: 401,
      });
    }

    const newAccessToken = app.jwt.sign({
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
    });

    reply.setCookie("access_token", newAccessToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    return reply.send({ data: { accessToken: newAccessToken, expiresIn: 900 } });
  });

  // POST /api/auth/logout
  app.post(
    "/logout",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await app.redis.del(`refresh:${req.user.sub}`);
      reply
        .clearCookie("access_token")
        .clearCookie("refresh_token", { path: "/api/auth/refresh" });
      return reply.send({ data: null, message: "Logged out" });
    }
  );
};
