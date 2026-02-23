import type { FastifyPluginAsync } from "fastify";

export const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/users/:username — public profile (still requires auth — login wall)
  app.get<{ Params: { username: string } }>(
    "/:username",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { username } = req.params;

      const user = await app.prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          bio: true,
          avatarUrl: true,
          createdAt: true,
          _count: {
            select: { followers: true, following: true, posts: true },
          },
        },
      });

      if (!user) {
        return reply.code(404).send({
          error: "NotFound",
          message: "User not found",
          statusCode: 404,
        });
      }

      // Check if requesting user follows this user
      const isFollowing =
        req.user.sub !== user.id
          ? !!(await app.prisma.follow.findUnique({
              where: {
                followerId_followeeId: {
                  followerId: req.user.sub,
                  followeeId: user.id,
                },
              },
            }))
          : false;

      return reply.send({
        data: {
          id: user.id,
          username: user.username,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt.toISOString(),
          followerCount: user._count.followers,
          followingCount: user._count.following,
          postCount: user._count.posts,
          isFollowing,
        },
      });
    }
  );

  // POST /api/users/:id/follow
  app.post<{ Params: { id: string } }>(
    "/:id/follow",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const followeeId = req.params.id;
      const followerId = req.user.sub;

      if (followerId === followeeId) {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Cannot follow yourself",
          statusCode: 400,
        });
      }

      const followee = await app.prisma.user.findUnique({
        where: { id: followeeId },
      });
      if (!followee) {
        return reply.code(404).send({
          error: "NotFound",
          message: "User not found",
          statusCode: 404,
        });
      }

      const existing = await app.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId, followeeId } },
      });

      if (!existing) {
        await app.prisma.follow.create({ data: { followerId, followeeId } });
        await app.prisma.notification.create({
          data: { userId: followeeId, type: "follow", actorId: followerId },
        });
      }

      return reply.code(201).send({ data: null, message: "Followed" });
    }
  );

  // GET /api/users/:username/posts — paginated posts for a user profile
  app.get<{
    Params: { username: string };
    Querystring: { cursor?: string; limit?: string };
  }>(
    "/:username/posts",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { username } = req.params;
      const limit = Math.min(Number(req.query.limit ?? 20), 50);
      const cursor = req.query.cursor;

      const user = await app.prisma.user.findUnique({ where: { username } });
      if (!user) {
        return reply.code(404).send({
          error: "NotFound",
          message: "User not found",
          statusCode: 404,
        });
      }

      const posts = await app.prisma.post.findMany({
        where: {
          userId: user.id,
          deletedAt: null,
          replyToId: null,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          _count: { select: { likes: true, replies: { where: { deletedAt: null } }, reposts: { where: { deletedAt: null } } } },
          repostOf: {
            include: {
              author: { select: { id: true, username: true, avatarUrl: true } },
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
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = posts.length > limit;
      const page = hasMore ? posts.slice(0, limit) : posts;

      const pageIds = page.map((p) => p.id);
      const likedRows =
        pageIds.length > 0
          ? await app.prisma.like.findMany({
              where: { userId: req.user.sub, postId: { in: pageIds } },
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
          deletedAt: p.deletedAt?.toISOString() ?? null,
          likeCount: p._count.likes,
          replyCount: p._count.replies,
          repostCount: p._count.reposts,
          isLiked: likedSet.has(p.id),
          author: p.author,
          repostOf: serializeRepostOf(p.repostOf),
        })),
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
        hasMore,
      });
    }
  );

  // DELETE /api/users/:id/follow
  app.delete<{ Params: { id: string } }>(
    "/:id/follow",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const followeeId = req.params.id;
      const followerId = req.user.sub;

      await app.prisma.follow.deleteMany({
        where: { followerId, followeeId },
      });

      return reply.send({ data: null, message: "Unfollowed" });
    }
  );
};
