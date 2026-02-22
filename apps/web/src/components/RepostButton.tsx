"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

interface RepostButtonProps {
  /** ID of the post to repost (pass original post ID when inside a repost card) */
  postId: string;
}

export function RepostButton({ postId }: RepostButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function repost() {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/posts", { repostOfId: postId });
      setDone(true);
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
        onClick={repost}
        disabled={loading || done}
        title={done ? "Reposted" : "Repost"}
        className={`flex items-center gap-1 text-xs transition-colors disabled:opacity-60 ${
          done ? "text-green-500" : "text-gray-400 hover:text-green-500"
        }`}
      >
        <span>🔄</span>
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
