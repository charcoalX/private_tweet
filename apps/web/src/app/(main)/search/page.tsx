import { getCurrentUser, serverFetch } from "@/lib/server-api";
import { redirect } from "next/navigation";
import { SearchResults, type UserResult } from "@/components/SearchResults";
import type { Post } from "@private-tweet/types";

interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login?from=/search");

  const { q: rawQ, tab: rawTab } = await searchParams;
  const q = (rawQ ?? "").trim();
  const initialTab = rawTab === "users" ? "users" : "posts";

  if (!q) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Search</h1>
        <p className="text-slate-500 text-sm text-center py-16">
          Type a keyword in the search box above and press Enter.
        </p>
      </div>
    );
  }

  const qs = encodeURIComponent(q);
  const [postsRes, usersRes] = await Promise.all([
    serverFetch<PageResult<Post>>(`/api/search/posts?q=${qs}&limit=10`).catch(
      () => ({ data: [] as Post[], nextCursor: null, hasMore: false })
    ),
    serverFetch<PageResult<UserResult>>(`/api/search/users?q=${qs}&limit=10`).catch(
      () => ({ data: [] as UserResult[], nextCursor: null, hasMore: false })
    ),
  ]);

  return (
    <SearchResults
      key={q}
      q={q}
      initialTab={initialTab}
      initialPosts={postsRes.data}
      initialPostsCursor={postsRes.nextCursor}
      initialPostsHasMore={postsRes.hasMore}
      initialUsers={usersRes.data}
      initialUsersCursor={usersRes.nextCursor}
      initialUsersHasMore={usersRes.hasMore}
      currentUserId={currentUser.sub}
      currentUserRole={currentUser.role}
    />
  );
}
