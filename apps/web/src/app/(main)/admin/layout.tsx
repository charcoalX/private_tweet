import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      {/* Admin sub-navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-surface-700 pb-0">
        <Link
          href="/admin/users"
          className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-100 border-b-2 border-transparent hover:border-surface-700 transition-colors"
        >
          Users
        </Link>
        <Link
          href="/admin/invites"
          className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-100 border-b-2 border-transparent hover:border-surface-700 transition-colors"
        >
          Invite codes
        </Link>
      </div>
      {children}
    </div>
  );
}
