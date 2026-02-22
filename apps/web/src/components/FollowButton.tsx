"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

interface FollowButtonProps {
  userId: string;
  initialIsFollowing: boolean;
}

export function FollowButton({ userId, initialIsFollowing }: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      if (isFollowing) {
        await api.delete(`/api/users/${userId}/follow`);
        setIsFollowing(false);
      } else {
        await api.post(`/api/users/${userId}/follow`);
        setIsFollowing(true);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        console.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-sm font-medium border rounded-full px-4 py-1.5 transition-colors disabled:opacity-50 ${
        isFollowing
          ? "border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-600"
          : "bg-blue-500 text-white border-transparent hover:bg-blue-600"
      }`}
    >
      {loading ? "…" : isFollowing ? "Following" : "Follow"}
    </button>
  );
}
