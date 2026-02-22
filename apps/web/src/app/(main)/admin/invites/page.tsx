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
          <p className="text-sm text-gray-500 mt-0.5">
            {available.length} available · {used.length} used
          </p>
        </div>
        <GenerateInviteButton />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {codes.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">
            No invite codes yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Used by</th>
                <th className="px-4 py-3">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {codes.map((c) => (
                <tr key={c.code} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-gray-800">
                    {c.code}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.createdBy}</td>
                  <td className="px-4 py-3">
                    {c.usedBy ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Used
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.usedBy ?? "—"}
                    {c.usedAt && (
                      <span className="text-gray-400 text-xs ml-1">
                        ({formatDate(c.usedAt)})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
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
