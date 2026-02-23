import type { FastifyPluginAsync } from "fastify";

// ── Helper ─────────────────────────────────────────────────────────────────────

/** Ensure participant1Id < participant2Id (lex order) so the unique constraint fires. */
function normalizeParticipants(
  a: string,
  b: string
): { participant1Id: string; participant2Id: string } {
  return a < b
    ? { participant1Id: a, participant2Id: b }
    : { participant1Id: b, participant2Id: a };
}

function formatMessage(
  m: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    readAt: Date | null;
    createdAt: Date;
    sender?: { id: string; username: string; avatarUrl: string | null };
  }
) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    readAt: m.readAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    sender: m.sender ?? undefined,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export const messageRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/messages/unread-count ───────────────────────────────────────────
  app.get(
    "/unread-count",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const me = req.user.sub;
      // Count messages in my conversations where I'm NOT the sender and readAt is null
      const count = await app.prisma.message.count({
        where: {
          readAt: null,
          senderId: { not: me },
          conversation: {
            OR: [{ participant1Id: me }, { participant2Id: me }],
          },
        },
      });
      return reply.send({ data: { count } });
    }
  );

  // ── GET /api/messages/conversations ─────────────────────────────────────────
  app.get(
    "/conversations",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const me = req.user.sub;

      const convs = await app.prisma.conversation.findMany({
        where: {
          OR: [{ participant1Id: me }, { participant2Id: me }],
        },
        include: {
          participant1: { select: { id: true, username: true, avatarUrl: true, publicKey: true } },
          participant2: { select: { id: true, username: true, avatarUrl: true, publicKey: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              conversationId: true,
              senderId: true,
              content: true,
              readAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Unread counts per conversation
      const unreadCounts = await app.prisma.message.groupBy({
        by: ["conversationId"],
        where: {
          readAt: null,
          senderId: { not: me },
          conversation: {
            OR: [{ participant1Id: me }, { participant2Id: me }],
          },
        },
        _count: { id: true },
      });
      const unreadMap = new Map(
        unreadCounts.map((r) => [r.conversationId, r._count.id])
      );

      const result = convs.map((c) => {
        const otherUser =
          c.participant1Id === me ? c.participant2 : c.participant1;
        const lastMessage = c.messages[0]
          ? formatMessage(c.messages[0])
          : null;
        return {
          id: c.id,
          participant1Id: c.participant1Id,
          participant2Id: c.participant2Id,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          otherUser,
          lastMessage,
          unreadCount: unreadMap.get(c.id) ?? 0,
        };
      });

      return reply.send({ data: result });
    }
  );

  // ── POST /api/messages/conversations ────────────────────────────────────────
  app.post<{ Body: { recipientId: string } }>(
    "/conversations",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const me = req.user.sub;
      const { recipientId } = req.body ?? {};

      if (!recipientId || recipientId === me) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Invalid recipientId", statusCode: 400 });
      }

      // Check DM eligibility: either user follows the other
      const link = await app.prisma.follow.findFirst({
        where: {
          OR: [
            { followerId: me, followeeId: recipientId },
            { followerId: recipientId, followeeId: me },
          ],
        },
      });
      if (!link) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "You can only DM users you follow or who follow you",
          statusCode: 403,
        });
      }

      const participants = normalizeParticipants(me, recipientId);

      // Upsert conversation
      const conv = await app.prisma.conversation.upsert({
        where: {
          participant1Id_participant2Id: participants,
        },
        create: participants,
        update: {},
        include: {
          participant1: { select: { id: true, username: true, avatarUrl: true, publicKey: true } },
          participant2: { select: { id: true, username: true, avatarUrl: true, publicKey: true } },
        },
      });

      const otherUser =
        conv.participant1Id === me ? conv.participant2 : conv.participant1;

      return reply.send({
        data: {
          id: conv.id,
          participant1Id: conv.participant1Id,
          participant2Id: conv.participant2Id,
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
          otherUser,
          lastMessage: null,
          unreadCount: 0,
        },
      });
    }
  );

  // ── GET /api/messages/conversations/:id/messages ─────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const me = req.user.sub;
      const { id } = req.params;
      const limit = Math.min(Number(req.query.limit ?? 50), 100);
      const cursor = req.query.cursor;

      // Verify membership
      const conv = await app.prisma.conversation.findUnique({ where: { id } });
      if (
        !conv ||
        (conv.participant1Id !== me && conv.participant2Id !== me)
      ) {
        return reply.code(404).send({ error: "Not Found", message: "Conversation not found", statusCode: 404 });
      }

      const messages = await app.prisma.message.findMany({
        where: {
          conversationId: id,
          ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
        },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const page = messages.slice(0, limit);
      // Reverse so oldest-first for rendering
      page.reverse();

      return reply.send({
        data: page.map(formatMessage),
        nextCursor: hasMore
          ? messages[limit - 1].createdAt.toISOString()
          : null,
        hasMore,
      });
    }
  );

  // ── POST /api/messages/conversations/:id/messages ────────────────────────────
  app.post<{ Params: { id: string }; Body: { content: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const me = req.user.sub;
      const { id } = req.params;
      const { content } = req.body ?? {};

      if (!content?.trim()) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "content is required", statusCode: 400 });
      }

      // Verify membership
      const conv = await app.prisma.conversation.findUnique({ where: { id } });
      if (
        !conv ||
        (conv.participant1Id !== me && conv.participant2Id !== me)
      ) {
        return reply.code(404).send({ error: "Not Found", message: "Conversation not found", statusCode: 404 });
      }

      const recipientId =
        conv.participant1Id === me ? conv.participant2Id : conv.participant1Id;

      const [message] = await app.prisma.$transaction([
        app.prisma.message.create({
          data: { conversationId: id, senderId: me, content: content.trim() },
          include: {
            sender: { select: { id: true, username: true, avatarUrl: true } },
          },
        }),
        // Bump updatedAt on conversation
        app.prisma.conversation.update({
          where: { id },
          data: { updatedAt: new Date() },
        }),
      ]);

      const payload = {
        type: "new_message",
        conversationId: id,
        message: formatMessage(message),
      };

      // Push to recipient and sender's other tabs
      app.wsBroadcastToUser(recipientId, payload);
      app.wsBroadcastToUser(me, payload);

      return reply.code(201).send({ data: formatMessage(message) });
    }
  );

  // ── POST /api/messages/conversations/:id/read ────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/read",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const me = req.user.sub;
      const { id } = req.params;

      const conv = await app.prisma.conversation.findUnique({ where: { id } });
      if (
        !conv ||
        (conv.participant1Id !== me && conv.participant2Id !== me)
      ) {
        return reply.code(404).send({ error: "Not Found", message: "Conversation not found", statusCode: 404 });
      }

      const otherUserId =
        conv.participant1Id === me ? conv.participant2Id : conv.participant1Id;

      await app.prisma.message.updateMany({
        where: {
          conversationId: id,
          senderId: otherUserId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      // Notify both sides that messages are read
      const readPayload = { type: "messages_read", conversationId: id };
      app.wsBroadcastToUser(me, readPayload);
      app.wsBroadcastToUser(otherUserId, readPayload);

      return reply.send({ data: null });
    }
  );
};
