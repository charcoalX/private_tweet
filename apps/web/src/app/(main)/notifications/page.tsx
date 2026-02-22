import Link from "next/link";
import { serverFetch } from "@/lib/server-api";
import { MarkAllReadButton } from "@/components/MarkAllReadButton";

interface NotificationItem {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  actor: { id: string; username: string; avatarUrl: string | null };
  post: { id: string; content: string } | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function actionText(type: string) {
  switch (type) {
    case "like":
      return "liked your post";
    case "follow":
      return "followed you";
    case "reply":
      return "replied to your post";
    case "repost":
      return "reposted your post";
    case "mention":
      return "mentioned you";
    default:
      return "interacted with you";
  }
}

export default async function NotificationsPage() {
  const res = await serverFetch<{ data: NotificationItem[] }>(
    "/api/notifications"
  ).catch(() => ({ data: [] as NotificationItem[] }));

  const notifications = res.data;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </div>

      {notifications.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-12">
          No notifications yet.
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-4 transition-colors ${
                !n.read ? "bg-blue-50 hover:bg-blue-100/60" : "hover:bg-gray-50"
              }`}
            >
              {/* Actor avatar */}
              <Link href={`/profile/${n.actor.username}`} className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm uppercase">
                  {n.actor.username[0]}
                </div>
              </Link>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <Link
                    href={`/profile/${n.actor.username}`}
                    className="font-semibold hover:underline"
                  >
                    {n.actor.username}
                  </Link>{" "}
                  {actionText(n.type)}
                </p>
                {n.post && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    "{n.post.content}"
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {timeAgo(n.createdAt)}
                </p>
              </div>

              {/* Unread dot */}
              {!n.read && (
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
