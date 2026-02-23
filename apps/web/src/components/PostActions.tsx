"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import type { Post } from "@private-tweet/types";
import { LikeButton } from "@/components/LikeButton";
import { RepostButton } from "@/components/RepostButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Highlight } from "@/lib/highlight";

interface PostDetailResponse {
  data: Post & { replies: Post[] };
}

// ── ReplyCard: self-contained recursive component ──────────────────────────
interface ReplyCardProps {
  reply: Post;
  currentUserId?: string;
  currentUserRole?: string;
  onDeleteReply?: (id: string) => void;
}

function ReplyCard({
  reply,
  currentUserId,
  currentUserRole,
  onDeleteReply,
}: ReplyCardProps) {
  const router = useRouter();
  const rUser = reply.author?.username ?? "unknown";

  // Compose box state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContent, setComposeContent] = useState("");
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Sub-replies state
  const [subOpen, setSubOpen] = useState(false);
  const [subReplies, setSubReplies] = useState<Post[] | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [subReplyCount, setSubReplyCount] = useState(reply.replyCount ?? 0);

  // Delete state
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit state
  const [displayContent, setDisplayContent] = useState(reply.content);
  const [displayIsEdited, setDisplayIsEdited] = useState(reply.isEdited ?? false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canDelete =
    Boolean(currentUserId) &&
    (reply.userId === currentUserId || currentUserRole === "ADMIN");
  const canEdit = Boolean(currentUserId) && reply.userId === currentUserId;

  function startEdit() {
    setEditDraft(displayContent);
    setMenuOpen(false);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditDraft("");
    setSaveError(null);
  }

  async function saveEdit() {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    if (trimmed === displayContent) { cancelEdit(); return; }
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await api.patch<{ data: { content: string; isEdited: boolean } }>(
        `/api/posts/${reply.id}`,
        { content: trimmed }
      );
      setDisplayContent(res.data.content);
      setDisplayIsEdited(res.data.isEdited);
      setIsEditing(false);
      setEditDraft("");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleCompose() {
    if (composeOpen) {
      setComposeOpen(false);
      setComposeContent("");
      setComposeError(null);
    } else {
      setComposeOpen(true);
    }
  }

  async function fetchSubs() {
    setLoadingSub(true);
    try {
      const res = await api.get<PostDetailResponse>(`/api/posts/${reply.id}`);
      setSubReplies(res.data.replies ?? []);
    } catch {
      setSubReplies([]);
    } finally {
      setLoadingSub(false);
    }
  }

  async function toggleSubs() {
    if (subOpen) {
      setSubOpen(false);
    } else {
      setSubOpen(true);
      if (subReplies === null) await fetchSubs();
    }
  }

  async function submitCompose() {
    if (!composeContent.trim()) return;
    setComposeSubmitting(true);
    setComposeError(null);
    try {
      await api.post("/api/posts", { content: composeContent.trim(), replyToId: reply.id });
      setComposeContent("");
      setComposeOpen(false);
      const res = await api.get<PostDetailResponse>(`/api/posts/${reply.id}`);
      setSubReplies(res.data.replies ?? []);
      setSubReplyCount((c) => c + 1);
      setSubOpen(true);
      router.refresh();
    } catch (err) {
      setComposeError(err instanceof ApiError ? err.message : "Failed to reply");
    } finally {
      setComposeSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/posts/${reply.id}`);
      setDialogOpen(false);
      if (onDeleteReply) {
        onDeleteReply(reply.id);
      } else {
        router.refresh();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
      setDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-xs uppercase flex-shrink-0">
        {rUser[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-100">{rUser}</span>
          <span className="text-xs text-slate-400">{timeAgo(reply.createdAt)}</span>
        </div>

        {isEditing ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              maxLength={240}
              rows={2}
              className="w-full text-sm bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{editDraft.length}/240</span>
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="text-xs px-3 py-1 text-slate-400 hover:text-slate-200">
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={isSaving || !editDraft.trim()}
                  className="text-xs px-3 py-1 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-200 mt-0.5 whitespace-pre-wrap leading-relaxed">
            <Highlight text={displayContent} query="" />
            {displayIsEdited && (
              <span className="ml-1.5 text-[10px] text-slate-500 font-normal align-middle">Edited</span>
            )}
          </p>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-5 mt-2">
          <LikeButton
            postId={reply.id}
            initialLiked={reply.isLiked ?? false}
            initialCount={reply.likeCount ?? 0}
          />
          <div className="flex items-center gap-1 text-xs text-brand-400">
            <button
              onClick={toggleCompose}
              className="hover:text-brand-500 transition-colors"
              title="Reply"
            >
              ↵
            </button>
            <button
              onClick={toggleSubs}
              className="hover:text-brand-500 transition-colors tabular-nums"
              title="View replies"
            >
              {subReplyCount}
            </button>
          </div>
          <RepostButton postId={reply.id} initialCount={reply.repostCount ?? 0} />

          {/* ··· menu */}
          {(canEdit || canDelete) && (
            <div className="ml-auto relative">
              {menuOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
              )}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="text-slate-500 hover:text-slate-300 transition-colors px-1 text-sm leading-none"
                title="More"
              >
                ···
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-50 overflow-hidden min-w-[100px]">
                  {canEdit && (
                    <button
                      onClick={startEdit}
                      className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-surface-700 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => { setMenuOpen(false); setDialogOpen(true); }}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-surface-700 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {deleteError && (
          <p className="text-xs text-red-400 mt-1">{deleteError}</p>
        )}

        {/* Sub-replies */}
        {subOpen && (
          <div className="mt-3 pl-1 border-l-2 border-surface-700">
            {loadingSub ? (
              <p className="text-xs text-slate-400 pl-2">Loading…</p>
            ) : subReplies && subReplies.length > 0 ? (
              <div className="space-y-3 pl-2">
                {subReplies.map((sub) => (
                  <ReplyCard
                    key={sub.id}
                    reply={sub}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    onDeleteReply={(id) => {
                      setSubReplies((prev) => prev?.filter((r) => r.id !== id) ?? null);
                      setSubReplyCount((c) => Math.max(0, c - 1));
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 pl-2">No replies yet</p>
            )}
          </div>
        )}

        {/* Compose box */}
        {composeOpen && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-400">
              Replying to <span className="font-medium text-slate-300">@{rUser}</span>
            </p>
            <textarea
              value={composeContent}
              onChange={(e) => setComposeContent(e.target.value)}
              placeholder="Write your reply…"
              maxLength={240}
              rows={2}
              className="w-full text-sm bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{composeContent.length}/240</span>
              <div className="flex gap-2">
                <button
                  onClick={toggleCompose}
                  className="text-xs px-3 py-1 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={submitCompose}
                  disabled={composeSubmitting || !composeContent.trim()}
                  className="text-xs px-3 py-1 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-50"
                >
                  {composeSubmitting ? "…" : "Reply"}
                </button>
              </div>
            </div>
            {composeError && <p className="text-xs text-red-400">{composeError}</p>}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={dialogOpen}
        title="Delete Reply"
        message="This action cannot be undone. Are you sure you want to delete this reply?"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}

// ── PostActions: like / reply / repost action bar ────────────────────────
interface PostActionsProps {
  post: Post;
  repostTargetId: string;
  currentUserId?: string;
  currentUserRole?: string;
}

export function PostActions({
  post,
  repostTargetId,
  currentUserId,
  currentUserRole,
}: PostActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Post[] | null>(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyCount, setReplyCount] = useState(post.replyCount ?? 0);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = post.author?.username ?? "unknown";

  async function fetchReplies() {
    setLoadingReplies(true);
    try {
      const res = await api.get<PostDetailResponse>(`/api/posts/${post.id}`);
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
    if (next && replies === null) await fetchReplies();
  }

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/posts", { content: content.trim(), replyToId: post.id });
      setContent("");
      setReplyCount((c) => c + 1);
      await fetchReplies();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reply");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Main post action row */}
      <div className="flex items-center gap-5 mt-3">
        <LikeButton
          postId={post.id}
          initialLiked={post.isLiked ?? false}
          initialCount={post.likeCount ?? 0}
        />
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
        <RepostButton postId={repostTargetId} initialCount={post.repostCount ?? 0} />
      </div>

      {/* First-level reply panel */}
      {open && (
        <div className="mt-3 border-t border-surface-700 pt-3 space-y-4">
          {loadingReplies ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : replies !== null && replies.length > 0 ? (
            <div className="space-y-4">
              {replies.map((reply) => (
                <ReplyCard
                  key={reply.id}
                  reply={reply}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  onDeleteReply={(id) => {
                    setReplies((prev) => prev?.filter((r) => r.id !== id) ?? null);
                    setReplyCount((c) => Math.max(0, c - 1));
                  }}
                />
              ))}
            </div>
          ) : replies !== null ? (
            <p className="text-xs text-slate-400">No replies yet</p>
          ) : null}

          {replies !== null && <div className="border-t border-surface-700" />}

          {/* Compose for main post */}
          <p className="text-xs text-slate-400">
            Replying to <span className="font-medium text-slate-300">@{username}</span>
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
                onClick={() => { setOpen(false); setContent(""); }}
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
