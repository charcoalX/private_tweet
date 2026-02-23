import Link from "next/link";
import type { Post } from "@private-tweet/types";
import { PostActions } from "@/components/PostActions";
import { timeAgo } from "@/lib/time";

/** 图片网格 */
function MediaGrid({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return null;

  if (urls.length === 1) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden">
        <img src={urls[0]} alt="" className="w-full max-h-96 object-cover" />
      </div>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-xl overflow-hidden">
      {urls.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          className={`w-full object-cover ${
            urls.length === 3 && i === 2
              ? "col-span-2 h-44"
              : urls.length === 4
              ? "h-36"
              : "h-44"
          }`}
        />
      ))}
    </div>
  );
}

/** 用户头像（首字母色块） */
function Avatar({ username, size = "md" }: { username: string; size?: "sm" | "md" }) {
  const initial = username[0]?.toUpperCase() ?? "?";
  const cls =
    size === "sm"
      ? "w-5 h-5 text-[10px]"
      : "w-10 h-10 text-sm";
  return (
    <div
      className={`${cls} rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold uppercase flex-shrink-0`}
    >
      {initial}
    </div>
  );
}


interface PostCardProps {
  post: Post;
  currentUserId?: string;
  currentUserRole?: string;
  onDelete?: (id: string) => void;
}

export function PostCard({ post, currentUserId, currentUserRole, onDelete }: PostCardProps) {
  const username = post.author?.username ?? "unknown";

  // ── 转发卡片 ────────────────────────────────────────────────────────────────
  if (post.repostOf) {
    // Walk the repostOf chain to collect intermediate reposters and find the
    // original post (the node with no further repostOf / repostOfId).
    type ChainNode = { author: Post["author"]; content: string };
    const intermediates: ChainNode[] = [];
    let cursor: Post["repostOf"] = post.repostOf;
    while (cursor && cursor.repostOfId) {
      if (cursor.repostOf) {
        // cursor is an intermediate — save it and go deeper
        intermediates.push({ author: cursor.author, content: cursor.content });
        cursor = cursor.repostOf as Post["repostOf"];
      } else {
        // No further data from API — treat cursor as original
        break;
      }
    }
    const original = cursor; // root post (A)
    const isDeleted = !original || Boolean(original.deletedAt);
    const embedUsername = original?.author?.username ?? "unknown";

    return (
      <article className="bg-surface-800 border border-surface-700 rounded-xl p-4">
        {/* 外层：转发者信息 */}
        <div className="flex items-center gap-3 mb-3">
          <Avatar username={username} />
          <div className="flex items-center gap-1.5">
            <Link
              href={`/profile/${username}`}
              className="font-semibold text-sm text-slate-100 hover:underline"
            >
              {username}
            </Link>
            <span className="text-sm text-slate-400">reposted</span>
          </div>
        </div>

        {/* 当前转发人的留言 */}
        {post.content && (
          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed mb-3">
            {post.content}
          </p>
        )}

        {/* 中间各层转发人及其留言（仅显示有内容的层） */}
        {intermediates.map((node, i) =>
          node.content ? (
            <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400 mb-2 flex-wrap">
              <span className="text-slate-500">↻ from</span>
              <div className="w-4 h-4 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-[9px] uppercase flex-shrink-0">
                {node.author?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="font-medium text-slate-300">{node.author?.username ?? "unknown"}</span>
              <span className="text-slate-600">:</span>
              <span>{node.content}</span>
            </div>
          ) : null
        )}

        {/* 内层：始终展示原始主帖 A */}
        {isDeleted ? (
          <div className="border border-dashed border-surface-700 rounded-xl px-4 py-3 text-sm text-slate-500 italic bg-surface-900">
            Original post was deleted
          </div>
        ) : original ? (
          <Link href={`/posts/${original.id}`} className="block group">
            <div className="border border-surface-700 rounded-xl px-4 py-3 bg-surface-900 group-hover:bg-surface-700/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-xs uppercase flex-shrink-0">
                  {embedUsername[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-sm font-semibold text-slate-500">{embedUsername}</span>
                <span className="text-xs text-slate-500">{timeAgo(original.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
                {original.content}
              </p>
              <MediaGrid urls={original.mediaUrls ?? []} />
            </div>
          </Link>
        ) : null}

        <PostActions
          post={post}
          repostTargetId={post.id}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onDelete={onDelete}
        />
      </article>
    );
  }

  // ── 普通帖子 ────────────────────────────────────────────────────────────────
  return (
    <article className="bg-surface-800 border border-surface-700 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Link href={`/profile/${username}`} className="flex items-center gap-3 group">
          <Avatar username={username} />
          <div>
            <p className="font-semibold text-sm text-slate-100 group-hover:underline">{username}</p>
            <p className="text-xs text-slate-400">{timeAgo(post.createdAt)}</p>
          </div>
        </Link>
      </div>

      <Link href={`/posts/${post.id}`} className="block">
        <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed hover:opacity-80 transition-opacity">
          {post.content}
        </p>
        <MediaGrid urls={post.mediaUrls ?? []} />
      </Link>

      <PostActions
        post={post}
        repostTargetId={post.id}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        onDelete={onDelete}
      />
    </article>
  );
}
