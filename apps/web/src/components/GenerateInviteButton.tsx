"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export function GenerateInviteButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setLastCode(null);
    try {
      const res = await api.post<{ data: { code: string; expiresAt: string } }>(
        "/api/admin/invites"
      );
      setLastCode(res.data.code);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={generate}
        disabled={loading}
        className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate invite code"}
      </button>
      {lastCode && (
        <span className="text-sm font-mono bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg">
          {lastCode}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
