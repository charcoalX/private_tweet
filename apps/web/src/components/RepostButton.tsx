"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

interface RepostButtonProps {
  /** ID of the post to repost (pass original post ID when inside a repost card) */
  postId: string;
  initialCount?: number;
}

export function RepostButton({ postId, initialCount = 0 }: RepostButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [content, setContent] = useState("");

  // Sync downward when parent decrements the count (e.g. a repost was deleted elsewhere).
  // We never sync upward to avoid overwriting the local +1 from the user's own repost action.
  useEffect(() => {
    setCount((prev) => {
      const next = initialCount ?? 0;
      return next < prev ? next : prev;
    });
  }, [initialCount]);

  // Close on Escape
  useEffect(() => {
    if (!composeOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeCompose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [composeOpen]);

  function openCompose() {
    if (loading || done) return;
    setContent("");
    setError(null);
    setComposeOpen(true);
  }

  function closeCompose() {
    setComposeOpen(false);
    setContent("");
    setError(null);
  }

  async function repost() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/posts", {
        repostOfId: postId,
        content: content.trim(),
      });
      setDone(true);
      setCount((c) => c + 1);
      setComposeOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div>
        <div className="flex items-center gap-1 text-xs text-brand-400">
          <button
            onClick={openCompose}
            disabled={loading || done}
            title={done ? "Reposted" : "Repost"}
            className={`transition-colors disabled:opacity-60 ${
              done ? "text-brand-500" : "text-brand-400 hover:text-brand-500"
            }`}
          >
            ↻
          </button>
          <span className="tabular-nums">{count}</span>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      {/* Repost compose modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeCompose}
          />

          {/* Panel */}
          <div className="relative bg-surface-800 border border-surface-700 rounded-xl p-5 w-full max-w-md shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Repost</h2>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a comment… (optional)"
              maxLength={240}
              rows={3}
              autoFocus
              className="w-full text-sm bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
            />

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-400">{content.length}/240</span>
              <div className="flex gap-2">
                <button
                  onClick={closeCompose}
                  disabled={loading}
                  className="text-xs px-3 py-1 text-slate-400 hover:text-slate-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={repost}
                  disabled={loading}
                  className="text-xs px-3 py-1 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-50"
                >
                  {loading ? "…" : "Repost"}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
