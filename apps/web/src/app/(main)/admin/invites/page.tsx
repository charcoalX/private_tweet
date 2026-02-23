import { redirect } from "next/navigation";
import { serverFetch, getCurrentUser } from "@/lib/server-api";
import { GenerateInviteButton } from "@/components/GenerateInviteButton";

interface InviteCode {
  code: string;
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AdminInvitesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    redirect("/feed");
  }

  const res = await serverFetch<{ data: InviteCode[] }>("/api/admin/invites");
  const codes = res.data;

  const used = codes.filter((c) => c.usedBy !== null);
  const available = codes.filter((c) => c.usedBy === null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Invite codes</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {available.length} available · {used.length} used
          </p>
        </div>
        <GenerateInviteButton />
      </div>

      <div className="bg-surface-800 border border-surface-700 rounded-xl overflow-x-auto">
        {codes.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">
            No invite codes yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700 bg-surface-900 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Used by</th>
                <th className="px-4 py-3">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {codes.map((c) => (
                <tr key={c.code} className="hover:bg-surface-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-slate-200">
                    {c.code}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{c.createdBy}</td>
                  <td className="px-4 py-3">
                    {c.usedBy ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-700/50 text-slate-400">
                        Used
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {c.usedBy ?? "—"}
                    {c.usedAt && (
                      <span className="text-slate-500 text-xs ml-1">
                        ({formatDate(c.usedAt)})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {formatDate(c.expiresAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
