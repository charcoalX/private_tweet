"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface LikeButtonProps {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ postId, initialLiked, initialCount }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    // Optimistic update
    setLiked((prev) => !prev);
    setCount((prev) => (liked ? prev - 1 : prev + 1));
    setLoading(true);
    try {
      const res = await api.post<{ data: { liked: boolean } }>(
        `/api/posts/${postId}/like`
      );
      // Sync with server truth
      setLiked(res.data.liked);
    } catch {
      // Revert on error
      setLiked((prev) => !prev);
      setCount((prev) => (liked ? prev + 1 : prev - 1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${
        liked
          ? "text-red-500 hover:text-red-400"
          : "text-gray-400 hover:text-red-400"
      }`}
    >
      <span className="text-base leading-none">{liked ? "♥" : "♡"}</span>
      <span>{count}</span>
    </button>
  );
}
