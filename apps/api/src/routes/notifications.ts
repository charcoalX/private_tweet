import type { FastifyPluginAsync } from "fastify";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/notifications — recent 50 notifications
  app.get("/", { preHandler: [app.authenticate] }, async (req, reply) => {
    const notifications = await app.prisma.notification.findMany({
      where: { userId: req.user.sub },
      include: {
        actor: { select: { id: true, username: true, avatarUrl: true } },
        post: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return reply.send({
      data: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
        actor: n.actor,
        post: n.post
          ? { id: n.post.id, content: n.post.content.slice(0, 80) }
          : null,
      })),
    });
  });

  // GET /api/notifications/count — unread badge count
  app.get("/count", { preHandler: [app.authenticate] }, async (req, reply) => {
    const count = await app.prisma.notification.count({
      where: { userId: req.user.sub, read: false },
    });
    return reply.send({ data: { count } });
  });

  // PATCH /api/notifications/read — mark all as read
  app.patch("/read", { preHandler: [app.authenticate] }, async (req, reply) => {
    await app.prisma.notification.updateMany({
      where: { userId: req.user.sub, read: false },
      data: { read: true },
    });
    return reply.send({ data: null });
  });
};
