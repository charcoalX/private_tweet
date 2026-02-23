"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import type { Post } from "@private-tweet/types";

interface ReplyButtonProps {
  postId: string;
  replyCount: number;
  replyToUsername: string;
}

interface PostDetailResponse {
  data: Post & { replies: Post[] };
}

export function ReplyButton({
  postId,
  replyCount,
  replyToUsername,
}: ReplyButtonProps) {
  const router = useRouter();

  // null = 未加载；[] = 已加载但无回复
  const [replies, setReplies] = useState<Post[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);

  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchReplies() {
    setLoadingReplies(true);
    try {
      const res = await api.get<PostDetailResponse>(`/api/posts/${postId}`);
      setReplies(res.data.replies ?? []);
    } catch {
      setReplies([]);
    } finally {
      setLoadingReplies(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && replies === null) {
      await fetchReplies();
    }
  }

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/posts", {
        content: content.trim(),
        replyToId: postId,
      });
      setContent("");
      // 重新拉取回复列表，让新回复立即出现
      await fetchReplies();
      // 刷新 Server Components 更新 replyCount
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reply");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* 操作行：↩ 图标 + 数字，两者都触发展开 */}
      <div className="flex items-center gap-1 text-xs text-brand-400">
        <button
          onClick={toggle}
          className="hover:text-brand-500 transition-colors"
          title="Reply"
        >
          ↵
</button>
        <button
          onClick={toggle}
          className="hover:text-brand-500 transition-colors tabular-nums"
        >
          {replyCount}
        </button>
      </div>

      {/* 展开面板 */}
      {open && (
        <div className="mt-3 border-t border-surface-700 pt-3 space-y-3">
          {/* 已有回复列表 */}
          {loadingReplies ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : replies !== null && replies.length > 0 ? (
            <div className="space-y-3">
              {replies.map((reply) => {
                const rUser = reply.author?.username ?? "unknown";
                return (
                  <div key={reply.id} className="flex gap-2.5">
                    {/* 头像 */}
                    <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-xs uppercase flex-shrink-0">
                      {rUser[0]?.toUpperCase() ?? "?"}
                    </div>
                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-100">{rUser}</span>
                        <span className="text-xs text-slate-400">
                          {timeAgo(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 mt-0.5 whitespace-pre-wrap leading-relaxed">
                        {reply.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : replies !== null ? (
            <p className="text-xs text-slate-400">No replies yet</p>
          ) : null}

          {/* 分隔线 */}
          {replies !== null && (
            <div className="border-t border-surface-700 pt-3" />
          )}

          {/* 撰写框 */}
          <p className="text-xs text-slate-400">
            Replying to{" "}
            <span className="font-medium text-slate-300">@{replyToUsername}</span>
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your reply…"
            maxLength={240}
            rows={3}
            className="w-full text-sm bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{content.length}/240</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setContent("");
                }}
                className="text-xs px-3 py-1 text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !content.trim()}
                className="text-xs px-3 py-1 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-50"
              >
                {submitting ? "…" : "Reply"}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
