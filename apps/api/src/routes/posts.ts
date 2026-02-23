import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const createPostSchema = z
  .object({
    content: z.string().max(240).default(""),
    replyToId: z.string().optional(),
    repostOfId: z.string().optional(),
    mediaUrls: z.array(z.string().url()).max(4).optional(),
  })
  .refine(
    (data) =>
      data.content.trim().length > 0 ||
      Boolean(data.repostOfId) ||
      (data.mediaUrls && data.mediaUrls.length > 0),
    { message: "Content is required", path: ["content"] }
  );

export const postRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/posts/feed — following timeline (cursor-based)
  app.get<{ Querystring: { cursor?: string; limit?: string } }>(
    "/feed",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const limit = Math.min(Number(req.query.limit ?? 20), 50);
      const cursor = req.query.cursor;

      // Try Redis sorted set first (fanout-on-write cache)
      const cacheKey = `feed:${req.user.sub}`;
      const cached = await app.redis.zrevrangebyscore(
        cacheKey,
        cursor ? `(${cursor}` : "+inf",
        "-inf",
        "LIMIT",
        0,
        limit + 1
      );

      if (cached.length > 0) {
        const hasMore = cached.length > limit;
        const ids = hasMore ? cached.slice(0, limit) : cached;
        const posts = await app.prisma.post.findMany({
          where: { id: { in: ids }, deletedAt: null, replyToId: null },
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
        });

        const likedSet = await getLikedSet(app.prisma, req.user.sub, ids);
        return reply.send({
          data: posts.map((p) => formatPost(p, likedSet.has(p.id))),
          nextCursor: hasMore ? ids[ids.length - 1] : null,
          hasMore,
        });
      }

      // Fallback: pull from DB
      const followees = await app.prisma.follow.findMany({
        where: { followerId: req.user.sub },
        select: { followeeId: true },
      });
      const authorIds = [
        req.user.sub,
        ...followees.map((f) => f.followeeId),
      ];

      const posts = await app.prisma.post.findMany({
        where: {
          userId: { in: authorIds },
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
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = posts.length > limit;
      const page = hasMore ? posts.slice(0, limit) : posts;

      const likedSet = await getLikedSet(
        app.prisma,
        req.user.sub,
        page.map((p) => p.id)
      );
      return reply.send({
        data: page.map((p) => formatPost(p, likedSet.has(p.id))),
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
        hasMore,
      });
    }
  );

  // GET /api/posts/:id — single post with replies
  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const post = await app.prisma.post.findFirst({
        where: { id: req.params.id, deletedAt: null },
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
          },
          replies: {
            where: { deletedAt: null },
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
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!post) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Post not found",
          statusCode: 404,
        });
      }

      const allIds = [post.id, ...post.replies.map((r) => r.id)];
      const likedSet = await getLikedSet(app.prisma, req.user.sub, allIds);

      return reply.send({
        data: {
          ...formatPost(post, likedSet.has(post.id)),
          replies: post.replies.map((r) => formatPost(r as PostWithRelations, likedSet.has(r.id))),
        },
      });
    }
  );

  // POST /api/posts — create post
  app.post(
    "/",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = createPostSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "ValidationError",
          message: body.error.issues[0]?.message ?? "Invalid input",
          statusCode: 400,
        });
      }

      const post = await app.prisma.post.create({
        data: {
          userId: req.user.sub,
          content: body.data.content,
          replyToId: body.data.replyToId,
          repostOfId: body.data.repostOfId,
          mediaUrls: body.data.mediaUrls ?? [],
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
          },
        },
      });

      // 回复帖不推入 feed 缓存；只有顶层帖子（原帖/转发）才做 fanout
      if (!body.data.replyToId) {
        const followers = await app.prisma.follow.findMany({
          where: { followeeId: req.user.sub },
          select: { followerId: true },
        });

        const score = post.createdAt.getTime();
        const pipeline = app.redis.pipeline();
        for (const { followerId } of followers) {
          pipeline.zadd(`feed:${followerId}`, score, post.id);
          pipeline.expire(`feed:${followerId}`, 3 * 24 * 60 * 60); // 3 days
        }
        // Also push to own feed
        pipeline.zadd(`feed:${req.user.sub}`, score, post.id);
        pipeline.expire(`feed:${req.user.sub}`, 3 * 24 * 60 * 60);
        await pipeline.exec();
      }

      // Notify parent post author on reply (skip self-replies)
      if (body.data.replyToId) {
        const parentPost = await app.prisma.post.findUnique({
          where: { id: body.data.replyToId },
          select: { userId: true },
        });
        if (parentPost && parentPost.userId !== req.user.sub) {
          await app.prisma.notification.create({
            data: {
              userId: parentPost.userId,
              type: "reply",
              actorId: req.user.sub,
              postId: post.id,
            },
          });
        }
      }

      return reply.code(201).send({ data: formatPost(post) });
    }
  );

  // DELETE /api/posts/:id — soft delete
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const post = await app.prisma.post.findUnique({
        where: { id: req.params.id },
      });

      if (!post || post.deletedAt) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Post not found",
          statusCode: 404,
        });
      }

      if (post.userId !== req.user.sub && req.user.role !== "ADMIN") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Not your post",
          statusCode: 403,
        });
      }

      await app.prisma.post.update({
        where: { id: req.params.id },
        data: { deletedAt: new Date() },
      });

      return reply.send({ data: null, message: "Post deleted" });
    }
  );

  // POST /api/posts/:id/like — toggle like
  app.post<{ Params: { id: string } }>(
    "/:id/like",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const postId = req.params.id;
      const userId = req.user.sub;

      const existing = await app.prisma.like.findUnique({
        where: { userId_postId: { userId, postId } },
      });

      if (existing) {
        await app.prisma.like.delete({
          where: { userId_postId: { userId, postId } },
        });
        return reply.send({ data: { liked: false } });
      }

      // Verify post exists
      const post = await app.prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, deletedAt: true, userId: true },
      });
      if (!post || post.deletedAt) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Post not found",
          statusCode: 404,
        });
      }

      await app.prisma.like.create({ data: { userId, postId } });

      // Notify post author (skip self-likes)
      if (post.userId !== userId) {
        await app.prisma.notification.create({
          data: {
            userId: post.userId,
            type: "like",
            actorId: userId,
            postId,
          },
        });
      }

      return reply.code(201).send({ data: { liked: true } });
    }
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────

