"use client";

import { useState } from "react";
import Link from "next/link";
import type { Post } from "@private-tweet/types";
import { PostCard } from "@/components/PostCard";
import { FollowButton } from "@/components/FollowButton";
import { Highlight } from "@/lib/highlight";
import { api } from "@/lib/api";

export interface UserResult {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  followerCount: number;
  isFollowing: boolean;
}

interface Props {
  q: string;
  initialTab: "posts" | "users";
  initialPosts: Post[];
  initialPostsCursor: string | null;
  initialPostsHasMore: boolean;
  initialUsers: UserResult[];
  initialUsersCursor: string | null;
  initialUsersHasMore: boolean;
  currentUserId?: string;
  currentUserRole?: string;
}

function UserCard({
  user,
  currentUserId,
  query,
}: {
  user: UserResult;
  currentUserId?: string;
  query: string;
}) {
  return (
    <div className="bg-surface-800 border border-surface-700 rounded-xl p-4 flex items-start gap-3">
      {/* Avatar */}
      <Link href={`/profile/${user.username}`} className="shrink-0">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-sm uppercase">
            {user.username[0]}
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/profile/${user.username}`}
              className="font-semibold text-sm text-slate-100 hover:underline truncate block"
            >
              <Highlight text={user.username} query={query} />
            </Link>
            <p className="text-xs text-slate-500">
              {user.followerCount} {user.followerCount === 1 ? "follower" : "followers"}
            </p>
          </div>
          {currentUserId && currentUserId !== user.id && (
            <FollowButton userId={user.id} initialIsFollowing={user.isFollowing} />
          )}
        </div>
        {user.bio && (
          <p className="text-sm text-slate-400 mt-1.5 line-clamp-2">
            <Highlight text={user.bio} query={query} />
          </p>
        )}
      </div>
    </div>
  );
}

export function SearchResults({
  q,
  initialTab,
  initialPosts,
  initialPostsCursor,
  initialPostsHasMore,
  initialUsers,
  initialUsersCursor,
  initialUsersHasMore,
  currentUserId,
  currentUserRole,
}: Props) {
  const [tab, setTab] = useState<"posts" | "users">(initialTab);

  // Posts state
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [postsCursor, setPostsCursor] = useState(initialPostsCursor);
  const [postsHasMore, setPostsHasMore] = useState(initialPostsHasMore);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserResult[]>(initialUsers);
  const [usersCursor, setUsersCursor] = useState(initialUsersCursor);
  const [usersHasMore, setUsersHasMore] = useState(initialUsersHasMore);
  const [loadingUsers, setLoadingUsers] = useState(false);

  async function loadMorePosts() {
    if (!postsCursor || loadingPosts) return;
    setLoadingPosts(true);
    try {
      const res = await api.get<{ data: Post[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/search/posts?q=${encodeURIComponent(q)}&cursor=${encodeURIComponent(postsCursor)}&limit=10`
      );
      setPosts((prev) => [...prev, ...res.data]);
      setPostsCursor(res.nextCursor);
      setPostsHasMore(res.hasMore);
    } catch {
      // ignore
    } finally {
      setLoadingPosts(false);
    }
  }

  async function loadMoreUsers() {
    if (!usersCursor || loadingUsers) return;
    setLoadingUsers(true);
    try {
      const res = await api.get<{ data: UserResult[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/search/users?q=${encodeURIComponent(q)}&cursor=${encodeURIComponent(usersCursor)}&limit=10`
      );
      setUsers((prev) => [...prev, ...res.data]);
      setUsersCursor(res.nextCursor);
      setUsersHasMore(res.hasMore);
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  }

  function handleDeletePost(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Search results</h1>
      <p className="text-slate-500 text-sm mb-5">
        Results for <span className="text-slate-300 font-medium">&ldquo;{q}&rdquo;</span>
      </p>

      {/* Tabs */}
      <div className="flex border-b border-surface-700 mb-5">
        {(["posts", "users"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-brand-400 text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "posts" ? `Posts (${posts.length}${postsHasMore ? "+" : ""})` : `Users (${users.length}${usersHasMore ? "+" : ""})`}
          </button>
        ))}
      </div>

      {/* Posts tab */}
      {tab === "posts" && (
        <div className="space-y-3">
          {posts.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-12">No posts found.</p>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onDelete={handleDeletePost}
                highlightQuery={q}
              />
            ))
          )}
          {postsHasMore && (
            <button
              onClick={loadMorePosts}
              disabled={loadingPosts}
              className="w-full py-2.5 text-sm text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
            >
              {loadingPosts ? "Loading…" : "Load more posts"}
            </button>
          )}
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <div className="space-y-3">
          {users.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-12">No users found.</p>
          ) : (
            users.map((user) => (
              <UserCard key={user.id} user={user} currentUserId={currentUserId} query={q} />
            ))
          )}
          {usersHasMore && (
            <button
              onClick={loadMoreUsers}
              disabled={loadingUsers}
              className="w-full py-2.5 text-sm text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
            >
              {loadingUsers ? "Loading…" : "Load more users"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
