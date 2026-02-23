import { redirect } from "next/navigation";
import { serverFetch, getCurrentUser } from "@/lib/server-api";
import { RoleToggleButton } from "@/components/RoleToggleButton";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
}

export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    redirect("/feed");
  }

  const res = await serverFetch<{ data: AdminUser[] }>("/api/admin/users");
  const users = res.data;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="text-sm text-slate-400 mt-0.5">{users.length} members</p>
        </div>
      </div>

      {/* overflow-x-auto lets the table scroll horizontally on narrow screens
          while rounded-xl is preserved via the outer border */}
      <div className="bg-surface-800 border border-surface-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-700 bg-surface-900 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 whitespace-nowrap">User</th>
              <th className="px-4 py-3 whitespace-nowrap">Email</th>
              <th className="px-4 py-3 whitespace-nowrap">Joined</th>
              <th className="px-4 py-3 whitespace-nowrap">Role</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface-700/30 transition-colors">
                {/* User */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-xs uppercase flex-shrink-0">
                      {u.username[0]}
                    </div>
                    <div>
                      <p className="font-medium text-slate-100">{u.username}</p>
                      <p className="text-xs text-slate-400">
                        {u.postCount} posts · {u.followerCount} followers
                      </p>
                    </div>
                  </div>
                </td>

                {/* Email */}
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                  {u.email}
                </td>

                {/* Joined */}
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                  {new Date(u.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>

                {/* Role badge */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === "ADMIN"
                        ? "bg-brand-500/20 text-brand-400"
                        : "bg-surface-700/50 text-slate-400"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>

                {/* Action */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <RoleToggleButton
                    userId={u.id}
                    currentRole={u.role}
                    isCurrentUser={u.id === currentUser.sub}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