type RepostData = {
  id: string;
  content: string;
  mediaUrls: string[];
  repostOfId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  author: { id: string; username: string; avatarUrl: string | null };
  repostOf: RepostData | null;
};

type PostWithRelations = {
  id: string;
  content: string;
  mediaUrls: string[];
  replyToId: string | null;
  repostOfId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  userId: string;
  author: { id: string; username: string; avatarUrl: string | null };
  _count: { likes: number; replies: number; reposts: number };
  repostOf: RepostData | null;
};

async function getLikedSet(
  prisma: import("@prisma/client").PrismaClient,
  userId: string,
  postIds: string[]
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await prisma.like.findMany({
    where: { userId, postId: { in: postIds } },
    select: { postId: true },
  });
  return new Set(rows.map((r) => r.postId));
}

function serializeRepostOf(r: RepostData | null): unknown {
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

function formatPost(post: PostWithRelations, isLiked = false) {
  return {
    id: post.id,
    userId: post.userId,
    content: post.content,
    mediaUrls: post.mediaUrls,
    replyToId: post.replyToId,
    repostOfId: post.repostOfId,
    createdAt: post.createdAt.toISOString(),
    deletedAt: post.deletedAt?.toISOString() ?? null,
    likeCount: post._count.likes,
    replyCount: post._count.replies,
    repostCount: post._count.reposts,
    isLiked,
    author: post.author,
    repostOf: serializeRepostOf(post.repostOf),
  };
}
