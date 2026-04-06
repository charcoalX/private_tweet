import { randomBytes } from "crypto";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";

async function adminOnly(req: FastifyRequest, reply: FastifyReply) {
  if (req.user.role !== "ADMIN") {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Admin access required",
      statusCode: 403,
    });
  }
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/admin/invites — list all invite codes
  app.get(
    "/invites",
    { preHandler: [app.authenticate, adminOnly] },
    async (_req, reply) => {
      const codes = await app.prisma.inviteCode.findMany({
        include: {
          creator: { select: { username: true } },
          user: { select: { username: true } },
        },
        orderBy: { expiresAt: "desc" },
      });

      return reply.send({
        data: codes.map((c) => ({
          code: c.code,
          createdBy: c.creator?.username ?? null,
          usedBy: c.user?.username ?? null,
          usedAt: c.usedAt?.toISOString() ?? null,
          expiresAt: c.expiresAt?.toISOString() ?? null,
        })),
      });
    }
  );

  // GET /api/admin/users — list all non-system users
  app.get(
    "/users",
    { preHandler: [app.authenticate, adminOnly] },
    async (_req, reply) => {
      const users = await app.prisma.user.findMany({
        where: { username: { not: "system" } },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
          _count: {
            select: { posts: true, followers: true, following: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return reply.send({
        data: users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
          postCount: u._count.posts,
          followerCount: u._count.followers,
          followingCount: u._count.following,
        })),
      });
    }
  );

  // PATCH /api/admin/users/:id/role — promote or demote a user
  app.patch<{ Params: { id: string }; Body: { role: string } }>(
    "/users/:id/role",
    { preHandler: [app.authenticate, adminOnly] },
    async (req, reply) => {
      const { id } = req.params;
      const { role } = req.body as { role: string };

      if (role !== "ADMIN" && role !== "USER") {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Role must be ADMIN or USER",
          statusCode: 400,
        });
      }
      if (id === req.user.sub && role === "USER") {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Cannot demote yourself",
          statusCode: 400,
        });
      }

      const user = await app.prisma.user.update({
        where: { id },
        data: { role: role as "ADMIN" | "USER" },
        select: { id: true, username: true, role: true },
      });

      return reply.send({ data: user });
    }
  );

  // POST /api/admin/invites — generate a new invite code
  app.post(
    "/invites",
    { preHandler: [app.authenticate, adminOnly] },
    async (req, reply) => {
      const raw = randomBytes(6).toString("hex").toUpperCase(); // 12 chars
      const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`; // XXXX-XXXX-XXXX

      const invite = await app.prisma.inviteCode.create({
        data: {
          code,
          createdBy: req.user.sub,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      return reply.code(201).send({
        data: {
          code: invite.code,
          expiresAt: invite.expiresAt?.toISOString() ?? null,
        },
      });
    }
  );
};
