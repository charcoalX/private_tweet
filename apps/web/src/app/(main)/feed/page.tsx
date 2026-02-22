import { serverFetch } from "@/lib/server-api";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import type { Post } from "@private-tweet/types";

export default async function FeedPage() {
  const feedRes = await serverFetch<{
    data: Post[];
    nextCursor: string | null;
    hasMore: boolean;
  }>("/api/posts/feed").catch(() => ({
    data: [] as Post[],
    nextCursor: null,
    hasMore: false,
  }));

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Home</h1>

      <PostComposer />

      {feedRes.data.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-12">
          No posts yet — follow some users or write your first post!
        </p>
      ) : (
        <div className="space-y-4">
          {feedRes.data.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
