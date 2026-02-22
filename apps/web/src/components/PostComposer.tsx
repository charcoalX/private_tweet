"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

const MAX_CHARS = 240;

export function PostComposer() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_CHARS - content.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/posts", { content: content.trim() });
      setContent("");
      router.refresh(); // 触发服务端组件重新拉取 feed
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-xl p-4 mb-6"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        rows={3}
        maxLength={MAX_CHARS}
        className="w-full resize-none text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span
          className={`text-xs tabular-nums ${
            remaining < 20 ? "text-red-500 font-medium" : "text-gray-400"
          }`}
        >
          {remaining}
        </span>
        <button
          type="submit"
          disabled={loading || !content.trim() || remaining < 0}
          className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors disabled:opacity-50"
        >
          {loading ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
