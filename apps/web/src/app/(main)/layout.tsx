import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser, serverFetch } from "@/lib/server-api";
import { SignOutButton } from "@/components/SignOutButton";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();
  const unreadCount = await serverFetch<{ data: { count: number } }>(
    "/api/notifications/count"
  )
    .then((r) => r.data.count)
    .catch(() => 0);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 bg-surface-800 border-b border-surface-700">
        <nav className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/feed"
            className="font-bold text-lg text-brand-400 hover:text-brand-500"
          >
            Private Tweet
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/feed"
              className="text-slate-400 hover:text-slate-100 font-medium"
            >
              Feed
            </Link>
            {currentUser && (
              <Link
                href={`/profile/${currentUser.username}`}
                className="text-slate-400 hover:text-slate-100 font-medium"
              >
                {currentUser.username}
              </Link>
            )}
            {/* Notification bell */}
            <Link
              href="/notifications"
              className="relative text-slate-400 hover:text-slate-100"
              title="Notifications"
            >
              <span className="text-lg leading-none">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>

            {currentUser?.role === "ADMIN" && (
              <Link
                href="/admin/users"
                className="text-slate-400 hover:text-slate-100 font-medium"
              >
                Admin
              </Link>
            )}
            <SignOutButton />
          </div>
        </nav>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
