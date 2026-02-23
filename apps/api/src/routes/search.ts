import type { FastifyPluginAsync } from "fastify";

export const searchRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/search/posts?q=&cursor=&limit= ───────────────────────────────────
  app.get<{ Querystring: { q?: string; cursor?: string; limit?: string } }>(
    "/posts",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const q = (req.query.q ?? "").trim();
      if (!q) return reply.send({ data: [], nextCursor: null, hasMore: false });

      const limit = Math.min(Number(req.query.limit ?? 10), 50);
      const cursor = req.query.cursor;
      const me = req.user.sub;

      const posts = await app.prisma.post.findMany({
        where: {
          content: { contains: q, mode: "insensitive" },
          deletedAt: null,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          _count: {
            select: {
              likes: true,
              replies: { where: { deletedAt: null } },
              reposts: { where: { deletedAt: null } },
            },
          },
          repostOf: {
            include: {
              author: { select: { id: true, username: true, avatarUrl: true } },
              repostOf: {
                include: {
                  author: { select: { id: true, username: true, avatarUrl: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = posts.length > limit;
      const page = posts.slice(0, limit);

      const pageIds = page.map((p) => p.id);
      const likedRows =
        pageIds.length > 0
          ? await app.prisma.like.findMany({
              where: { userId: me, postId: { in: pageIds } },
              select: { postId: true },
            })
          : [];
      const likedSet = new Set(likedRows.map((r) => r.postId));

      function serializeRepostOf(r: any): unknown {
        if (!r) return null;
        return {
          id: r.id,
          content: r.content,
          mediaUrls: r.mediaUrls,
          repostOfId: r.repostOfId,
          createdAt: r.createdAt.toISOString(),
          deletedAt: r.deletedAt?.toISOString() ?? null,
          author: r.author,
          repostOf: serializeRepostOf(r.repostOf),
        };
      }

      return reply.send({
        data: page.map((p) => ({
          id: p.id,
          userId: p.userId,
          content: p.content,
          mediaUrls: p.mediaUrls,
          replyToId: p.replyToId,
          repostOfId: p.repostOfId,
          createdAt: p.createdAt.toISOString(),
          deletedAt: null,
          likeCount: p._count.likes,
          replyCount: p._count.replies,
          repostCount: p._count.reposts,
          isLiked: likedSet.has(p.id),
          author: p.author,
          repostOf: serializeRepostOf(p.repostOf),
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
        hasMore,
      });
    }
  );

  // ── GET /api/search/users?q=&cursor=&limit= ───────────────────────────────────
  app.get<{ Querystring: { q?: string; cursor?: string; limit?: string } }>(
    "/users",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const q = (req.query.q ?? "").trim();
      if (!q) return reply.send({ data: [], nextCursor: null, hasMore: false });

      const limit = Math.min(Number(req.query.limit ?? 10), 50);
      const cursor = req.query.cursor;
      const me = req.user.sub;

      const users = await app.prisma.user.findMany({
        where: {
          AND: [
            {
              OR: [
                { username: { contains: q, mode: "insensitive" } },
                { bio: { contains: q, mode: "insensitive" } },
              ],
            },
            { id: { not: me } },
            ...(cursor ? [{ id: { lt: cursor } }] : []),
          ],
        },
        select: {
          id: true,
          username: true,
          bio: true,
          avatarUrl: true,
          createdAt: true,
          _count: { select: { followers: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = users.length > limit;
      const page = users.slice(0, limit);

      const userIds = page.map((u) => u.id);
      const followingRows =
        userIds.length > 0
          ? await app.prisma.follow.findMany({
              where: { followerId: me, followeeId: { in: userIds } },
              select: { followeeId: true },
            })
          : [];
      const followingSet = new Set(followingRows.map((r) => r.followeeId));

      return reply.send({
        data: page.map((u) => ({
          id: u.id,
          username: u.username,
          bio: u.bio,
          avatarUrl: u.avatarUrl,
          followerCount: u._count.followers,
          isFollowing: followingSet.has(u.id),
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
        hasMore,
      });
    }
  );
};
