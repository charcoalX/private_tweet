"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await api.post("/api/auth/logout");
    } catch {
      // cookie already gone or token invalid — proceed anyway
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="text-gray-400 hover:text-gray-700 text-sm disabled:opacity-50"
    >
      {loading ? "…" : "Sign out"}
    </button>
  );
}
