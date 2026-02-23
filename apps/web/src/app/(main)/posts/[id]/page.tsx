import { notFound } from "next/navigation";
import { serverFetch, getCurrentUser } from "@/lib/server-api";
import { PostCard } from "@/components/PostCard";
import { BackButton } from "@/components/BackButton";
import type { Post } from "@private-tweet/types";

interface PostDetail extends Post {
  replies: Post[];
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let post: PostDetail;
  const currentUser = await getCurrentUser();
  try {
    const res = await serverFetch<{ data: PostDetail }>(`/api/posts/${id}`);
    post = res.data;
  } catch {
    notFound();
  }

  return (
    <div>
      {/* 返回 */}
      <div className="mb-4">
        <BackButton />
      </div>

      {/* 原帖 */}
      <PostCard
        post={post}
        currentUserId={currentUser?.sub}
        currentUserRole={currentUser?.role}
      />

      {/* Thread：左竖线 + 回复列表 */}
      {post.replies.length > 0 ? (
        <div className="mt-1 ml-9 pl-5 border-l-2 border-surface-700">
          {/* 回复数提示 */}
          <p className="text-xs text-slate-400 py-3">
            {post.replies.length} {post.replies.length === 1 ? "reply" : "replies"}
          </p>

          <div className="flex flex-col gap-4 pb-4">
            {post.replies.map((reply) => (
              <div key={reply.id} className="relative">
                {/* 连接线小横杠 */}
                <div className="absolute -left-5 top-6 w-4 h-px bg-surface-700" />
                <PostCard
                  post={reply}
                  currentUserId={currentUser?.sub}
                  currentUserRole={currentUser?.role}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-10">
          No replies yet — press ↵ to be the first
        </p>
      )}
    </div>
  );
}
