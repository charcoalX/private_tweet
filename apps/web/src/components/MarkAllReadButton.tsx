"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function MarkAllReadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markRead() {
    setLoading(true);
    try {
      await api.patch("/api/notifications/read");
    } catch {
      // best-effort
    }
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={markRead}
      disabled={loading}
      className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
    >
      {loading ? "…" : "Mark all read"}
    </button>
  );
}
