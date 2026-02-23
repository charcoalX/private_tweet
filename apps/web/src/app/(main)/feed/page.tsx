import { serverFetch, getCurrentUser } from "@/lib/server-api";
import { PostComposer } from "@/components/PostComposer";
import { FeedInfiniteScroll } from "@/components/FeedInfiniteScroll";
import type { Post } from "@private-tweet/types";

export default async function FeedPage() {
  const [feedRes, currentUser] = await Promise.all([
    serverFetch<{ data: Post[]; nextCursor: string | null; hasMore: boolean }>(
      "/api/posts/feed?limit=20"
    ).catch(() => ({ data: [] as Post[], nextCursor: null, hasMore: false })),
    getCurrentUser(),
  ]);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Home</h1>

      <PostComposer />

      {feedRes.data.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12">
          No posts yet — follow some users or write your first post!
        </p>
      ) : (
        <FeedInfiniteScroll
          key={feedRes.data[0]?.id ?? "empty"}
          initialPosts={feedRes.data}
          initialCursor={feedRes.nextCursor}
          initialHasMore={feedRes.hasMore}
          currentUserId={currentUser?.sub}
          currentUserRole={currentUser?.role}
        />
      )}
    </div>
  );
}
