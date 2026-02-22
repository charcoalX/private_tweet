import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      {/* Admin sub-navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 pb-0">
        <Link
          href="/admin/users"
          className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition-colors"
        >
          Users
        </Link>
        <Link
          href="/admin/invites"
          className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition-colors"
        >
          Invite codes
        </Link>
      </div>
      {children}
    </div>
  );
}
