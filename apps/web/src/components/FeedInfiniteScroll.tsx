"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { PostCard } from "@/components/PostCard";
import type { Post } from "@private-tweet/types";

interface FeedResponse {
  data: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface FeedInfiniteScrollProps {
  initialPosts: Post[];
  initialCursor: string | null;
  initialHasMore: boolean;
  currentUserId?: string;
  currentUserRole?: string;
}

export function FeedInfiniteScroll({
  initialPosts,
  initialCursor,
  initialHasMore,
  currentUserId,
  currentUserRole,
}: FeedInfiniteScrollProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);

  // Keep mutable refs so the IntersectionObserver callback never captures
  // stale state — refs are always current without re-creating the observer.
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(initialHasMore);
  const cursorRef = useRef<string | null>(initialCursor);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const qs = cursorRef.current
        ? `?cursor=${encodeURIComponent(cursorRef.current)}&limit=20`
        : "?limit=20";
      const res = await api.get<FeedResponse>(`/api/posts/feed${qs}`);

      setPosts((prev) => [...prev, ...res.data]);

      // Update refs first so any re-trigger sees fresh values immediately
      cursorRef.current = res.nextCursor;
      hasMoreRef.current = res.hasMore;
      setHasMore(res.hasMore);
    } catch {
      // Silently ignore — user can scroll again to retry
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []); // stable — reads exclusively from refs

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { rootMargin: "300px" } // start fetching 300 px before hitting bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onDelete={(id) =>
              setPosts((prev) => {
                const deleted = prev.find((p) => p.id === id);
                const next = prev.filter((p) => p.id !== id);
                if (deleted?.repostOfId) {
                  return next.map((p) =>
                    p.id === deleted.repostOfId
                      ? { ...p, repostCount: Math.max(0, (p.repostCount ?? 0) - 1) }
                      : p
                  );
                }
                return next;
              })
            }
          />
        ))}
      </div>

      {/* Sentinel element observed by IntersectionObserver */}
      <div ref={sentinelRef} className="h-px" />

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <p className="text-center text-xs text-slate-500 py-8">You&apos;re all caught up</p>
      )}
    </div>
  );
}
