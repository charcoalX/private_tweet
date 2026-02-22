import { notFound } from "next/navigation";
import { serverFetch, getCurrentUser } from "@/lib/server-api";
import { PostCard } from "@/components/PostCard";
import { FollowButton } from "@/components/FollowButton";
import type { Post } from "@private-tweet/types";

interface ProfileUser {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isFollowing: boolean;
}

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;

  const [currentUser, userRes, postsRes] = await Promise.all([
    getCurrentUser(),
    serverFetch<{ data: ProfileUser }>(`/api/users/${username}`).catch(
      () => null
    ),
    serverFetch<{ data: Post[]; nextCursor: string | null; hasMore: boolean }>(
      `/api/users/${username}/posts`
    ).catch(() => null),
  ]);

  if (!userRes) notFound();

  const user = userRes.data;
  const posts = postsRes?.data ?? [];
  const isOwnProfile = currentUser?.username === username;

  return (
    <div>
      {/* Profile header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl uppercase flex-shrink-0">
            {user.username[0]}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-xl">{user.username}</h1>
            {user.bio && (
              <p className="text-sm text-gray-600 mt-1">{user.bio}</p>
            )}
          </div>

          {/* Follow button — only shown on other users' profiles */}
          {!isOwnProfile && (
            <FollowButton
              userId={user.id}
              initialIsFollowing={user.isFollowing}
            />
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-5 text-sm text-gray-500">
          <span>
            <strong className="text-gray-900">{user.postCount}</strong> posts
          </span>
          <span>
            <strong className="text-gray-900">{user.followerCount}</strong>{" "}
            followers
          </span>
          <span>
            <strong className="text-gray-900">{user.followingCount}</strong>{" "}
            following
          </span>
        </div>
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-12">
          No posts yet.
        </p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
