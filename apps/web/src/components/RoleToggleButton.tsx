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
    return <span className="text-xs text-slate-500 italic">you</span>;
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
            ? "border-brand-500/40 text-brand-400 hover:bg-red-900/20 hover:border-red-500/40 hover:text-red-400"
            : "border-surface-700 text-slate-400 hover:bg-brand-500/10 hover:border-brand-500/40 hover:text-brand-400"
        }`}
      >
        {loading ? "…" : isAdmin ? "Demote" : "Make admin"}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
