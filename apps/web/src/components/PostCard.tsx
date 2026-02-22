import Link from "next/link";
import type { Post } from "@private-tweet/types";
import { LikeButton } from "@/components/LikeButton";
import { ReplyButton } from "@/components/ReplyButton";
import { RepostButton } from "@/components/RepostButton";
import { timeAgo } from "@/lib/time";

/** 用户头像（首字母色块） */
function Avatar({ username, size = "md" }: { username: string; size?: "sm" | "md" }) {
  const initial = username[0]?.toUpperCase() ?? "?";
  const cls =
    size === "sm"
      ? "w-5 h-5 text-[10px]"
      : "w-10 h-10 text-sm";
  return (
    <div
      className={`${cls} rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold uppercase flex-shrink-0`}
    >
      {initial}
    </div>
  );
}

/** 操作栏（点赞 / 回复 / 转发） */
function Actions({ post, repostTargetId }: { post: Post; repostTargetId: string }) {
  const username = post.author?.username ?? "unknown";
  return (
    <div className="flex items-center gap-5 mt-3">
      <LikeButton
        postId={post.id}
        initialLiked={post.isLiked ?? false}
        initialCount={post.likeCount ?? 0}
      />
      <ReplyButton
        postId={post.id}
        replyCount={post.replyCount ?? 0}
        replyToUsername={username}
      />
      <RepostButton postId={repostTargetId} />
    </div>
  );
}

export function PostCard({ post }: { post: Post }) {
  const username = post.author?.username ?? "unknown";

  // ── 转发卡片 ────────────────────────────────────────────────────────────────
  if (post.repostOf) {
    const orig = post.repostOf;
    const isDeleted = Boolean(orig.deletedAt);
    const origUsername = orig.author?.username ?? "unknown";

    return (
      <article className="bg-white border border-gray-200 rounded-xl p-4">
        {/* 外层：转发者信息 */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
          <Avatar username={username} size="sm" />
          <Link
            href={`/profile/${username}`}
            className="font-medium text-gray-500 hover:underline"
          >
            {username}
          </Link>
          <span>转发了</span>
        </div>

        {/* 内层：原帖嵌套卡片 */}
        {isDeleted ? (
          <div className="border border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400 italic bg-gray-50">
            原帖已删除
          </div>
        ) : (
          <Link href={`/posts/${orig.id}`} className="block group">
            <div className="border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 group-hover:bg-gray-100 transition-colors">
              {/* 原帖作者行 */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs uppercase flex-shrink-0">
                  {origUsername[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  {origUsername}
                </span>
                <span className="text-xs text-gray-400">{timeAgo(orig.createdAt)}</span>
              </div>
              {/* 原帖内容 */}
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {orig.content}
              </p>
            </div>
          </Link>
        )}

        {/* 操作栏：转发按钮指向原帖（若已删除则指向转发帖自身） */}
        <Actions post={post} repostTargetId={isDeleted ? post.id : orig.id} />
      </article>
    );
  }

  // ── 普通帖子 ────────────────────────────────────────────────────────────────
  return (
    <article className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Link href={`/profile/${username}`} className="flex items-center gap-3 group">
          <Avatar username={username} />
          <div>
            <p className="font-semibold text-sm group-hover:underline">{username}</p>
            <p className="text-xs text-gray-400">{timeAgo(post.createdAt)}</p>
          </div>
        </Link>
      </div>

      <Link href={`/posts/${post.id}`} className="block">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed hover:opacity-80 transition-opacity">
          {post.content}
        </p>
      </Link>

      <Actions post={post} repostTargetId={post.id} />
    </article>
  );
}
