"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Post } from "@private-tweet/types";
import { PostActions } from "@/components/PostActions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { timeAgo } from "@/lib/time";
import { Highlight } from "@/lib/highlight";
import { api, ApiError } from "@/lib/api";

/** 图片网格 */
function MediaGrid({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return null;

  if (urls.length === 1) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden">
        <img src={urls[0]} alt="" className="w-full max-h-96 object-cover" />
      </div>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-xl overflow-hidden">
      {urls.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          className={`w-full object-cover ${
            urls.length === 3 && i === 2
              ? "col-span-2 h-44"
              : urls.length === 4
              ? "h-36"
              : "h-44"
          }`}
        />
      ))}
    </div>
  );
}

/** 用户头像（首字母色块） */
function Avatar({ username, size = "md" }: { username: string; size?: "sm" | "md" }) {
  const initial = username[0]?.toUpperCase() ?? "?";
  const cls =
    size === "sm"
      ? "w-5 h-5 text-[10px]"
      : "w-10 h-10 text-sm";
  return (
    <div
      className={`${cls} rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold uppercase flex-shrink-0`}
    >
      {initial}
    </div>
  );
}

/** Inline edit textarea + Cancel / Save controls */
function EditBox({
  draft,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: string;
  saving: boolean;
  error: string | null;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        maxLength={240}
        rows={3}
        className="w-full text-sm bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
        autoFocus
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{draft.length}/240</span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1 text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !draft.trim()}
            className="text-xs px-3 py-1 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

interface PostCardProps {
  post: Post;
  currentUserId?: string;
  currentUserRole?: string;
  onDelete?: (id: string) => void;
  highlightQuery?: string;
}

export function PostCard({ post, currentUserId, currentUserRole, onDelete, highlightQuery = "" }: PostCardProps) {
  const router = useRouter();
  const username = post.author?.username ?? "unknown";

  // ── Edit state ────────────────────────────────────────────────────────────
  const [displayContent, setDisplayContent] = useState(post.content);
  const [displayIsEdited, setDisplayIsEdited] = useState(post.isEdited ?? false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Delete state ──────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = Boolean(currentUserId) && post.userId === currentUserId;
  const canDelete =
    Boolean(currentUserId) &&
    (post.userId === currentUserId || currentUserRole === "ADMIN");

  function startEdit() {
    setMenuOpen(false);
    setEditDraft(displayContent);
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
        `/api/posts/${post.id}`,
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

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/posts/${post.id}`);
      setDeleteOpen(false);
      if (onDelete) {
        onDelete(post.id);
      } else {
        router.refresh();
      }
    } catch {
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  /** The ··· dropdown menu (Edit + Delete) */
  const dotMenu = (canEdit || canDelete) && (
    <div className="relative">
      {menuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
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
              onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-surface-700 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ── 转发卡片 ──────────────────────────────────────────────────────────────
  if (post.repostOf) {
    type ChainNode = { author: Post["author"]; content: string };
    const intermediates: ChainNode[] = [];
    let cursor: Post["repostOf"] = post.repostOf;
    while (cursor && cursor.repostOfId) {
      if (cursor.repostOf) {
        intermediates.push({ author: cursor.author, content: cursor.content });
        cursor = cursor.repostOf as Post["repostOf"];
      } else {
        break;
      }
    }
    const original = cursor;
    const isDeleted = !original || Boolean(original.deletedAt);
    const embedUsername = original?.author?.username ?? "unknown";

    return (
      <article className="bg-surface-800 border border-surface-700 rounded-xl p-4">
        {/* 外层：转发者信息 */}
        <div className="flex items-center gap-3 mb-3">
          <Avatar username={username} />
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Link
              href={`/profile/${username}`}
              className="font-semibold text-sm text-slate-100 hover:underline"
            >
              {username}
            </Link>
            <span className="text-sm text-slate-400">reposted</span>
          </div>
          {dotMenu}
        </div>

        {/* 当前转发人的留言：可编辑 */}
        {isEditing ? (
          <div className="mb-3">
            <EditBox
              draft={editDraft}
              saving={isSaving}
              error={saveError}
              onChange={setEditDraft}
              onCancel={cancelEdit}
              onSave={saveEdit}
            />
          </div>
        ) : (
          displayContent && (
            <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed mb-3">
              <Highlight text={displayContent} query={highlightQuery} />
              {displayIsEdited && (
                <span className="ml-1.5 text-[10px] text-slate-500 font-normal align-middle">Edited</span>
              )}
            </p>
          )
        )}

        {/* 中间各层转发人留言 */}
        {intermediates.map((node, i) =>
          node.content ? (
            <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400 mb-2 flex-wrap">
              <span className="text-slate-500">↻ from</span>
              <div className="w-4 h-4 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-[9px] uppercase flex-shrink-0">
                {node.author?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="font-medium text-slate-300">{node.author?.username ?? "unknown"}</span>
              <span className="text-slate-600">:</span>
              <span><Highlight text={node.content} query={highlightQuery} /></span>
            </div>
          ) : null
        )}

        {/* 内层：始终展示原始主帖 */}
        {isDeleted ? (
          <div className="border border-dashed border-surface-700 rounded-xl px-4 py-3 text-sm text-slate-500 italic bg-surface-900">
            Original post was deleted
          </div>
        ) : original ? (
          <Link href={`/posts/${original.id}`} className="block group">
            <div className="border border-surface-700 rounded-xl px-4 py-3 bg-surface-900 group-hover:bg-surface-700/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-semibold text-xs uppercase flex-shrink-0">
                  {embedUsername[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-sm font-semibold text-slate-500">{embedUsername}</span>
                <span className="text-xs text-slate-500">{timeAgo(original.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
                <Highlight text={original.content} query={highlightQuery} />
              </p>
              <MediaGrid urls={original.mediaUrls ?? []} />
            </div>
          </Link>
        ) : null}

        <PostActions
          post={post}
          repostTargetId={post.id}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />

        <ConfirmDialog
          open={deleteOpen}
          title="Delete Post"
          message="This action cannot be undone. Are you sure you want to delete this post?"
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      </article>
    );
  }

  // ── 普通帖子 ──────────────────────────────────────────────────────────────
  return (
    <article className="bg-surface-800 border border-surface-700 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Link href={`/profile/${username}`} className="flex items-center gap-3 group flex-1 min-w-0">
          <Avatar username={username} />
          <div className="min-w-0">
            <p className="font-semibold text-sm text-slate-100 group-hover:underline">{username}</p>
            <p className="text-xs text-slate-400">{timeAgo(post.createdAt)}</p>
          </div>
        </Link>
        {dotMenu}
      </div>

      {isEditing ? (
        <EditBox
          draft={editDraft}
          saving={isSaving}
          error={saveError}
          onChange={setEditDraft}
          onCancel={cancelEdit}
          onSave={saveEdit}
        />
      ) : (
        <Link href={`/posts/${post.id}`} className="block">
          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed hover:opacity-80 transition-opacity">
            <Highlight text={displayContent} query={highlightQuery} />
            {displayIsEdited && (
              <span className="ml-1.5 text-[10px] text-slate-500 font-normal align-middle">Edited</span>
            )}
          </p>
          <MediaGrid urls={post.mediaUrls ?? []} />
        </Link>
      )}

      <PostActions
        post={post}
        repostTargetId={post.id}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Post"
        message="This action cannot be undone. Are you sure you want to delete this post?"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </article>
  );
}
