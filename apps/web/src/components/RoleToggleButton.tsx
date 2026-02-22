"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

interface RoleToggleButtonProps {
  userId: string;
  currentRole: string;
  isCurrentUser: boolean;
}

export function RoleToggleButton({
  userId,
  currentRole,
  isCurrentUser,
}: RoleToggleButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isCurrentUser) {
    return <span className="text-xs text-gray-400 italic">you</span>;
  }

  const isAdmin = currentRole === "ADMIN";

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      await api.patch(`/api/admin/users/${userId}/role`, {
        role: isAdmin ? "USER" : "ADMIN",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={loading}
        className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
          isAdmin
            ? "border-purple-200 text-purple-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
            : "border-gray-200 text-gray-500 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600"
        }`}
      >
        {loading ? "…" : isAdmin ? "Demote" : "Make admin"}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
